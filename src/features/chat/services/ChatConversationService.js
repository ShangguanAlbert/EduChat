import { sanitizeChatSessionId } from "../../../../shared/contracts/chat.js";

export const DEFAULT_CONTEXT_USER_ROUNDS = 10;

export function resolveBootstrapTargetSessionId({
  sessions = [],
  activeId = "",
  restoreSessionId = "",
} = {}) {
  const safeSessions = Array.isArray(sessions) ? sessions : [];
  const safeRestoreId = sanitizeChatSessionId(restoreSessionId);
  const safeActiveId = sanitizeChatSessionId(activeId);

  if (
    safeRestoreId &&
    safeSessions.some((session) => sanitizeChatSessionId(session?.id) === safeRestoreId)
  ) {
    return safeRestoreId;
  }

  if (
    safeActiveId &&
    safeSessions.some((session) => sanitizeChatSessionId(session?.id) === safeActiveId)
  ) {
    return safeActiveId;
  }

  return sanitizeChatSessionId(safeSessions[0]?.id);
}

export function isUntitledSessionTitle(value) {
  return /^新对话(?:\s*\d+)?$/.test(String(value || "").trim());
}

export function stripMarkdownForSessionTitle(value) {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
    .replace(/^>\s*/gm, "")
    .replace(/[#*_~>-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function clipSessionTitleText(value, maxLength = 22) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength ? `${text.slice(0, maxLength).trim()}...` : text;
}

export function buildSessionRenameQuestion(message) {
  const text = clipSessionTitleText(stripMarkdownForSessionTitle(message?.content || ""), 120);
  const attachments = Array.isArray(message?.attachments) ? message.attachments : [];
  const attachmentNames = attachments
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const attachmentText = attachmentNames.length > 0 ? `附件：${attachmentNames.join("、")}` : "";
  return [text, attachmentText].filter(Boolean).join("\n");
}

export function buildSessionRenameAnswer(message) {
  return clipSessionTitleText(stripMarkdownForSessionTitle(message?.content || ""), 240);
}

export function fallbackSessionTitleFromQuestion(question) {
  const primaryQuestionLine = String(question || "")
    .split("\n")
    .map((line) => String(line || "").trim())
    .find((line) => line && !line.startsWith("附件："));
  const normalized = clipSessionTitleText(
    stripMarkdownForSessionTitle(primaryQuestionLine || question).trim(),
    18,
  );
  return normalized || "新对话";
}

export function normalizeSuggestedSessionTitle(value, fallback = "新对话") {
  const text = clipSessionTitleText(
    stripMarkdownForSessionTitle(value)
      .replace(/^[”"“'‘’【[]+|[”"“'‘’】\]]+$/g, "")
      .trim(),
    22,
  );
  return text || fallback;
}

function normalizeUsageValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function sanitizeContextCompressionMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const estimatedInputTokensBefore = normalizeUsageValue(raw.estimatedInputTokensBefore);
  const estimatedInputTokensAfter = normalizeUsageValue(raw.estimatedInputTokensAfter);
  const sourceMessageCount = normalizeUsageValue(raw.sourceMessageCount);
  const updatedAt = String(raw.updatedAt || "").trim();
  if (
    !estimatedInputTokensBefore &&
    !estimatedInputTokensAfter &&
    !sourceMessageCount &&
    !updatedAt
  ) {
    return null;
  }
  return {
    estimatedInputTokensBefore,
    estimatedInputTokensAfter,
    sourceMessageCount,
    updatedAt,
  };
}

export function sanitizeContextSummaryMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const content = String(raw.content || "").trim();
  if (!content) return null;
  const internalType = String(raw.internalType || "").trim().toLowerCase();
  if (internalType !== "context_summary") return null;
  return {
    id: String(raw.id || `context-summary-${Date.now()}`).trim(),
    role: "system",
    content,
    hidden: true,
    internalType: "context_summary",
    summaryUpToMessageId: String(raw.summaryUpToMessageId || "").trim(),
    compressionMeta: sanitizeContextCompressionMeta(raw.compressionMeta),
  };
}

export function buildApiSourceMessages(list) {
  const safeList = Array.isArray(list) ? list.filter(Boolean) : [];
  return safeList.filter((message) => !message?.hidden);
}

export function buildApiMessageContentFromMessage(message, useVolcengineResponsesFileRefs) {
  const text = String(message?.content || "");
  if (!useVolcengineResponsesFileRefs || message?.role !== "user") {
    return text;
  }

  const refs = Array.isArray(message?.attachments)
    ? message.attachments
        .map((attachment) => {
          const fileId = String(attachment?.fileId || "").trim();
          const inputType = String(attachment?.inputType || "").trim().toLowerCase();
          if (!fileId) return null;
          if (
            inputType !== "input_file" &&
            inputType !== "input_image" &&
            inputType !== "input_video"
          ) {
            return null;
          }
          return { type: inputType, file_id: fileId };
        })
        .filter(Boolean)
    : [];
  if (refs.length === 0) return text;

  const parts = [];
  if (text.trim()) {
    parts.push({ type: "text", text });
  }
  parts.push(...refs);
  return parts;
}

export function buildApiMessages(
  list,
  { useVolcengineResponsesFileRefs = false } = {},
) {
  return buildApiSourceMessages(list)
    .map((message) => {
      const nextMessage = {
        id: String(message?.id || ""),
        role: message?.role,
        content: buildApiMessageContentFromMessage(message, useVolcengineResponsesFileRefs),
      };
      if (message?.hidden) {
        nextMessage.hidden = true;
      }
      if (message?.internalType) {
        nextMessage.internalType = String(message.internalType);
      }
      if (message?.summaryUpToMessageId) {
        nextMessage.summaryUpToMessageId = String(message.summaryUpToMessageId);
      }
      if (message?.compressionMeta && typeof message.compressionMeta === "object") {
        nextMessage.compressionMeta = { ...message.compressionMeta };
      }
      return nextMessage;
    })
    .filter((message) => {
      if (message.role === "user") return true;
      if (typeof message.content === "string") return message.content.trim().length > 0;
      return Array.isArray(message.content) && message.content.length > 0;
    });
}

export function pickRecentRounds(list, maxRounds = DEFAULT_CONTEXT_USER_ROUNDS) {
  if (!Array.isArray(list) || list.length === 0) return [];
  if (maxRounds <= 0) return [];

  let seenUser = 0;
  let startIdx = 0;
  for (let index = list.length - 1; index >= 0; index -= 1) {
    if (list[index]?.role === "user") {
      seenUser += 1;
      if (seenUser === maxRounds) {
        startIdx = index;
        break;
      }
    }
  }
  return list.slice(startIdx);
}

export function sanitizeUploadedAttachmentLinks(raw) {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((item) => ({
      name: String(item?.fileName || item?.name || "").trim().slice(0, 240),
      type: String(item?.mimeType || item?.type || "").trim().toLowerCase(),
      size: Number(item?.size || 0),
      url: String(item?.url || "").trim(),
      ossKey: String(item?.ossKey || "").trim(),
    }))
    .filter((item) => !!item.url);
}

export function mergeAttachmentsWithUploadedLinks(attachments, rawLinks) {
  const list = Array.isArray(attachments) ? attachments : [];
  const links = sanitizeUploadedAttachmentLinks(rawLinks);
  if (list.length === 0 || links.length === 0) return list;

  const nextLinks = [...links];
  return list.map((attachment) => {
    const existingUrl = String(attachment?.url || attachment?.fileUrl || "").trim();
    const existingOssKey = String(attachment?.ossKey || "").trim();
    if (existingUrl || existingOssKey) {
      return attachment;
    }
    const normalizedName = String(attachment?.name || "").trim();
    const normalizedType = String(attachment?.type || "").trim().toLowerCase();
    const normalizedSize = Number(attachment?.size || 0);
    const exactIndex = nextLinks.findIndex((item) => {
      const sameName = item.name && normalizedName && item.name === normalizedName;
      const sameType = item.type && normalizedType && item.type === normalizedType;
      const sameSize = item.size > 0 && normalizedSize > 0 && item.size === normalizedSize;
      return sameName || (sameType && sameSize);
    });
    const fallbackIndex = exactIndex >= 0 ? exactIndex : 0;
    const matched = nextLinks[fallbackIndex] || null;
    if (!matched) return attachment;
    nextLinks.splice(fallbackIndex, 1);
    return {
      ...attachment,
      url: matched.url,
      ossKey: matched.ossKey || attachment?.ossKey || "",
    };
  });
}

export function buildStagedPreviewItem(file, ref = {}) {
  return {
    kind: "staged_ref",
    file,
    name: String(file?.name || ref?.fileName || ""),
    size: Number(ref?.size || file?.size || 0),
    type: String(ref?.mimeType || file?.type || ""),
    mimeType: String(ref?.mimeType || file?.type || ""),
    url: String(ref?.url || "").trim(),
    ossKey: String(ref?.ossKey || "").trim(),
    stagedToken: String(ref?.token || "").trim(),
    thumbnailUrl: "",
    previewStage: "ready",
  };
}
