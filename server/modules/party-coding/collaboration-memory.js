import {
  deriveSupportNeedFromTrigger,
  normalizeSupportNeed,
} from "./collaboration-agent.js";

const MEMORY_RETENTION_MS = 90 * 24 * 60 * 60 * 1000;
const VALID_FEEDBACK = new Set(["correct", "partial", "incorrect"]);
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

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

export function resolveNextNightlyMemoryUpdateAt(value = new Date()) {
  const now = safeDate(value);
  const local = new Date(now.getTime() + SHANGHAI_OFFSET_MS);
  let targetUtcMs = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    15,
    30,
  );
  if (targetUtcMs <= now.getTime()) targetUtcMs += 24 * 60 * 60 * 1000;
  return new Date(targetUtcMs);
}

export async function readRelevantCollaborationMemories({
  Memory,
  roomId,
  supportNeed,
  now = new Date(),
} = {}) {
  if (!Memory || !roomId || !supportNeed) return [];
  return Memory.find({
    roomId: safeText(roomId, 100),
    scope: "room",
    supportNeed: safeText(supportNeed, 60),
    expiresAt: { $gt: now },
  })
    .sort({ lastValidatedAt: -1, consolidatedAt: -1 })
    .limit(5)
    .lean();
}

export async function recordHumanValidatedCollaborationMemory({
  Candidate,
  intervention,
  feedback,
  userId,
  note = "",
  now = new Date(),
} = {}) {
  if (!Candidate || !intervention || !feedback) return null;
  const verdict = safeText(feedback, 20).toLowerCase();
  if (!VALID_FEEDBACK.has(verdict)) return null;
  const roomId = safeText(intervention.roomId, 100);
  const sourceInterventionId = safeText(intervention._id || intervention.id, 100);
  const strategyKey = safeText(intervention?.orchestration?.strategyKey, 80);
  if (!roomId || !sourceInterventionId || !strategyKey) return null;
  const validatedAt = safeDate(now);
  const supportNeed = normalizeSupportNeed(
    intervention.supportNeed,
    deriveSupportNeedFromTrigger(intervention.triggerType),
  );
  const appliedMemoryIds = (Array.isArray(intervention?.orchestration?.memoryIds)
    ? intervention.orchestration.memoryIds
    : [])
    .map((item) => safeText(item, 100))
    .filter(Boolean)
    .slice(0, 5);
  const summary = verdict === "incorrect"
    ? "学生指出这条协作支持与当时的小组实际情况不匹配。"
    : verdict === "partial"
      ? "学生认为这条协作支持只部分贴合当时的小组实际情况。"
      : "学生确认这条协作支持与当时的小组实际情况贴合。";
  return Candidate.findOneAndUpdate(
    { sourceInterventionId },
    {
      $setOnInsert: {
        roomId,
        scope: "room",
        memoryType: "intervention_feedback",
        supportNeed,
        strategyKey,
        appliedMemoryIds,
        triggerType: safeText(intervention.triggerType, 80),
        taskStage: safeText(intervention.taskStage, 30),
        verdict,
        summary,
        feedbackNote: safeText(note, 500),
        sourceInterventionId,
        validatedByUserId: safeText(userId, 100),
        validatedAt,
        eligibleAt: resolveNextNightlyMemoryUpdateAt(validatedAt),
        status: "pending",
        createdAt: validatedAt,
      },
    },
    { new: true, upsert: true, setDefaultsOnInsert: true },
  ).lean();
}

function resolveConsolidatedVerdict(counts) {
  if (counts.incorrectCount > counts.correctCount) return "incorrect";
  if (counts.correctCount > counts.incorrectCount) return "correct";
  return "partial";
}

export async function consolidateEligibleCollaborationMemories({
  Candidate,
  Memory,
  now = new Date(),
  limit = 100,
} = {}) {
  if (!Candidate || !Memory) return { candidates: 0 };
  const consolidatedAt = safeDate(now);
  const candidates = await Candidate.find({
    status: "pending",
    eligibleAt: { $lte: consolidatedAt },
  })
    .sort({ validatedAt: 1 })
    .limit(Math.max(1, Math.min(500, Number(limit) || 100)))
    .lean();
  let candidateCount = 0;
  for (const candidate of candidates) {
    const candidateId = safeText(candidate?._id, 100);
    const roomId = safeText(candidate?.roomId, 100);
    const strategyKey = safeText(candidate?.strategyKey, 80);
    if (!candidateId || !roomId || !strategyKey) continue;
    const filter = {
      roomId,
      scope: "room",
      supportNeed: normalizeSupportNeed(candidate.supportNeed),
      strategyKey,
    };
    const existing = await Memory.findOne(filter).lean();
    const sourceCandidateIds = (Array.isArray(existing?.sourceCandidateIds)
      ? existing.sourceCandidateIds
      : []).map(String);
    if (!sourceCandidateIds.includes(candidateId)) {
      const counts = {
        correctCount: Math.max(0, Number(existing?.correctCount || 0)),
        partialCount: Math.max(0, Number(existing?.partialCount || 0)),
        incorrectCount: Math.max(0, Number(existing?.incorrectCount || 0)),
      };
      const countKey = `${safeText(candidate.verdict, 20)}Count`;
      if (Object.hasOwn(counts, countKey)) counts[countKey] += 1;
      await Memory.findOneAndUpdate(
        filter,
        {
          $set: {
            ...counts,
            verdict: resolveConsolidatedVerdict(counts),
            lastValidatedAt: safeDate(candidate.validatedAt, consolidatedAt),
            consolidatedAt,
            expiresAt: new Date(consolidatedAt.getTime() + MEMORY_RETENTION_MS),
          },
          $setOnInsert: {
            memoryType: "intervention_feedback",
            createdAt: consolidatedAt,
            useCount: 0,
          },
          $addToSet: { sourceCandidateIds: candidateId },
        },
        { new: true, upsert: true, setDefaultsOnInsert: true },
      ).lean();
    }
    await Candidate.updateOne(
      { _id: candidate._id, status: "pending" },
      { $set: { status: "consolidated", consolidatedAt } },
    );
    candidateCount += 1;
  }
  return { candidates: candidateCount };
}

export async function markCollaborationMemoriesUsed({
  Memory,
  memoryIds = [],
  now = new Date(),
} = {}) {
  const ids = (Array.isArray(memoryIds) ? memoryIds : [])
    .map((item) => safeText(item, 100))
    .filter(Boolean)
    .slice(0, 5);
  if (!Memory || !ids.length) return null;
  return Memory.updateMany(
    { _id: { $in: ids } },
    { $inc: { useCount: 1 }, $set: { lastUsedAt: safeDate(now) } },
  );
}
