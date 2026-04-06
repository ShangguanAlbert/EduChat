import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Lock, LockOpen, LogOut, X } from "lucide-react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import Sidebar from "../../../components/Sidebar.jsx";
import AgentSelect from "../../../components/AgentSelect.jsx";
import MessageList from "../../../components/MessageList.jsx";
import MessageInput from "../../../components/MessageInput.jsx";
import ExportUserInfoModal from "../../../components/chat/ExportUserInfoModal.jsx";
import {
  AGENT_META,
  CHAT_ROUND_WARNING_THRESHOLD,
  DEFAULT_USER_INFO,
  GENDER_OPTIONS,
  GRADE_OPTIONS,
} from "../constants.js";
import {
  DEFAULT_AGENT_RUNTIME_CONFIG,
  PACKYCODE_DEFAULT_MODEL,
  PACKYCODE_PROVIDER,
  createDefaultAgentRuntimeConfigMap,
  resolveProviderDefaultModel,
  sanitizeRuntimeConfigMap,
} from "../agentRuntimeConfig.js";
import {
  createRuntimeSnapshot,
  mergeRuntimeWithMeta,
  mergeRuntimeWithUsage,
  normalizeReasoningEffort,
  normalizeTemperature,
  normalizeTopP,
  readErrorMessage,
  readSseStream,
} from "../chatHelpers.js";
import {
  buildExportMeta,
  formatMarkdownExport,
  formatTxtExport,
  getSafeFileBaseName,
} from "../exportHelpers.js";
import {
  isUserInfoComplete,
  sanitizeUserInfo,
  validateUserInfo,
} from "../userInfo.js";
import {
  clearManyStreamDrafts,
  clearStreamDraft,
  getAllStreamDrafts,
  getStreamDraft,
  primeAllStreamDrafts,
  replaceAllStreamDrafts,
  startStreamDraft,
  updateStreamDraft,
  useAllStreamDrafts,
} from "../streamDraftStore.js";
import { readChatBootstrapPrefetch } from "../bootstrapPrefetch.js";
import {
  clearChatSmartContext,
  fetchChatBootstrap,
  getAuthTokenHeader,
  prepareChatAttachments,
  reportChatClientDebug,
  saveChatSessionMessages,
  saveChatState,
  saveChatStateMeta,
  saveUserProfile,
  suggestChatSessionTitle,
  uploadVolcengineChatFiles,
} from "../stateApi.js";
import {
  clearUserAuthSession,
  getStoredAuthUser,
  resolveActiveAuthSlot,
  withAuthSlot,
} from "../../../app/authStorage.js";
import {
  createNewSessionRecord,
  createWelcomeMessage,
  hasUserTurn,
} from "../sessionFactory.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "../../image/returnContext.js";
import "../../../styles/chat.css";
import "../../../styles/chat-motion.css";

const DEFAULT_GROUPS = [];
const DEFAULT_SESSIONS = [
  { id: "s1", title: "新对话 1", groupId: null, pinned: false },
];
const DEFAULT_SESSION_MESSAGES = {
  s1: [createWelcomeMessage()],
};
const CONTEXT_USER_ROUNDS = 10;
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);
const CHAT_AGENT_IDS = Object.freeze(["A", "B", "C", "D", "E"]);
const DEFAULT_AGENT_PROVIDER_MAP = Object.freeze({
  A: "volcengine",
  B: "volcengine",
  C: "volcengine",
  D: "aliyun",
  E: "openrouter",
});
const TEACHER_SCOPE_YANG_JUNFENG = "yang-junfeng";
const AGENT_C_LOCKED_PROVIDER = "volcengine";
const AGENT_C_LOCKED_MODEL = "doubao-seed-2-0-pro-260215";
const AGENT_C_LOCKED_PROTOCOL = "responses";
const AGENT_C_LOCKED_MAX_OUTPUT_TOKENS = 131072;
const CHAT_ATTACHMENT_THUMBNAIL_MAX_EDGE = 176;
const CHAT_ATTACHMENT_THUMBNAIL_QUALITY = 0.76;
const CHAT_VIEW_SNAPSHOT_VERSION = 1;
const CHAT_VIEW_SNAPSHOT_STORAGE_PREFIX = "educhat:chat:view-snapshot";
const CHAT_VIEW_SNAPSHOT_MAX_JSON_LENGTH = 3_500_000;
const EMPTY_ROUTE_NAVIGATION_SENTINEL = "__empty__";
const CHAT_HOME_HEADLINE = "你今天想聊些什么？";
const TEACHER_HOME_DEFAULT_GRADE = GRADE_OPTIONS.includes("大学四年级")
  ? "大学四年级"
  : GRADE_OPTIONS[0] || "";
const TEACHER_HOME_DEFAULT_USER_INFO = Object.freeze({
  name: "教师",
  studentId: "000000",
  gender: GENDER_OPTIONS.includes("男") ? "男" : GENDER_OPTIONS[0] || "",
  grade: TEACHER_HOME_DEFAULT_GRADE,
  className: "教师端",
});
const LOCKED_AGENT_BY_TEACHER_SCOPE = Object.freeze({
  [TEACHER_SCOPE_YANG_JUNFENG]: "C",
});
const chatViewSnapshotMemoryCache = new Map();

function stripLegacyPlaceholderGroups(groups, sessions) {
  const safeGroups = Array.isArray(groups) ? groups : [];
  if (safeGroups.length === 0) return [];

  const referencedGroupIds = new Set(
    (Array.isArray(sessions) ? sessions : [])
      .map((session) => String(session?.groupId || "").trim())
      .filter(Boolean),
  );

  return safeGroups.filter((group) => {
    const groupId = String(group?.id || "").trim();
    if (!groupId) return false;
    const groupName = String(group?.name || "").trim();
    const groupDesc = String(group?.description || "").trim();
    const isLegacyPlaceholder =
      groupName === "新组" &&
      !groupDesc &&
      !referencedGroupIds.has(groupId);
    return !isLegacyPlaceholder;
  });
}

function isImageUploadFile(file) {
  const mime = String(file?.type || "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(file?.name || "")
    .trim()
    .toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg|heic|avif)$/i.test(name);
}

function loadImageElementFromObjectUrl(objectUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode image failed"));
    image.src = objectUrl;
  });
}

async function loadImageSourceFromFile(file) {
  if (!(file instanceof File)) {
    throw new Error("invalid image file");
  }

  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(file);
    return {
      node: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      release: () => {
        if (typeof bitmap.close === "function") {
          bitmap.close();
        }
      },
    };
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImageElementFromObjectUrl(objectUrl);
    return {
      node: image,
      width: image.naturalWidth || image.width,
      height: image.naturalHeight || image.height,
      release: () => {
        URL.revokeObjectURL(objectUrl);
      },
    };
  } catch (error) {
    URL.revokeObjectURL(objectUrl);
    throw error;
  }
}

async function buildImageThumbnailDataUrl(file) {
  if (!(file instanceof File) || !isImageUploadFile(file)) return "";

  try {
    const source = await loadImageSourceFromFile(file);
    const width = Math.max(1, Number(source.width || 0));
    const height = Math.max(1, Number(source.height || 0));
    const scale = Math.min(
      1,
      CHAT_ATTACHMENT_THUMBNAIL_MAX_EDGE / Math.max(width, height),
    );
    const targetWidth = Math.max(1, Math.round(width * scale));
    const targetHeight = Math.max(1, Math.round(height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      source.release();
      return "";
    }
    context.drawImage(source.node, 0, 0, targetWidth, targetHeight);
    source.release();
    return canvas.toDataURL("image/jpeg", CHAT_ATTACHMENT_THUMBNAIL_QUALITY);
  } catch {
    return "";
  }
}

function isUntitledSessionTitle(value) {
  return /^新对话(?:\s*\d+)?$/.test(String(value || "").trim());
}

function stripMarkdownForSessionTitle(value) {
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

function clipSessionTitleText(value, maxLength = 22) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}...`
    : text;
}

function buildSessionRenameQuestion(message) {
  const text = clipSessionTitleText(
    stripMarkdownForSessionTitle(message?.content || ""),
    120,
  );
  const attachments = Array.isArray(message?.attachments)
    ? message.attachments
    : [];
  const attachmentNames = attachments
    .map((item) => String(item?.name || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  const attachmentText =
    attachmentNames.length > 0 ? `附件：${attachmentNames.join("、")}` : "";
  return [text, attachmentText].filter(Boolean).join("\n");
}

function buildSessionRenameAnswer(message) {
  return clipSessionTitleText(
    stripMarkdownForSessionTitle(message?.content || ""),
    240,
  );
}

function fallbackSessionTitleFromQuestion(question) {
  const normalized = clipSessionTitleText(
    stripMarkdownForSessionTitle(question)
      .replace(/^附件：/u, "")
      .trim(),
    18,
  );
  return normalized || "新对话";
}

function normalizeSuggestedSessionTitle(value, fallback = "新对话") {
  const text = clipSessionTitleText(
    stripMarkdownForSessionTitle(value)
      .replace(/^[”"“'‘’【[]+|[”"“'‘’】\]]+$/g, "")
      .trim(),
    22,
  );
  return text || fallback;
}

function sanitizeProvider(value, fallback = "openrouter") {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (
    key === "openrouter" ||
    key === "packycode" ||
    key === "packy" ||
    key === "volcengine" ||
    key === "aliyun"
  ) {
    return key === "packy" ? "packycode" : key;
  }
  if (key === "packyapi") {
    return "packycode";
  }
  if (key === "volc" || key === "ark") {
    return "volcengine";
  }
  if (key === "dashscope" || key === "alibaba") {
    return "aliyun";
  }
  return fallback;
}

function sanitizeAgentProviderDefaults(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = {
    A: sanitizeProvider(source.A, DEFAULT_AGENT_PROVIDER_MAP.A),
    B: sanitizeProvider(source.B, DEFAULT_AGENT_PROVIDER_MAP.B),
    C: sanitizeProvider(source.C, DEFAULT_AGENT_PROVIDER_MAP.C),
    D: sanitizeProvider(source.D, DEFAULT_AGENT_PROVIDER_MAP.D),
    E: sanitizeProvider(source.E, DEFAULT_AGENT_PROVIDER_MAP.E),
  };
  next.C = AGENT_C_LOCKED_PROVIDER;
  return next;
}

function resolveAgentProvider(agentId, runtimeConfig, providerDefaults) {
  const safeAgentId = AGENT_META[agentId] ? agentId : "A";
  if (safeAgentId === "C") {
    return AGENT_C_LOCKED_PROVIDER;
  }
  const runtimeProvider = String(runtimeConfig?.provider || "")
    .trim()
    .toLowerCase();
  if (runtimeProvider && runtimeProvider !== "inherit") {
    return sanitizeProvider(runtimeProvider, "openrouter");
  }
  return sanitizeProvider(
    providerDefaults?.[safeAgentId],
    DEFAULT_AGENT_PROVIDER_MAP[safeAgentId],
  );
}

function normalizeTeacherScopeKey(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function resolveLockedAgentByTeacherScope(teacherScopeKey) {
  const normalized = normalizeTeacherScopeKey(teacherScopeKey);
  const lockedAgent = LOCKED_AGENT_BY_TEACHER_SCOPE[normalized] || "";
  return sanitizeSmartContextAgentId(lockedAgent);
}

function resolveChatReturnTarget(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    const target = String(params.get("returnTo") || "")
      .trim()
      .toLowerCase();
    if (target === "mode-selection" || target === "student-home") {
      return "mode-selection";
    }
    if (target === "teacher-home" || target === "admin-home") {
      return "teacher-home";
    }
  } catch {
    // Ignore malformed query and fall back to chat.
  }
  return "chat";
}

function resolveTeacherHomePanelParam(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    return String(params.get("teacherPanel") || "")
      .trim()
      .toLowerCase();
  } catch {
    return "";
  }
}

function resolveTeacherHomeExportContext(search = "") {
  try {
    const params = new URLSearchParams(String(search || ""));
    return {
      exportTeacherScopeKey: String(
        params.get("exportTeacherScopeKey") || "",
      ).trim(),
      exportDate: String(params.get("exportDate") || "").trim(),
    };
  } catch {
    return {
      exportTeacherScopeKey: "",
      exportDate: "",
    };
  }
}

function fillTeacherHomeDefaultUserInfo(profile) {
  const source = sanitizeUserInfo(profile);
  const gender = GENDER_OPTIONS.includes(source.gender)
    ? source.gender
    : TEACHER_HOME_DEFAULT_USER_INFO.gender;
  const grade = GRADE_OPTIONS.includes(source.grade)
    ? source.grade
    : TEACHER_HOME_DEFAULT_USER_INFO.grade;
  return sanitizeUserInfo({
    name: source.name || TEACHER_HOME_DEFAULT_USER_INFO.name,
    studentId: source.studentId || TEACHER_HOME_DEFAULT_USER_INFO.studentId,
    gender,
    grade,
    className: source.className || TEACHER_HOME_DEFAULT_USER_INFO.className,
  });
}

function resolveRuntimeConfigForAgent(agentId, runtimeConfigs) {
  const safeAgentId = AGENT_META[agentId] ? agentId : "A";
  const base = runtimeConfigs?.[safeAgentId] || DEFAULT_AGENT_RUNTIME_CONFIG;
  if (safeAgentId === "C") {
    return {
      ...base,
      provider: AGENT_C_LOCKED_PROVIDER,
      model: AGENT_C_LOCKED_MODEL,
      protocol: AGENT_C_LOCKED_PROTOCOL,
      temperature: 1,
      topP: 0.95,
      maxOutputTokens: AGENT_C_LOCKED_MAX_OUTPUT_TOKENS,
      thinkingEffort: "medium",
      enableWebSearch: true,
    };
  }
  if (safeAgentId !== "E") return base;
  return {
    ...base,
    provider: "volcengine",
    protocol: "responses",
  };
}

function resolveRuntimeModelForProvider(
  agentId,
  runtimeConfig,
  providerDefaults,
) {
  const provider = resolveAgentProvider(agentId, runtimeConfig, providerDefaults);
  const explicitModel = String(runtimeConfig?.model || "").trim();
  if (explicitModel) return explicitModel;
  return resolveProviderDefaultModel(provider, agentId);
}

function isPackyTokenBudgetRuntime(agentId, runtimeConfig, providerDefaults) {
  const provider = resolveAgentProvider(agentId, runtimeConfig, providerDefaults);
  if (provider !== PACKYCODE_PROVIDER) return false;
  const model = String(
    resolveRuntimeModelForProvider(agentId, runtimeConfig, providerDefaults) ||
      "",
  )
    .trim()
    .toLowerCase();
  return !model || model === PACKYCODE_DEFAULT_MODEL;
}

function normalizeUsageValue(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.round(numeric));
}

function sanitizeContextCompressionMeta(raw) {
  if (!raw || typeof raw !== "object") return null;
  const estimatedInputTokensBefore = normalizeUsageValue(
    raw.estimatedInputTokensBefore,
  );
  const estimatedInputTokensAfter = normalizeUsageValue(
    raw.estimatedInputTokensAfter,
  );
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

function sanitizeContextSummaryMessage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const content = String(raw.content || "").trim();
  if (!content) return null;
  const internalType = String(raw.internalType || "").trim().toLowerCase();
  if (internalType !== "context_summary") return null;
  return {
    id: String(raw.id || `packy-summary-${Date.now()}`).trim(),
    role: "system",
    content,
    hidden: true,
    internalType: "context_summary",
    summaryUpToMessageId: String(raw.summaryUpToMessageId || "").trim(),
    compressionMeta: sanitizeContextCompressionMeta(raw.compressionMeta),
  };
}

function findLatestPackyContextSummaryMessage(list) {
  const safeList = Array.isArray(list) ? list : [];
  for (let index = safeList.length - 1; index >= 0; index -= 1) {
    const message = safeList[index];
    if (
      message?.hidden &&
      message?.role === "system" &&
      String(message?.internalType || "").trim().toLowerCase() ===
        "context_summary" &&
      String(message?.content || "").trim()
    ) {
      return message;
    }
  }
  return null;
}

function buildApiSourceMessages(list, { usePackyContextSummary = false } = {}) {
  const safeList = Array.isArray(list) ? list.filter(Boolean) : [];
  if (!usePackyContextSummary) {
    return safeList.filter((message) => !message?.hidden);
  }

  const summaryMessage = findLatestPackyContextSummaryMessage(safeList);
  if (!summaryMessage) {
    return safeList.filter((message) => !message?.hidden);
  }

  const cutoffId = String(summaryMessage.summaryUpToMessageId || "").trim();
  let skipping = !!cutoffId;
  let foundCutoff = !cutoffId;
  const next = [summaryMessage];

  safeList.forEach((message) => {
    if (message?.id === summaryMessage.id) return;
    if (message?.hidden) return;
    if (!skipping) {
      next.push(message);
      return;
    }
    if (String(message?.id || "").trim() === cutoffId) {
      foundCutoff = true;
      skipping = false;
    }
  });

  if (foundCutoff) return next;
  return [summaryMessage, ...safeList.filter((message) => !message?.hidden)];
}

function sanitizeUploadedAttachmentLinks(raw) {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((item) => ({
      name: String(item?.fileName || item?.name || "")
        .trim()
        .slice(0, 240),
      type: String(item?.mimeType || item?.type || "")
        .trim()
        .toLowerCase(),
      size: Number(item?.size || 0),
      url: String(item?.url || "").trim(),
      ossKey: String(item?.ossKey || "").trim(),
    }))
    .filter((item) => !!item.url);
}

function mergeAttachmentsWithUploadedLinks(attachments, rawLinks) {
  const list = Array.isArray(attachments) ? attachments : [];
  const links = sanitizeUploadedAttachmentLinks(rawLinks);
  if (list.length === 0 || links.length === 0) return list;

  const nextLinks = [...links];
  return list.map((attachment) => {
    const normalizedName = String(attachment?.name || "").trim();
    const normalizedType = String(attachment?.type || "")
      .trim()
      .toLowerCase();
    const normalizedSize = Number(attachment?.size || 0);
    const exactIndex = nextLinks.findIndex((item) => {
      const sameName =
        item.name && normalizedName && item.name === normalizedName;
      const sameType =
        item.type && normalizedType && item.type === normalizedType;
      const sameSize =
        item.size > 0 && normalizedSize > 0 && item.size === normalizedSize;
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

function getSmartContextDefaultEnabled(agentId) {
  return (
    String(agentId || "")
      .trim()
      .toUpperCase() === "E"
  );
}

function sanitizeSmartContextSessionId(value) {
  const text = String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.$]/g, "");
  if (!text) return "";
  return text.slice(0, 80);
}

function sanitizeSmartContextAgentId(value) {
  const id = String(value || "")
    .trim()
    .toUpperCase();
  if (CHAT_AGENT_IDS.includes(id)) return id;
  return "";
}

function buildSmartContextKey(sessionId, agentId) {
  const safeSessionId = sanitizeSmartContextSessionId(sessionId);
  const safeAgentId = sanitizeSmartContextAgentId(agentId);
  if (!safeSessionId || !safeAgentId) return "";
  return `${safeSessionId}::${safeAgentId}`;
}

function sanitizeSmartContextEnabledMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  Object.entries(source)
    .slice(0, 1200)
    .forEach(([rawKey, rawValue]) => {
      if (
        rawValue &&
        typeof rawValue === "object" &&
        !Array.isArray(rawValue)
      ) {
        const safeSessionId = sanitizeSmartContextSessionId(rawKey);
        if (!safeSessionId) return;
        Object.entries(rawValue)
          .slice(0, CHAT_AGENT_IDS.length)
          .forEach(([rawAgentId, nestedValue]) => {
            const key = buildSmartContextKey(safeSessionId, rawAgentId);
            if (!key) return;
            normalized[key] = !!nestedValue;
          });
        return;
      }
      const [rawSessionId, rawAgentId] = String(rawKey || "").split("::");
      const key = buildSmartContextKey(rawSessionId, rawAgentId);
      if (!key) return;
      normalized[key] = !!rawValue;
    });

  return normalized;
}

function readSmartContextEnabledBySessionAgent(map, sessionId, agentId) {
  const key = buildSmartContextKey(sessionId, agentId);
  const fallback = getSmartContextDefaultEnabled(agentId);
  if (!key) return fallback;

  const source = map && typeof map === "object" ? map : {};
  if (Object.prototype.hasOwnProperty.call(source, key)) {
    return !!source[key];
  }
  return fallback;
}

function patchSmartContextEnabledBySessionAgent(
  map,
  sessionId,
  agentId,
  enabled,
) {
  const key = buildSmartContextKey(sessionId, agentId);
  const source = sanitizeSmartContextEnabledMap(map);
  if (!key) return source;
  const nextEnabled = !!enabled;
  if (source[key] === nextEnabled) return source;
  return {
    ...source,
    [key]: nextEnabled,
  };
}

function removeSmartContextBySessions(map, sessionIds) {
  const source = sanitizeSmartContextEnabledMap(map);
  const remove = sessionIds instanceof Set ? sessionIds : new Set();
  if (remove.size === 0) return source;

  let changed = false;
  const next = {};
  Object.entries(source).forEach(([key, value]) => {
    const [sessionId] = String(key || "").split("::");
    if (remove.has(sessionId)) {
      changed = true;
      return;
    }
    next[key] = !!value;
  });
  return changed ? next : source;
}

function sanitizeAgentBySessionMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const normalized = {};

  Object.entries(source)
    .slice(0, 1200)
    .forEach(([rawSessionId, rawAgentId]) => {
      const sessionId = sanitizeSmartContextSessionId(rawSessionId);
      const agentId = sanitizeSmartContextAgentId(rawAgentId);
      if (!sessionId || !agentId) return;
      normalized[sessionId] = agentId;
    });

  return normalized;
}

function readAgentBySession(map, sessionId, fallback = "A") {
  const source = map && typeof map === "object" ? map : {};
  const safeSessionId = sanitizeSmartContextSessionId(sessionId);
  const safeFallback = sanitizeSmartContextAgentId(fallback) || "A";
  if (!safeSessionId) return safeFallback;

  const savedAgent = sanitizeSmartContextAgentId(source[safeSessionId]);
  return savedAgent || safeFallback;
}

function patchAgentBySession(map, sessionId, agentId) {
  const source = sanitizeAgentBySessionMap(map);
  const safeSessionId = sanitizeSmartContextSessionId(sessionId);
  const safeAgentId = sanitizeSmartContextAgentId(agentId);
  if (!safeSessionId || !safeAgentId) return source;
  if (source[safeSessionId] === safeAgentId) return source;
  return {
    ...source,
    [safeSessionId]: safeAgentId,
  };
}

function removeAgentBySessions(map, sessionIds) {
  const source = sanitizeAgentBySessionMap(map);
  const remove = sessionIds instanceof Set ? sessionIds : new Set();
  if (remove.size === 0) return source;

  let changed = false;
  const next = {};
  Object.entries(source).forEach(([sessionId, agentId]) => {
    if (remove.has(sessionId)) {
      changed = true;
      return;
    }
    next[sessionId] = agentId;
  });
  return changed ? next : source;
}

function ensureAgentBySessionMap(map, sessions, fallbackAgent = "A") {
  const source = sanitizeAgentBySessionMap(map);
  const safeFallback = sanitizeSmartContextAgentId(fallbackAgent) || "A";
  const validSessionIds = new Set();

  if (Array.isArray(sessions)) {
    sessions.slice(0, 600).forEach((session) => {
      const sessionId = sanitizeSmartContextSessionId(session?.id);
      if (!sessionId) return;
      validSessionIds.add(sessionId);
    });
  }

  let changed = false;
  const next = {};
  validSessionIds.forEach((sessionId) => {
    const nextAgent =
      sanitizeSmartContextAgentId(source[sessionId]) || safeFallback;
    if (source[sessionId] !== nextAgent) changed = true;
    next[sessionId] = nextAgent;
  });
  Object.keys(source).forEach((sessionId) => {
    if (!validSessionIds.has(sessionId)) changed = true;
  });

  if (!changed && Object.keys(next).length === Object.keys(source).length) {
    return source;
  }
  return next;
}

function lockAgentBySessionMap(map, sessions, lockedAgentId) {
  const safeLockedAgentId = sanitizeSmartContextAgentId(lockedAgentId);
  if (!safeLockedAgentId) return sanitizeAgentBySessionMap(map);

  const source = sanitizeAgentBySessionMap(map);
  const next = {};
  let changed = false;
  const validSessionIds = new Set();

  if (Array.isArray(sessions)) {
    sessions.slice(0, 600).forEach((session) => {
      const sessionId = sanitizeSmartContextSessionId(session?.id);
      if (!sessionId) return;
      validSessionIds.add(sessionId);
      if (source[sessionId] !== safeLockedAgentId) changed = true;
      next[sessionId] = safeLockedAgentId;
    });
  }

  Object.keys(source).forEach((sessionId) => {
    if (!validSessionIds.has(sessionId)) {
      changed = true;
    }
  });

  if (!changed && Object.keys(next).length === Object.keys(source).length) {
    return source;
  }
  return next;
}

function enableSmartContextForAgentSessions(map, sessions, agentId) {
  const safeAgentId = sanitizeSmartContextAgentId(agentId);
  if (!safeAgentId) return sanitizeSmartContextEnabledMap(map);

  let next = sanitizeSmartContextEnabledMap(map);
  if (!Array.isArray(sessions) || sessions.length === 0) return next;
  sessions.slice(0, 600).forEach((session) => {
    const sessionId = sanitizeSmartContextSessionId(session?.id);
    if (!sessionId) return;
    next = patchSmartContextEnabledBySessionAgent(
      next,
      sessionId,
      safeAgentId,
      true,
    );
  });
  return next;
}

function sanitizeChatSnapshotUserKey(value) {
  return (
    String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "")
      .slice(0, 64) || "anonymous"
  );
}

function resolveChatViewSnapshotStorageKey() {
  const slot = resolveActiveAuthSlot();
  const storedUser = getStoredAuthUser(slot);
  const userKey = sanitizeChatSnapshotUserKey(
    storedUser?.id ||
      storedUser?.userId ||
      storedUser?.username ||
      storedUser?.studentId,
  );
  return `${CHAT_VIEW_SNAPSHOT_STORAGE_PREFIX}:${slot}:${userKey}`;
}

function createDefaultChatViewState() {
  return {
    hasSnapshot: false,
    groups: DEFAULT_GROUPS,
    sessions: DEFAULT_SESSIONS,
    sessionMessages: DEFAULT_SESSION_MESSAGES,
    activeId: DEFAULT_SESSIONS[0]?.id || "s1",
    agent: "A",
    agentBySession: {},
    agentRuntimeConfigs: createDefaultAgentRuntimeConfigMap(),
    agentProviderDefaults: sanitizeAgentProviderDefaults(
      DEFAULT_AGENT_PROVIDER_MAP,
    ),
    teacherScopeKey: "",
    lastAppliedReasoning: "high",
    smartContextEnabledBySessionAgent: {},
    userInfo: DEFAULT_USER_INFO,
    streamDrafts: {},
  };
}

function sanitizeStreamDraftMap(raw, validSessionIds = null) {
  const source = raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  const normalized = {};

  Object.entries(source)
    .slice(0, 120)
    .forEach(([rawSessionId, rawDraft]) => {
      const sessionId = sanitizeSmartContextSessionId(rawSessionId);
      if (!sessionId) return;
      if (validSessionIds instanceof Set && !validSessionIds.has(sessionId)) return;
      if (!rawDraft || typeof rawDraft !== "object") return;
      const draftId = String(rawDraft.id || "").trim();
      if (!draftId) return;

      normalized[sessionId] = {
        ...rawDraft,
        id: draftId,
        role: "assistant",
        content: String(rawDraft.content || ""),
        reasoning: String(rawDraft.reasoning || ""),
        streaming: false,
      };
    });

  return normalized;
}

function buildChatViewSnapshotPayload(state) {
  const buildPreviewMessagesMap = (messagesBySession, activeSessionId = "") => {
    const source =
      messagesBySession && typeof messagesBySession === "object"
        ? messagesBySession
        : DEFAULT_SESSION_MESSAGES;
    const safeActiveSessionId = String(activeSessionId || "").trim();
    const previewMap = {};

    Object.entries(source).forEach(([sessionId, list]) => {
      if (!Array.isArray(list) || list.length === 0) return;
      if (sessionId === safeActiveSessionId) {
        previewMap[sessionId] = list;
        return;
      }
      previewMap[sessionId] = list.slice(-2);
    });

    return previewMap;
  };

  const base = {
    version: CHAT_VIEW_SNAPSHOT_VERSION,
    groups: stripLegacyPlaceholderGroups(
      Array.isArray(state.groups) ? state.groups : DEFAULT_GROUPS,
      Array.isArray(state.sessions) ? state.sessions : DEFAULT_SESSIONS,
    ),
    sessions: Array.isArray(state.sessions) ? state.sessions : DEFAULT_SESSIONS,
    activeId: String(state.activeId || ""),
    agent: sanitizeSmartContextAgentId(state.agent) || "A",
    agentBySession: sanitizeAgentBySessionMap(state.agentBySession),
    agentRuntimeConfigs: sanitizeRuntimeConfigMap(state.agentRuntimeConfigs),
    agentProviderDefaults: sanitizeAgentProviderDefaults(
      state.agentProviderDefaults,
    ),
    teacherScopeKey: normalizeTeacherScopeKey(state.teacherScopeKey),
    lastAppliedReasoning: normalizeReasoningEffort(
      state.lastAppliedReasoning ?? "high",
    ),
    smartContextEnabledBySessionAgent: sanitizeSmartContextEnabledMap(
      state.smartContextEnabledBySessionAgent,
    ),
    userInfo: sanitizeUserInfo(state.userInfo),
    streamDrafts: sanitizeStreamDraftMap(
      state.streamDrafts,
      new Set(
        (Array.isArray(state.sessions) ? state.sessions : DEFAULT_SESSIONS)
          .map((session) => sanitizeSmartContextSessionId(session?.id))
          .filter(Boolean),
      ),
    ),
  };

  const fullPayload = {
    ...base,
    sessionMessages: pruneSessionMessagesBySessions(
      state.sessionMessages,
      base.sessions,
    ),
    messageScope: "full",
  };
  const fullSerialized = JSON.stringify(fullPayload);
  if (fullSerialized.length <= CHAT_VIEW_SNAPSHOT_MAX_JSON_LENGTH) {
    return fullPayload;
  }

  const activeId = String(base.activeId || "").trim();
  const activeMessages =
    activeId &&
    state.sessionMessages &&
    typeof state.sessionMessages === "object" &&
    Array.isArray(state.sessionMessages[activeId])
      ? state.sessionMessages[activeId]
      : [];
  const activeOnlyPayload = {
    ...base,
    sessionMessages: buildPreviewMessagesMap(state.sessionMessages, activeId),
    messageScope: "active-with-previews",
  };
  const activeOnlySerialized = JSON.stringify(activeOnlyPayload);
  if (activeOnlySerialized.length <= CHAT_VIEW_SNAPSHOT_MAX_JSON_LENGTH) {
    return activeOnlyPayload;
  }

  return {
    ...base,
    sessionMessages: activeId ? { [activeId]: activeMessages.slice(-120) } : {},
    messageScope: "active-trimmed",
  };
}

function pruneSessionMessagesBySessions(sessionMessages, sessions) {
  const source =
    sessionMessages && typeof sessionMessages === "object" ? sessionMessages : {};
  const validSessionIds = new Set(
    (Array.isArray(sessions) ? sessions : [])
      .map((session) => sanitizeSmartContextSessionId(session?.id))
      .filter(Boolean),
  );
  const next = {};

  validSessionIds.forEach((sessionId) => {
    next[sessionId] = Array.isArray(source[sessionId]) ? source[sessionId] : [];
  });

  return next;
}

function scoreSessionMessage(message) {
  if (!message || typeof message !== "object") return 0;
  const contentLength = String(message.content || "").trim().length;
  const reasoningLength = String(message.reasoning || "").trim().length;
  const attachmentCount = Array.isArray(message.attachments)
    ? message.attachments.filter(Boolean).length
    : 0;
  return contentLength + reasoningLength + attachmentCount * 64;
}

function scoreSessionMessageList(list) {
  const safeList = Array.isArray(list) ? list : [];
  return safeList.reduce((total, message) => total + scoreSessionMessage(message), 0);
}

function mergeSessionMessageLists(primaryList, secondaryList) {
  const base = Array.isArray(primaryList) ? primaryList.filter(Boolean) : [];
  const extras = Array.isArray(secondaryList) ? secondaryList.filter(Boolean) : [];
  const next = [...base];
  const indexById = new Map();

  next.forEach((message, index) => {
    const messageId = String(message?.id || "").trim();
    if (!messageId) return;
    indexById.set(messageId, index);
  });

  extras.forEach((message) => {
    const messageId = String(message?.id || "").trim();
    if (!messageId) {
      next.push(message);
      return;
    }

    const existingIndex = indexById.get(messageId);
    if (!Number.isInteger(existingIndex)) {
      indexById.set(messageId, next.length);
      next.push(message);
      return;
    }

    if (scoreSessionMessage(message) > scoreSessionMessage(next[existingIndex])) {
      next[existingIndex] = message;
    }
  });

  return next;
}

function chooseMoreCompleteSessionMessageList(localList, remoteList) {
  const safeLocal = Array.isArray(localList) ? localList.filter(Boolean) : [];
  const safeRemote = Array.isArray(remoteList) ? remoteList.filter(Boolean) : [];

  if (safeLocal.length === 0) {
    return { list: safeRemote, preferLocal: false };
  }
  if (safeRemote.length === 0) {
    return { list: safeLocal, preferLocal: true };
  }

  const localIds = new Set(
    safeLocal.map((message) => String(message?.id || "").trim()).filter(Boolean),
  );
  const remoteIds = new Set(
    safeRemote.map((message) => String(message?.id || "").trim()).filter(Boolean),
  );
  const localContainsRemote = Array.from(remoteIds).every((id) => localIds.has(id));
  const remoteContainsLocal = Array.from(localIds).every((id) => remoteIds.has(id));
  const localScore = scoreSessionMessageList(safeLocal);
  const remoteScore = scoreSessionMessageList(safeRemote);

  if (localContainsRemote && safeLocal.length >= safeRemote.length && localScore >= remoteScore) {
    return { list: safeLocal, preferLocal: true };
  }

  if (remoteContainsLocal && safeRemote.length >= safeLocal.length && remoteScore >= localScore) {
    return { list: safeRemote, preferLocal: false };
  }

  if (safeLocal.length > safeRemote.length || localScore > remoteScore) {
    return {
      list: mergeSessionMessageLists(safeLocal, safeRemote),
      preferLocal: true,
    };
  }

  return {
    list: mergeSessionMessageLists(safeRemote, safeLocal),
    preferLocal: false,
  };
}

function writeChatViewSnapshot(state) {
  if (typeof window === "undefined") return;
  const storageKey = resolveChatViewSnapshotStorageKey();
  try {
    const payload = buildChatViewSnapshotPayload(state);
    const serialized = JSON.stringify(payload);
    if (serialized.length > CHAT_VIEW_SNAPSHOT_MAX_JSON_LENGTH) return;
    chatViewSnapshotMemoryCache.set(storageKey, payload);
    window.sessionStorage.setItem(storageKey, serialized);
  } catch {
    // Ignore snapshot write failures.
  }
}

function clearChatViewSnapshot() {
  if (typeof window === "undefined") return;
  const storageKey = resolveChatViewSnapshotStorageKey();
  chatViewSnapshotMemoryCache.delete(storageKey);
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // Ignore snapshot cleanup failures.
  }
}

function restoreChatViewStateFromSnapshot(rawSnapshot, preferredSessionId = "") {
  const defaults = createDefaultChatViewState();
  if (
    !rawSnapshot ||
    typeof rawSnapshot !== "object" ||
    Number(rawSnapshot.version) !== CHAT_VIEW_SNAPSHOT_VERSION
  ) {
    return defaults;
  }

  const nextSessions = Array.isArray(rawSnapshot.sessions)
    ? rawSnapshot.sessions
    : DEFAULT_SESSIONS;
  const nextGroups = stripLegacyPlaceholderGroups(
    Array.isArray(rawSnapshot.groups) ? rawSnapshot.groups : DEFAULT_GROUPS,
    nextSessions,
  );
  let nextActiveId = String(rawSnapshot.activeId || nextSessions[0]?.id || "");
  const safePreferredSessionId = sanitizeSmartContextSessionId(preferredSessionId);
  if (
    safePreferredSessionId &&
    nextSessions.some((session) => session?.id === safePreferredSessionId)
  ) {
    nextActiveId = safePreferredSessionId;
  }
  if (!nextSessions.some((session) => session?.id === nextActiveId)) {
    nextActiveId = nextSessions[0]?.id || "";
  }

  let nextSessionMessages =
    rawSnapshot.sessionMessages && typeof rawSnapshot.sessionMessages === "object"
      ? rawSnapshot.sessionMessages
      : nextSessions.length > 0
        ? DEFAULT_SESSION_MESSAGES
        : {};
  nextSessionMessages = pruneSessionMessagesBySessions(
    nextSessionMessages,
    nextSessions,
  );

  const validSessionIds = new Set(
    nextSessions
      .map((session) => sanitizeSmartContextSessionId(session?.id))
      .filter(Boolean),
  );

  const nextTeacherScopeKey = normalizeTeacherScopeKey(
    rawSnapshot.teacherScopeKey,
  );
  const lockedAgentId =
    resolveLockedAgentByTeacherScope(nextTeacherScopeKey);
  const fallbackAgent =
    lockedAgentId ||
    (AGENT_META[rawSnapshot.agent] ? rawSnapshot.agent : defaults.agent);

  let nextAgentBySession = ensureAgentBySessionMap(
    rawSnapshot.agentBySession,
    nextSessions,
    fallbackAgent,
  );
  if (lockedAgentId) {
    nextAgentBySession = lockAgentBySessionMap(
      nextAgentBySession,
      nextSessions,
      lockedAgentId,
    );
  }

  let nextSmartContextEnabledMap = sanitizeSmartContextEnabledMap(
    rawSnapshot.smartContextEnabledBySessionAgent,
  );
  if (lockedAgentId) {
    nextSmartContextEnabledMap = enableSmartContextForAgentSessions(
      nextSmartContextEnabledMap,
      nextSessions,
      lockedAgentId,
    );
  }

  return {
    hasSnapshot: true,
    groups: nextGroups,
    sessions: nextSessions,
    sessionMessages: nextSessionMessages,
    activeId: nextActiveId,
    agent: readAgentBySession(nextAgentBySession, nextActiveId, fallbackAgent),
    agentBySession: nextAgentBySession,
    agentRuntimeConfigs: sanitizeRuntimeConfigMap(
      rawSnapshot.agentRuntimeConfigs,
    ),
    agentProviderDefaults: sanitizeAgentProviderDefaults(
      rawSnapshot.agentProviderDefaults,
    ),
    teacherScopeKey: nextTeacherScopeKey,
    lastAppliedReasoning: normalizeReasoningEffort(
      rawSnapshot.lastAppliedReasoning ?? "high",
    ),
    smartContextEnabledBySessionAgent: nextSmartContextEnabledMap,
    userInfo: sanitizeUserInfo(rawSnapshot.userInfo),
    streamDrafts: sanitizeStreamDraftMap(rawSnapshot.streamDrafts, validSessionIds),
  };
}

function readInitialChatViewState(preferredSessionId = "") {
  const defaults = createDefaultChatViewState();
  if (typeof window === "undefined") return defaults;
  const storageKey = resolveChatViewSnapshotStorageKey();
  const cached = chatViewSnapshotMemoryCache.get(storageKey);
  if (cached) {
    return restoreChatViewStateFromSnapshot(cached, preferredSessionId);
  }
  try {
    const raw = String(window.sessionStorage.getItem(storageKey) || "").trim();
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    chatViewSnapshotMemoryCache.set(storageKey, parsed);
    return restoreChatViewStateFromSnapshot(parsed, preferredSessionId);
  } catch {
    return defaults;
  }
}

function restoreChatViewStateFromBootstrap(
  bootstrapData,
  preferredSessionId = "",
) {
  const defaults = createDefaultChatViewState();
  if (!bootstrapData || typeof bootstrapData !== "object") {
    return defaults;
  }

  const state =
    bootstrapData.state && typeof bootstrapData.state === "object"
      ? bootstrapData.state
      : {};
  const nextSessions =
    Array.isArray(state.sessions) && state.sessions.length > 0
      ? state.sessions
      : DEFAULT_SESSIONS;
  const nextGroups = stripLegacyPlaceholderGroups(
    Array.isArray(state.groups) ? state.groups : DEFAULT_GROUPS,
    nextSessions,
  );
  let nextActiveId = sanitizeSmartContextSessionId(
    preferredSessionId || state.activeId || nextSessions[0]?.id || "",
  );
  if (!nextSessions.some((session) => session?.id === nextActiveId)) {
    nextActiveId = nextSessions[0]?.id || "";
  }

  const nextSessionMessages = pruneSessionMessagesBySessions(
    state.sessionMessages && typeof state.sessionMessages === "object"
      ? state.sessionMessages
      : nextSessions.length > 0
        ? DEFAULT_SESSION_MESSAGES
        : {},
    nextSessions,
  );
  const stateSettings =
    state.settings && typeof state.settings === "object" ? state.settings : {};
  const nextTeacherScopeKey = normalizeTeacherScopeKey(
    bootstrapData.teacherScopeKey,
  );
  const lockedAgentId =
    resolveLockedAgentByTeacherScope(nextTeacherScopeKey);
  const fallbackAgent =
    lockedAgentId ||
    (AGENT_META[stateSettings.agent] ? stateSettings.agent : defaults.agent);
  let nextAgentBySession = ensureAgentBySessionMap(
    stateSettings.agentBySession,
    nextSessions,
    fallbackAgent,
  );
  if (lockedAgentId) {
    nextAgentBySession = lockAgentBySessionMap(
      nextAgentBySession,
      nextSessions,
      lockedAgentId,
    );
  }

  let nextSmartContextEnabledMap = sanitizeSmartContextEnabledMap(
    stateSettings.smartContextEnabledBySessionAgent,
  );
  if (lockedAgentId) {
    nextSmartContextEnabledMap = enableSmartContextForAgentSessions(
      nextSmartContextEnabledMap,
      nextSessions,
      lockedAgentId,
    );
  }

  return {
    hasSnapshot: true,
    groups: nextGroups,
    sessions: nextSessions,
    sessionMessages: nextSessionMessages,
    activeId: nextActiveId,
    agent: readAgentBySession(nextAgentBySession, nextActiveId, fallbackAgent),
    agentBySession: nextAgentBySession,
    agentRuntimeConfigs: sanitizeRuntimeConfigMap(
      bootstrapData.agentRuntimeConfigs,
    ),
    agentProviderDefaults: sanitizeAgentProviderDefaults(
      bootstrapData.agentProviderDefaults,
    ),
    teacherScopeKey: nextTeacherScopeKey,
    lastAppliedReasoning: normalizeReasoningEffort(
      stateSettings.lastAppliedReasoning ?? "high",
    ),
    smartContextEnabledBySessionAgent: nextSmartContextEnabledMap,
    userInfo: sanitizeUserInfo(bootstrapData.profile),
    streamDrafts: {},
  };
}

export default function ChatDesktopPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeSessionId = sanitizeSmartContextSessionId(params.sessionId);
  const initialViewStateRef = useRef(null);
  if (initialViewStateRef.current === null) {
    const prefetchedBootstrap = readChatBootstrapPrefetch(location.search);
    initialViewStateRef.current =
      restoreChatViewStateFromBootstrap(prefetchedBootstrap, routeSessionId);
    if (!initialViewStateRef.current?.hasSnapshot) {
      initialViewStateRef.current = readInitialChatViewState(routeSessionId);
    }
    primeAllStreamDrafts(initialViewStateRef.current.streamDrafts);
  }
  const initialViewState = initialViewStateRef.current;
  const hasInitialViewSnapshot = !!initialViewState?.hasSnapshot;
  const returnTarget = useMemo(
    () => resolveChatReturnTarget(location.search),
    [location.search],
  );
  const teacherHomePanelParam = useMemo(
    () => resolveTeacherHomePanelParam(location.search),
    [location.search],
  );
  const teacherHomeExportContext = useMemo(
    () => resolveTeacherHomeExportContext(location.search),
    [location.search],
  );
  const buildChatSessionHref = useCallback(
    (sessionId = "", search = location.search) => {
      const safeSessionId = sanitizeSmartContextSessionId(sessionId);
      const basePath = safeSessionId
        ? `/c/${encodeURIComponent(safeSessionId)}`
        : "/c";
      return withAuthSlot(`${basePath}${String(search || "")}`);
    },
    [location.search],
  );
  const logoutText =
    returnTarget === "mode-selection"
      ? "返回学生主页"
      : returnTarget === "teacher-home"
        ? "返回教师主页"
        : "退出登录";
  const currentRouteHref = `${location.pathname}${location.search || ""}`;
  const [groups, setGroups] = useState(() => initialViewState.groups);
  const [sessions, setSessions] = useState(() => initialViewState.sessions);
  const [sessionMessages, setSessionMessages] = useState(
    () => initialViewState.sessionMessages,
  );

  const [activeId, setActiveId] = useState(() => initialViewState.activeId);
  const [agent, setAgent] = useState(() => initialViewState.agent);
  const [agentBySession, setAgentBySession] = useState(
    () => initialViewState.agentBySession,
  );
  const [agentRuntimeConfigs, setAgentRuntimeConfigs] = useState(
    () => initialViewState.agentRuntimeConfigs,
  );
  const [agentProviderDefaults, setAgentProviderDefaults] = useState(
    () => initialViewState.agentProviderDefaults,
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [apiTemperature, setApiTemperature] = useState("0.6");
  const [apiTopP, setApiTopP] = useState("1");
  const [apiReasoningEffort, setApiReasoningEffort] = useState("high");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [stateSaveError, setStateSaveError] = useState("");
  const [lastAppliedReasoning, setLastAppliedReasoning] = useState(
    () => initialViewState.lastAppliedReasoning,
  );
  const [
    smartContextEnabledBySessionAgent,
    setSmartContextEnabledBySessionAgent,
  ] = useState(() => initialViewState.smartContextEnabledBySessionAgent);
  const [selectedAskText, setSelectedAskText] = useState("");
  const [focusUserMessageId, setFocusUserMessageId] = useState("");
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [pendingExportKind, setPendingExportKind] = useState("");
  const [showUserInfoModal, setShowUserInfoModal] = useState(
    () => hasInitialViewSnapshot && !isUserInfoComplete(initialViewState.userInfo),
  );
  const [forceUserInfoModal, setForceUserInfoModal] = useState(
    () => hasInitialViewSnapshot && !isUserInfoComplete(initialViewState.userInfo),
  );
  const [userInfo, setUserInfo] = useState(() => initialViewState.userInfo);
  const [userInfoErrors, setUserInfoErrors] = useState({});
  const [userInfoSaving, setUserInfoSaving] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(
    () => !hasInitialViewSnapshot,
  );
  const [bootstrapPending, setBootstrapPending] = useState(
    () => !hasInitialViewSnapshot,
  );
  const [bootstrapError, setBootstrapError] = useState("");
  const [teacherScopeKey, setTeacherScopeKey] = useState(
    () => initialViewState.teacherScopeKey,
  );
  const [dismissedRoundWarningBySession, setDismissedRoundWarningBySession] =
    useState({});
  const [messageBottomInset, setMessageBottomInset] = useState(0);
  const allStreamDrafts = useAllStreamDrafts();

  const messageListRef = useRef(null);
  const chatInputWrapRef = useRef(null);
  const exportWrapRef = useRef(null);
  const streamTargetRef = useRef({
    sessionId: "",
    assistantId: "",
    mode: "draft",
  });
  const streamBufferRef = useRef({
    content: "",
    reasoning: "",
    firstTextAt: "",
  });
  const streamFlushTimerRef = useRef(null);
  const streamReasoningEnabledRef = useRef(true);
  const streamAbortControllerRef = useRef(null);
  const streamAbortReasonRef = useRef("");
  const metaSaveTimerRef = useRef(null);
  const messageSaveTimerRef = useRef(null);
  const snapshotSaveTimerRef = useRef(null);
  const persistReadyRef = useRef(false);
  const pendingMetaSaveRef = useRef(false);
  const forceFullStateSaveRef = useRef(false);
  const messageUpsertQueueRef = useRef(new Map());
  const messageUpsertRevisionRef = useRef(new Map());
  const sessionsRef = useRef(initialViewState.sessions);
  const sessionMessagesRef = useRef(initialViewState.sessionMessages);
  const agentBySessionRef = useRef(initialViewState.agentBySession);
  const smartContextEnabledBySessionAgentRef = useRef(
    initialViewState.smartContextEnabledBySessionAgent,
  );
  const activeIdRef = useRef(initialViewState.activeId);
  const latestSnapshotStateRef = useRef({
    groups: initialViewState.groups,
    sessions: initialViewState.sessions,
    sessionMessages: initialViewState.sessionMessages,
    activeId: initialViewState.activeId,
    agent: initialViewState.agent,
    agentBySession: initialViewState.agentBySession,
    agentRuntimeConfigs: initialViewState.agentRuntimeConfigs,
    agentProviderDefaults: initialViewState.agentProviderDefaults,
    teacherScopeKey: initialViewState.teacherScopeKey,
    lastAppliedReasoning: initialViewState.lastAppliedReasoning,
    smartContextEnabledBySessionAgent:
      initialViewState.smartContextEnabledBySessionAgent,
    userInfo: initialViewState.userInfo,
    streamDrafts: initialViewState.streamDrafts,
  });
  const autoSessionTitleRequestRef = useRef(new Set());
  const pendingRouteSessionIdRef = useRef("");
  const pendingNavigationSessionIdRef = useRef("");
  const lastReportedRoutePathRef = useRef("");

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  );
  const activeSessionAgent = useMemo(
    () => readAgentBySession(agentBySession, activeId, "A"),
    [agentBySession, activeId],
  );
  const messages = useMemo(
    () => sessionMessages[activeId] || [],
    [sessionMessages, activeId],
  );
  const activeSessionTitle = useMemo(
    () => String(activeSession?.title || "").trim() || `智能体 ${agent}`,
    [activeSession, agent],
  );

  useLayoutEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);
  useLayoutEffect(() => {
    sessionMessagesRef.current = sessionMessages;
  }, [sessionMessages]);
  useLayoutEffect(() => {
    agentBySessionRef.current = agentBySession;
  }, [agentBySession]);
  useLayoutEffect(() => {
    smartContextEnabledBySessionAgentRef.current = smartContextEnabledBySessionAgent;
  }, [smartContextEnabledBySessionAgent]);
  useLayoutEffect(() => {
    activeIdRef.current = activeId;
  }, [activeId]);
  const roundCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );
  const hasStartedConversation = useMemo(
    () => hasUserTurn(messages),
    [messages],
  );
  const displayedMessages = useMemo(
    () => (hasStartedConversation ? messages : []),
    [hasStartedConversation, messages],
  );
  const hasAtLeastOneSession = sessions.length > 0;
  const canUseMessageInput = hasAtLeastOneSession && !!activeSession;
  const roundWarningDismissed = !!dismissedRoundWarningBySession[activeId];
  const userInfoComplete = useMemo(
    () => isUserInfoComplete(userInfo),
    [userInfo],
  );
  const interactionLocked =
    (bootstrapLoading && !hasInitialViewSnapshot) ||
    forceUserInfoModal ||
    userInfoSaving;
  const teacherLockedAgentId = useMemo(
    () => resolveLockedAgentByTeacherScope(teacherScopeKey),
    [teacherScopeKey],
  );
  const teacherScopedAgentLocked = !!teacherLockedAgentId;
  const activeAgent = useMemo(() => AGENT_META[agent] || AGENT_META.A, [agent]);
  const activeRuntimeConfig = useMemo(
    () => resolveRuntimeConfigForAgent(agent, agentRuntimeConfigs),
    [agentRuntimeConfigs, agent],
  );
  const activeProvider = useMemo(
    () =>
      resolveAgentProvider(agent, activeRuntimeConfig, agentProviderDefaults),
    [agent, activeRuntimeConfig, agentProviderDefaults],
  );
  const smartContextEnabled = useMemo(
    () =>
      readSmartContextEnabledBySessionAgent(
        smartContextEnabledBySessionAgent,
        activeId,
        agent,
      ),
    [smartContextEnabledBySessionAgent, activeId, agent],
  );
  const smartContextSupported = activeProvider === "volcengine";
  const effectiveSmartContextEnabled =
    smartContextSupported && (teacherScopedAgentLocked || smartContextEnabled);
  const smartContextToggleDisabled =
    teacherScopedAgentLocked ||
    isStreaming ||
    interactionLocked ||
    !smartContextSupported;
  const smartContextInfoTitle = teacherScopedAgentLocked
    ? "当前授课教师已锁定远程教育智能体，并强制开启智能上下文管理。"
    : smartContextSupported
      ? "开启后将锁定当前智能体进行对话，不得切换智能体"
      : "仅火山引擎智能体支持智能上下文管理，当前智能体已默认关闭";
  const agentSwitchLocked =
    teacherScopedAgentLocked || effectiveSmartContextEnabled;
  const agentSelectDisabledTitle = teacherScopedAgentLocked
    ? "当前授课教师下已锁定为“远程教育”智能体。"
    : "开启智能上下文管理后，需先关闭开关才能切换智能体。";
  const canonicalActiveHref = buildChatSessionHref(activeId);
  const sessionActionsLocked =
    bootstrapPending || (!!activeId && canonicalActiveHref !== currentRouteHref);
  const makeRuntimeSnapshot = (agentId = agent) => {
    const runtime = resolveRuntimeConfigForAgent(agentId, agentRuntimeConfigs);
    return createRuntimeSnapshot({
      agentId,
      agentMeta: AGENT_META,
      apiTemperature:
        runtime?.temperature ?? DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
      apiTopP: runtime?.topP ?? DEFAULT_AGENT_RUNTIME_CONFIG.topP,
      enableThinking:
        runtime?.enableThinking ?? DEFAULT_AGENT_RUNTIME_CONFIG.enableThinking,
    });
  };

  const emitChatDebugLog = useCallback((event, payload = {}) => {
    if (event !== "route_status") return;
    const pathname = String(payload.pathname || "").trim();
    if (!pathname) return;
    void reportChatClientDebug("route_status", {
      pathname,
      ok: !!payload.ok,
    });
  }, []);

  useLayoutEffect(() => {
    latestSnapshotStateRef.current = {
      groups,
      sessions,
      sessionMessages,
      activeId,
      agent,
      agentBySession,
      agentRuntimeConfigs,
      agentProviderDefaults,
      teacherScopeKey,
      lastAppliedReasoning,
      smartContextEnabledBySessionAgent,
      userInfo,
      streamDrafts: allStreamDrafts,
    };
  }, [
    activeId,
    agent,
    agentBySession,
    agentProviderDefaults,
    agentRuntimeConfigs,
    allStreamDrafts,
    groups,
    lastAppliedReasoning,
    sessionMessages,
    sessions,
    smartContextEnabledBySessionAgent,
    teacherScopeKey,
    userInfo,
  ]);

  const commitImmediateSnapshotState = useCallback((overrides = {}) => {
    const base = latestSnapshotStateRef.current;
    if (!base) return null;
    const nextState = {
      ...base,
      ...overrides,
      streamDrafts: Object.prototype.hasOwnProperty.call(overrides, "streamDrafts")
        ? overrides.streamDrafts
        : getAllStreamDrafts(),
    };

    if (Object.prototype.hasOwnProperty.call(overrides, "sessions")) {
      sessionsRef.current = nextState.sessions;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "sessionMessages")) {
      sessionMessagesRef.current = nextState.sessionMessages;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "agentBySession")) {
      agentBySessionRef.current = nextState.agentBySession;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        overrides,
        "smartContextEnabledBySessionAgent",
      )
    ) {
      smartContextEnabledBySessionAgentRef.current =
        nextState.smartContextEnabledBySessionAgent;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "activeId")) {
      activeIdRef.current = nextState.activeId;
    }

    latestSnapshotStateRef.current = nextState;
    writeChatViewSnapshot(nextState);
    return nextState;
  }, []);

  const persistLiveSnapshot = useCallback(() => {
    const snapshotState = latestSnapshotStateRef.current;
    if (!snapshotState) return;
    if (streamFlushTimerRef.current) {
      clearTimeout(streamFlushTimerRef.current);
      streamFlushTimerRef.current = null;
    }
    flushStreamBuffer();
    writeChatViewSnapshot({
      ...snapshotState,
      streamDrafts: getAllStreamDrafts(),
    });
  }, []);

  const abortActiveStream = useCallback((reason = "user") => {
    const controller = streamAbortControllerRef.current;
    if (!controller) return false;
    streamAbortReasonRef.current = String(reason || "user");
    controller.abort();
    return true;
  }, []);

  const activateSession = useCallback(
    (sessionId, { replace = false } = {}) => {
      const safeSessionId = sanitizeSmartContextSessionId(sessionId);
      const nextAgentId = safeSessionId
        ? readAgentBySession(agentBySessionRef.current, safeSessionId, agent)
        : agent;
      commitImmediateSnapshotState({
        activeId: safeSessionId,
        agent: nextAgentId,
      });
      pendingNavigationSessionIdRef.current =
        safeSessionId || EMPTY_ROUTE_NAVIGATION_SENTINEL;
      emitChatDebugLog("activate_session", {
        clickedSessionId: safeSessionId,
        replace,
        sessionsRef: (sessionsRef.current || []).map((session) => session.id),
        currentActiveId: activeIdRef.current,
      });
      setActiveId(safeSessionId);
      const targetHref = buildChatSessionHref(safeSessionId);
      const currentHref = `${location.pathname}${location.search || ""}`;
      if (targetHref === currentHref) return;
      emitChatDebugLog("navigate_request", {
        clickedSessionId: safeSessionId,
        replace,
        currentHref,
        targetHref,
      });
      navigate(targetHref, { replace });
    },
    [
      buildChatSessionHref,
      commitImmediateSnapshotState,
      emitChatDebugLog,
      agent,
      location.pathname,
      location.search,
      navigate,
    ],
  );

  const redirectAfterSessionRemoval = useCallback(
    (removedSessionIds, nextActiveSessionId = "") => {
      const removed = new Set(
        (Array.isArray(removedSessionIds) ? removedSessionIds : [])
          .map((sessionId) => sanitizeSmartContextSessionId(sessionId))
          .filter(Boolean),
      );
      if (removed.size === 0) return;

      const currentRouteSessionId = sanitizeSmartContextSessionId(routeSessionId);
      if (!currentRouteSessionId || !removed.has(currentRouteSessionId)) return;

      const safeNextActiveSessionId =
        sanitizeSmartContextSessionId(nextActiveSessionId);
      pendingRouteSessionIdRef.current = "";
      pendingNavigationSessionIdRef.current =
        safeNextActiveSessionId || EMPTY_ROUTE_NAVIGATION_SENTINEL;

      const targetHref = buildChatSessionHref(safeNextActiveSessionId);
      const currentHref = `${location.pathname}${location.search || ""}`;
      emitChatDebugLog("delete_route_invalidate", {
        removedSessionIds: Array.from(removed),
        currentRouteSessionId,
        currentHref,
        targetHref,
        nextActiveSessionId: safeNextActiveSessionId,
      });
      if (targetHref !== currentHref) {
        navigate(targetHref, { replace: true });
      }
    },
    [
      buildChatSessionHref,
      emitChatDebugLog,
      location.pathname,
      location.search,
      navigate,
      routeSessionId,
    ],
  );

  useEffect(() => {
    const inputWrap = chatInputWrapRef.current;
    if (!inputWrap) return undefined;

    let frameId = 0;
    const parsePx = (value) => {
      const n = Number.parseFloat(value);
      return Number.isFinite(n) ? n : 0;
    };

    const updateInset = () => {
      frameId = 0;
      const wrapHeight = inputWrap.getBoundingClientRect().height;
      const latestRow = inputWrap.querySelector(".chat-scroll-latest-row");
      let latestRowHeight = 0;

      if (latestRow && latestRow instanceof HTMLElement) {
        const rowRect = latestRow.getBoundingClientRect();
        const styles = window.getComputedStyle(latestRow);
        latestRowHeight =
          rowRect.height +
          parsePx(styles.marginTop) +
          parsePx(styles.marginBottom);
      }

      const next = Math.max(0, Math.ceil(wrapHeight - latestRowHeight));
      setMessageBottomInset((prev) =>
        Math.abs(prev - next) <= 1 ? prev : next,
      );
    };

    const scheduleUpdate = () => {
      if (frameId) cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(updateInset);
    };

    scheduleUpdate();

    let resizeObserver = null;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(scheduleUpdate);
      resizeObserver.observe(inputWrap);
    }
    window.addEventListener("resize", scheduleUpdate);

    return () => {
      if (resizeObserver) resizeObserver.disconnect();
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, []);

  function patchAssistantMessage(sessionId, assistantId, updater, onPatched) {
    if (typeof updater !== "function") return;
    setSessionMessages((prev) => {
      const list = prev[sessionId] || [];
      let touched = false;
      let patchedMessage = null;
      const nextList = list.map((item) => {
        if (item?.id !== assistantId || item?.role !== "assistant") return item;
        touched = true;
        const nextMessage = updater(item);
        patchedMessage = nextMessage;
        return nextMessage;
      });
      if (!touched) return prev;
      if (typeof onPatched === "function" && patchedMessage) {
        onPatched(patchedMessage);
      }
      return {
        ...prev,
        [sessionId]: nextList,
      };
    });
  }

  function updateAssistantRuntimeFromMeta(sessionId, assistantId, meta) {
    const target = streamTargetRef.current;
    const shouldPatchMessage =
      target?.mode === "message" &&
      target?.sessionId === sessionId &&
      target?.assistantId === assistantId;

    if (shouldPatchMessage) {
      patchAssistantMessage(sessionId, assistantId, (message) => ({
        ...message,
        runtime: mergeRuntimeWithMeta(message.runtime, meta),
      }));
      return;
    }

    updateStreamDraft(sessionId, (draft) => {
      if (!draft || draft.id !== assistantId) return draft;
      return {
        ...draft,
        runtime: mergeRuntimeWithMeta(draft.runtime, meta),
      };
    });
  }

  function updateAssistantRuntimeUsage(sessionId, assistantId, usage) {
    const target = streamTargetRef.current;
    const shouldPatchMessage =
      target?.mode === "message" &&
      target?.sessionId === sessionId &&
      target?.assistantId === assistantId;

    if (shouldPatchMessage) {
      patchAssistantMessage(sessionId, assistantId, (message) => ({
        ...message,
        runtime: mergeRuntimeWithUsage(message.runtime, usage),
      }));
      return;
    }

    updateStreamDraft(sessionId, (draft) => {
      if (!draft || draft.id !== assistantId) return draft;
      return {
        ...draft,
        runtime: mergeRuntimeWithUsage(draft.runtime, usage),
      };
    });
  }

  function applyContextSummaryMessage(sessionId, rawSummaryMessage) {
    const summaryMessage = sanitizeContextSummaryMessage(rawSummaryMessage);
    if (!sessionId || !summaryMessage) return;

    setSessionMessages((prev) => {
      const list = Array.isArray(prev?.[sessionId]) ? prev[sessionId] : [];
      const existingIndex = list.findIndex(
        (message) =>
          message?.hidden &&
          message?.role === "system" &&
          String(message?.internalType || "").trim().toLowerCase() ===
            "context_summary",
      );
      let nextList = list;
      if (existingIndex >= 0) {
        const existing = list[existingIndex];
        const unchanged =
          String(existing?.content || "") === summaryMessage.content &&
          String(existing?.summaryUpToMessageId || "") ===
            summaryMessage.summaryUpToMessageId &&
          JSON.stringify(existing?.compressionMeta || null) ===
            JSON.stringify(summaryMessage.compressionMeta || null);
        if (unchanged) return prev;
        nextList = list.map((message, index) =>
          index === existingIndex
            ? {
                ...existing,
                ...summaryMessage,
              }
            : message,
        );
      } else {
        nextList = [summaryMessage, ...list];
      }
      return {
        ...prev,
        [sessionId]: nextList,
      };
    });
    queueMessageUpsert(sessionId, summaryMessage);
  }

  function queueMessageUpsert(sessionId, message) {
    const sid = String(sessionId || "").trim();
    const mid = String(message?.id || "").trim();
    if (!sid || !mid || !message || typeof message !== "object") return;
    const key = `${sid}::${mid}`;
    messageUpsertQueueRef.current.set(key, { sessionId: sid, message });
    const current = messageUpsertRevisionRef.current.get(key) || 0;
    messageUpsertRevisionRef.current.set(key, current + 1);
  }

  function clearSessionMessageQueue(sessionId) {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    const prefix = `${sid}::`;
    Array.from(messageUpsertQueueRef.current.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        messageUpsertQueueRef.current.delete(key);
      }
    });
    Array.from(messageUpsertRevisionRef.current.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        messageUpsertRevisionRef.current.delete(key);
      }
    });
  }

  async function autoRenameSessionFromFirstExchange(
    sessionId,
    userMessage,
    assistantMessage,
  ) {
    const sid = String(sessionId || "").trim();
    if (!sid || autoSessionTitleRequestRef.current.has(sid)) return;

    const currentSession =
      sessionsRef.current.find((item) => item?.id === sid) || null;
    if (!isUntitledSessionTitle(currentSession?.title)) return;

    const question = buildSessionRenameQuestion(userMessage);
    const answer = buildSessionRenameAnswer(assistantMessage);
    if (!question || !answer) return;

    autoSessionTitleRequestRef.current.add(sid);
    let nextTitle = "";
    try {
      const result = await suggestChatSessionTitle({
        question,
        answer,
      });
      nextTitle = normalizeSuggestedSessionTitle(
        result?.title,
        fallbackSessionTitleFromQuestion(question),
      );
    } catch {
      nextTitle = fallbackSessionTitleFromQuestion(question);
    } finally {
      autoSessionTitleRequestRef.current.delete(sid);
    }

    if (!nextTitle || isUntitledSessionTitle(nextTitle)) return;
    setSessions((prev) =>
      prev.map((session) => {
        if (session.id !== sid) return session;
        if (!isUntitledSessionTitle(session.title)) return session;
        return { ...session, title: nextTitle };
      }),
    );
  }

  function updateUserInfoField(field, value) {
    setUserInfo((prev) => ({ ...prev, [field]: value }));
    setUserInfoErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function openUserInfoModal(force = false) {
    setForceUserInfoModal(force);
    setShowUserInfoModal(true);
    setUserInfoErrors({});
    if (!force) setPendingExportKind("");
  }

  function closeUserInfoModal() {
    if (forceUserInfoModal) return;
    setShowUserInfoModal(false);
    setUserInfoErrors({});
    setPendingExportKind("");
  }

  function onNewChat() {
    if (sessionActionsLocked) return;
    const next = createNewSessionRecord();
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const currentMessages =
      sessionMessagesRef.current && typeof sessionMessagesRef.current === "object"
        ? sessionMessagesRef.current
        : {};
    const currentAgentBySession =
      agentBySessionRef.current && typeof agentBySessionRef.current === "object"
        ? agentBySessionRef.current
        : {};
    const currentSmartContextMap =
      smartContextEnabledBySessionAgentRef.current &&
      typeof smartContextEnabledBySessionAgentRef.current === "object"
        ? smartContextEnabledBySessionAgentRef.current
        : {};
    const untitledCount =
      currentSessions.filter((session) =>
        /^新对话(?:\s*\d+)?$/.test(String(session?.title || "").trim()),
      ).length + 1;
    next.session.title = untitledCount > 1 ? `新对话 ${untitledCount}` : "新对话";
    const nextAgentId = teacherLockedAgentId || agent;
    const nextSessions = [next.session, ...currentSessions];
    const nextSessionMessages = {
      ...currentMessages,
      [next.session.id]: next.messages,
    };
    const nextAgentBySession = patchAgentBySession(
      currentAgentBySession,
      next.session.id,
      nextAgentId,
    );
    const nextSmartContextMap = teacherScopedAgentLocked
      ? patchSmartContextEnabledBySessionAgent(
          currentSmartContextMap,
          next.session.id,
          nextAgentId,
          true,
        )
      : currentSmartContextMap;
    const nextActiveAgent = teacherScopedAgentLocked ? nextAgentId : agent;

    commitImmediateSnapshotState({
      sessions: nextSessions,
      sessionMessages: nextSessionMessages,
      activeId: next.session.id,
      agent: nextActiveAgent,
      agentBySession: nextAgentBySession,
      smartContextEnabledBySessionAgent: nextSmartContextMap,
    });

    setSessions(nextSessions);
    setSessionMessages(nextSessionMessages);
    setAgentBySession(nextAgentBySession);
    if (teacherScopedAgentLocked) {
      setSmartContextEnabledBySessionAgent(nextSmartContextMap);
      setAgent(nextAgentId);
    }
    if (next.messages[0]) {
      queueMessageUpsert(next.session.id, next.messages[0]);
    }
    activateSession(next.session.id);
    setStreamError("");
    setSelectedAskText("");
    setFocusUserMessageId("");
  }

  function onOpenImageGeneration() {
    const context = normalizeImageReturnContext({
      sessionId: activeId,
      agentId: agent,
      timestamp: Date.now(),
    });
    if (context) {
      saveImageReturnContext(context);
    }
    const nextReturnTarget =
      returnTarget === "teacher-home" ? "teacher-home" : "chat";
    const params = new URLSearchParams();
    params.set("returnTo", nextReturnTarget);
    if (nextReturnTarget === "teacher-home" && teacherHomePanelParam) {
      params.set("teacherPanel", teacherHomePanelParam);
    }
    if (
      nextReturnTarget === "teacher-home" &&
      teacherHomeExportContext.exportTeacherScopeKey
    ) {
      params.set(
        "exportTeacherScopeKey",
        teacherHomeExportContext.exportTeacherScopeKey,
      );
    }
    if (
      nextReturnTarget === "teacher-home" &&
      teacherHomeExportContext.exportDate
    ) {
      params.set("exportDate", teacherHomeExportContext.exportDate);
    }
    navigate(withAuthSlot(`/image-generation?${params.toString()}`), {
      state: {
        returnContext: context,
      },
    });
  }

  function onOpenGroupChat() {
    const nextReturnTarget =
      returnTarget === "teacher-home" ? "teacher-home" : "chat";
    const params = new URLSearchParams();
    params.set("returnTo", nextReturnTarget);
    if (nextReturnTarget === "teacher-home" && teacherHomePanelParam) {
      params.set("teacherPanel", teacherHomePanelParam);
    }
    if (
      nextReturnTarget === "teacher-home" &&
      teacherHomeExportContext.exportTeacherScopeKey
    ) {
      params.set(
        "exportTeacherScopeKey",
        teacherHomeExportContext.exportTeacherScopeKey,
      );
    }
    if (
      nextReturnTarget === "teacher-home" &&
      teacherHomeExportContext.exportDate
    ) {
      params.set("exportDate", teacherHomeExportContext.exportDate);
    }
    navigate(withAuthSlot(`/party?${params.toString()}`));
  }

  function onDeleteSession(sessionId) {
    if (sessionActionsLocked) return;
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const currentMessages =
      sessionMessagesRef.current && typeof sessionMessagesRef.current === "object"
        ? sessionMessagesRef.current
        : {};
    const currentAgentBySession =
      agentBySessionRef.current && typeof agentBySessionRef.current === "object"
        ? agentBySessionRef.current
        : {};
    const currentSmartContextMap =
      smartContextEnabledBySessionAgentRef.current &&
      typeof smartContextEnabledBySessionAgentRef.current === "object"
        ? smartContextEnabledBySessionAgentRef.current
        : {};
    const currentActiveId = sanitizeSmartContextSessionId(activeIdRef.current);
    const nextSessions = currentSessions.filter((session) => session.id !== sessionId);
    const nextActiveSessionId =
      sessionId === currentActiveId ? nextSessions[0]?.id || "" : currentActiveId;
    const nextMessages = { ...currentMessages };
    delete nextMessages[sessionId];
    const nextSmartContextMap = removeSmartContextBySessions(
      currentSmartContextMap,
      new Set([sessionId]),
    );
    const nextAgentBySession = removeAgentBySessions(
      currentAgentBySession,
      new Set([sessionId]),
    );
    const nextAgentId = nextActiveSessionId
      ? readAgentBySession(nextAgentBySession, nextActiveSessionId, agent)
      : agent;

    commitImmediateSnapshotState({
      sessions: nextSessions,
      sessionMessages: nextMessages,
      activeId: nextActiveSessionId || "",
      agent: nextAgentId,
      agentBySession: nextAgentBySession,
      smartContextEnabledBySessionAgent: nextSmartContextMap,
    });

    emitChatDebugLog("delete_session_apply", {
      clickedSessionId: sanitizeSmartContextSessionId(sessionId),
      sessionsRef: currentSessions.map((session) => session.id),
      currentActiveId,
      nextSessions: nextSessions.map((session) => session.id),
    });
    redirectAfterSessionRemoval([sessionId], nextActiveSessionId);
    setSessions(nextSessions);
    if (sessionId === currentActiveId) {
      if (nextSessions.length > 0) {
        activateSession(nextSessions[0].id);
      } else {
        activateSession("", { replace: true });
      }
    }

    setSessionMessages(nextMessages);
    setDismissedRoundWarningBySession((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setSmartContextEnabledBySessionAgent(nextSmartContextMap);
    setAgentBySession(nextAgentBySession);
    clearStreamDraft(sessionId);
    clearSessionMessageQueue(sessionId);

    if (sessionId === activeId) {
      setSelectedAskText("");
    }
  }

  function onAgentChange(nextAgent) {
    if (teacherScopedAgentLocked || agentSwitchLocked) return;
    setAgent(nextAgent);
    setAgentBySession((prev) => patchAgentBySession(prev, activeId, nextAgent));
  }

  function onBatchDeleteSessions(sessionIds) {
    if (sessionActionsLocked) return;
    const remove = new Set(sessionIds);
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const currentMessages =
      sessionMessagesRef.current && typeof sessionMessagesRef.current === "object"
        ? sessionMessagesRef.current
        : {};
    const currentAgentBySession =
      agentBySessionRef.current && typeof agentBySessionRef.current === "object"
        ? agentBySessionRef.current
        : {};
    const currentSmartContextMap =
      smartContextEnabledBySessionAgentRef.current &&
      typeof smartContextEnabledBySessionAgentRef.current === "object"
        ? smartContextEnabledBySessionAgentRef.current
        : {};
    const currentActiveId = sanitizeSmartContextSessionId(activeIdRef.current);
    const nextSessions = currentSessions.filter((session) => !remove.has(session.id));
    const nextActiveSessionId = remove.has(currentActiveId)
      ? nextSessions[0]?.id || ""
      : currentActiveId;
    const nextMessages = { ...currentMessages };
    sessionIds.forEach((id) => {
      delete nextMessages[id];
    });
    const nextSmartContextMap = removeSmartContextBySessions(
      currentSmartContextMap,
      remove,
    );
    const nextAgentBySession = removeAgentBySessions(currentAgentBySession, remove);
    const nextAgentId = nextActiveSessionId
      ? readAgentBySession(nextAgentBySession, nextActiveSessionId, agent)
      : agent;

    commitImmediateSnapshotState({
      sessions: nextSessions,
      sessionMessages: nextMessages,
      activeId: nextActiveSessionId || "",
      agent: nextAgentId,
      agentBySession: nextAgentBySession,
      smartContextEnabledBySessionAgent: nextSmartContextMap,
    });

    emitChatDebugLog("batch_delete_sessions_apply", {
      clickedSessionIds: Array.from(remove),
      sessionsRef: currentSessions.map((session) => session.id),
      currentActiveId,
      nextSessions: nextSessions.map((session) => session.id),
    });
    redirectAfterSessionRemoval(Array.from(remove), nextActiveSessionId);
    setSessions(nextSessions);
    if (remove.has(currentActiveId)) {
      if (nextSessions.length > 0) {
        activateSession(nextSessions[0].id);
      } else {
        activateSession("", { replace: true });
      }
    }

    setSessionMessages(nextMessages);
    setDismissedRoundWarningBySession((prev) => {
      const next = { ...prev };
      let changed = false;
      sessionIds.forEach((id) => {
        if (next[id]) {
          delete next[id];
          changed = true;
        }
      });
      return changed ? next : prev;
    });
    setSmartContextEnabledBySessionAgent(nextSmartContextMap);
    setAgentBySession(nextAgentBySession);
    clearManyStreamDrafts(sessionIds);
    sessionIds.forEach((id) => clearSessionMessageQueue(id));
  }

  async function clearSmartContextReferenceBySession(sessionId) {
    const safeSessionId = sanitizeSmartContextSessionId(sessionId);
    if (!safeSessionId) return;
    try {
      await clearChatSmartContext(safeSessionId);
    } catch (error) {
      setStateSaveError(error?.message || "智能上下文引用清理失败");
    }
  }

  function onToggleSmartContext(enabled) {
    if (teacherScopedAgentLocked) return;
    const nextEnabled = !!enabled;
    setSmartContextEnabledBySessionAgent((prev) =>
      patchSmartContextEnabledBySessionAgent(
        prev,
        activeId,
        agent,
        nextEnabled,
      ),
    );
    if (!nextEnabled) {
      void clearSmartContextReferenceBySession(activeId);
    }
  }

  function onMoveSessionToGroup(sessionId, groupId) {
    if (sessionActionsLocked) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, groupId: groupId || null };
      }),
    );
  }

  function onBatchMoveSessionsToGroup(sessionIds, groupId) {
    if (sessionActionsLocked) return;
    const selected = new Set(sessionIds);

    setSessions((prev) =>
      prev.map((s) => {
        if (!selected.has(s.id)) return s;
        return { ...s, groupId: groupId || null };
      }),
    );
  }

  function onRenameSession(sessionId, title) {
    if (sessionActionsLocked) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, title };
      }),
    );
  }

  function onToggleSessionPin(sessionId) {
    if (sessionActionsLocked) return;
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, pinned: !s.pinned };
      }),
    );
  }

  function onCreateGroup(payload) {
    if (sessionActionsLocked) return;
    const item = {
      id: `g${Date.now()}`,
      name: payload.name,
      description: payload.description,
    };

    setGroups((prev) => [item, ...prev]);
  }

  function onRenameGroup(groupId, payload) {
    if (sessionActionsLocked) return;
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    setGroups((prev) =>
      prev.map((group) => {
        if (group.id !== safeGroupId) return group;
        return {
          ...group,
          name: payload.name,
          description: payload.description,
        };
      }),
    );
  }

  function onDeleteGroup(groupId) {
    if (sessionActionsLocked) return;
    setGroups((prev) => prev.filter((g) => g.id !== groupId));

    setSessions((prev) =>
      prev.map((s) => {
        if (s.groupId !== groupId) return s;
        return { ...s, groupId: null };
      }),
    );
  }

  function flushStreamBuffer() {
    const target = streamTargetRef.current;
    if (!target.sessionId || !target.assistantId) return;

    const { content, reasoning, firstTextAt } = streamBufferRef.current;
    if (!content && !reasoning && !firstTextAt) return;
    const snapshotState = latestSnapshotStateRef.current;

    if (target.mode === "message") {
      if (snapshotState?.sessionMessages) {
        const snapshotList = snapshotState.sessionMessages[target.sessionId] || [];
        snapshotState.sessionMessages = {
          ...snapshotState.sessionMessages,
          [target.sessionId]: snapshotList.map((message) => {
            if (
              message?.id !== target.assistantId ||
              message?.role !== "assistant"
            ) {
              return message;
            }
            return {
              ...message,
              content: (message.content || "") + content,
              reasoning: (message.reasoning || "") + reasoning,
              firstTextAt: message.firstTextAt || firstTextAt || null,
            };
          }),
        };
      }
      patchAssistantMessage(
        target.sessionId,
        target.assistantId,
        (message) => ({
          ...message,
          content: (message.content || "") + content,
          reasoning: (message.reasoning || "") + reasoning,
          firstTextAt: message.firstTextAt || firstTextAt || null,
        }),
      );
    } else {
      if (snapshotState?.streamDrafts) {
        const previousDraft = snapshotState.streamDrafts[target.sessionId] || null;
        if (previousDraft?.id === target.assistantId) {
          snapshotState.streamDrafts = {
            ...snapshotState.streamDrafts,
            [target.sessionId]: {
              ...previousDraft,
              content: (previousDraft.content || "") + content,
              reasoning: (previousDraft.reasoning || "") + reasoning,
              firstTextAt: previousDraft.firstTextAt || firstTextAt || null,
            },
          };
        }
      }
      updateStreamDraft(target.sessionId, (draft) => {
        if (!draft || draft.id !== target.assistantId) return draft;
        return {
          ...draft,
          content: (draft.content || "") + content,
          reasoning: (draft.reasoning || "") + reasoning,
          firstTextAt: draft.firstTextAt || firstTextAt || null,
        };
      });
    }

    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };
  }

  function scheduleStreamFlush() {
    if (streamFlushTimerRef.current) return;
    streamFlushTimerRef.current = setTimeout(() => {
      streamFlushTimerRef.current = null;
      flushStreamBuffer();
    }, 33);
  }

  function pickRecentRounds(list, maxRounds = CONTEXT_USER_ROUNDS) {
    if (!Array.isArray(list) || list.length === 0) return [];
    if (maxRounds <= 0) return [];

    let seenUser = 0;
    let startIdx = 0;
    for (let i = list.length - 1; i >= 0; i -= 1) {
      if (list[i]?.role === "user") {
        seenUser += 1;
        if (seenUser > maxRounds) {
          startIdx = i + 1;
          break;
        }
      }
    }
    return list.slice(startIdx);
  }

  function toApiMessages(
    list,
    { useVolcengineResponsesFileRefs = false, usePackyContextSummary = false } = {},
  ) {
    return buildApiSourceMessages(list, { usePackyContextSummary })
      .map((m) => {
        const content = buildApiMessageContentFromMessage(
          m,
          useVolcengineResponsesFileRefs,
        );
        const nextMessage = {
          id: String(m?.id || ""),
          role: m.role,
          content,
        };
        if (m?.hidden) {
          nextMessage.hidden = true;
        }
        if (m?.internalType) {
          nextMessage.internalType = String(m.internalType);
        }
        if (m?.summaryUpToMessageId) {
          nextMessage.summaryUpToMessageId = String(m.summaryUpToMessageId);
        }
        if (m?.compressionMeta && typeof m.compressionMeta === "object") {
          nextMessage.compressionMeta = { ...m.compressionMeta };
        }
        return nextMessage;
      })
      .filter((m) => {
        if (m.role === "user") return true;
        if (typeof m.content === "string") return m.content.trim().length > 0;
        return Array.isArray(m.content) && m.content.length > 0;
      });
  }

  function buildApiMessageContentFromMessage(
    message,
    useVolcengineResponsesFileRefs,
  ) {
    const text = String(message?.content || "");
    if (!useVolcengineResponsesFileRefs || message?.role !== "user") {
      return text;
    }

    const refs = Array.isArray(message?.attachments)
      ? message.attachments
          .map((attachment) => {
            const fileId = String(attachment?.fileId || "").trim();
            const inputType = String(attachment?.inputType || "")
              .trim()
              .toLowerCase();
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

  function shouldUseVolcengineFilesApi(runtimeConfig) {
    const provider = resolveAgentProvider(
      agent,
      runtimeConfig,
      agentProviderDefaults,
    );
    const protocol = String(runtimeConfig?.protocol || "")
      .trim()
      .toLowerCase();
    return provider === "volcengine" && protocol === "responses";
  }

  function classifyVolcengineFilesApiType(file) {
    const mime = String(file?.type || "")
      .trim()
      .toLowerCase();
    const name = String(file?.name || "")
      .trim()
      .toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";

    if (mime.includes("pdf") || ext === "pdf") return "input_file";
    if (mime.startsWith("image/")) return "input_image";
    if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext))
      return "input_video";
    return "";
  }

  function isPdfUploadFile(file) {
    const mime = String(file?.type || "")
      .trim()
      .toLowerCase();
    const name = String(file?.name || "")
      .trim()
      .toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    return mime.includes("pdf") || ext === "pdf";
  }

  function shouldUseAliyunPdfPreprocess(runtimeConfig, currentAgent) {
    const provider = resolveAgentProvider(
      currentAgent,
      runtimeConfig,
      agentProviderDefaults,
    );
    const safeAgent = String(currentAgent || "")
      .trim()
      .toUpperCase();
    return provider === "aliyun" && safeAgent === "D";
  }

  async function onPrepareFiles(pickedFiles) {
    const safePicked = Array.isArray(pickedFiles)
      ? pickedFiles.filter(Boolean)
      : [];
    if (safePicked.length === 0) return [];

    const runtimeConfig = resolveRuntimeConfigForAgent(
      agent,
      agentRuntimeConfigs,
    );
    if (shouldUseAliyunPdfPreprocess(runtimeConfig, agent)) {
      const indexedPicked = safePicked.map((file, index) => ({
        index,
        file,
        isPdf: isPdfUploadFile(file),
      }));
      const pdfCandidates = indexedPicked.filter((item) => item.isPdf);
      const localItems = await Promise.all(
        indexedPicked
          .filter((item) => !item.isPdf)
          .map(async (item) => ({
            index: item.index,
            kind: "local",
            file: item.file,
            name: String(item.file?.name || ""),
            size: Number(item.file?.size || 0),
            type: String(item.file?.type || ""),
            thumbnailUrl: await buildImageThumbnailDataUrl(item.file),
          })),
      );

      if (pdfCandidates.length > 0) {
        const prepareResult = await prepareChatAttachments({
          agentId: agent,
          sessionId: activeId,
          files: pdfCandidates.map((item) => item.file),
        });
        const preparedRefs = Array.isArray(prepareResult?.files)
          ? prepareResult.files
          : [];
        if (preparedRefs.length !== pdfCandidates.length) {
          throw new Error("PDF 预处理结果异常，请重新上传。");
        }

        const preparedItems = preparedRefs.map((ref, idx) => {
          const file = pdfCandidates[idx].file;
          const preparedToken = String(ref?.token || "").trim();
          if (!preparedToken) {
            throw new Error("PDF 预处理缺少 token，请重新上传。");
          }
          return {
            index: pdfCandidates[idx].index,
            kind: "prepared_ref",
            // Keep the original File for local preview in composer.
            file,
            name: String(file?.name || ref?.fileName || ""),
            size: Number(ref?.size || file?.size || 0),
            type: String(ref?.mimeType || file?.type || ""),
            mimeType: String(ref?.mimeType || file?.type || ""),
            preparedToken,
          };
        });

        return [...localItems, ...preparedItems]
          .sort((a, b) => a.index - b.index)
          .map((item) => {
            const nextItem = { ...item };
            delete nextItem.index;
            return nextItem;
          });
      }

      return localItems
        .sort((a, b) => a.index - b.index)
        .map((item) => {
          const nextItem = { ...item };
          delete nextItem.index;
          return nextItem;
        });
    }

    if (!shouldUseVolcengineFilesApi(runtimeConfig)) {
      return Promise.all(
        safePicked.map(async (file) => ({
          kind: "local",
          file,
          name: String(file?.name || ""),
          size: Number(file?.size || 0),
          type: String(file?.type || ""),
          thumbnailUrl: await buildImageThumbnailDataUrl(file),
        })),
      );
    }

    const indexedPicked = safePicked.map((file, index) => ({
      index,
      file,
      inputType: classifyVolcengineFilesApiType(file),
    }));
    const remoteCandidates = indexedPicked.filter((item) => !!item.inputType);
    const localCandidates = indexedPicked.filter((item) => !item.inputType);
    const localItems = await Promise.all(
      localCandidates.map(async (item) => ({
        index: item.index,
        kind: "local",
        file: item.file,
        name: String(item.file?.name || ""),
        size: Number(item.file?.size || 0),
        type: String(item.file?.type || ""),
        thumbnailUrl: await buildImageThumbnailDataUrl(item.file),
      })),
    );

    if (remoteCandidates.length === 0) {
      return localItems.sort((a, b) => a.index - b.index);
    }

    const uploadResult = await uploadVolcengineChatFiles({
      agentId: agent,
      files: remoteCandidates.map((item) => item.file),
    });
    const remoteRefs = Array.isArray(uploadResult?.files)
      ? uploadResult.files
      : [];
    if (remoteRefs.length !== remoteCandidates.length) {
      throw new Error("文件上传结果异常，请重试。");
    }

    const remoteItems = await Promise.all(
      remoteRefs.map(async (ref, idx) => ({
        index: remoteCandidates[idx].index,
        kind: "volc_ref",
        // Keep the original File for local preview in composer.
        file: remoteCandidates[idx].file,
        name: String(remoteCandidates[idx].file?.name || ref?.name || ""),
        size: Number(ref?.size || remoteCandidates[idx].file?.size || 0),
        type: String(ref?.mimeType || remoteCandidates[idx].file?.type || ""),
        mimeType: String(
          ref?.mimeType || remoteCandidates[idx].file?.type || "",
        ),
        inputType: String(
          ref?.inputType || remoteCandidates[idx].inputType || "",
        ),
        fileId: String(ref?.fileId || ""),
        url: String(ref?.url || "").trim(),
        ossKey: String(ref?.ossKey || "").trim(),
        thumbnailUrl: await buildImageThumbnailDataUrl(
          remoteCandidates[idx].file,
        ),
      })),
    );

    return [...localItems, ...remoteItems]
      .sort((a, b) => a.index - b.index)
      .map((item) => {
        const nextItem = { ...item };
        delete nextItem.index;
        return nextItem;
      });
  }

  async function onSend(text, files) {
    if (!activeId || isStreaming || interactionLocked || !userInfoComplete)
      return;
    const runtimeConfig = resolveRuntimeConfigForAgent(
      agent,
      agentRuntimeConfigs,
    );

    setStreamError("");
    const askedAt = new Date().toISOString();

    const fileItems = Array.isArray(files) ? files.filter(Boolean) : [];
    const localFiles = [];
    const volcengineFileRefs = [];
    const preparedAttachmentRefs = [];
    const attachments = fileItems.map((item) => {
      if (item?.kind === "prepared_ref") {
        const preparedToken = String(item?.preparedToken || "").trim();
        if (preparedToken) {
          preparedAttachmentRefs.push({
            token: preparedToken,
            fileName: String(item?.name || ""),
            mimeType: String(item?.mimeType || item?.type || ""),
            size: Number(item?.size || 0),
          });
        }
        return {
          name: String(item?.name || "文件"),
          size: Number(item?.size || 0),
          type: String(item?.mimeType || item?.type || ""),
          thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
        };
      }
      if (item?.kind === "volc_ref") {
        const fileId = String(item?.fileId || "").trim();
        const inputType = String(item?.inputType || "")
          .trim()
          .toLowerCase();
        if (
          fileId &&
          (inputType === "input_file" ||
            inputType === "input_image" ||
            inputType === "input_video")
        ) {
          volcengineFileRefs.push({
            fileId,
            inputType,
            name: String(item?.name || ""),
            mimeType: String(item?.mimeType || item?.type || ""),
            size: Number(item?.size || 0),
          });
        }
        return {
          name: String(item?.name || "文件"),
          size: Number(item?.size || 0),
          type: String(item?.mimeType || item?.type || ""),
          fileId,
          inputType,
          url: String(item?.url || "").trim(),
          ossKey: String(item?.ossKey || "").trim(),
          thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
        };
      }

      const rawFile = item?.kind === "local" ? item.file : item;
      if (rawFile instanceof File) {
        localFiles.push(rawFile);
        return {
          name: rawFile.name,
          size: rawFile.size,
          type: rawFile.type,
          thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
        };
      }

      return {
        name: String(item?.name || "文件"),
        size: Number(item?.size || 0),
        type: String(item?.type || ""),
      };
    });

    const userMsg = {
      id: `u${Date.now()}`,
      role: "user",
      content: text || "",
      attachments,
      askedAt,
    };

    const assistantId = `a${Date.now()}-stream`;
    const assistantMsg = {
      id: assistantId,
      role: "assistant",
      content: "",
      reasoning: "",
      feedback: null,
      streaming: true,
      startedAt: new Date().toISOString(),
      firstTextAt: null,
      runtime: makeRuntimeSnapshot(agent),
    };

    const currentSessionId = activeId;
    const priorMessages = sessionMessages[currentSessionId] || [];
    const shouldAutoRenameSession =
      isUntitledSessionTitle(
        sessionsRef.current.find((item) => item?.id === currentSessionId)
          ?.title || "",
      ) &&
      !priorMessages.some((item) => {
        if (item?.role !== "user") return false;
        const hasText = String(item?.content || "").trim().length > 0;
        const hasAttachments =
          Array.isArray(item?.attachments) && item.attachments.some(Boolean);
        return hasText || hasAttachments;
      });
    const currentHistory = [...priorMessages, userMsg];

    setSessionMessages((prev) => {
      const list = prev[currentSessionId] || [];
      return { ...prev, [currentSessionId]: [...list, userMsg] };
    });
    queueMessageUpsert(currentSessionId, userMsg);
    startStreamDraft(currentSessionId, assistantMsg);

    const historyForApi = toApiMessages(
      isPackyTokenBudgetRuntime(agent, runtimeConfig, agentProviderDefaults)
        ? currentHistory
        : pickRecentRounds(
            currentHistory,
            runtimeConfig.contextRounds || CONTEXT_USER_ROUNDS,
          ),
      {
        useVolcengineResponsesFileRefs:
          shouldUseVolcengineFilesApi(runtimeConfig),
        usePackyContextSummary: isPackyTokenBudgetRuntime(
          agent,
          runtimeConfig,
          agentProviderDefaults,
        ),
      },
    );

    const formData = new FormData();
    const streamEndpoint =
      agent === "E" ? "/api/chat/stream-e" : "/api/chat/stream";
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append(
      "smartContextEnabled",
      String(effectiveSmartContextEnabled),
    );
    formData.append("contextMode", "append");
    formData.append("messages", JSON.stringify(historyForApi));

    localFiles.forEach((f) => formData.append("files", f));
    if (volcengineFileRefs.length > 0) {
      formData.append("volcengineFileRefs", JSON.stringify(volcengineFileRefs));
    }
    if (preparedAttachmentRefs.length > 0) {
      formData.append(
        "preparedAttachmentRefs",
        JSON.stringify(preparedAttachmentRefs),
      );
    }

    setFocusUserMessageId("");
    setIsAtLatest(true);
    requestAnimationFrame(() => {
      scrollToLatestRound(220);
    });
    setIsStreaming(true);
    streamReasoningEnabledRef.current = !!runtimeConfig.enableThinking;
    streamTargetRef.current = {
      sessionId: currentSessionId,
      assistantId,
      mode: "draft",
    };
    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };
    const requestController = new AbortController();
    streamAbortControllerRef.current = requestController;
    streamAbortReasonRef.current = "";

    try {
      const resp = await fetch(streamEndpoint, {
        method: "POST",
        headers: {
          ...getAuthTokenHeader(),
        },
        body: formData,
        signal: requestController.signal,
      });

      if (!resp.ok || !resp.body) {
        const errText = await readErrorMessage(resp);
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      await readSseStream(resp, {
        onMeta: (meta) => {
          applyContextSummaryMessage(currentSessionId, meta?.contextSummaryMessage);
          const uploadedLinks = Array.isArray(meta?.uploadedAttachmentLinks)
            ? meta.uploadedAttachmentLinks
            : [];
          if (uploadedLinks.length > 0) {
            setSessionMessages((prev) => {
              const list = prev[currentSessionId] || [];
              const nextList = list.map((item) => {
                if (item.id !== userMsg.id || item.role !== "user") return item;
                const nextAttachments = mergeAttachmentsWithUploadedLinks(
                  item.attachments,
                  uploadedLinks,
                );
                const changed = nextAttachments.some(
                  (attachment, idx) =>
                    attachment?.url !== item.attachments?.[idx]?.url,
                );
                if (!changed) return item;
                const changedMessage = {
                  ...item,
                  attachments: nextAttachments,
                };
                queueMessageUpsert(currentSessionId, changedMessage);
                return changedMessage;
              });
              return {
                ...prev,
                [currentSessionId]: nextList,
              };
            });
          }
          const enabled = !!meta?.reasoningEnabled;
          const applied = meta?.reasoningApplied || "none";
          streamReasoningEnabledRef.current = enabled;
          setLastAppliedReasoning(applied);
          updateAssistantRuntimeFromMeta(currentSessionId, assistantId, meta);
        },
        onUsage: (usage) => {
          updateAssistantRuntimeUsage(currentSessionId, assistantId, usage);
        },
        onToken: (textChunk) => {
          if (!textChunk) return;
          streamBufferRef.current.content += textChunk;
          if (!streamBufferRef.current.firstTextAt) {
            streamBufferRef.current.firstTextAt = new Date().toISOString();
          }
          scheduleStreamFlush();
        },
        onReasoningToken: (textChunk) => {
          if (!textChunk) return;
          if (!streamReasoningEnabledRef.current) return;
          streamBufferRef.current.reasoning += textChunk;
          scheduleStreamFlush();
        },
        onError: (msg) => {
          throw new Error(msg || "stream error");
        },
      });
    } catch (error) {
      const aborted =
        error?.name === "AbortError" || !!streamAbortReasonRef.current;
      if (!aborted) {
        const msg = error?.message || "请求失败";
        setStreamError(msg);
        flushStreamBuffer();
        updateStreamDraft(currentSessionId, (draft) => {
          if (!draft || draft.id !== assistantId) return draft;
          return {
            ...draft,
            content: (draft.content || "") + `\n\n> 请求失败：${msg}`,
          };
        });
      }
    } finally {
      if (streamAbortControllerRef.current === requestController) {
        streamAbortControllerRef.current = null;
      }
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      flushStreamBuffer();
      const completed = getStreamDraft(currentSessionId);
      clearStreamDraft(currentSessionId);
      const hasRenderableDraft =
        completed &&
        completed.id === assistantId &&
        (String(completed.content || "").trim() ||
          String(completed.reasoning || "").trim());
      if (hasRenderableDraft) {
        const completedMsg = { ...completed, streaming: false };
        setSessionMessages((prev) => {
          const list = prev[currentSessionId] || [];
          return {
            ...prev,
            [currentSessionId]: [...list, completedMsg],
          };
        });
        queueMessageUpsert(currentSessionId, completedMsg);
        if (
          shouldAutoRenameSession &&
          String(completedMsg.content || "").trim()
        ) {
          void autoRenameSessionFromFirstExchange(
            currentSessionId,
            userMsg,
            completedMsg,
          );
        }
      }
      streamAbortReasonRef.current = "";
      streamTargetRef.current = {
        sessionId: "",
        assistantId: "",
        mode: "draft",
      };
      setIsStreaming(false);
    }
  }

  function onAssistantFeedback(messageId, feedback) {
    if (!activeId) return;
    const currentList = sessionMessages[activeId] || [];
    const currentMessage = currentList.find(
      (m) => m.id === messageId && m.role === "assistant",
    );
    if (!currentMessage) return;

    const nextFeedback = currentMessage.feedback === feedback ? null : feedback;
    const changedMessage = { ...currentMessage, feedback: nextFeedback };

    setSessionMessages((prev) => {
      const list = prev[activeId] || [];
      const next = list.map((m) => {
        if (m.id !== messageId) return m;
        if (m.role !== "assistant") return m;
        return changedMessage;
      });
      return { ...prev, [activeId]: next };
    });
    queueMessageUpsert(activeId, changedMessage);
  }

  async function onAssistantRegenerate(
    assistantIdToRegenerate,
    promptMessageId,
  ) {
    if (
      !activeId ||
      isStreaming ||
      !promptMessageId ||
      interactionLocked ||
      !userInfoComplete
    ) {
      return;
    }
    const runtimeConfig = resolveRuntimeConfigForAgent(
      agent,
      agentRuntimeConfigs,
    );

    const currentSessionId = activeId;
    const list = sessionMessages[currentSessionId] || [];
    const assistantIndex = list.findIndex(
      (m) => m.id === assistantIdToRegenerate && m.role === "assistant",
    );
    if (assistantIndex === -1) return;
    const promptIndex = list.findIndex(
      (m) => m.id === promptMessageId && m.role === "user",
    );
    if (promptIndex === -1) return;

    const promptMsg = list[promptIndex];
    const previousAssistant = list[assistantIndex];
    const historyForApi = toApiMessages(
      isPackyTokenBudgetRuntime(agent, runtimeConfig, agentProviderDefaults)
        ? list.slice(0, promptIndex + 1)
        : pickRecentRounds(
            list.slice(0, promptIndex + 1),
            runtimeConfig.contextRounds || CONTEXT_USER_ROUNDS,
          ),
      {
        useVolcengineResponsesFileRefs:
          shouldUseVolcengineFilesApi(runtimeConfig),
        usePackyContextSummary: isPackyTokenBudgetRuntime(
          agent,
          runtimeConfig,
          agentProviderDefaults,
        ),
      },
    );

    const regeneratingAssistant = {
      ...previousAssistant,
      content: "",
      reasoning: "",
      feedback: null,
      streaming: true,
      startedAt: new Date().toISOString(),
      firstTextAt: null,
      regenerateOf: assistantIdToRegenerate,
      askedAt: promptMsg.askedAt || null,
      runtime: makeRuntimeSnapshot(agent),
    };
    let hasReceivedRegeneratedOutput = false;

    patchAssistantMessage(
      currentSessionId,
      assistantIdToRegenerate,
      () => regeneratingAssistant,
    );

    const formData = new FormData();
    const streamEndpoint =
      agent === "E" ? "/api/chat/stream-e" : "/api/chat/stream";
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append(
      "smartContextEnabled",
      String(effectiveSmartContextEnabled),
    );
    formData.append("contextMode", "regenerate");
    formData.append("messages", JSON.stringify(historyForApi));

    setFocusUserMessageId(promptMessageId);
    setIsStreaming(true);
    streamReasoningEnabledRef.current = !!runtimeConfig.enableThinking;
    streamTargetRef.current = {
      sessionId: currentSessionId,
      assistantId: assistantIdToRegenerate,
      mode: "message",
    };
    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };
    const requestController = new AbortController();
    streamAbortControllerRef.current = requestController;
    streamAbortReasonRef.current = "";

    try {
      const resp = await fetch(streamEndpoint, {
        method: "POST",
        headers: {
          ...getAuthTokenHeader(),
        },
        body: formData,
        signal: requestController.signal,
      });

      if (!resp.ok || !resp.body) {
        const errText = await readErrorMessage(resp);
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      await readSseStream(resp, {
        onMeta: (meta) => {
          applyContextSummaryMessage(currentSessionId, meta?.contextSummaryMessage);
          const enabled = !!meta?.reasoningEnabled;
          const applied = meta?.reasoningApplied || "none";
          streamReasoningEnabledRef.current = enabled;
          setLastAppliedReasoning(applied);
          updateAssistantRuntimeFromMeta(
            currentSessionId,
            assistantIdToRegenerate,
            meta,
          );
        },
        onUsage: (usage) => {
          updateAssistantRuntimeUsage(
            currentSessionId,
            assistantIdToRegenerate,
            usage,
          );
        },
        onToken: (textChunk) => {
          if (!textChunk) return;
          hasReceivedRegeneratedOutput = true;
          streamBufferRef.current.content += textChunk;
          if (!streamBufferRef.current.firstTextAt) {
            streamBufferRef.current.firstTextAt = new Date().toISOString();
          }
          scheduleStreamFlush();
        },
        onReasoningToken: (textChunk) => {
          if (!textChunk) return;
          if (!streamReasoningEnabledRef.current) return;
          hasReceivedRegeneratedOutput = true;
          streamBufferRef.current.reasoning += textChunk;
          scheduleStreamFlush();
        },
        onError: (msg) => {
          throw new Error(msg || "stream error");
        },
      });
    } catch (error) {
      const aborted =
        error?.name === "AbortError" || !!streamAbortReasonRef.current;
      if (!aborted) {
        const msg = error?.message || "请求失败";
        setStreamError(msg);
        flushStreamBuffer();
        patchAssistantMessage(
          currentSessionId,
          assistantIdToRegenerate,
          (message) => ({
            ...message,
            content: `${message.content || ""}\n\n> 请求失败：${msg}`,
          }),
        );
      }
    } finally {
      if (streamAbortControllerRef.current === requestController) {
        streamAbortControllerRef.current = null;
      }
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      flushStreamBuffer();
      if (!hasReceivedRegeneratedOutput) {
        patchAssistantMessage(
          currentSessionId,
          assistantIdToRegenerate,
          () => ({
            ...previousAssistant,
            streaming: false,
          }),
          (completedMessage) => {
            queueMessageUpsert(currentSessionId, completedMessage);
          },
        );
      } else {
        patchAssistantMessage(
          currentSessionId,
          assistantIdToRegenerate,
          (message) => ({
            ...message,
            streaming: false,
          }),
          (completedMessage) => {
            queueMessageUpsert(currentSessionId, completedMessage);
          },
        );
      }
      streamAbortReasonRef.current = "";
      streamTargetRef.current = {
        sessionId: "",
        assistantId: "",
        mode: "draft",
      };
      setIsStreaming(false);
    }
  }

  function onAskSelection(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    setSelectedAskText(trimmed);
  }

  function onStopStreaming() {
    abortActiveStream("user");
  }

  function scrollToLatestRound(duration = 420) {
    messageListRef.current?.scrollToLatest?.(duration);
  }

  function closeStreamErrorBanner() {
    setStreamError("");
    setStateSaveError("");
    setBootstrapError("");
  }

  function closeRoundWarning() {
    if (!activeId) return;
    setDismissedRoundWarningBySession((prev) => ({
      ...prev,
      [activeId]: true,
    }));
  }

  function runExport(kind, userInfo) {
    const liveDraft = getStreamDraft(activeId);
    const exportMessages =
      liveDraft && liveDraft.id && !messages.some((m) => m.id === liveDraft.id)
        ? [...messages, liveDraft]
        : messages;

    const meta = buildExportMeta({
      activeSession,
      groups,
      messages: exportMessages,
      userInfo,
      activeAgentName: activeAgent.name,
      apiTemperature: String(activeRuntimeConfig.temperature),
      apiTopP: String(activeRuntimeConfig.topP),
      apiReasoningEffort: activeRuntimeConfig.enableThinking ? "high" : "none",
      lastAppliedReasoning,
    });

    if (kind === "markdown") {
      download(
        formatMarkdownExport(exportMessages, meta),
        "md",
        "text/markdown;charset=utf-8",
      );
      return;
    }
    if (kind === "txt") {
      download(
        formatTxtExport(exportMessages, meta),
        "txt",
        "text/plain;charset=utf-8",
      );
    }
  }

  function requestExport(kind) {
    setShowExportMenu(false);
    if (!isUserInfoComplete(userInfo)) {
      setPendingExportKind(kind);
      openUserInfoModal(true);
      return;
    }
    runExport(kind, userInfo);
  }

  function onLogout() {
    if (returnTarget === "mode-selection") {
      navigate(withAuthSlot("/mode-selection"), { replace: true });
      return;
    }
    if (returnTarget === "teacher-home") {
      const params = new URLSearchParams();
      if (teacherHomePanelParam) {
        params.set("teacherPanel", teacherHomePanelParam);
      }
      if (teacherHomeExportContext.exportTeacherScopeKey) {
        params.set(
          "exportTeacherScopeKey",
          teacherHomeExportContext.exportTeacherScopeKey,
        );
      }
      if (teacherHomeExportContext.exportDate) {
        params.set("exportDate", teacherHomeExportContext.exportDate);
      }
      const query = params.toString()
        ? `/admin/settings?${params.toString()}`
        : "/admin/settings";
      navigate(withAuthSlot(query), { replace: true });
      return;
    }
    clearChatViewSnapshot();
    replaceAllStreamDrafts({});
    clearUserAuthSession();
    navigate(withAuthSlot("/login"), { replace: true });
  }

  async function submitUserInfo(e) {
    e.preventDefault();
    const errors = validateUserInfo(userInfo);
    setUserInfoErrors(errors);
    if (Object.keys(errors).length > 0) return;

    const next = sanitizeUserInfo(userInfo);
    setUserInfoSaving(true);
    try {
      await saveUserProfile(next);
      setUserInfo(next);
      setShowUserInfoModal(false);
      setForceUserInfoModal(false);
      setUserInfoErrors({});
      if (pendingExportKind) {
        runExport(pendingExportKind, next);
      }
      setPendingExportKind("");
    } catch (error) {
      setUserInfoErrors((prev) => ({
        ...prev,
        _form: error?.message || "保存失败，请稍后再试。",
      }));
    } finally {
      setUserInfoSaving(false);
    }
  }

  function download(content, ext, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${getSafeFileBaseName(activeSession?.title)}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setShowExportMenu(false);
  }

  useEffect(() => {
    function onDocMouseDown(e) {
      if (!showExportMenu) return;
      const t = e.target;
      if (exportWrapRef.current && exportWrapRef.current.contains(t)) return;
      setShowExportMenu(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [showExportMenu]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.history) return undefined;
    const previous = window.history.scrollRestoration;
    if (typeof previous === "string") {
      window.history.scrollRestoration = "manual";
    }
    return () => {
      if (typeof previous === "string") {
        window.history.scrollRestoration = previous;
      }
    };
  }, []);

  useEffect(() => {
    function handlePageHide() {
      persistLiveSnapshot();
    }

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [persistLiveSnapshot]);

  useEffect(
    () => () => {
      persistLiveSnapshot();
      abortActiveStream("navigation");
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      if (metaSaveTimerRef.current) {
        clearTimeout(metaSaveTimerRef.current);
        metaSaveTimerRef.current = null;
      }
      if (messageSaveTimerRef.current) {
        clearTimeout(messageSaveTimerRef.current);
        messageSaveTimerRef.current = null;
      }
      if (snapshotSaveTimerRef.current) {
        clearTimeout(snapshotSaveTimerRef.current);
        snapshotSaveTimerRef.current = null;
      }
      pendingMetaSaveRef.current = false;
      messageUpsertQueueRef.current.clear();
      messageUpsertRevisionRef.current.clear();
      streamAbortControllerRef.current = null;
      streamAbortReasonRef.current = "";
    },
    [abortActiveStream, persistLiveSnapshot],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      if (!hasInitialViewSnapshot) {
        setBootstrapPending(true);
      }
      if (!hasInitialViewSnapshot) {
        setBootstrapLoading(true);
      }
      setBootstrapError("");
      // Capture the local session state BEFORE the network request so we can detect
      // what the user changed during the async wait (deleted or created sessions).
      const preBootstrapSessions = Array.isArray(sessionsRef.current)
        ? [...sessionsRef.current]
        : [];
      const preBootstrapActiveId = sanitizeSmartContextSessionId(
        activeIdRef.current,
      );
      emitChatDebugLog("bootstrap_start", {
        hasInitialViewSnapshot,
        routeSessionId,
        liveRouteSessionId: sanitizeSmartContextSessionId(
          pendingRouteSessionIdRef.current || routeSessionId,
        ),
        activeId: preBootstrapActiveId,
        pendingNavigationSessionId: pendingNavigationSessionIdRef.current,
        sessionIds: preBootstrapSessions.map((session) =>
          sanitizeSmartContextSessionId(session?.id),
        ),
      });
      try {
        const data = await fetchChatBootstrap();
        if (cancelled) return;

        const state = data?.state || {};
        const nextSessions =
          Array.isArray(state.sessions) && state.sessions.length > 0
            ? state.sessions
            : DEFAULT_SESSIONS;
        const nextGroups = stripLegacyPlaceholderGroups(
          Array.isArray(state.groups) ? state.groups : DEFAULT_GROUPS,
          nextSessions,
        );
        const nextSessionMessages =
          state.sessionMessages && typeof state.sessionMessages === "object"
            ? state.sessionMessages
            : nextSessions.length > 0
              ? DEFAULT_SESSION_MESSAGES
              : {};
        const rawActiveId = String(
          state.activeId || nextSessions[0]?.id || "",
        );
        const stateSettings =
          state.settings && typeof state.settings === "object"
            ? state.settings
            : {};
        const nextTeacherScopeKey = normalizeTeacherScopeKey(
          data?.teacherScopeKey,
        );
        const lockedAgentId =
          resolveLockedAgentByTeacherScope(nextTeacherScopeKey);
        const nextRuntimeConfigs = sanitizeRuntimeConfigMap(
          data?.agentRuntimeConfigs,
        );
        const nextProviderDefaults = sanitizeAgentProviderDefaults(
          data?.agentProviderDefaults,
        );
        const restoreContext = location.state?.fromImageGeneration
          ? normalizeImageReturnContext(
              location.state?.restoreContext || loadImageReturnContext(),
            )
          : null;

        const fallbackAgent =
          lockedAgentId ||
          (AGENT_META[stateSettings.agent] ? stateSettings.agent : "A");
        const nextAppliedReasoning = normalizeReasoningEffort(
          stateSettings.lastAppliedReasoning ?? "high",
        );
        let nextSmartContextEnabledMap = sanitizeSmartContextEnabledMap(
          stateSettings.smartContextEnabledBySessionAgent,
        );

        let resolvedSessions = nextSessions;
        let resolvedMessages = nextSessionMessages;
        let resolvedActiveId = rawActiveId;

        // localOnlySessions is used later to restore per-session agent/smart-context state.
        let localOnlySessions = [];

        // Reconcile server state with what the user may have changed locally while the
        // network request was in flight.  Two distinct cases:
        //
        // A) Component remounted with an existing snapshot (hasInitialViewSnapshot=true):
        //    The snapshot already reflects the user's intended state (Fix 1/1b flush it
        //    synchronously on delete/create).  Use it as the source of truth:
        //    • filter out server sessions the user deleted (not in snapshot)
        //    • add sessions the user created locally but that haven't reached the server yet
        //
        // B) First visit – no snapshot (hasInitialViewSnapshot=false):
        //    sessionsRef.current starts as DEFAULT_SESSIONS and may have drifted by the time
        //    bootstrap returns (the user could have deleted or created sessions).
        //    Compare the state captured just BEFORE the request with the state NOW to find
        //    the delta, then apply it on top of the server result.
        //    This also fixes the "s1 always comes back" bug: because s1 is in BOTH
        //    preBootstrapSessions and currentSessions (user didn't touch it), it is never
        //    treated as a "locally created" session and is therefore not merged back in.

        const currentLocalSessions = Array.isArray(sessionsRef.current)
          ? sessionsRef.current
          : [];
        const currentLocalMessages =
          sessionMessagesRef.current && typeof sessionMessagesRef.current === "object"
            ? sessionMessagesRef.current
            : {};
        let shouldForceFullStateSave = false;

        if (hasInitialViewSnapshot) {
          // ── Case A: snapshot-guided reconciliation ───────────────────────────────
          const localSessionIdSet = new Set(
            currentLocalSessions
              .map((s) => sanitizeSmartContextSessionId(s?.id))
              .filter(Boolean),
          );
          // Remove sessions the user deleted before the server-save debounce fired.
          resolvedSessions = resolvedSessions.filter((s) => {
            const id = sanitizeSmartContextSessionId(s?.id);
            return !id || localSessionIdSet.has(id);
          });
          // Preserve sessions created locally but not yet persisted.
          localOnlySessions = currentLocalSessions.filter((s) => {
            const id = sanitizeSmartContextSessionId(s?.id);
            return id && !resolvedSessions.some((r) => r?.id === id);
          });
        } else {
          // ── Case B: delta-based reconciliation (first visit, no snapshot) ────────
          const preIds = new Set(
            preBootstrapSessions
              .map((s) => sanitizeSmartContextSessionId(s?.id))
              .filter(Boolean),
          );
          const currentIds = new Set(
            currentLocalSessions
              .map((s) => sanitizeSmartContextSessionId(s?.id))
              .filter(Boolean),
          );
          // Sessions that existed at bootstrap-start but are gone now → user deleted them.
          const deletedSet = new Set(
            [...preIds].filter((id) => !currentIds.has(id)),
          );
          if (deletedSet.size > 0) {
            resolvedSessions = resolvedSessions.filter((s) => {
              const id = sanitizeSmartContextSessionId(s?.id);
              return !id || !deletedSet.has(id);
            });
          }
          // Sessions that appeared since bootstrap-start → user created them.
          localOnlySessions = currentLocalSessions.filter((s) => {
            const id = sanitizeSmartContextSessionId(s?.id);
            return (
              id && !preIds.has(id) && !resolvedSessions.some((r) => r?.id === id)
            );
          });
        }

        if (localOnlySessions.length > 0) {
          resolvedSessions = [...localOnlySessions, ...resolvedSessions];
          resolvedMessages = {
            ...resolvedMessages,
            ...localOnlySessions.reduce((acc, session) => {
              const sessionId = sanitizeSmartContextSessionId(session?.id);
              if (!sessionId) return acc;
              acc[sessionId] =
                sessionMessagesRef.current?.[sessionId] ||
                resolvedMessages?.[sessionId] ||
                [];
              return acc;
            }, {}),
          };
        }
        if (hasInitialViewSnapshot) {
          resolvedMessages = resolvedSessions.reduce((acc, session) => {
            const sessionId = sanitizeSmartContextSessionId(session?.id);
            if (!sessionId) return acc;
            const localList = Array.isArray(currentLocalMessages[sessionId])
              ? currentLocalMessages[sessionId]
              : [];
            const remoteList = Array.isArray(resolvedMessages?.[sessionId])
              ? resolvedMessages[sessionId]
              : [];
            const { list, preferLocal } = chooseMoreCompleteSessionMessageList(
              localList,
              remoteList,
            );
            if (preferLocal) {
              shouldForceFullStateSave = true;
            }
            acc[sessionId] = list;
            return acc;
          }, {});
        }
        const resolvedSessionIds = new Set(
          resolvedSessions
            .map((session) => sanitizeSmartContextSessionId(session?.id))
            .filter(Boolean),
        );

        const liveRouteSessionId = sanitizeSmartContextSessionId(
          pendingRouteSessionIdRef.current || routeSessionId,
        );
        const pendingNavigationSessionIdRaw =
          pendingNavigationSessionIdRef.current;
        const pendingNavigationSessionId =
          pendingNavigationSessionIdRaw === EMPTY_ROUTE_NAVIGATION_SENTINEL
            ? ""
            : sanitizeSmartContextSessionId(pendingNavigationSessionIdRaw);
        const currentActiveId = sanitizeSmartContextSessionId(activeIdRef.current);
        const currentActiveStillValid =
          currentActiveId &&
          resolvedSessions.some((session) => session?.id === currentActiveId);
        const currentActiveChangedDuringBootstrap =
          currentActiveStillValid && currentActiveId !== preBootstrapActiveId;
        const canRestoreSession =
          !liveRouteSessionId &&
          !pendingNavigationSessionId &&
          !!restoreContext?.sessionId &&
          resolvedSessions.some((s) => s.id === restoreContext.sessionId);
        const preferredActiveIdCandidates = [
          pendingNavigationSessionId,
          liveRouteSessionId,
          canRestoreSession ? restoreContext.sessionId : "",
          hasInitialViewSnapshot || currentActiveChangedDuringBootstrap
            ? currentActiveId
            : "",
          sanitizeSmartContextSessionId(rawActiveId),
        ].filter(Boolean);
        const preferredResolvedActiveId = preferredActiveIdCandidates.find(
          (sessionId) => resolvedSessions.some((session) => session?.id === sessionId),
        );
        if (preferredResolvedActiveId) {
          resolvedActiveId = preferredResolvedActiveId;
        } else if (!resolvedSessions.some((s) => s.id === resolvedActiveId)) {
          resolvedActiveId = resolvedSessions[0]?.id || "";
        }
        emitChatDebugLog("bootstrap_resolved_active", {
          routeSessionId,
          liveRouteSessionId,
          pendingNavigationSessionId,
          preBootstrapActiveId,
          currentActiveId,
          currentActiveChangedDuringBootstrap,
          rawActiveId,
          resolvedActiveId,
          resolvedSessionIds: Array.from(resolvedSessionIds),
          localOnlySessionIds: localOnlySessions.map((session) =>
            sanitizeSmartContextSessionId(session?.id),
          ),
        });

        let nextAgentBySession = ensureAgentBySessionMap(
          stateSettings.agentBySession,
          resolvedSessions,
          fallbackAgent,
        );
        localOnlySessions.forEach((session) => {
          const sessionId = sanitizeSmartContextSessionId(session?.id);
          if (!sessionId) return;
          const localAgentId = readAgentBySession(
            agentBySessionRef.current,
            sessionId,
            fallbackAgent,
          );
          nextAgentBySession = patchAgentBySession(
            nextAgentBySession,
            sessionId,
            localAgentId,
          );
        });
        if (
          !lockedAgentId &&
          canRestoreSession &&
          restoreContext?.agentId &&
          AGENT_META[restoreContext.agentId]
        ) {
          nextAgentBySession = patchAgentBySession(
            nextAgentBySession,
            restoreContext.sessionId,
            restoreContext.agentId,
          );
        }
        if (lockedAgentId) {
          nextAgentBySession = lockAgentBySessionMap(
            nextAgentBySession,
            resolvedSessions,
            lockedAgentId,
          );
        }

        const nextAgent = readAgentBySession(
          nextAgentBySession,
          resolvedActiveId,
          fallbackAgent,
        );
        const nextRuntime =
          nextRuntimeConfigs[nextAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
        const nextApiTemperature = String(
          normalizeTemperature(nextRuntime.temperature),
        );
        const nextApiTopP = String(normalizeTopP(nextRuntime.topP));
        const nextApiReasoning = nextRuntime.enableThinking ? "high" : "none";
        const nextProvider = resolveAgentProvider(
          nextAgent,
          nextRuntime,
          nextProviderDefaults,
        );

        if (
          stateSettings.smartContextEnabled &&
          nextProvider === "volcengine"
        ) {
          const legacyKey = buildSmartContextKey(resolvedActiveId, nextAgent);
          if (
            legacyKey &&
            !Object.prototype.hasOwnProperty.call(
              nextSmartContextEnabledMap,
              legacyKey,
            )
          ) {
            nextSmartContextEnabledMap[legacyKey] = true;
          }
        }
        localOnlySessions.forEach((session) => {
          const sessionId = sanitizeSmartContextSessionId(session?.id);
          if (!sessionId) return;
          CHAT_AGENT_IDS.forEach((agentId) => {
            const enabled = readSmartContextEnabledBySessionAgent(
              smartContextEnabledBySessionAgentRef.current,
              sessionId,
              agentId,
            );
            nextSmartContextEnabledMap = patchSmartContextEnabledBySessionAgent(
              nextSmartContextEnabledMap,
              sessionId,
              agentId,
              enabled,
            );
          });
        });
        if (lockedAgentId) {
          const forcedSmartContextMap = enableSmartContextForAgentSessions(
            nextSmartContextEnabledMap,
            resolvedSessions,
            lockedAgentId,
          );
          nextSmartContextEnabledMap = forcedSmartContextMap;
        }

        setGroups(nextGroups);
        setSessions(resolvedSessions);
        setSessionMessages(resolvedMessages);
        setActiveId(resolvedActiveId);
        setAgent(nextAgent);
        setAgentBySession(nextAgentBySession);
        setAgentRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setTeacherScopeKey(nextTeacherScopeKey);
        setApiTemperature(nextApiTemperature);
        setApiTopP(nextApiTopP);
        setApiReasoningEffort(nextApiReasoning);
        setLastAppliedReasoning(nextAppliedReasoning);
        setSmartContextEnabledBySessionAgent(nextSmartContextEnabledMap);
        replaceAllStreamDrafts(
          sanitizeStreamDraftMap(getAllStreamDrafts(), resolvedSessionIds),
        );
        if (shouldForceFullStateSave) {
          forceFullStateSaveRef.current = true;
          pendingMetaSaveRef.current = true;
        }

        let profile = sanitizeUserInfo(data?.profile);
        if (returnTarget === "teacher-home" && !isUserInfoComplete(profile)) {
          profile = fillTeacherHomeDefaultUserInfo(profile);
          try {
            await saveUserProfile(profile);
          } catch {
            // Ignore profile autofill save errors and continue with local defaults.
          }
        }
        setUserInfo(profile);
        if (!isUserInfoComplete(profile)) {
          setForceUserInfoModal(true);
          setShowUserInfoModal(true);
        } else {
          setForceUserInfoModal(false);
          setShowUserInfoModal(false);
        }

        persistReadyRef.current = true;
      } catch (error) {
        if (cancelled) return;
        const msg = error?.message || "初始化失败";
        setBootstrapError(msg);
        if (
          msg.includes("登录状态无效") ||
          msg.includes("重新登录") ||
          msg.includes("账号不存在")
        ) {
          clearChatViewSnapshot();
          replaceAllStreamDrafts({});
          clearUserAuthSession();
          navigate(withAuthSlot("/login"), { replace: true });
          return;
        }
        persistReadyRef.current = true;
      } finally {
        if (!cancelled) {
          setBootstrapPending(false);
          setBootstrapLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [
    hasInitialViewSnapshot,
    location.state,
    navigate,
    routeSessionId,
    returnTarget,
  ]);

  useLayoutEffect(() => {
    pendingRouteSessionIdRef.current = routeSessionId || "";
    if (
      pendingNavigationSessionIdRef.current &&
      ((pendingNavigationSessionIdRef.current === EMPTY_ROUTE_NAVIGATION_SENTINEL &&
        !(routeSessionId || "")) ||
        pendingNavigationSessionIdRef.current === (routeSessionId || ""))
    ) {
      pendingNavigationSessionIdRef.current = "";
    }
    emitChatDebugLog("route_param_seen", {
      pathname: location.pathname,
      search: location.search,
      routeSessionId,
    });
  }, [location.pathname, location.search, routeSessionId]);

  useLayoutEffect(() => {
    if (bootstrapLoading && !hasInitialViewSnapshot) return;
    if (
      pendingNavigationSessionIdRef.current &&
      !(
        pendingNavigationSessionIdRef.current === EMPTY_ROUTE_NAVIGATION_SENTINEL &&
        !pendingRouteSessionIdRef.current
      ) &&
      pendingNavigationSessionIdRef.current !== pendingRouteSessionIdRef.current
    ) {
      return;
    }
    const pendingRouteSessionId = sanitizeSmartContextSessionId(
      pendingRouteSessionIdRef.current,
    );
    if (!pendingRouteSessionId) return;
    if (!sessions.some((session) => session?.id === pendingRouteSessionId)) return;

    pendingRouteSessionIdRef.current = "";
    emitChatDebugLog("route_param_applied", {
      pendingRouteSessionId,
      sessions: sessions.map((session) => session.id),
    });
    setActiveId((current) =>
      current === pendingRouteSessionId ? current : pendingRouteSessionId,
    );

    const canonicalHref = buildChatSessionHref(pendingRouteSessionId);
    const currentHref = `${location.pathname}${location.search || ""}`;
    if (canonicalHref !== currentHref) {
      navigate(canonicalHref, { replace: true });
    }
  }, [
    bootstrapLoading,
    buildChatSessionHref,
    hasInitialViewSnapshot,
    location.pathname,
    location.search,
    navigate,
    sessions,
  ]);

  useLayoutEffect(() => {
    if (bootstrapLoading && !hasInitialViewSnapshot) return;
    if (
      routeSessionId &&
      !sessions.some((session) => session?.id === routeSessionId) &&
      !activeId
    ) {
      const currentHref = `${location.pathname}${location.search || ""}`;
      const emptyHref = buildChatSessionHref("");
      if (emptyHref !== currentHref) {
        emitChatDebugLog("invalid_route_reset", {
          routeSessionId,
          currentHref,
          emptyHref,
          sessions: sessions.map((session) => session.id),
        });
        navigate(emptyHref, { replace: true });
      }
      return;
    }
    if (!activeId) return;
    if (!sessions.some((session) => session?.id === activeId)) return;
    if (
      routeSessionId &&
      sessions.some((session) => session?.id === routeSessionId) &&
      routeSessionId !== activeId
    ) {
      return;
    }

    const nextHref = buildChatSessionHref(activeId);
    const currentHref = `${location.pathname}${location.search || ""}`;
    if (nextHref === currentHref) return;
    emitChatDebugLog("active_to_route_sync", {
      activeId,
      currentHref,
      nextHref,
      sessions: sessions.map((session) => session.id),
    });
    navigate(nextHref, { replace: true });
  }, [
    activeId,
    bootstrapLoading,
    buildChatSessionHref,
    emitChatDebugLog,
    hasInitialViewSnapshot,
    location.pathname,
    location.search,
    navigate,
    routeSessionId,
    sessions,
  ]);

  useEffect(() => {
    const routeMatchesActive = (routeSessionId || "") === (activeId || "");
    const ok =
      !bootstrapPending &&
      canonicalActiveHref === currentRouteHref &&
      routeMatchesActive;
    if (!ok) return;

    const pathname = String(location.pathname || "").trim();
    const search = String(location.search || "").trim();
    const targetPath = `${pathname}${search}`;
    if (!targetPath) return;
    if (lastReportedRoutePathRef.current === targetPath) return;

    lastReportedRoutePathRef.current = targetPath;
    emitChatDebugLog("route_status", { pathname: targetPath, ok: true });
  }, [
    activeId,
    bootstrapPending,
    canonicalActiveHref,
    currentRouteHref,
    emitChatDebugLog,
    location.pathname,
    location.search,
    routeSessionId,
  ]);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const baseTitle = "元协坊";
    const titleText = clipSessionTitleText(activeSessionTitle, 48);
    document.title = titleText ? `${titleText} · ${baseTitle}` : baseTitle;
    return () => {
      document.title = baseTitle;
    };
  }, [activeSessionTitle]);

  useEffect(() => {
    if (!persistReadyRef.current && !hasInitialViewSnapshot) return;

    if (snapshotSaveTimerRef.current) {
      clearTimeout(snapshotSaveTimerRef.current);
      snapshotSaveTimerRef.current = null;
    }

    snapshotSaveTimerRef.current = setTimeout(() => {
      writeChatViewSnapshot({
        groups,
        sessions,
        sessionMessages,
        activeId,
        agent,
        agentBySession,
        agentRuntimeConfigs,
        agentProviderDefaults,
        teacherScopeKey,
        lastAppliedReasoning,
        smartContextEnabledBySessionAgent,
        userInfo,
        streamDrafts: allStreamDrafts,
      });
      snapshotSaveTimerRef.current = null;
    }, isStreaming ? 180 : 90);
  }, [
    activeId,
    agent,
    agentBySession,
    agentProviderDefaults,
    agentRuntimeConfigs,
    allStreamDrafts,
    bootstrapLoading,
    groups,
    hasInitialViewSnapshot,
    isStreaming,
    lastAppliedReasoning,
    sessionMessages,
    sessions,
    smartContextEnabledBySessionAgent,
    teacherScopeKey,
    userInfo,
  ]);

  useEffect(() => {
    setApiTemperature(
      String(normalizeTemperature(activeRuntimeConfig.temperature)),
    );
    setApiTopP(String(normalizeTopP(activeRuntimeConfig.topP)));
    setApiReasoningEffort(activeRuntimeConfig.enableThinking ? "high" : "none");
  }, [activeRuntimeConfig]);

  useEffect(() => {
    if (!activeId) return;
    if (agent === activeSessionAgent) return;
    setAgent(activeSessionAgent);
  }, [activeId, activeSessionAgent, agent]);

  useEffect(() => {
    if (!persistReadyRef.current || bootstrapLoading) return;
    pendingMetaSaveRef.current = true;

    if (isStreaming) {
      if (metaSaveTimerRef.current) {
        clearTimeout(metaSaveTimerRef.current);
        metaSaveTimerRef.current = null;
      }
      return;
    }

    if (metaSaveTimerRef.current) {
      clearTimeout(metaSaveTimerRef.current);
      metaSaveTimerRef.current = null;
    }

    metaSaveTimerRef.current = setTimeout(async () => {
      if (!pendingMetaSaveRef.current) return;
      pendingMetaSaveRef.current = false;
      const prunedSessionMessages = pruneSessionMessagesBySessions(
        sessionMessages,
        sessions,
      );
      const shouldPersistFullState =
        forceFullStateSaveRef.current ||
        sessions.length === 0 ||
        Object.keys(prunedSessionMessages).length !==
          Object.keys(sessionMessages || {}).length;
      try {
        const payload = {
          activeId,
          groups,
          sessions,
          settings: {
            agent,
            agentBySession: sanitizeAgentBySessionMap(agentBySession),
            apiTemperature: normalizeTemperature(apiTemperature),
            apiTopP: normalizeTopP(apiTopP),
            apiReasoningEffort: normalizeReasoningEffort(apiReasoningEffort),
            lastAppliedReasoning:
              normalizeReasoningEffort(lastAppliedReasoning),
            smartContextEnabled: effectiveSmartContextEnabled,
            smartContextEnabledBySessionAgent: sanitizeSmartContextEnabledMap(
              smartContextEnabledBySessionAgent,
            ),
          },
        };
        if (shouldPersistFullState) {
          await saveChatState({
            ...payload,
            sessionMessages: prunedSessionMessages,
          });
          forceFullStateSaveRef.current = false;
        } else {
          await saveChatStateMeta(payload);
        }
        setStateSaveError("");
      } catch (error) {
        setStateSaveError(error?.message || "聊天记录保存失败");
      } finally {
        metaSaveTimerRef.current = null;
      }
    }, 360);
  }, [
    activeId,
    groups,
    sessions,
    agent,
    agentBySession,
    apiTemperature,
    apiTopP,
    apiReasoningEffort,
    lastAppliedReasoning,
    effectiveSmartContextEnabled,
    smartContextEnabledBySessionAgent,
    bootstrapLoading,
    isStreaming,
    sessionMessages,
  ]);

  useEffect(() => {
    if (!persistReadyRef.current || bootstrapLoading) return;
    if (messageUpsertQueueRef.current.size === 0) return;

    if (isStreaming) {
      if (messageSaveTimerRef.current) {
        clearTimeout(messageSaveTimerRef.current);
        messageSaveTimerRef.current = null;
      }
      return;
    }

    if (messageSaveTimerRef.current) {
      clearTimeout(messageSaveTimerRef.current);
      messageSaveTimerRef.current = null;
    }

    messageSaveTimerRef.current = setTimeout(async () => {
      const entries = Array.from(messageUpsertQueueRef.current.entries());
      if (entries.length === 0) {
        messageSaveTimerRef.current = null;
        return;
      }

      const upserts = [];
      const sentRevisionByKey = {};
      entries.forEach(([key, payload]) => {
        if (!payload?.sessionId || !payload?.message?.id) return;
        upserts.push(payload);
        sentRevisionByKey[key] = messageUpsertRevisionRef.current.get(key) || 0;
      });

      if (upserts.length === 0) {
        entries.forEach(([key]) => {
          messageUpsertQueueRef.current.delete(key);
          messageUpsertRevisionRef.current.delete(key);
        });
        messageSaveTimerRef.current = null;
        return;
      }

      try {
        await saveChatSessionMessages({ upserts });
        Object.entries(sentRevisionByKey).forEach(([key, sentRevision]) => {
          const currentRevision =
            messageUpsertRevisionRef.current.get(key) || 0;
          if (currentRevision === sentRevision) {
            messageUpsertQueueRef.current.delete(key);
            messageUpsertRevisionRef.current.delete(key);
          }
        });
        setStateSaveError("");
      } catch (error) {
        setStateSaveError(error?.message || "聊天记录保存失败");
      } finally {
        messageSaveTimerRef.current = null;
      }
    }, 320);
  }, [sessionMessages, bootstrapLoading, isStreaming]);

  useEffect(() => {
    setSelectedAskText("");
    setFocusUserMessageId("");
    setIsAtLatest(true);
  }, [activeId]);

  return (
    <div className="chat-layout">
      <Sidebar
        sessions={sessions}
        groups={groups}
        activeId={activeId}
        onSelect={(sessionId) => {
          activateSession(sessionId);
        }}
        onNewChat={() => {
          onNewChat();
        }}
        onOpenImageGeneration={onOpenImageGeneration}
        onOpenGroupChat={onOpenGroupChat}
        onDeleteSession={onDeleteSession}
        onBatchDeleteSessions={onBatchDeleteSessions}
        onMoveSessionToGroup={onMoveSessionToGroup}
        onBatchMoveSessionsToGroup={onBatchMoveSessionsToGroup}
        onRenameSession={onRenameSession}
        onToggleSessionPin={onToggleSessionPin}
        onCreateGroup={onCreateGroup}
        onRenameGroup={onRenameGroup}
        onDeleteGroup={onDeleteGroup}
        hasUserInfo={userInfoComplete}
        onOpenUserInfoModal={() => openUserInfoModal(false)}
        sessionActionsDisabled={sessionActionsLocked}
      />
      <div
        className={`chat-main ${hasStartedConversation ? "is-thread-stage" : "is-home-stage"}`}
      >
        <div className="chat-topbar">
          <div className="chat-topbar-left">
            <AgentSelect
              key={agentSwitchLocked ? "agent-locked" : "agent-unlocked"}
              value={agent}
              onChange={onAgentChange}
              disabled={agentSwitchLocked}
              disabledTitle={agentSelectDisabledTitle}
            />
            <button
              type="button"
              className={`smart-context-icon-btn${effectiveSmartContextEnabled ? " is-active" : ""}${
                !smartContextSupported ? " is-disabled" : ""
              }`}
              onClick={() => onToggleSmartContext(!effectiveSmartContextEnabled)}
              disabled={smartContextToggleDisabled}
              title={smartContextInfoTitle}
              aria-label={smartContextInfoTitle}
              aria-pressed={effectiveSmartContextEnabled}
            >
              {effectiveSmartContextEnabled ? <Lock size={16} /> : <LockOpen size={16} />}
            </button>
          </div>
          <div className="chat-topbar-center">
            <div className="chat-session-title" title={activeSessionTitle}>
              {activeSessionTitle}
            </div>
          </div>
          <div className="chat-topbar-right">
            <div className="export-wrap" ref={exportWrapRef}>
              <button
                type="button"
                className="export-trigger"
                onClick={() => setShowExportMenu((v) => !v)}
              >
                导出
              </button>
              {showExportMenu && (
                <div className="export-menu">
                  <button
                    type="button"
                    className="export-item"
                    onClick={() => requestExport("markdown")}
                  >
                    导出为 Markdown
                  </button>
                  <button
                    type="button"
                    className="export-item"
                    onClick={() => requestExport("txt")}
                  >
                    导出为 TXT
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              className="chat-logout-btn"
              onClick={onLogout}
              aria-label={logoutText}
              title={logoutText}
            >
              <span className="chat-logout-tip">{logoutText}</span>
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {(streamError || stateSaveError || bootstrapError) && (
          <div className="stream-error">
            <span>
              {[streamError, stateSaveError, bootstrapError]
                .filter(Boolean)
                .join(" | ")}
            </span>
            <button
              type="button"
              className="stream-error-close"
              onClick={closeStreamErrorBanner}
              aria-label="关闭错误提示"
              title="关闭错误提示"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {!hasStartedConversation && (
          <div className="chat-home-stage" aria-hidden="true">
            <div className="chat-home-stage-inner">
              <h1 className="chat-home-stage-title">{CHAT_HOME_HEADLINE}</h1>
            </div>
          </div>
        )}

        <MessageList
          ref={messageListRef}
          activeSessionId={activeId}
          messages={displayedMessages}
          isStreaming={isStreaming}
          focusMessageId={focusUserMessageId}
          bottomInset={messageBottomInset}
          onAssistantFeedback={onAssistantFeedback}
          onAssistantRegenerate={onAssistantRegenerate}
          onAskSelection={onAskSelection}
          onLatestChange={setIsAtLatest}
        />

        <div className="chat-input-wrap" ref={chatInputWrapRef}>
          {roundCount >= CHAT_ROUND_WARNING_THRESHOLD &&
            !roundWarningDismissed && (
              <div className="chat-round-warning" role="status">
                <span>继续当前对话可能导致页面卡顿，请新建一个对话。</span>
                <button
                  type="button"
                  className="chat-round-warning-close"
                  onClick={closeRoundWarning}
                  aria-label="关闭提示"
                  title="关闭提示"
                >
                  <X size={14} />
                </button>
              </div>
            )}

          {!isAtLatest && (
            <div className="chat-scroll-latest-row">
              <button
                type="button"
                className="chat-scroll-latest-btn"
                onClick={() => scrollToLatestRound()}
                aria-label="跳转到最新消息"
                title="跳转到最新消息"
              >
                跳转到最新消息
              </button>
            </div>
          )}

          <MessageInput
            onSend={onSend}
            onStop={onStopStreaming}
            onPrepareFiles={onPrepareFiles}
            disabled={interactionLocked || !canUseMessageInput}
            isStreaming={isStreaming}
            layoutMode={hasStartedConversation ? "thread" : "home"}
            quoteText={selectedAskText}
            onClearQuote={() => setSelectedAskText("")}
            onConsumeQuote={() => setSelectedAskText("")}
          />
          <p className="chat-disclaimer">
            智能体也可能会犯错，请以批判的视角看待他的回答。你可以为每条点赞或踩。
          </p>
        </div>
      </div>

      <ExportUserInfoModal
        open={showUserInfoModal}
        userInfo={userInfo}
        errors={userInfoErrors}
        genderOptions={GENDER_OPTIONS}
        gradeOptions={GRADE_OPTIONS}
        onClose={closeUserInfoModal}
        onSubmit={submitUserInfo}
        onFieldChange={updateUserInfoField}
        title="用户信息"
        hint={
          forceUserInfoModal
            ? "当前账号尚未完善用户信息，请先填写并保存后继续使用。"
            : "完善用户信息后可用于导出与实验留档。"
        }
        submitLabel={
          userInfoSaving ? "保存中…" : pendingExportKind ? "保存并导出" : "保存"
        }
        showCancel={!forceUserInfoModal && !userInfoSaving}
        lockOverlayClose={forceUserInfoModal || userInfoSaving}
        dialogLabel={forceUserInfoModal ? "首次填写用户信息" : "编辑用户信息"}
      />
    </div>
  );
}
