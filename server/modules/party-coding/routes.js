import crypto from "node:crypto";
import { getPartyCodingRunLogModel, getPartyCodingWorkspaceModel } from "./model.js";
import { createPartyCodingRealtime } from "./realtime.js";

const SHI_GAOJUN_TEACHER_SCOPE_KEY = "shi-gaojun";
const MAX_CODE_LENGTH = 200_000;
const MAX_STDIN_LENGTH = 20_000;
const MAX_CONSOLE_OUTPUT_LENGTH = 200_000;
const PYTHON_RUNNER_REQUEST_TIMEOUT_MS = Math.max(
  25_000,
  Number(process.env.PYTHON_RUNNER_REQUEST_TIMEOUT_MS || 630_000),
);
const configuredRunLogRetentionDays = Number(process.env.PARTY_CODING_RUN_LOG_RETENTION_DAYS || 30);
const RUN_LOG_RETENTION_DAYS = Number.isFinite(configuredRunLogRetentionDays)
  ? Math.max(1, configuredRunLogRetentionDays)
  : 30;

function sanitizeCode(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_CODE_LENGTH);
}

function sanitizeStdin(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_STDIN_LENGTH);
}

function sanitizeConsoleOutput(value) {
  return String(value || "").replace(/\r\n/g, "\n").slice(0, MAX_CONSOLE_OUTPUT_LENGTH);
}

function summarizeRunnerError(value) {
  return sanitizeConsoleOutput(value).replace(/\s+/g, " ").trim().slice(0, 500);
}

function normalizeRunMetric(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : 0;
}

function getRunStatus(result, statusCode) {
  if (Number(statusCode) === 429) return "queue_full";
  if (Number(statusCode) === 503) return "scheduler_unavailable";
  if (Number(statusCode) >= 500) return "runner_unavailable";
  if (Number(result?.timedOut) === 1 || result?.timedOut === true) return "timed_out";
  if (Number(result?.exitCode) === 0) return "succeeded";
  return "failed";
}

function normalizeWorkspace(doc) {
  if (!doc) return null;
  return {
    roomId: String(doc.roomId || ""),
    code: sanitizeCode(doc.code),
    stdin: sanitizeStdin(doc.stdin),
    revision: Math.max(1, Number(doc.revision || 1)),
    versions: (Array.isArray(doc.versions) ? doc.versions : []).map((item) => ({
      revision: Number(item?.revision || 0),
      code: sanitizeCode(item?.code),
      savedByName: String(item?.savedByName || "成员").slice(0, 60),
      createdAt: item?.createdAt ? new Date(item.createdAt).toISOString() : "",
    })),
    run: {
      status: String(doc?.run?.status || "idle") === "running" ? "running" : "idle",
      startedByUserId: String(doc?.run?.startedByUserId || ""),
      startedByName: String(doc?.run?.startedByName || "成员").slice(0, 60),
      startedAt: doc?.run?.startedAt ? new Date(doc.run.startedAt).toISOString() : "",
      completedAt: doc?.run?.completedAt ? new Date(doc.run.completedAt).toISOString() : "",
      stdout: sanitizeConsoleOutput(doc?.run?.stdout),
      stderr: sanitizeConsoleOutput(doc?.run?.stderr),
      exitCode: doc?.run?.exitCode == null || doc.run.exitCode === "" ? null : Number.isFinite(Number(doc.run.exitCode)) ? Number(doc.run.exitCode) : null,
      durationMs: doc?.run?.durationMs == null || doc.run.durationMs === "" ? null : Number.isFinite(Number(doc.run.durationMs)) ? Number(doc.run.durationMs) : null,
    },
  };
}

export function registerPartyCodingRoutes(app, deps) {
  const { GroupChatRoom, requireChatAuth, sanitizeId, isMongoObjectIdLike, broadcastGroupChatWsPayload } = deps;
  const Workspace = getPartyCodingWorkspaceModel(deps.mongoose);
  const RunLog = getPartyCodingRunLogModel(deps.mongoose);
  const collaboration = createPartyCodingRealtime(deps);

  async function persistRunLog({ member, runId, startedByName, code, stdin, startedAt, result, statusCode, fallbackError = "" }) {
    const completedAt = new Date();
    const errorSummary = summarizeRunnerError(result?.stderr || fallbackError);
    try {
      await RunLog.create({
        roomId: member.roomId,
        runId,
        teacherScopeKey: SHI_GAOJUN_TEACHER_SCOPE_KEY,
        startedByUserId: member.userId,
        startedByName,
        codeSha256: crypto.createHash("sha256").update(code).digest("hex"),
        codeLength: code.length,
        stdinLength: stdin.length,
        status: getRunStatus(result, statusCode),
        exitCode: Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : -1,
        durationMs: normalizeRunMetric(result?.durationMs),
        queueWaitMs: normalizeRunMetric(result?.queueWaitMs),
        errorSummary,
        startedAt,
        completedAt,
        expiresAt: new Date(completedAt.getTime() + RUN_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000),
      });
    } catch (error) {
      console.error("[party-coding] failed to persist run log", error);
    }
  }

  async function requireCodingMember(req, res) {
    const userId = sanitizeId(req.authUser?._id, "");
    const roomId = sanitizeId(req.params?.roomId, "");
    if (String(req.authTeacherScopeKey || "").trim().toLowerCase() !== SHI_GAOJUN_TEACHER_SCOPE_KEY) {
      res.status(403).json({ error: "协作编程仅面向施高俊授课范围开放。" });
      return null;
    }
    if (!userId || !roomId || !isMongoObjectIdLike(roomId)) {
      res.status(400).json({ error: "无效派房间。" });
      return null;
    }
    const room = await GroupChatRoom.findOne({ _id: roomId, memberUserIds: userId }, { ownerUserId: 1 }).lean();
    if (!room) {
      res.status(403).json({ error: "你不是该派成员，无法使用协作编程。" });
      return null;
    }
    return { roomId, userId, isOwner: sanitizeId(room.ownerUserId, "") === userId };
  }

  app.get("/api/group-chat/rooms/:roomId/coding", requireChatAuth, async (req, res) => {
    try {
      const member = await requireCodingMember(req, res);
      if (!member) return;
      const workspace = await Workspace.findOneAndUpdate(
        { roomId: member.roomId },
        { $setOnInsert: { roomId: member.roomId } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      res.json({ ok: true, workspace: normalizeWorkspace(workspace) });
    } catch (error) {
      res.status(500).json({ error: error?.message || "读取协作代码失败。" });
    }
  });

  app.put("/api/group-chat/rooms/:roomId/coding", requireChatAuth, async (req, res) => {
    try {
      const member = await requireCodingMember(req, res);
      if (!member) return;
      const code = sanitizeCode(req.body?.code);
      const savedByName = String(req.authUser?.profile?.name || req.authUser?.username || "成员").slice(0, 60);
      const workspace = await collaboration.replaceRoomCode({
        roomId: member.roomId,
        code,
        author: { userId: member.userId, name: savedByName },
      });
      res.json({ ok: true, workspace });
    } catch (error) {
      res.status(500).json({ error: error?.message || "保存协作代码失败。" });
    }
  });

  app.post("/api/group-chat/rooms/:roomId/coding/restore", requireChatAuth, async (req, res) => {
    try {
      const member = await requireCodingMember(req, res);
      if (!member) return;
      if (!member.isOwner) return res.status(403).json({ error: "仅派主可恢复代码版本。" });
      const revisionToRestore = Number(req.body?.revision || 0);
      const current = await Workspace.findOne({ roomId: member.roomId }).lean();
      const source = (current?.versions || []).find((item) => Number(item?.revision) === revisionToRestore);
      if (!source) return res.status(404).json({ error: "代码版本不存在。" });
      const savedByName = String(req.authUser?.profile?.name || req.authUser?.username || "派主").slice(0, 60);
      const workspace = await collaboration.replaceRoomCode({
        roomId: member.roomId,
        code: source.code,
        author: { userId: member.userId, name: savedByName },
      });
      res.json({ ok: true, workspace });
    } catch (error) {
      res.status(500).json({ error: error?.message || "恢复代码版本失败。" });
    }
  });

  app.put("/api/group-chat/rooms/:roomId/coding/stdin", requireChatAuth, async (req, res) => {
    try {
      const member = await requireCodingMember(req, res);
      if (!member) return;
      const stdin = sanitizeStdin(req.body?.stdin);
      const workspace = await Workspace.findOneAndUpdate(
        { roomId: member.roomId },
        { $set: { stdin } },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
      broadcastGroupChatWsPayload(member.roomId, {
        type: "coding_collab_stdin",
        roomId: member.roomId,
        stdin,
      });
      res.json({ ok: true, workspace: normalizeWorkspace(workspace) });
    } catch (error) {
      res.status(500).json({ error: error?.message || "保存标准输入失败。" });
    }
  });

  app.post("/api/group-chat/rooms/:roomId/coding/run", requireChatAuth, async (req, res) => {
    try {
      const member = await requireCodingMember(req, res);
      if (!member) return;
      const code = sanitizeCode(req.body?.code);
      const stdin = sanitizeStdin(req.body?.stdin);
      const runId = crypto.randomUUID();
      const startedByName = String(req.authUser?.profile?.name || req.authUser?.username || "成员").trim().slice(0, 60) || "成员";
      const startedAt = new Date();
      const started = await Workspace.findOneAndUpdate(
        { roomId: member.roomId, "run.status": { $ne: "running" } },
        {
          $set: {
            stdin,
            "run.status": "running",
            "run.runId": runId,
            "run.startedAt": startedAt,
            "run.startedByUserId": member.userId,
            "run.startedByName": startedByName,
            "run.stdout": "",
            "run.stderr": "",
            "run.exitCode": null,
            "run.durationMs": null,
            "run.completedAt": null,
          },
        },
        { new: true },
      ).lean();
      if (!started) return res.status(409).json({ error: "当前派正在运行代码，请等待结果。" });
      broadcastGroupChatWsPayload(member.roomId, {
        type: "coding_collab_run_updated",
        roomId: member.roomId,
        workspace: normalizeWorkspace(started),
      });
      try {
        const response = await fetch(`${String(process.env.PYTHON_RUNNER_URL || "http://127.0.0.1:8790").replace(/\/$/, "")}/run`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code, stdin }), signal: AbortSignal.timeout(PYTHON_RUNNER_REQUEST_TIMEOUT_MS),
        });
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(result?.stderr || result?.error || "Python 执行器不可用。");
          error.statusCode = response.status;
          error.runnerResult = result;
          throw error;
        }
        const finished = await Workspace.findOneAndUpdate(
          { roomId: member.roomId, "run.runId": runId },
          {
            $set: {
              "run.status": "idle",
              "run.runId": "",
              "run.stdout": sanitizeConsoleOutput(result?.stdout),
              "run.stderr": sanitizeConsoleOutput(result?.stderr),
              "run.exitCode": Number.isFinite(Number(result?.exitCode)) ? Number(result.exitCode) : -1,
              "run.durationMs": Math.max(0, Number(result?.durationMs) || 0),
              "run.completedAt": new Date(),
            },
          },
          { new: true },
        ).lean();
        broadcastGroupChatWsPayload(member.roomId, {
          type: "coding_collab_run_updated",
          roomId: member.roomId,
          workspace: normalizeWorkspace(finished),
        });
        await persistRunLog({
          member,
          runId,
          startedByName,
          code,
          stdin,
          startedAt,
          result,
          statusCode: response.status,
        });
        res.json({ ok: true, result });
      } catch (error) {
        const result = error?.runnerResult || {
          stdout: "",
          stderr: error?.message || "运行 Python 代码失败。",
          exitCode: -1,
          durationMs: 0,
          queueWaitMs: 0,
          timedOut: false,
        };
        const finished = await Workspace.findOneAndUpdate(
          { roomId: member.roomId, "run.runId": runId },
          {
            $set: {
              "run.status": "idle",
              "run.runId": "",
              "run.stdout": "",
              "run.stderr": sanitizeConsoleOutput(result.stderr || error?.message || "运行 Python 代码失败。"),
              "run.exitCode": Number.isFinite(Number(result.exitCode)) ? Number(result.exitCode) : -1,
              "run.durationMs": normalizeRunMetric(result.durationMs),
              "run.completedAt": new Date(),
            },
          },
          { new: true },
        ).lean();
        broadcastGroupChatWsPayload(member.roomId, {
          type: "coding_collab_run_updated",
          roomId: member.roomId,
          workspace: normalizeWorkspace(finished),
        });
        await persistRunLog({
          member,
          runId,
          startedByName,
          code,
          stdin,
          startedAt,
          result,
          statusCode: error?.statusCode || 502,
          fallbackError: error?.message,
        });
        throw error;
      }
    } catch (error) {
      const upstreamStatusCode = Number(error?.statusCode);
      const statusCode = upstreamStatusCode === 429 || upstreamStatusCode === 503
        ? upstreamStatusCode
        : 502;
      res.status(statusCode).json({ error: error?.message || "运行 Python 代码失败。" });
    }
  });

  return collaboration;
}
