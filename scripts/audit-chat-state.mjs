import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { createAppContext } from "../server/app/createAppContext.js";

function printUsage() {
  console.log(`
用法:
  npm run audit:chat-state -- snapshot --username=<用户名> [--teacher-scope=default] [--session=<id>]... --output=<file>
  npm run audit:chat-state -- compare --before=<file> --after=<file>

示例:
  npm run audit:chat-state -- snapshot --username=上官福泽 --session=s1775273442951-4nbult --output=tmp/chat-before.json
  npm run audit:chat-state -- compare --before=tmp/chat-before.json --after=tmp/chat-after.json
  `);
}

function parseArgs(argv = []) {
  const [command = "", ...rest] = argv;
  const options = {
    command: String(command || "").trim(),
    username: "",
    teacherScope: "default",
    sessions: [],
    output: "",
    before: "",
    after: "",
  };

  rest.forEach((arg) => {
    const text = String(arg || "").trim();
    if (!text) return;
    if (text.startsWith("--username=")) {
      options.username = text.slice("--username=".length).trim();
      return;
    }
    if (text.startsWith("--teacher-scope=")) {
      options.teacherScope = text.slice("--teacher-scope=".length).trim() || "default";
      return;
    }
    if (text.startsWith("--session=")) {
      const value = text.slice("--session=".length).trim();
      if (value) options.sessions.push(value);
      return;
    }
    if (text.startsWith("--sessions=")) {
      const values = text
        .slice("--sessions=".length)
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      options.sessions.push(...values);
      return;
    }
    if (text.startsWith("--output=")) {
      options.output = text.slice("--output=".length).trim();
      return;
    }
    if (text.startsWith("--before=")) {
      options.before = text.slice("--before=".length).trim();
      return;
    }
    if (text.startsWith("--after=")) {
      options.after = text.slice("--after=".length).trim();
    }
  });

  options.sessions = Array.from(new Set(options.sessions));
  return options;
}

function sha256(value) {
  return createHash("sha256").update(String(value || "")).digest("hex");
}

function fingerprintMessage(message, index) {
  const content = String(message?.content || "");
  const reasoning = String(message?.reasoning || "");
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
        .map((item) =>
          JSON.stringify({
            name: String(item?.name || ""),
            type: String(item?.type || ""),
            mimeType: String(item?.mimeType || ""),
            url: String(item?.url || ""),
            fileId: String(item?.fileId || ""),
          }),
        )
        .join("|")
    : "";

  const digest = sha256(
    JSON.stringify({
      id: String(message?.id || ""),
      role: String(message?.role || ""),
      content,
      reasoning,
      attachments,
    }),
  );

  return {
    index,
    id: String(message?.id || ""),
    role: String(message?.role || ""),
    contentLength: content.length,
    reasoningLength: reasoning.length,
    attachmentCount: Array.isArray(message?.attachments)
      ? message.attachments.filter(Boolean).length
      : 0,
    digest,
    preview: content.trim().slice(0, 80),
  };
}

function summarizeSession(session, messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const messageFingerprints = safeMessages.map((message, index) =>
    fingerprintMessage(message, index),
  );
  const messageIds = messageFingerprints.map((item) => item.id).filter(Boolean);
  const lastMessage = messageFingerprints[messageFingerprints.length - 1] || null;
  const digest = sha256(
    JSON.stringify(
      messageFingerprints.map((item) => ({
        id: item.id,
        role: item.role,
        digest: item.digest,
      })),
    ),
  );

  return {
    id: String(session?.id || ""),
    title: String(session?.title || ""),
    groupId: session?.groupId ?? null,
    pinned: !!session?.pinned,
    messageCount: safeMessages.length,
    messageIds,
    digest,
    lastMessageId: lastMessage?.id || "",
    lastRole: lastMessage?.role || "",
    lastPreview: lastMessage?.preview || "",
    messages: messageFingerprints,
  };
}

async function writeJson(filePath, payload) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  await mkdir(path.dirname(absolutePath), { recursive: true });
  await writeFile(absolutePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return absolutePath;
}

async function readJson(filePath) {
  const absolutePath = path.resolve(process.cwd(), filePath);
  const raw = await readFile(absolutePath, "utf8");
  return { absolutePath, data: JSON.parse(raw) };
}

async function snapshotChatState(options) {
  if (!options.username) {
    throw new Error("snapshot 模式必须提供 --username");
  }
  if (!options.output) {
    throw new Error("snapshot 模式必须提供 --output");
  }

  const deps = createAppContext();
  await deps.mongoose.connect(deps.mongoUri, { serverSelectionTimeoutMS: 6000 });
  console.log(`[chat-audit] Mongo connected: ${deps.mongoUri}`);

  try {
    const teacherScopeKey = deps.sanitizeTeacherScopeKey(options.teacherScope);
    const user = await deps.AuthUser.findOne(
      { username: options.username },
      { _id: 1, username: 1 },
    ).lean();
    if (!user?._id) {
      throw new Error(`找不到用户: ${options.username}`);
    }

    const stateDoc = await deps.ChatState.findOne({ userId: user._id }).lean();
    const normalized = deps.normalizeChatStateDoc(stateDoc, teacherScopeKey);
    const requestedSessionIds =
      options.sessions.length > 0
        ? new Set(options.sessions)
        : new Set(normalized.sessions.map((session) => String(session?.id || "")));

    const sessions = normalized.sessions
      .filter((session) => requestedSessionIds.has(String(session?.id || "")))
      .map((session) =>
        summarizeSession(session, normalized.sessionMessages?.[String(session?.id || "")]),
      );

    const missingSessionIds = Array.from(requestedSessionIds).filter(
      (sessionId) => !sessions.some((session) => session.id === sessionId),
    );

    const snapshot = {
      type: "chat-state-snapshot",
      generatedAt: new Date().toISOString(),
      username: user.username,
      teacherScope: teacherScopeKey,
      requestedSessionIds: Array.from(requestedSessionIds),
      missingSessionIds,
      activeId: String(normalized.activeId || ""),
      sessionCount: sessions.length,
      sessions,
    };

    const outputPath = await writeJson(options.output, snapshot);
    console.log(
      `[chat-audit] snapshot saved: ${outputPath} sessions=${sessions.length} missing=${missingSessionIds.length}`,
    );
    sessions.forEach((session) => {
      console.log(
        `[chat-audit] session=${session.id} title=${session.title || "-"} messages=${session.messageCount} last=${session.lastMessageId || "-"}`,
      );
    });
    if (missingSessionIds.length) {
      console.warn(`[chat-audit] missing sessions: ${missingSessionIds.join(", ")}`);
    }
  } finally {
    await deps.mongoose.disconnect().catch(() => {});
  }
}

function compareSnapshots(beforeSnapshot, afterSnapshot) {
  const beforeSessions = new Map(
    (Array.isArray(beforeSnapshot.sessions) ? beforeSnapshot.sessions : []).map((session) => [
      session.id,
      session,
    ]),
  );
  const afterSessions = new Map(
    (Array.isArray(afterSnapshot.sessions) ? afterSnapshot.sessions : []).map((session) => [
      session.id,
      session,
    ]),
  );

  const sessionIds = Array.from(new Set([...beforeSessions.keys(), ...afterSessions.keys()]));
  const issues = [];

  sessionIds.forEach((sessionId) => {
    const before = beforeSessions.get(sessionId);
    const after = afterSessions.get(sessionId);
    if (!before) {
      issues.push(`[${sessionId}] after 中多出一个 before 不存在的会话`);
      return;
    }
    if (!after) {
      issues.push(`[${sessionId}] after 缺失整个会话`);
      return;
    }

    const beforeIds = new Set(Array.isArray(before.messageIds) ? before.messageIds : []);
    const afterIds = new Set(Array.isArray(after.messageIds) ? after.messageIds : []);
    const missingMessageIds = Array.from(beforeIds).filter((messageId) => !afterIds.has(messageId));

    if (after.messageCount < before.messageCount) {
      issues.push(
        `[${sessionId}] 消息数减少 ${before.messageCount} -> ${after.messageCount}`,
      );
    }
    if (missingMessageIds.length) {
      issues.push(`[${sessionId}] 丢失消息 id: ${missingMessageIds.join(", ")}`);
    }

    const beforeById = new Map(
      (Array.isArray(before.messages) ? before.messages : []).map((message) => [message.id, message]),
    );
    const afterById = new Map(
      (Array.isArray(after.messages) ? after.messages : []).map((message) => [message.id, message]),
    );

    Array.from(beforeById.keys()).forEach((messageId) => {
      if (!afterById.has(messageId)) return;
      const beforeMessage = beforeById.get(messageId);
      const afterMessage = afterById.get(messageId);
      if (beforeMessage?.digest !== afterMessage?.digest) {
        issues.push(`[${sessionId}] 消息内容变化 id=${messageId}`);
      }
    });
  });

  return {
    ok: issues.length === 0,
    issues,
    sessionIds,
  };
}

async function compareChatSnapshots(options) {
  if (!options.before || !options.after) {
    throw new Error("compare 模式必须提供 --before 和 --after");
  }

  const { absolutePath: beforePath, data: beforeSnapshot } = await readJson(options.before);
  const { absolutePath: afterPath, data: afterSnapshot } = await readJson(options.after);

  const result = compareSnapshots(beforeSnapshot, afterSnapshot);
  console.log(`[chat-audit] before=${beforePath}`);
  console.log(`[chat-audit] after=${afterPath}`);

  if (!result.ok) {
    console.error(`[chat-audit] compare failed, issues=${result.issues.length}`);
    result.issues.forEach((issue) => console.error(`[chat-audit] ${issue}`));
    process.exitCode = 1;
    return;
  }

  console.log(
    `[chat-audit] compare passed, checked sessions=${result.sessionIds.length}`,
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.command === "snapshot") {
    await snapshotChatState(options);
    return;
  }
  if (options.command === "compare") {
    await compareChatSnapshots(options);
    return;
  }

  printUsage();
  throw new Error(`未知命令: ${options.command || "(empty)"}`);
}

main().catch((error) => {
  console.error(`[chat-audit] fatal: ${error?.message || error}`);
  process.exit(1);
});
