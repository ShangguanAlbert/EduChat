const OUTCOME_WINDOW_MS = 15 * 60 * 1000;
const MEMORY_USE_TYPES = new Set(["student_reply", "group_intervention"]);
const MEMORY_KINDS = new Set(["longitudinal", "collaboration"]);

function safeText(value, maxLength = 800) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replaceAll("\0", "")
    .trim()
    .slice(0, maxLength);
}

function safeDate(value, fallback = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : fallback;
}

function safeIds(value, limit = 24) {
  return Array.from(new Set(
    (Array.isArray(value) ? value : [])
      .map((item) => safeText(item, 100))
      .filter(Boolean),
  )).slice(0, limit);
}

function normalizeMemoryItem(item) {
  const memoryId = safeText(item?._id || item?.id || item?.memoryId, 100);
  if (!memoryId) return null;
  return {
    memoryId,
    memoryVersion: safeText(
      item?.updatedAt || item?.consolidatedAt || item?.lastBoundaryAt,
      100,
    ),
    subjectType: safeText(item?.subjectType, 30),
    subjectId: safeText(item?.subjectId, 100),
  };
}

export async function recordPartyMemoryUses({
  MemoryUse,
  roomId,
  taskId = "",
  projectId = "",
  memoryKind,
  memories = [],
  memoryIds = [],
  useType,
  retrievalReason = "",
  retrievalScore = null,
  groupChatAiTaskId = "",
  agentMessageIds = [],
  interventionId = "",
  usedAt = new Date(),
} = {}) {
  const safeRoomId = safeText(roomId, 100);
  const safeKind = safeText(memoryKind, 30);
  const safeUseType = safeText(useType, 40);
  if (!MemoryUse || !safeRoomId || !MEMORY_KINDS.has(safeKind) || !MEMORY_USE_TYPES.has(safeUseType)) {
    return { recorded: 0 };
  }
  const itemById = new Map(
    (Array.isArray(memories) ? memories : [])
      .map(normalizeMemoryItem)
      .filter(Boolean)
      .map((item) => [item.memoryId, item]),
  );
  safeIds(memoryIds, 24).forEach((memoryId) => {
    if (!itemById.has(memoryId)) itemById.set(memoryId, { memoryId });
  });
  if (!itemById.size) return { recorded: 0 };

  const safeTaskId = safeText(taskId, 200);
  const safeProjectId = safeText(projectId, 200);
  const safeTaskReference = safeText(
    interventionId || groupChatAiTaskId || safeTaskId,
    150,
  );
  if (!safeTaskReference) return { recorded: 0 };
  const safeUsedAt = safeDate(usedAt);
  const operations = Array.from(itemById.values()).map((item) => {
    const usageKey = `${safeUseType}:${safeTaskReference}:${safeKind}:${item.memoryId}`;
    return {
      updateOne: {
        filter: { usageKey },
        update: {
          $setOnInsert: {
            usageKey,
            roomId: safeRoomId,
            taskId: safeTaskId,
            projectId: safeProjectId,
            memoryKind: safeKind,
            memoryId: item.memoryId,
            memoryVersion: safeText(item.memoryVersion, 100),
            subjectType: safeText(item.subjectType, 30),
            subjectId: safeText(item.subjectId, 100),
            useType: safeUseType,
            retrievalReason: safeText(retrievalReason, 500),
            retrievalScore: Number.isFinite(Number(retrievalScore))
              ? Math.max(0, Math.min(1, Number(retrievalScore)))
              : null,
            groupChatAiTaskId: safeText(groupChatAiTaskId, 100),
            agentMessageIds: safeIds(agentMessageIds, 16),
            interventionId: safeText(interventionId, 100),
            outcomeEventIds: [],
            outcomeStatus: "pending",
            usedAt: safeUsedAt,
          },
        },
        upsert: true,
      },
    };
  });
  const result = await MemoryUse.bulkWrite(operations, { ordered: false });
  return {
    recorded: Math.max(
      0,
      Number(result?.upsertedCount || 0) + Number(result?.modifiedCount || 0),
    ),
  };
}

export async function linkLearningEventToRecentMemoryUses({
  MemoryUse,
  event,
  now = new Date(),
} = {}) {
  const eventId = safeText(event?._id || event?.id, 100);
  const roomId = safeText(event?.roomId, 100);
  const role = safeText(event?.role, 30);
  const eventType = safeText(event?.eventType, 60);
  if (!MemoryUse || !eventId || !roomId || role === "paia" || eventType === "task_switch") {
    return null;
  }
  const occurredAt = safeDate(event?.occurredAt, safeDate(now));
  return MemoryUse.updateMany(
    {
      roomId,
      usedAt: {
        $lte: occurredAt,
        $gte: new Date(occurredAt.getTime() - OUTCOME_WINDOW_MS),
      },
    },
    {
      $addToSet: { outcomeEventIds: eventId },
      $set: { outcomeStatus: "observed" },
    },
  );
}

export async function recordMemoryUseFeedback({
  MemoryUse,
  interventionId,
  feedback,
  userId,
  feedbackAt = new Date(),
} = {}) {
  const safeInterventionId = safeText(interventionId, 100);
  const safeFeedback = safeText(feedback, 20);
  const outcomeStatus = safeFeedback === "correct"
    ? "helpful"
    : safeFeedback === "partial"
      ? "partial"
      : safeFeedback === "incorrect"
        ? "unsuitable"
        : "pending";
  if (!MemoryUse || !safeInterventionId || outcomeStatus === "pending") return null;
  return MemoryUse.updateMany(
    { interventionId: safeInterventionId },
    {
      $set: {
        feedback: safeFeedback,
        feedbackByUserId: safeText(userId, 100),
        feedbackAt: safeDate(feedbackAt),
        outcomeStatus,
      },
    },
  );
}

export function normalizeMemoryUseForAdmin(doc) {
  if (!doc) return null;
  return {
    id: safeText(doc?._id || doc?.id, 100),
    roomId: safeText(doc?.roomId, 100),
    taskId: safeText(doc?.taskId, 200),
    projectId: safeText(doc?.projectId, 200),
    memoryKind: safeText(doc?.memoryKind, 30),
    memoryId: safeText(doc?.memoryId, 100),
    memoryVersion: safeText(doc?.memoryVersion, 100),
    subjectType: safeText(doc?.subjectType, 30),
    subjectId: safeText(doc?.subjectId, 100),
    useType: safeText(doc?.useType, 40),
    retrievalReason: safeText(doc?.retrievalReason, 500),
    retrievalScore: Number.isFinite(Number(doc?.retrievalScore))
      ? Math.max(0, Math.min(1, Number(doc.retrievalScore)))
      : null,
    groupChatAiTaskId: safeText(doc?.groupChatAiTaskId, 100),
    agentMessageIds: safeIds(doc?.agentMessageIds, 16),
    interventionId: safeText(doc?.interventionId, 100),
    outcomeEventIds: safeIds(doc?.outcomeEventIds, 100),
    outcomeStatus: safeText(doc?.outcomeStatus, 30) || "pending",
    feedback: safeText(doc?.feedback, 20),
    feedbackByUserId: safeText(doc?.feedbackByUserId, 100),
    feedbackAt: doc?.feedbackAt || null,
    usedAt: doc?.usedAt || null,
  };
}
