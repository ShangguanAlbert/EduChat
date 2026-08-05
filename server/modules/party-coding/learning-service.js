import {
  getPartyLearningEventModel,
  getPartyPaiaInterventionModel,
  getPartyWebWorkspaceModel,
} from "./model.js";

const ANALYSIS_WINDOW_MS = 5 * 60 * 1000;
const INTERVENTION_COOLDOWN_MS = 3 * 60 * 1000;
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
  const { mongoose } = deps;
  const Workspace = getPartyWebWorkspaceModel(mongoose);
  const LearningEvent = getPartyLearningEventModel(mongoose);
  const Intervention = getPartyPaiaInterventionModel(mongoose);

  function normalizeIntervention(doc) {
    if (!doc) return null;
    return {
      id: String(doc?._id || ""),
      triggerType: safeText(doc.triggerType, 80),
      evidenceSummary: safeText(doc.evidenceSummary, 500),
      prompt: safeText(doc.prompt, 800),
      targetUserId: safeText(doc.targetUserId, 100),
      feedback: safeText(doc.feedback, 20),
      feedbackNote: safeText(doc.feedbackNote, 500),
      feedbackByUserId: safeText(doc.feedbackByUserId, 100),
      feedbackAt: doc.feedbackAt ? new Date(doc.feedbackAt).toISOString() : "",
      createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : "",
    };
  }

  async function readWorkspace(roomId) {
    return Workspace.findOne({ roomId: safeText(roomId, 100) }).lean();
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
    const currentWorkspace = workspace || await readWorkspace(safeRoomId);
    return LearningEvent.create({
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
  }

  async function maybeIntervene({ roomId, memberNames = {} }) {
    const safeRoomId = safeText(roomId, 100);
    if (!safeRoomId) return null;
    const [workspace, latestIntervention, recentEvents] = await Promise.all([
      readWorkspace(safeRoomId),
      Intervention.findOne({ roomId: safeRoomId }).sort({ createdAt: -1 }).lean(),
      LearningEvent.find({
        roomId: safeRoomId,
        occurredAt: { $gte: new Date(Date.now() - ANALYSIS_WINDOW_MS) },
      }).sort({ occurredAt: 1 }).limit(120).lean(),
    ]);
    if (!workspace) return null;
    if (latestIntervention && Date.now() - new Date(latestIntervention.createdAt).getTime() < INTERVENTION_COOLDOWN_MS) {
      return null;
    }
    const decision = detectPaiaIntervention(recentEvents, {
      driverUserId: safeText(workspace.driverUserId, 100),
      navigatorUserId: safeText(workspace.navigatorUserId, 100),
      memberNames,
    });
    if (!decision) return null;
    if (latestIntervention?.feedback === "incorrect"
      && latestIntervention?.triggerType === decision.triggerType
      && Date.now() - new Date(latestIntervention.createdAt).getTime() < 15 * 60 * 1000) {
      return null;
    }
    if (latestIntervention?.feedback === "partial"
      && latestIntervention?.triggerType === decision.triggerType
      && Date.now() - new Date(latestIntervention.createdAt).getTime() < 6 * 60 * 1000) {
      return null;
    }

    const intervention = await Intervention.create({
      roomId: safeRoomId,
      taskId: `${safeRoomId}:${Math.max(1, Number(workspace.taskRevision || 1))}`,
      taskStage: workspace.taskStage,
      ...decision,
    });
    await recordEvent({
      roomId: safeRoomId,
      userName: "琳琳",
      eventType: "paia_intervention",
      metadata: {
        interventionId: String(intervention._id),
        triggerType: decision.triggerType,
        evidenceSummary: decision.evidenceSummary,
      },
      workspace,
    });

    if (deps.GroupChatMessage && deps.normalizeGroupChatMessageDoc && deps.broadcastGroupChatMessageCreated) {
      const messageDoc = await deps.GroupChatMessage.create({
        roomId: safeRoomId,
        type: "text",
        senderKind: "ai",
        senderUserId: "",
        senderName: "琳琳 · PAIA",
        content: `${decision.prompt}\n\n判断依据：${decision.evidenceSummary}`,
        mentionNames: [],
        reactions: [],
      });
      const message = deps.normalizeGroupChatMessageDoc(messageDoc);
      if (message) deps.broadcastGroupChatMessageCreated(safeRoomId, message);
    }

    const normalized = normalizeIntervention(intervention);
    deps.broadcastGroupChatWsPayload?.(safeRoomId, {
      type: "coding_collab_intervention",
      roomId: safeRoomId,
      intervention: normalized,
    });
    return normalized;
  }

  async function getLatestIntervention(roomId) {
    const safeRoomId = safeText(roomId, 100);
    const workspace = await readWorkspace(safeRoomId);
    const taskId = `${safeRoomId}:${Math.max(1, Number(workspace?.taskRevision || 1))}`;
    const doc = await Intervention.findOne({ roomId: safeRoomId, taskId }).sort({ createdAt: -1 }).lean();
    return normalizeIntervention(doc);
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
    const updated = await Intervention.findOneAndUpdate(
      { _id: interventionId, roomId: safeText(roomId, 100) },
      {
        $set: {
          feedback: safeFeedback,
          feedbackNote: safeText(note, 500),
          feedbackByUserId: safeText(userId, 100),
          feedbackAt: new Date(),
        },
      },
      { new: true },
    ).lean();
    if (!updated) return null;
    await recordEvent({
      roomId,
      userId,
      eventType: "paia_feedback",
      metadata: { interventionId: String(updated._id), feedback: safeFeedback, note: safeText(note, 500) },
    });
    return normalizeIntervention(updated);
  }

  return {
    getLatestIntervention,
    maybeIntervene,
    recordEvent,
    startTask,
    submitFeedback,
  };
}
