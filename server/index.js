import express from "express";
import multer from "multer";
import http from "node:http";
import { existsSync } from "node:fs";
import path from "node:path";
import { createAppContext } from "./app/createAppContext.js";
import { createStartupTasks } from "./app/startup-tasks.js";
import { resolveConfiguredBasePath, stripBasePath } from "./config/base-path.js";
import { registerAuthUserClassroomRoutes } from "./routes/auth-user-classroom.js";
import { registerAdminRoutes } from "./routes/admin.js";
import { registerChatAndImageRoutes } from "./routes/chat-and-images.js";
import { registerGroupChatRoutes } from "./routes/group-chat.js";
import { registerAgentLabRoutes } from "./routes/agent-lab.js";
import { registerNotesRoutes } from "./routes/notes.js";
import { createGroupChatRealtimeHub } from "./runtime/group-chat-realtime-hub.js";
import { createAgentLabRealtimeHub } from "./runtime/agent-lab-realtime-hub.js";

const app = express();
const AGENT_LAB_WS_PATH = "/ws/agent-lab";
const APP_BASE_PATH = resolveConfiguredBasePath();
const deps = createAppContext();
const startupTasks = createStartupTasks(deps);
const groupChatRealtimeHub = createGroupChatRealtimeHub(deps);
const agentLabRealtimeHub = createAgentLabRealtimeHub(deps);

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
registerChatAndImageRoutes(app, deps);
registerNotesRoutes(app, deps);
registerGroupChatRoutes(app, deps);
registerAgentLabRoutes(app, { ...deps, agentLabRealtimeHub });

const distDir = path.resolve(process.cwd(), "dist");
const distIndexHtml = path.join(distDir, "index.html");
if (existsSync(distIndexHtml)) {
  app.use(express.static(distDir));
  app.get(/^\/(?!api(?:\/|$)).*/, (_req, res) => {
    res.sendFile(distIndexHtml);
  });
}

app.use((error, _req, res, _next) => {
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
  console.log(`Mongo connected: ${deps.mongoUri}`);
  await deps.ensureFixedAdminAccounts();
  await deps.ensureFixedStudentAccounts();

  const server = http.createServer(app);
  agentLabRealtimeHub.initWebSocketServer(server);
  groupChatRealtimeHub.initWebSocketServer(server);
  const upgradeListeners = server.listeners("upgrade");
  if (upgradeListeners.length >= 2) {
    const agentLabUpgradeListener = upgradeListeners[0];
    const groupChatUpgradeListener = upgradeListeners[1];
    server.removeAllListeners("upgrade");
    server.on("upgrade", (request, socket, head) => {
      let pathname = "";
      try {
        pathname = stripBasePath(
          new URL(request.url || "", "http://localhost").pathname,
          APP_BASE_PATH,
        );
      } catch {
        pathname = "";
      }
      if (pathname === AGENT_LAB_WS_PATH) {
        agentLabUpgradeListener(request, socket, head);
        return;
      }
      if (pathname === deps.GROUP_CHAT_WS_PATH) {
        groupChatUpgradeListener(request, socket, head);
        return;
      }
      try {
        socket.destroy();
      } catch {
        // ignore invalid upgrade sockets
      }
    });
  }

  server.listen(deps.port, () => {
    console.log(`API server listening on http://localhost:${deps.port}`);
    console.log(
      `Group chat websocket listening on ws://localhost:${deps.port}${deps.GROUP_CHAT_WS_PATH}`,
    );
    console.log(`Agent Lab websocket listening on ws://localhost:${deps.port}/ws/agent-lab`);
    console.log(`Configured app base path: ${APP_BASE_PATH}`);
  });

  void startupTasks.run();
}

startServer().catch((error) => {
  console.error("Failed to start server:", error);
  process.exit(1);
});
