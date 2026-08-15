import {
  getPartyCollaborationMemoryCandidateModel,
  getPartyLearningEventModel,
  getPartyMemoryUseModel,
  getPartyPaiaInterventionModel,
  getPartyWebWorkspaceModel,
} from "./model.js";
import {
  normalizePublicCollaborationIntervention,
} from "./collaboration-agent.js";
import {
  recordHumanValidatedCollaborationMemory,
} from "./collaboration-memory.js";
import {
  linkLearningEventToRecentMemoryUses,
  recordMemoryUseFeedback,
} from "./memory-usage.js";
import { GroupChatAiTask } from "../../models/group-chat-ai-task.js";
import {
  getGroupChatAiRedisClient,
  getGroupChatAiRedisPrefix,
} from "../../runtime/group-chat-ai-runtime.js";
import {
  enqueueGroupChatAiTaskId,
  releasePartyParticipationAnalysisReservation,
  reservePartyParticipationAnalysis,
} from "../../runtime/group-chat-ai-redis.js";
import {
  PARTICIPATION_ANALYSIS_SCHEDULE_INTERVAL_MS,
  buildParticipationAnalysisTriggerMessageId,
} from "./participation-analysis.js";

const ANALYSIS_WINDOW_MS = 5 * 60 * 1000;
const AGREEMENT_PATTERN = /^(可以|行|好|好的|同意|没问题|就这样|可以的|嗯|ok|okay)[。！!，,\s]*$/i;
const REASON_PATTERN = /(因为|原因|所以|考虑|如果|依据|我觉得|我认为|这样做|优点|缺点)/;

function safeText(value, maxLength = 500) {
  return String(value || "").replace(/\r\n/g, "\n").trim().slice(0, maxLength);
}

function eventTime(event) {
  const time = new Date(event?.occurredAt || event?.createdAt || 0).getTime();
  return Number.isFinite(time) ? time : 0;
}

function countByUser(events) {
  const counts = new Map();
  events.forEach((event) => {
    const userId = safeText(event?.userId, 100);
    if (!userId) return;
    counts.set(userId, (counts.get(userId) || 0) + 1);
  });
  return counts;
}

function findParticipationImbalance(events, context) {
  const edits = events.filter((event) => event?.eventType === "code_edit");
  if (edits.length < 4) return null;
  const counts = countByUser(edits);
  if (counts.size === 0) return null;
  const ranked = Array.from(counts.entries()).sort((left, right) => right[1] - left[1]);
  const [dominantUserId, dominantCount] = ranked[0];
  const ratio = dominantCount / edits.length;
  if (ratio < 0.8) return null;
  const targetUserId = dominantUserId === context.driverUserId
    ? context.navigatorUserId
    : context.driverUserId;
  if (!targetUserId) return null;
  const targetContributed = events.some(
    (event) => event?.userId === targetUserId && event?.eventType === "chat_message",
  );
  if (targetContributed) return null;
  const targetName = context.memberNames?.[targetUserId] || "另一位同学";
  return {
    triggerType: "participation_imbalance",
    targetUserId,
    evidenceSummary: `最近 ${edits.length} 次代码编辑中，有 ${dominantCount} 次来自同一位同学。`,
    prompt: `我注意到最近的代码修改主要由一位同学完成。${targetName}可以先说说你观察到的问题或下一步建议吗？`,
  };
}

function findQuickAgreement(events) {
  const chats = events.filter((event) => event?.eventType === "chat_message");
  if (chats.length < 2) return null;
  const latest = chats.at(-1);
  const content = safeText(latest?.metadata?.content, 300);
  if (!AGREEMENT_PATTERN.test(content) || REASON_PATTERN.test(content)) return null;
  const previous = chats.slice(0, -1).reverse().find((event) => event?.userId !== latest?.userId);
  if (!previous || eventTime(latest) - eventTime(previous) > 2 * 60 * 1000) return null;
  return {
    triggerType: "quick_agreement",
    targetUserId: "",
    evidenceSummary: "两位同学很快达成一致，但最近的讨论中尚未看到具体理由。",
    prompt: "你们已经很快达成了一致。可以请两位同学分别用一句话说明这样设计的理由，再决定是否继续吗？",
  };
}

function findRepeatedTrial(events) {
  const previews = events.filter((event) => event?.eventType === "preview");
  if (previews.length < 3) return null;
  const firstPreviewAt = eventTime(previews.at(-3));
  const diagnostics = events.filter(
    (event) => event?.eventType === "diagnostic_error" && eventTime(event) >= firstPreviewAt,
  );
  const edits = events.filter(
    (event) => event?.eventType === "code_edit" && eventTime(event) >= firstPreviewAt,
  );
  if (diagnostics.length < 2 && edits.length < 4) return null;
  return {
    triggerType: "repeated_trial",
    targetUserId: "",
    evidenceSummary: `最近进行了 ${previews.length} 次预览，并持续出现修改或诊断问题。`,
    prompt: "你们已经连续尝试了几次。先暂停一下：你们预测问题最可能出在 HTML 结构还是 CSS 样式？请选一个最小位置验证。",
  };
}

function findAiAnswerAdoption(events) {
  const latestAiEvent = events
    .filter((event) => event?.eventType === "paia_intervention" || event?.metadata?.senderKind === "ai")
    .at(-1);
  if (!latestAiEvent) return null;
  const largeEdit = events.find(
    (event) => event?.eventType === "code_edit"
      && eventTime(event) > eventTime(latestAiEvent)
      && eventTime(event) - eventTime(latestAiEvent) < 2 * 60 * 1000
      && Number(event?.metadata?.changedCharacters || 0) >= 250,
  );
  if (!largeEdit) return null;
  const explanation = events.find(
    (event) => event?.eventType === "chat_message"
      && eventTime(event) > eventTime(latestAiEvent)
      && REASON_PATTERN.test(safeText(event?.metadata?.content, 300)),
  );
  if (explanation) return null;
  return {
    triggerType: "ai_answer_adoption",
    targetUserId: "",
    evidenceSummary: "AI 提示后出现了较大幅度的代码修改，但尚未看到学生对关键内容的解释。",
    prompt: "代码已经有了较大变化。请你们先指出其中最关键的一处修改，并说明它如何影响网页效果，再刷新预览验证。",
  };
}

export function normalizePaiaIntervention(doc) {
  return normalizePublicCollaborationIntervention(doc);
}

export function detectPaiaIntervention(rawEvents, context = {}, now = Date.now()) {
  const events = (Array.isArray(rawEvents) ? rawEvents : [])
    .filter((event) => now - eventTime(event) <= ANALYSIS_WINDOW_MS)
    .sort((left, right) => eventTime(left) - eventTime(right));
  if (!events.length) return null;
  return findAiAnswerAdoption(events)
    || findParticipationImbalance(events, context)
    || findQuickAgreement(events)
    || findRepeatedTrial(events)
    || null;
}

export function createPartyLearningService(deps) {
  const { mongoose, GroupChatRoom } = deps;
  const Workspace = getPartyWebWorkspaceModel(mongoose);
  const LearningEvent = getPartyLearningEventModel(mongoose);
  const Intervention = getPartyPaiaInterventionModel(mongoose);
  const MemoryUse = getPartyMemoryUseModel(mongoose);
  const CollaborationMemoryCandidate = getPartyCollaborationMemoryCandidateModel(mongoose);

  async function readWorkspace(roomId) {
    return Workspace.findOne({ roomId: safeText(roomId, 100) }).lean();
  }

  async function readMonitoringState(roomId) {
    if (!GroupChatRoom) return null;
    return GroupChatRoom.findOne(
      {
        _id: safeText(roomId, 100),
        teacherScopeKey: "shi-gaojun",
        paiaMonitoringEnabled: true,
      },
      { paiaMonitoringEnabled: 1, paiaMonitoringStartedAt: 1 },
    ).lean();
  }

  async function enqueueParticipationAnalysis({
    roomId,
    triggerMessageId,
    requestedByUserId,
    requestedByUserName,
  }) {
    const safeRoomId = safeText(roomId, 100);
    const safeTriggerMessageId = safeText(triggerMessageId, 100);
    if (!safeRoomId || !safeTriggerMessageId) return null;
    const monitoringState = await readMonitoringState(safeRoomId);
    if (!monitoringState?.paiaMonitoringStartedAt) return null;

    const redis = getGroupChatAiRedisClient(deps.env || process.env);
    if (!redis) return null;
    const redisPrefix = getGroupChatAiRedisPrefix(deps.env || process.env);
    const taskId = String(new mongoose.Types.ObjectId());
    const reserved = await reservePartyParticipationAnalysis(redis, {
      prefix: redisPrefix,
      roomId: safeRoomId,
      taskId,
      ttlMs: PARTICIPATION_ANALYSIS_SCHEDULE_INTERVAL_MS,
    });
    if (!reserved) return null;

    try {
      const task = await GroupChatAiTask.create({
        _id: taskId,
        taskKind: "participation_analysis",
        roomId: safeRoomId,
        triggerMessageId: buildParticipationAnalysisTriggerMessageId(
          safeTriggerMessageId,
        ),
        placeholderMessageId: "",
        requestedByUserId: safeText(requestedByUserId, 100) || "paia-monitor",
        requestedByUserName: safeText(requestedByUserName, 60),
        agentId: "A",
        provider: "aliyun",
        model: "qwen3.7-plus",
        status: "pending",
        contextSnapshot: {
          monitoringStartedAt: new Date(
            monitoringState.paiaMonitoringStartedAt,
          ).toISOString(),
          sourceTriggerMessageId: safeTriggerMessageId,
        },
        queueJobId: taskId,
        attemptCount: 0,
        lastQueuedAt: new Date(),
      });
      await enqueueGroupChatAiTaskId(redis, {
        prefix: redisPrefix,
        taskId,
      });
      return task;
    } catch (error) {
      await GroupChatAiTask.findByIdAndUpdate(taskId, {
        $set: {
          status: "failed",
          finishedAt: new Date(),
          lastError: error?.message || "参与度分析任务入队失败。",
        },
      }).catch(() => {});
      await releasePartyParticipationAnalysisReservation(redis, {
        prefix: redisPrefix,
        roomId: safeRoomId,
        taskId,
      }).catch(() => {});
      throw error;
    }
  }

  function resolveRole(workspace, userId) {
    const safeUserId = safeText(userId, 100);
    if (safeUserId && safeUserId === safeText(workspace?.driverUserId, 100)) return "driver";
    if (safeUserId && safeUserId === safeText(workspace?.navigatorUserId, 100)) return "navigator";
    return "observer";
  }

  async function recordEvent({ roomId, userId = "", userName = "成员", eventType, metadata = {}, workspace = null }) {
    const safeRoomId = safeText(roomId, 100);
    if (!safeRoomId || !eventType) return null;
    const [monitoringState, currentWorkspace] = await Promise.all([
      readMonitoringState(safeRoomId),
      workspace ? Promise.resolve(workspace) : readWorkspace(safeRoomId),
    ]);
    if (!monitoringState) return null;
    const event = await LearningEvent.create({
      roomId: safeRoomId,
      taskId: `${safeRoomId}:${Math.max(1, Number(currentWorkspace?.taskRevision || 1))}`,
      taskStage: safeText(currentWorkspace?.taskStage, 30) || "understand",
      userId: safeText(userId, 100),
      userName: safeText(userName, 60) || "成员",
      role: resolveRole(currentWorkspace, userId),
      eventType,
      metadata,
      occurredAt: new Date(),
    });
    await linkLearningEventToRecentMemoryUses({
      MemoryUse,
      event,
    }).catch(() => {});
    return event;
  }

  async function getLatestIntervention(roomId) {
    const safeRoomId = safeText(roomId, 100);
    const [monitoringState, workspace] = await Promise.all([
      readMonitoringState(safeRoomId),
      readWorkspace(safeRoomId),
    ]);
    if (!monitoringState) return null;
    const taskId = `${safeRoomId}:${Math.max(1, Number(workspace?.taskRevision || 1))}`;
    const doc = await Intervention.findOne({
      roomId: safeRoomId,
      taskId,
      createdAt: { $gte: monitoringState.paiaMonitoringStartedAt || new Date() },
    }).sort({ createdAt: -1 }).lean();
    return normalizePaiaIntervention(doc);
  }

  async function startTask({ roomId, userId, userName, taskText }) {
    const safeRoomId = safeText(roomId, 100);
    if (!safeRoomId) return null;
    await Workspace.findOneAndUpdate(
      { roomId: safeRoomId },
      { $setOnInsert: { roomId: safeRoomId } },
      { new: true, upsert: true, setDefaultsOnInsert: true },
    );
    const workspace = await Workspace.findOneAndUpdate(
      { roomId: safeRoomId },
      {
        $set: { taskStage: "understand" },
        $inc: { taskRevision: 1 },
      },
      { new: true },
    ).lean();
    await recordEvent({
      roomId: safeRoomId,
      userId,
      userName,
      eventType: "task_switch",
      metadata: { taskText: safeText(taskText, 500), taskRevision: workspace.taskRevision },
      workspace,
    });
    deps.broadcastGroupChatWsPayload?.(safeRoomId, {
      type: "coding_collab_workspace_updated",
      roomId: safeRoomId,
      workspace: {
        roomId: safeRoomId,
        revision: Math.max(1, Number(workspace.revision || 1)),
        taskStage: workspace.taskStage,
        taskRevision: workspace.taskRevision,
        taskId: `${safeRoomId}:${workspace.taskRevision}`,
        driverUserId: safeText(workspace.driverUserId, 100),
        navigatorUserId: safeText(workspace.navigatorUserId, 100),
        roleRotationCount: Math.max(0, Number(workspace.roleRotationCount || 0)),
        rolesUpdatedAt: workspace.rolesUpdatedAt ? new Date(workspace.rolesUpdatedAt).toISOString() : "",
        lastPreviewAt: workspace.lastPreviewAt ? new Date(workspace.lastPreviewAt).toISOString() : "",
        lastPreviewByUserId: safeText(workspace.lastPreviewByUserId, 100),
        lastDiagnostics: Array.isArray(workspace.lastDiagnostics) ? workspace.lastDiagnostics.map(String).slice(0, 20) : [],
      },
    });
    deps.broadcastGroupChatWsPayload?.(safeRoomId, {
      type: "coding_collab_intervention",
      roomId: safeRoomId,
      intervention: null,
    });
    return workspace;
  }

  async function submitFeedback({ roomId, interventionId, userId, feedback, note = "" }) {
    const safeFeedback = safeText(feedback, 20);
    if (!new Set(["correct", "partial", "incorrect"]).has(safeFeedback)) return null;
    const safeRoomId = safeText(roomId, 100);
    const safeUserId = safeText(userId, 100);
    const safeNote = safeText(note, 500);
    const feedbackAt = new Date();
    const interventionFilter = { _id: interventionId, roomId: safeRoomId };
    let isNewFeedback = true;
    let updated = await Intervention.findOneAndUpdate(
      {
        ...interventionFilter,
        feedback: { $in: ["", null] },
      },
      {
        $set: {
          feedback: safeFeedback,
          feedbackNote: safeNote,
          feedbackByUserId: safeUserId,
          feedbackAt,
        },
      },
      { new: true },
    ).lean();
    if (!updated) {
      const existing = await Intervention.findOne(interventionFilter).lean();
      const isIdempotentRetry = existing
        && safeText(existing.feedback, 20) === safeFeedback
        && safeText(existing.feedbackNote, 500) === safeNote
        && safeText(existing.feedbackByUserId, 100) === safeUserId;
      if (!isIdempotentRetry) return null;
      updated = existing;
      isNewFeedback = false;
    }
    if (isNewFeedback) {
      await recordEvent({
        roomId: safeRoomId,
        userId: safeUserId,
        eventType: "paia_feedback",
        metadata: {
          interventionId: String(updated._id),
          feedback: safeFeedback,
          note: safeNote,
        },
      });
    }
    await recordHumanValidatedCollaborationMemory({
      Candidate: CollaborationMemoryCandidate,
      intervention: updated,
      feedback: safeFeedback,
      userId: safeUserId,
      note: safeNote,
      now: updated.feedbackAt || feedbackAt,
    });
    await recordMemoryUseFeedback({
      MemoryUse,
      interventionId: updated._id,
      feedback: safeFeedback,
      userId: safeUserId,
      feedbackAt: updated.feedbackAt || feedbackAt,
    }).catch(() => {});
    return normalizePaiaIntervention(updated);
  }

  return {
    enqueueParticipationAnalysis,
    getLatestIntervention,
    recordEvent,
    startTask,
    submitFeedback,
  };
}
