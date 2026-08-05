const GROUP_CHAT_AI_MENTION_PATTERN = /(^|[\s(（[{"'“‘])@ai(?=$|[\s,，。！？!?;；:：)\]}>”’'"])/i;

export const GROUP_CHAT_AI_RUNTIME = Object.freeze({
  agentId: "A",
  provider: "aliyun",
  model: "qwen3.7-plus",
  protocol: "dashscope",
});

export const GROUP_CHAT_AI_LIMITS = Object.freeze({
  roomRunning: 4,
  userRunning: 2,
  userPending: 3,
  roomPending: 12,
  duplicateWindowMs: 10_000,
  taskTimeoutMs: 75_000,
});

const GROUP_CHAT_AI_TASK_TEXT_MAX_CHARS = 500;
const GROUP_CHAT_AI_TASK_ATTACHMENT_MAX_CHARS = 8_000;
const GROUP_CHAT_AI_TASK_ATTACHMENTS_MAX_CHARS = 20_000;

export function isGroupChatAiMentionRequested(content) {
  return GROUP_CHAT_AI_MENTION_PATTERN.test(String(content || ""));
}

export function stripGroupChatAiMentions(content) {
  return String(content || "")
    .replace(/(^|[\s(（[{"'“‘])@ai(?=$|[\s,，。！？!?;；:：)\]}>”’'"])/gi, "$1")
    .replace(/\s{2,}/g, " ")
    .trim();
}

export function checkGroupChatAiEnqueuePolicy(
  {
    duplicateActive = false,
    roomPendingCount = 0,
    userPendingCount = 0,
  } = {},
  limits = GROUP_CHAT_AI_LIMITS,
) {
  if (duplicateActive) {
    return {
      accepted: false,
      code: "duplicate_active",
      message: "相同问题已在处理中。",
    };
  }
  if (Number(roomPendingCount) >= Number(limits.roomPending || 0)) {
    return {
      accepted: false,
      code: "room_pending_limit",
      message: "当前群聊等待中的 AI 请求过多，请稍后再试。",
    };
  }
  if (Number(userPendingCount) >= Number(limits.userPending || 0)) {
    return {
      accepted: false,
      code: "user_pending_limit",
      message: "你当前等待中的 AI 请求过多，请稍后再试。",
    };
  }
  return {
    accepted: true,
    code: "accepted",
    message: "",
  };
}

export function checkGroupChatAiStartPolicy(
  {
    roomRunningCount = 0,
    userRunningCount = 0,
  } = {},
  limits = GROUP_CHAT_AI_LIMITS,
) {
  if (Number(roomRunningCount) >= Number(limits.roomRunning || 0)) {
    return {
      accepted: false,
      code: "room_running_limit",
      message: "当前群聊正在运行的 AI 请求过多，请稍后再试。",
    };
  }
  if (Number(userRunningCount) >= Number(limits.userRunning || 0)) {
    return {
      accepted: false,
      code: "user_running_limit",
      message: "你当前正在运行的 AI 请求过多，请稍后再试。",
    };
  }
  return {
    accepted: true,
    code: "accepted",
    message: "",
  };
}

export function buildGroupChatAiContextSnapshot({
  room,
  triggerMessage,
  recentMessages,
} = {}) {
  const safeRoom = room && typeof room === "object" ? room : {};
  const safeTrigger = triggerMessage && typeof triggerMessage === "object" ? triggerMessage : {};
  const safeRecentMessages = Array.isArray(recentMessages) ? recentMessages.filter(Boolean) : [];
  const triggerMessageId = sanitizeText(safeTrigger.id);
  const replyTargetMessageId = sanitizeText(safeTrigger.replyToMessageId);
  const requestedByUserId = sanitizeText(safeTrigger.senderUserId);
  const requestedByUserName = sanitizeText(safeTrigger.senderName, "用户");
  const userQuestion = stripGroupChatAiMentions(safeTrigger.content);
  const taskContext = normalizeTaskContext(safeRoom);

  const attachmentMessages = [];
  const seenAttachmentIds = new Set();
  safeRecentMessages.forEach((message) => {
    const normalized = normalizeSnapshotMessage(message);
    if (!normalized) return;
    const isAttachment = normalized.type === "image" || normalized.type === "file";
    if (!isAttachment) return;
    const isReplyTarget = normalized.id === replyTargetMessageId;
    if (!isReplyTarget) return;
    if (seenAttachmentIds.has(normalized.id)) return;
    seenAttachmentIds.add(normalized.id);
    attachmentMessages.push(normalized);
  });

  safeRecentMessages.forEach((message) => {
    const normalized = normalizeSnapshotMessage(message);
    if (!normalized) return;
    if (normalized.id === triggerMessageId) return;
    const isAttachment = normalized.type === "image" || normalized.type === "file";
    if (!isAttachment) return;
    if (seenAttachmentIds.has(normalized.id)) return;
    if (attachmentMessages.length >= 3) return;
    seenAttachmentIds.add(normalized.id);
    attachmentMessages.push(normalized);
  });

  const transcriptLines = safeRecentMessages
    .map((message) => normalizeSnapshotMessage(message))
    .filter(Boolean)
    .filter((message) => message.id !== triggerMessageId)
    .filter((message) => message.type === "text" || message.type === "system")
    .map((message) => `${message.senderName}：${message.content}`)
    .filter(Boolean);

  return {
    roomId: sanitizeText(safeRoom.id || safeRoom._id),
    roomName: sanitizeText(safeRoom.name, "群聊"),
    triggerMessageId,
    replyTargetMessageId,
    requestedByUserId,
    requestedByUserName,
    userQuestion,
    taskContext,
    attachmentMessages,
    transcriptText: transcriptLines.join("\n"),
  };
}

function normalizeTaskContext(room) {
  const taskText = sanitizeText(room?.announcement, "").slice(
    0,
    GROUP_CHAT_AI_TASK_TEXT_MAX_CHARS,
  );
  let totalAttachmentChars = 0;
  const attachments = (Array.isArray(room?.announcementAttachments)
    ? room.announcementAttachments
    : []
  )
    .map((item) => {
      const remaining = GROUP_CHAT_AI_TASK_ATTACHMENTS_MAX_CHARS - totalAttachmentChars;
      if (remaining <= 0) return null;
      const text = sanitizeText(item?.aiContextText, "").slice(
        0,
        Math.min(GROUP_CHAT_AI_TASK_ATTACHMENT_MAX_CHARS, remaining),
      );
      totalAttachmentChars += text.length;
      return {
        fileId: sanitizeText(item?.fileId),
        fileName: sanitizeText(item?.fileName, "任务附件"),
        mimeType: sanitizeText(item?.mimeType),
        text,
        hint: sanitizeText(item?.aiContextHint, "").slice(0, 240),
      };
    })
    .filter(Boolean)
    .slice(0, 5);

  return {
    text: taskText,
    attachments,
  };
}

export function buildGroupChatAiPendingReplyDraft({
  roomId,
  triggerMessageId,
  requestedByUserId,
} = {}) {
  return {
    roomId: sanitizeText(roomId),
    type: "text",
    senderKind: "ai",
    senderUserId: "",
    senderName: "琳琳 · PAIA",
    content: "琳琳正在整理思路，请稍候…",
    replyToMessageId: sanitizeText(triggerMessageId),
    replyPreviewText: "",
    replySenderName: "",
    replyType: "",
    mentionNames: [],
    reactions: [],
    aiMeta: buildGroupChatAiMeta({
      requestedByUserId,
      triggerMessageId,
      status: "pending",
      streaming: false,
      error: "",
    }),
  };
}

export function buildGroupChatAiFailedReplyDraft({
  roomId,
  triggerMessageId,
  requestedByUserId,
  errorMessage,
} = {}) {
  const safeErrorMessage = sanitizeText(errorMessage, "AI 请求失败，请稍后再试。");
  return {
    roomId: sanitizeText(roomId),
    type: "text",
    senderKind: "ai",
    senderUserId: "",
    senderName: "琳琳 · PAIA",
    content: safeErrorMessage,
    replyToMessageId: sanitizeText(triggerMessageId),
    replyPreviewText: "",
    replySenderName: "",
    replyType: "",
    mentionNames: [],
    reactions: [],
    aiMeta: buildGroupChatAiMeta({
      requestedByUserId,
      triggerMessageId,
      status: "failed",
      streaming: false,
      error: safeErrorMessage,
    }),
  };
}

function normalizeSnapshotMessage(message) {
  if (!message || typeof message !== "object") return null;
  const id = sanitizeText(message.id);
  const type = sanitizeText(message.type).toLowerCase();
  if (!id || !type) return null;
  return {
    id,
    type,
    senderName: sanitizeText(message.senderName, type === "system" ? "系统" : "用户"),
    content: sanitizeText(message.content, ""),
    file: message.file && typeof message.file === "object" ? { ...message.file } : null,
    image: message.image && typeof message.image === "object" ? { ...message.image } : null,
  };
}

function buildGroupChatAiMeta({
  requestedByUserId,
  triggerMessageId,
  status,
  streaming,
  error,
}) {
  return {
    taskId: "",
    agentId: GROUP_CHAT_AI_RUNTIME.agentId,
    provider: GROUP_CHAT_AI_RUNTIME.provider,
    model: GROUP_CHAT_AI_RUNTIME.model,
    requestedByUserId: sanitizeText(requestedByUserId),
    triggerMessageId: sanitizeText(triggerMessageId),
    status: sanitizeText(status, "pending"),
    streaming: Boolean(streaming),
    error: sanitizeText(error),
  };
}

function sanitizeText(value, fallback = "") {
  const text = String(value || "").trim();
  return text || fallback;
}
