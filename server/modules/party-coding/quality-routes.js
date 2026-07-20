import { getPartyCodingRunLogModel, getPartyCodingWorkspaceModel } from "./model.js";

const SHI_GAOJUN_TEACHER_SCOPE_KEY = "shi-gaojun";
const DEFAULT_WINDOW_HOURS = 24;
const MAX_WINDOW_HOURS = 24 * 31;
const MAX_SUMMARY_LOGS = 5_000;
const DEFAULT_LOG_LIMIT = 50;
const MAX_LOG_LIMIT = 100;
const RUNNER_HEALTH_TIMEOUT_MS = 2_500;

function getRunLogRetentionDays() {
  const configured = Number(process.env.PARTY_CODING_RUN_LOG_RETENTION_DAYS || 30);
  return Number.isFinite(configured) ? Math.max(1, configured) : 30;
}

function clampInteger(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value || ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function safeNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * ratio) - 1));
  return values[index];
}

function summarizeError(value) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function normalizeRunnerHealth(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    available: source.ok === true,
    studentEnvironment: String(source.studentEnvironment || "未声明环境"),
    environmentVersion: String(source.environmentVersion || "未声明版本"),
    studentPackages: Array.isArray(source.studentPackages)
      ? source.studentPackages.map((item) => String(item || "").trim()).filter(Boolean)
      : [],
    maxConcurrency: safeNumber(source.maxConcurrency),
    globalMaxConcurrency: safeNumber(source.globalMaxConcurrency),
    activeJobs: safeNumber(source.activeJobs),
    queuedJobs: safeNumber(source.queuedJobs),
    completedJobs: safeNumber(source.completedJobs),
    failedJobs: safeNumber(source.failedJobs),
    timedOutJobs: safeNumber(source.timedOutJobs),
    queueMaxSize: safeNumber(source.queueMaxSize),
    timeoutSeconds: safeNumber(source.timeoutSeconds),
    memoryBytes: safeNumber(source.memoryBytes),
    processLimit: safeNumber(source.processLimit),
    distributed: source.distributed === true,
  };
}

async function fetchRunnerHealth() {
  const runnerUrl = String(process.env.PYTHON_RUNNER_URL || "http://127.0.0.1:8790").replace(/\/$/, "");
  try {
    const response = await fetch(`${runnerUrl}/health`, {
      signal: AbortSignal.timeout(RUNNER_HEALTH_TIMEOUT_MS),
    });
    const body = await response.json();
    if (!response.ok) throw new Error(`运行器健康检查失败（${response.status}）。`);
    return { ...normalizeRunnerHealth(body), checkedAt: new Date().toISOString(), error: "" };
  } catch (error) {
    return {
      ...normalizeRunnerHealth(null),
      available: false,
      checkedAt: new Date().toISOString(),
      error: summarizeError(error?.message || "无法连接 Python 执行器。"),
    };
  }
}

function buildSummary(logs) {
  const totalRuns = logs.length;
  const statusCounts = logs.reduce((counts, item) => {
    const key = String(item?.status || "failed");
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});
  const durations = logs
    .map((item) => safeNumber(item?.durationMs))
    .filter((value) => value >= 0)
    .sort((left, right) => left - right);
  const queueWaits = logs
    .map((item) => safeNumber(item?.queueWaitMs))
    .filter((value) => value >= 0);
  const errorCounts = new Map();
  for (const item of logs) {
    const summary = summarizeError(item?.errorSummary);
    if (!summary) continue;
    errorCounts.set(summary, (errorCounts.get(summary) || 0) + 1);
  }
  const frequentErrors = Array.from(errorCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN"))
    .slice(0, 5)
    .map(([message, count]) => ({ message, count }));
  return {
    totalRuns,
    succeededRuns: statusCounts.succeeded || 0,
    failedRuns: totalRuns - (statusCounts.succeeded || 0),
    timedOutRuns: statusCounts.timed_out || 0,
    queueFullRuns: statusCounts.queue_full || 0,
    schedulerUnavailableRuns: statusCounts.scheduler_unavailable || 0,
    successRate: totalRuns ? Number((((statusCounts.succeeded || 0) / totalRuns) * 100).toFixed(1)) : 0,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    p95DurationMs: percentile(durations, 0.95),
    averageQueueWaitMs: queueWaits.length ? Math.round(queueWaits.reduce((sum, value) => sum + value, 0) / queueWaits.length) : 0,
    frequentErrors,
  };
}

function normalizeLog(doc, roomById) {
  const roomId = String(doc?.roomId || "");
  const room = roomById.get(roomId);
  return {
    id: String(doc?._id || ""),
    roomId,
    roomName: String(room?.name || "已解散的派"),
    roomCode: String(room?.roomCode || ""),
    startedByName: String(doc?.startedByName || "成员"),
    status: String(doc?.status || "failed"),
    durationMs: safeNumber(doc?.durationMs),
    queueWaitMs: safeNumber(doc?.queueWaitMs),
    exitCode: doc?.exitCode == null ? null : safeNumber(doc.exitCode, -1),
    errorSummary: summarizeError(doc?.errorSummary),
    codeLength: safeNumber(doc?.codeLength),
    stdinLength: safeNumber(doc?.stdinLength),
    startedAt: doc?.startedAt ? new Date(doc.startedAt).toISOString() : "",
    completedAt: doc?.completedAt ? new Date(doc.completedAt).toISOString() : "",
  };
}

export function registerPartyCodingQualityRoutes(app, deps) {
  const { GroupChatRoom, mongoose, requireAdminAuth } = deps;
  const RunLog = getPartyCodingRunLogModel(mongoose);
  const Workspace = getPartyCodingWorkspaceModel(mongoose);

  app.get("/api/auth/admin/party-coding/quality", requireAdminAuth, async (req, res) => {
    try {
      const windowHours = clampInteger(req.query?.hours, DEFAULT_WINDOW_HOURS, 1, MAX_WINDOW_HOURS);
      const logLimit = clampInteger(req.query?.limit, DEFAULT_LOG_LIMIT, 1, MAX_LOG_LIMIT);
      const since = new Date(Date.now() - windowHours * 60 * 60 * 1000);
      const query = { teacherScopeKey: SHI_GAOJUN_TEACHER_SCOPE_KEY, startedAt: { $gte: since } };
      const [summaryLogs, latestLogs, activeRoomCount, runner] = await Promise.all([
        RunLog.find(query, { status: 1, durationMs: 1, queueWaitMs: 1, errorSummary: 1 })
          .sort({ startedAt: -1 })
          .limit(MAX_SUMMARY_LOGS)
          .lean(),
        RunLog.find(query).sort({ startedAt: -1 }).limit(logLimit).lean(),
        Workspace.countDocuments({ "run.status": "running" }),
        fetchRunnerHealth(),
      ]);
      const roomIds = Array.from(new Set(latestLogs.map((item) => String(item?.roomId || "")).filter(Boolean)));
      const rooms = roomIds.length
        ? await GroupChatRoom.find({ _id: { $in: roomIds } }, { name: 1, roomCode: 1 }).lean()
        : [];
      const roomById = new Map(rooms.map((room) => [String(room?._id || ""), room]));
      res.json({
        ok: true,
        generatedAt: new Date().toISOString(),
        scope: { key: SHI_GAOJUN_TEACHER_SCOPE_KEY, label: "施高俊" },
        windowHours,
        runner,
        activePartyRuns: activeRoomCount,
        summary: buildSummary(summaryLogs),
        logs: latestLogs.map((item) => normalizeLog(item, roomById)),
        retentionDays: getRunLogRetentionDays(),
      });
    } catch (error) {
      res.status(500).json({ error: error?.message || "读取 Python 质控数据失败。" });
    }
  });
}
