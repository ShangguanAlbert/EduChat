import express from "express";
import multer from "multer";
import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { createAppContext } from "./app/createAppContext.js";
import { createStartupTasks } from "./app/startup-tasks.js";
import { resolveConfiguredBasePath, stripBasePath } from "./config/base-path.js";
import { createChatDeps } from "./modules/chat/createChatDeps.js";
import { registerChatRoutes } from "./modules/chat/routes.js";
import { createImageDeps } from "./modules/images/createImageDeps.js";
import { registerImageRoutes } from "./modules/images/routes.js";
import { createMusicDeps } from "./modules/music/createMusicDeps.js";
import { registerMusicRoutes } from "./modules/music/routes.js";
import { registerAuthUserClassroomRoutes } from "./routes/auth-user-classroom.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerGroupChatRoutes } from "./routes/group-chat.js";
import { registerNotesRoutes } from "./routes/notes.js";
import { registerPartyCodingRoutes } from "./modules/party-coding/routes.js";
import { createGroupChatRealtimeHub } from "./runtime/group-chat-realtime-hub.js";
import { subscribeGroupChatAiEvents } from "./runtime/group-chat-ai-events.js";

const app = express();
const APP_BASE_PATH = resolveConfiguredBasePath();
const deps = createAppContext();
const startupTasks = createStartupTasks(deps);
const groupChatRealtimeHub = createGroupChatRealtimeHub(deps);
const uploadsDir = path.resolve(process.cwd(), "uploads");

if (APP_BASE_PATH !== "/") {
  app.use((req, _res, next) => {
    const rewrittenUrl = stripBasePath(req.url || "/", APP_BASE_PATH);
    if (rewrittenUrl !== (req.url || "/")) {
      req.url = rewrittenUrl;
    }
    next();
  });
}

registerAuthUserClassroomRoutes(app, deps);
registerAdminRoutes(app, deps);
registerChatRoutes(app, createChatDeps(deps));
registerImageRoutes(app, createImageDeps(deps));
registerMusicRoutes(app, createMusicDeps(deps));
registerNotesRoutes(app, deps);
registerGroupChatRoutes(app, deps);
const partyCodingRealtime = registerPartyCodingRoutes(app, deps);
deps.setPartyCodingRealtime(partyCodingRealtime);

app.use("/uploads", express.static(uploadsDir));

const distDir = path.resolve(process.cwd(), "dist");
const distIndexHtml = path.join(distDir, "index.html");
if (existsSync(distIndexHtml)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(distIndexHtml);
  });
}

app.use((error, _req, res, next) => {
  void next;
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      res.status(413).json({ error: "文件过大，请压缩后重试。" });
      return;
    }
    if (error.code === "LIMIT_FILE_COUNT") {
      res.status(413).json({ error: "文件数量超过限制，请减少上传数量后重试。" });
      return;
    }
    res.status(400).json({ error: `上传失败: ${error.code}` });
    return;
  }

  res.status(500).json({ error: error?.message || "unknown server error" });
});

async function startServer() {
  await deps.mongoose.connect(deps.mongoUri, { serverSelectionTimeoutMS: 6000 });
  console.log("Mongo connected.");
  await deps.ensureFixedAdminAccounts();
  await deps.ensureFixedStudentAccounts();

  const server = http.createServer(app);
  groupChatRealtimeHub.initWebSocketServer(server);
  const unsubscribeGroupChatAiEvents = subscribeGroupChatAiEvents({
    env: process.env,
    logger: console,
    onMessageCreated: (payload) => {
      const roomId = String(payload?.roomId || payload?.message?.roomId || "").trim();
      if (!roomId || !payload?.message) return;
      groupChatRealtimeHub.broadcastMessageCreated(roomId, payload.message);
    },
    onMessageUpdated: (payload) => {
      const roomId = String(payload?.roomId || payload?.message?.roomId || "").trim();
      if (!roomId || !payload?.message) return;
      console.info(
        `[group-chat-ai-app] broadcasting message_updated roomId=${roomId} messageId=${String(
          payload?.message?.id || "",
        ).trim()} socketCount=${groupChatRealtimeHub.getRoomSocketCount(roomId)}`,
      );
      groupChatRealtimeHub.broadcastMessageUpdated(roomId, payload.message);
    },
  });

  server.listen(deps.port, () => {
    console.log(`API server listening on http://localhost:${deps.port}`);
    console.log(
      `Group chat websocket listening on ws://localhost:${deps.port}${deps.GROUP_CHAT_WS_PATH}`,
    );
    console.log(`Configured app base path: ${APP_BASE_PATH}`);
  });

  const shutdown = async () => {
    try {
      await unsubscribeGroupChatAiEvents();
    } catch {
      // ignore
    }
    server.close();
    try {
      await deps.mongoose.disconnect();
    } catch {
      // ignore
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  void startupTasks.run();
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
