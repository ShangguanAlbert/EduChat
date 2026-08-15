import Redis from "ioredis";
import {
  GROUP_CHAT_AI_LIMITS,
} from "../services/group-chat-ai.js";

const DEFAULT_PREFIX = "educhat:group-chat-ai";
const REDIS_LIFECYCLE_LOGGING_BOUND = Symbol("groupChatAiRedisLifecycleLoggingBound");
const GROUP_CHAT_AI_ENQUEUE_MESSAGES = Object.freeze({
  duplicate_active: "相同问题已在处理中。",
  room_pending_limit: "当前群聊等待中的 AI 请求过多，请稍后再试。",
  user_pending_limit: "你当前等待中的 AI 请求过多，请稍后再试。",
  accepted: "",
});
const GROUP_CHAT_AI_START_MESSAGES = Object.freeze({
  global_running_limit: "当前 AI 请求较多，已进入排队，请稍后。",
  room_running_limit: "当前群聊正在运行的 AI 请求过多，请稍后再试。",
  user_running_limit: "你当前正在运行的 AI 请求过多，请稍后再试。",
  accepted: "",
});
const RESERVE_PENDING_CAPACITY_LUA = `
local duplicateKey = KEYS[3]
if duplicateKey ~= "" and redis.call("EXISTS", duplicateKey) == 1 then
  return "duplicate_active"
end

local roomPending = tonumber(redis.call("GET", KEYS[1]) or "0")
if roomPending >= tonumber(ARGV[1]) then
  return "room_pending_limit"
end

local userPending = tonumber(redis.call("GET", KEYS[2]) or "0")
if userPending >= tonumber(ARGV[2]) then
  return "user_pending_limit"
end

redis.call("INCR", KEYS[1])
redis.call("INCR", KEYS[2])
if duplicateKey ~= "" then
  redis.call("PSETEX", duplicateKey, tonumber(ARGV[3]), "1")
end
return "accepted"
`;
const ACQUIRE_RUNNING_CAPACITY_LUA = `
local globalRunning = tonumber(redis.call("GET", KEYS[1]) or "0")
if globalRunning >= tonumber(ARGV[1]) then
  return "global_running_limit"
end

local roomRunning = tonumber(redis.call("GET", KEYS[2]) or "0")
if roomRunning >= tonumber(ARGV[2]) then
  return "room_running_limit"
end

local userRunning = tonumber(redis.call("GET", KEYS[3]) or "0")
if userRunning >= tonumber(ARGV[3]) then
  return "user_running_limit"
end

redis.call("INCR", KEYS[1])
redis.call("INCR", KEYS[2])
redis.call("INCR", KEYS[3])
return "accepted"
`;
const ACQUIRE_PARTICIPATION_RUNNING_CAPACITY_LUA = `
local globalRunning = tonumber(redis.call("GET", KEYS[1]) or "0")
if globalRunning >= tonumber(ARGV[1]) then
  return "global_running_limit"
end

local participationRunning = tonumber(redis.call("GET", KEYS[2]) or "0")
if participationRunning >= tonumber(ARGV[2]) then
  return "participation_running_limit"
end

redis.call("INCR", KEYS[1])
redis.call("INCR", KEYS[2])
return "accepted"
`;
const DECREMENT_WITH_FLOOR_LUA = `
for _, key in ipairs(KEYS) do
  local current = tonumber(redis.call("GET", key) or "0")
  if current <= 1 then
    redis.call("SET", key, "0")
  else
    redis.call("DECR", key)
  end
end
return "ok"
`;
const RELEASE_PARTICIPATION_ANALYSIS_RESERVATION_LUA = `
if redis.call("GET", KEYS[1]) == ARGV[1] then
  return redis.call("DEL", KEYS[1])
end
return 0
`;

export function resolveGroupChatAiRedisUrl(env = process.env) {
  return String(env.GROUP_CHAT_AI_REDIS_URL || env.REDIS_URL || "").trim();
}

export function resolveGroupChatAiRedisPrefix(env = process.env) {
  return String(env.GROUP_CHAT_AI_REDIS_PREFIX || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
}

export function isGroupChatAiRedisEnabled(env = process.env) {
  return !!resolveGroupChatAiRedisUrl(env);
}

export function attachGroupChatAiRedisLifecycleLogging(
  redis,
  {
    logger = console,
    connectionName = "group-chat-ai",
    redisUrl = "",
  } = {},
) {
  if (!redis || typeof redis.on !== "function" || redis[REDIS_LIFECYCLE_LOGGING_BOUND]) {
    return redis;
  }

  let hasLoggedConnectionError = false;
  const endpointSuffix = redisUrl ? ` (${redisUrl})` : "";

  redis.on("error", (error) => {
    if (hasLoggedConnectionError) return;
    hasLoggedConnectionError = true;
    logger.warn?.(
      `[${connectionName}] Redis connection error${endpointSuffix}. Waiting for reconnect attempts.`,
      error,
    );
  });

  redis.on("ready", () => {
    if (!hasLoggedConnectionError) return;
    hasLoggedConnectionError = false;
    logger.info?.(`[${connectionName}] Redis connection restored${endpointSuffix}.`);
  });

  Object.defineProperty(redis, REDIS_LIFECYCLE_LOGGING_BOUND, {
    value: true,
    configurable: false,
    enumerable: false,
    writable: false,
  });

  return redis;
}

export function createGroupChatAiRedisConnection(
  {
    env = process.env,
    logger = console,
    connectionName = "group-chat-ai",
  } = {},
) {
  const redisUrl = resolveGroupChatAiRedisUrl(env);
  if (!redisUrl) return null;
  const redis = new Redis(redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: true,
    lazyConnect: false,
  });
  return attachGroupChatAiRedisLifecycleLogging(redis, {
    logger,
    connectionName,
    redisUrl,
  });
}

export function buildGroupChatAiRedisKeys({ prefix = DEFAULT_PREFIX, roomId, userId, hash = "" } = {}) {
  const basePrefix = String(prefix || DEFAULT_PREFIX).trim() || DEFAULT_PREFIX;
  const safeRoomId = String(roomId || "").trim();
  const safeUserId = String(userId || "").trim();
  const safeHash = String(hash || "").trim();
  return {
    queue: `${basePrefix}:queue`,
    events: `${basePrefix}:events`,
    globalRunning: `${basePrefix}:global:running`,
    participationRunning: `${basePrefix}:participation-analysis:running`,
    roomRunning: `${basePrefix}:room:${safeRoomId}:running`,
    userRunning: `${basePrefix}:user:${safeUserId}:running`,
    roomPending: `${basePrefix}:room:${safeRoomId}:pending`,
    userPending: `${basePrefix}:user:${safeUserId}:pending`,
    duplicate: safeHash ? `${basePrefix}:dedupe:${safeRoomId}:${safeUserId}:${safeHash}` : "",
    participationAnalysisReservation: safeRoomId
      ? `${basePrefix}:participation-analysis:${safeRoomId}:scheduled`
      : "",
    participationAnalysisRoomLock: safeRoomId
      ? `${basePrefix}:participation-analysis:room:${safeRoomId}:running`
      : "",
    longitudinalMemoryNightlyLock: `${basePrefix}:longitudinal-memory:nightly:running`,
  };
}

export async function tryAcquireLongitudinalMemoryNightlyLock(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    ownerId,
    ttlMs = 15 * 60 * 1000,
  } = {},
) {
  if (!redis) return false;
  const key = buildGroupChatAiRedisKeys({ prefix }).longitudinalMemoryNightlyLock;
  const safeOwnerId = String(ownerId || "").trim();
  if (!key || !safeOwnerId) return false;
  const result = await redis.set(
    key,
    safeOwnerId,
    "PX",
    Math.max(60_000, Math.floor(Number(ttlMs) || 15 * 60 * 1000)),
    "NX",
  );
  return String(result || "").toUpperCase() === "OK";
}

export async function releaseLongitudinalMemoryNightlyLock(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    ownerId,
  } = {},
) {
  if (!redis) return;
  const key = buildGroupChatAiRedisKeys({ prefix }).longitudinalMemoryNightlyLock;
  const safeOwnerId = String(ownerId || "").trim();
  if (!key || !safeOwnerId) return;
  await redis.eval(
    RELEASE_PARTICIPATION_ANALYSIS_RESERVATION_LUA,
    1,
    key,
    safeOwnerId,
  );
}

export async function tryAcquirePartyParticipationRoomLock(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    taskId,
    ttlMs = GROUP_CHAT_AI_LIMITS.taskTimeoutMs + 15_000,
  } = {},
) {
  if (!redis) return false;
  const key = buildGroupChatAiRedisKeys({ prefix, roomId })
    .participationAnalysisRoomLock;
  const safeTaskId = String(taskId || "").trim();
  if (!key || !safeTaskId) return false;
  const result = await redis.set(
    key,
    safeTaskId,
    "PX",
    Math.max(1_000, Math.floor(Number(ttlMs) || 90_000)),
    "NX",
  );
  return String(result || "").toUpperCase() === "OK";
}

export async function releasePartyParticipationRoomLock(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    taskId,
  } = {},
) {
  if (!redis) return;
  const key = buildGroupChatAiRedisKeys({ prefix, roomId })
    .participationAnalysisRoomLock;
  const safeTaskId = String(taskId || "").trim();
  if (!key || !safeTaskId) return;
  await redis.eval(
    RELEASE_PARTICIPATION_ANALYSIS_RESERVATION_LUA,
    1,
    key,
    safeTaskId,
  );
}

export async function reservePartyParticipationAnalysis(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    taskId,
    ttlMs = 30_000,
  } = {},
) {
  if (!redis) return false;
  const key = buildGroupChatAiRedisKeys({ prefix, roomId })
    .participationAnalysisReservation;
  const safeTaskId = String(taskId || "").trim();
  if (!key || !safeTaskId) return false;
  const result = await redis.set(
    key,
    safeTaskId,
    "PX",
    Math.max(1_000, Math.floor(Number(ttlMs) || 30_000)),
    "NX",
  );
  return String(result || "").toUpperCase() === "OK";
}

export async function releasePartyParticipationAnalysisReservation(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    taskId,
  } = {},
) {
  if (!redis) return;
  const key = buildGroupChatAiRedisKeys({ prefix, roomId })
    .participationAnalysisReservation;
  const safeTaskId = String(taskId || "").trim();
  if (!key || !safeTaskId) return;
  await redis.eval(
    RELEASE_PARTICIPATION_ANALYSIS_RESERVATION_LUA,
    1,
    key,
    safeTaskId,
  );
}

export async function reserveGroupChatAiPendingCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    userId,
    duplicateHash = "",
  } = {},
) {
  const keys = buildGroupChatAiRedisKeys({
    prefix,
    roomId,
    userId,
    hash: duplicateHash,
  });
  if (!redis || !keys.roomPending || !keys.userPending) {
    return {
      accepted: false,
      code: "redis_unavailable",
      message: "AI 队列服务暂不可用，请稍后再试。",
    };
  }
  const code = String(
    await redis.eval(
      RESERVE_PENDING_CAPACITY_LUA,
      3,
      keys.roomPending,
      keys.userPending,
      keys.duplicate,
      GROUP_CHAT_AI_LIMITS.roomPending,
      GROUP_CHAT_AI_LIMITS.userPending,
      GROUP_CHAT_AI_LIMITS.duplicateWindowMs,
    ),
  );
  return {
    accepted: code === "accepted",
    code,
    message: GROUP_CHAT_AI_ENQUEUE_MESSAGES[code] || "AI 队列服务暂不可用，请稍后再试。",
  };
}

export async function rollbackGroupChatAiPendingCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    userId,
    duplicateHash = "",
  } = {},
) {
  if (!redis) return;
  const keys = buildGroupChatAiRedisKeys({
    prefix,
    roomId,
    userId,
    hash: duplicateHash,
  });
  await redis.eval(
    DECREMENT_WITH_FLOOR_LUA,
    2,
    keys.roomPending,
    keys.userPending,
  );
  if (keys.duplicate) {
    await redis.del(keys.duplicate);
  }
}

export async function enqueueGroupChatAiTaskId(
  redis,
  { prefix = DEFAULT_PREFIX, taskId } = {},
) {
  const queueKey = buildGroupChatAiRedisKeys({ prefix }).queue;
  await redis.rpush(queueKey, String(taskId || "").trim());
}

export async function popGroupChatAiTaskId(
  redis,
  { prefix = DEFAULT_PREFIX, timeoutSeconds = 5 } = {},
) {
  const queueKey = buildGroupChatAiRedisKeys({ prefix }).queue;
  const result = await redis.blpop(queueKey, timeoutSeconds);
  if (!Array.isArray(result) || result.length < 2) return "";
  return String(result[1] || "").trim();
}

export async function requeueGroupChatAiTaskId(
  redis,
  { prefix = DEFAULT_PREFIX, taskId } = {},
) {
  const queueKey = buildGroupChatAiRedisKeys({ prefix }).queue;
  await redis.rpush(queueKey, String(taskId || "").trim());
}

export async function tryAcquireGroupChatAiRunningCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    userId,
  } = {},
) {
  const keys = buildGroupChatAiRedisKeys({ prefix, roomId, userId });
  const code = String(
    await redis.eval(
      ACQUIRE_RUNNING_CAPACITY_LUA,
      3,
      keys.globalRunning,
      keys.roomRunning,
      keys.userRunning,
      GROUP_CHAT_AI_LIMITS.globalRunning,
      GROUP_CHAT_AI_LIMITS.roomRunning,
      GROUP_CHAT_AI_LIMITS.userRunning,
    ),
  );
  return {
    accepted: code === "accepted",
    code,
    message: GROUP_CHAT_AI_START_MESSAGES[code] || "AI 队列服务暂不可用，请稍后再试。",
  };
}

export async function tryAcquirePartyParticipationRunningCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
  } = {},
) {
  if (!redis) {
    return {
      accepted: false,
      code: "redis_unavailable",
      message: "AI 队列服务暂不可用，请稍后再试。",
    };
  }
  const keys = buildGroupChatAiRedisKeys({ prefix });
  const code = String(
    await redis.eval(
      ACQUIRE_PARTICIPATION_RUNNING_CAPACITY_LUA,
      2,
      keys.globalRunning,
      keys.participationRunning,
      GROUP_CHAT_AI_LIMITS.globalRunning,
      GROUP_CHAT_AI_LIMITS.participationRunning,
    ),
  );
  return {
    accepted: code === "accepted",
    code,
    message: code === "participation_running_limit"
      ? "参与度分析任务较多，已进入排队。"
      : GROUP_CHAT_AI_START_MESSAGES[code] || "AI 队列服务暂不可用，请稍后再试。",
  };
}

export async function decrementGroupChatAiPendingCounters(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    userId,
  } = {},
) {
  if (!redis) return;
  const keys = buildGroupChatAiRedisKeys({ prefix, roomId, userId });
  await redis.eval(
    DECREMENT_WITH_FLOOR_LUA,
    2,
    keys.roomPending,
    keys.userPending,
  );
}

export async function releaseGroupChatAiRunningCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    userId,
  } = {},
) {
  if (!redis) return;
  const keys = buildGroupChatAiRedisKeys({ prefix, roomId, userId });
  await redis.eval(
    DECREMENT_WITH_FLOOR_LUA,
    3,
    keys.globalRunning,
    keys.roomRunning,
    keys.userRunning,
  );
}

export async function releasePartyParticipationRunningCapacity(
  redis,
  {
    prefix = DEFAULT_PREFIX,
  } = {},
) {
  if (!redis) return;
  const keys = buildGroupChatAiRedisKeys({ prefix });
  await redis.eval(
    DECREMENT_WITH_FLOOR_LUA,
    2,
    keys.globalRunning,
    keys.participationRunning,
  );
}

export async function publishGroupChatAiMessageUpdated(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    message,
  } = {},
) {
  if (!redis) return;
  const channel = buildGroupChatAiRedisKeys({ prefix }).events;
  await redis.publish(
    channel,
    JSON.stringify({
      type: "message_updated",
      roomId: String(roomId || "").trim(),
      message,
    }),
  );
}

export async function publishGroupChatAiMessageCreated(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    message,
  } = {},
) {
  if (!redis) return;
  const channel = buildGroupChatAiRedisKeys({ prefix }).events;
  await redis.publish(
    channel,
    JSON.stringify({
      type: "message_created",
      roomId: String(roomId || "").trim(),
      message,
    }),
  );
}

export async function publishGroupChatAiRealtimePayload(
  redis,
  {
    prefix = DEFAULT_PREFIX,
    roomId,
    payload,
  } = {},
) {
  if (!redis || !payload || typeof payload !== "object") return;
  const channel = buildGroupChatAiRedisKeys({ prefix }).events;
  await redis.publish(
    channel,
    JSON.stringify({
      type: "realtime_payload",
      roomId: String(roomId || "").trim(),
      payload,
    }),
  );
}
