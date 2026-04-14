import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  FileOutput,
  Lock,
  LockOpen,
  LogOut,
  PanelLeftOpen,
  PanelRightOpen,
  X,
} from "lucide-react";
import {
  useBeforeUnload,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import Sidebar from "../../../components/Sidebar.jsx";
import AgentSelect from "../../../components/AgentSelect.jsx";
import MessageList from "../../../components/MessageList.jsx";
import MessageInput from "../../../components/MessageInput.jsx";
import ChatDocumentPreview from "../../../components/chat/ChatDocumentPreview.jsx";
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
  createDefaultAgentRuntimeConfigMap,
  sanitizeRuntimeConfigMap,
} from "../agentRuntimeConfig.js";
import {
  createRuntimeSnapshot,
  mergeRuntimeWithMeta,
  mergeRuntimeWithUsage,
  normalizeReasoningEffort,
  normalizeTemperature,
  normalizeTopP,
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
  clearChatSmartContext,
  downloadChatAttachment,
  fetchChatBootstrap,
  reportChatClientDebug,
  saveChatSessionMessages,
  saveChatState,
  saveChatStateMeta,
  saveUserProfile,
} from "../../../features/chat/api/chatApi.js";
import { ChatApiService } from "../../../features/chat/services/ChatApiService.js";
import {
  isUntitledSessionTitle,
  mergeAttachmentsWithUploadedLinks,
} from "../../../features/chat/services/ChatConversationService.js";
import { chatDataService } from "../../../features/chat/services/ChatDataService.js";
import {
  buildHistoryForApi,
  prepareComposerFiles,
  suggestSessionTitleForExchange,
} from "../../../features/chat/services/ChatSessionService.js";
import { captureNoteFromChat } from "../../../modules/notes/api/notesApi.js";
import {
  clearUserAuthSession,
  withAuthSlot,
} from "../../../app/authStorage.js";
import {
  appendReturnUrlParam,
  compactReturnUrlSearch,
  readReturnUrlFromSearch,
  redirectToReturnUrl,
} from "../../../app/returnNavigation.js";
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
  s1: [chatDataService.createWelcomeMessage()],
};
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);
const WORD_PREVIEW_EXTENSIONS = new Set(["doc", "docx"]);
const HTML_PREVIEW_EXTENSIONS = new Set(["html", "htm"]);
const MARKDOWN_PREVIEW_EXTENSIONS = new Set(["md", "markdown", "mdown", "mkd"]);
const SIDEBAR_COLLAPSED_STORAGE_KEY = "educhat.chat.sidebar-collapsed";
const TEXT_PREVIEW_EXTENSIONS = new Set([
  "txt",
  "c",
  "h",
  "cc",
  "hh",
  "cpp",
  "hpp",
  "cxx",
  "hxx",
  "py",
  "python",
  "xml",
  "json",
  "yaml",
  "yml",
  "js",
  "jsx",
  "ts",
  "tsx",
  "java",
  "go",
  "rs",
  "sh",
  "bash",
  "zsh",
  "sql",
  "css",
  "scss",
  "less",
  "csv",
  "tsv",
  "toml",
  "ini",
  "log",
  "tex",
  "r",
  "rb",
  "php",
  "swift",
  "kt",
  "m",
  "mm",
  "vue",
  "svelte",
]);
const CHAT_AGENT_IDS = Object.freeze(["A", "B", "C", "D"]);
const REMOVED_AGENT_E_ID = "E";
const REMOVED_AGENT_E_NAME = "SSCI审稿人";
const REMOVED_AGENT_E_NOTICE =
  "该会话原绑定的 SSCI审稿人已下线，当前会话不可继续对话。";
const DEFAULT_AGENT_PROVIDER_MAP = Object.freeze({
  A: "volcengine",
  B: "volcengine",
  C: "volcengine",
  D: "aliyun",
});
const TEACHER_SCOPE_YANG_JUNFENG = "yang-junfeng";
const AGENT_C_LOCKED_PROVIDER = "volcengine";
const AGENT_C_LOCKED_MODEL = "doubao-seed-2-0-pro-260215";
const AGENT_C_LOCKED_PROTOCOL = "responses";
const AGENT_C_LOCKED_MAX_OUTPUT_TOKENS = 131072;
const CHAT_ATTACHMENT_THUMBNAIL_MAX_EDGE = 176;
const CHAT_ATTACHMENT_THUMBNAIL_QUALITY = 0.76;
const EMPTY_ROUTE_NAVIGATION_SENTINEL = "__empty__";
const CHAT_HOME_HEADLINE = "你今天想聊些什么？";
const CHAT_STREAMING_SWITCH_SESSION_CONFIRM_MESSAGE =
  "当前对话仍在生成中，切换到其他会话会中断本次生成。确定要切换吗？";
const CHAT_STREAMING_LEAVE_PAGE_CONFIRM_MESSAGE =
  "当前对话仍在生成中，离开聊天页会中断本次生成。确定要离开吗？";
const CHAT_STREAMING_LOGOUT_CONFIRM_MESSAGE =
  "当前对话仍在生成中，退出当前页面会中断本次生成。确定要继续吗？";
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

function readUploadItemFile(item) {
  if (item instanceof File) return item;
  if (item?.file instanceof File) return item.file;
  return null;
}

function readUploadItemName(item) {
  const localFile = readUploadItemFile(item);
  if (localFile) return String(localFile.name || "").trim();
  return String(item?.name || item?.fileName || "").trim();
}

function readUploadItemMimeType(item) {
  const localFile = readUploadItemFile(item);
  if (localFile) {
    return String(localFile.type || "")
      .trim()
      .toLowerCase();
  }
  return String(item?.mimeType || item?.type || "")
    .trim()
    .toLowerCase();
}

function getUploadItemExtension(item) {
  const name = readUploadItemName(item).toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match?.[1] || "";
}

function classifyUploadPreviewKind(item) {
  const mime = readUploadItemMimeType(item);
  const extension = getUploadItemExtension(item);
  if (mime.includes("pdf") || extension === "pdf") return "pdf";
  if (mime.includes("word") || WORD_PREVIEW_EXTENSIONS.has(extension)) {
    return "word";
  }
  if (mime.includes("html") || HTML_PREVIEW_EXTENSIONS.has(extension)) {
    return "html";
  }
  if (mime.includes("markdown") || mime === "text/x-markdown" || MARKDOWN_PREVIEW_EXTENSIONS.has(extension)) {
    return "markdown";
  }
  if (
    TEXT_PREVIEW_EXTENSIONS.has(extension) ||
    mime.startsWith("text/") ||
    mime.includes("json") ||
    mime.includes("xml") ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("x-python") ||
    mime.includes("x-c")
  ) {
    return "text";
  }
  return "";
}

function createDocumentPreviewDescriptor(item) {
  const file = readUploadItemFile(item);
  if (!(file instanceof File)) return null;

  const kind = classifyUploadPreviewKind(item);
  if (!kind) return null;

  const name = readUploadItemName(item) || "文档";
  const mimeType = readUploadItemMimeType(item);
  const previewUrl = String(item?.url || item?.fileUrl || "").trim();
  const previewOssKey = String(item?.ossKey || "").trim();
  return {
    key: [
      "composer",
      kind,
      name,
      Number(file.size || 0),
      Number(file.lastModified || 0),
      mimeType,
      previewOssKey,
      previewUrl,
    ].join("::"),
    source: "composer",
    kind,
    name,
    file,
    mimeType,
    size: Number(file.size || 0),
    previewUrl,
    previewOssKey,
  };
}

function collectComposerDocumentEntries(items) {
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  return list
    .map((item) => createDocumentPreviewDescriptor(item))
    .filter(Boolean);
}

function createSessionDocumentDescriptor(
  sessionId,
  message,
  attachment,
  attachmentIndex,
  messageIndex,
) {
  const kind = classifyUploadPreviewKind(attachment);
  if (!kind) return null;
  const name = readUploadItemName(attachment) || "文档";
  return {
    key: `session::${String(message?.id || "").trim()}::${attachmentIndex}`,
    source: "session",
    kind,
    name,
    mimeType: readUploadItemMimeType(attachment),
    size: Number(attachment?.size || 0),
    sessionId: String(sessionId || "").trim(),
    messageId: String(message?.id || "").trim(),
    attachmentIndex,
    messageIndex,
    attachment,
    fileId: String(attachment?.fileId || "").trim(),
    inputType: String(attachment?.inputType || "")
      .trim()
      .toLowerCase(),
  };
}

function collectSessionDocumentEntries(sessionId, messages) {
  const safeMessages = Array.isArray(messages) ? messages : [];
  const entries = [];
  safeMessages.forEach((message, messageIndex) => {
    const attachments = Array.isArray(message?.attachments)
      ? message.attachments
      : [];
    attachments.forEach((attachment, attachmentIndex) => {
      const entry = createSessionDocumentDescriptor(
        sessionId,
        message,
        attachment,
        attachmentIndex,
        messageIndex,
      );
      if (entry) entries.push(entry);
    });
  });
  return entries.sort((left, right) => {
    if (left.messageIndex !== right.messageIndex) {
      return right.messageIndex - left.messageIndex;
    }
    return left.attachmentIndex - right.attachmentIndex;
  });
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

function clipSessionTitleText(value, maxLength = 22) {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.length > maxLength
    ? `${text.slice(0, maxLength).trim()}...`
    : text;
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
  const safeAgentId = CHAT_AGENT_IDS.includes(agentId) ? agentId : "A";
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
  return base;
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

function getSmartContextDefaultEnabled(agentId) {
  void agentId;
  return false;
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

function sanitizeStoredAgentId(value) {
  const id = String(value || "")
    .trim()
    .toUpperCase();
  if (CHAT_AGENT_IDS.includes(id) || id === REMOVED_AGENT_E_ID) return id;
  return "";
}

function isRemovedAgentId(value) {
  return sanitizeStoredAgentId(value) === REMOVED_AGENT_E_ID;
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
      const agentId = sanitizeStoredAgentId(rawAgentId);
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

  const savedAgent = sanitizeStoredAgentId(source[safeSessionId]);
  if (savedAgent) return savedAgent;
  return safeFallback;
}

function readStoredAgentBySession(map, sessionId) {
  const source = map && typeof map === "object" ? map : {};
  const safeSessionId = sanitizeSmartContextSessionId(sessionId);
  if (!safeSessionId) return "";
  return sanitizeStoredAgentId(source[safeSessionId]);
}

function readSelectableAgentBySession(map, sessionId, fallback = "A") {
  const savedAgent = readStoredAgentBySession(map, sessionId);
  if (CHAT_AGENT_IDS.includes(savedAgent)) return savedAgent;
  const safeFallback = sanitizeSmartContextAgentId(fallback) || "A";
  return safeFallback;
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
    const nextAgent = sanitizeStoredAgentId(source[sessionId]) || safeFallback;
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

function createDefaultChatViewState() {
  return {
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

export default function ChatDesktopPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const params = useParams();
  const routeSessionId = sanitizeSmartContextSessionId(params.sessionId);
  const initialViewStateRef = useRef(null);
  if (initialViewStateRef.current === null) {
    initialViewStateRef.current = createDefaultChatViewState();
    chatDataService.primeDrafts({});
  }
  const initialViewState = initialViewStateRef.current;
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
  const returnUrl = useMemo(
    () => readReturnUrlFromSearch(location.search),
    [location.search],
  );
  const buildChatSessionHref = useCallback(
    (sessionId = "", search = location.search) => {
      const safeSessionId = sanitizeSmartContextSessionId(sessionId);
      const basePath = safeSessionId
        ? `/c/${encodeURIComponent(safeSessionId)}`
        : "/c";
      const compactSearch = compactReturnUrlSearch(search);
      return withAuthSlot(`${basePath}${compactSearch}`);
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
  const [contextCompactingMessage, setContextCompactingMessage] = useState("");
  const [upstreamReconnectMessage, setUpstreamReconnectMessage] = useState("");
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
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [forceUserInfoModal, setForceUserInfoModal] = useState(false);
  const [userInfo, setUserInfo] = useState(() => initialViewState.userInfo);
  const [userInfoErrors, setUserInfoErrors] = useState({});
  const [userInfoSaving, setUserInfoSaving] = useState(false);
  const [sessionMutationPending, setSessionMutationPending] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY) === "1";
  });
  const [bootstrapPending, setBootstrapPending] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [noteActionError, setNoteActionError] = useState("");
  const [teacherScopeKey, setTeacherScopeKey] = useState(
    () => initialViewState.teacherScopeKey,
  );
  const [dismissedRoundWarningBySession, setDismissedRoundWarningBySession] =
    useState({});
  const [messageBottomInset, setMessageBottomInset] = useState(0);
  const [composerDocumentEntries, setComposerDocumentEntries] = useState([]);
  const [selectedContextDocumentKeys, setSelectedContextDocumentKeys] = useState(
    [],
  );
  const [activeDocumentKey, setActiveDocumentKey] = useState("");
  const [dismissedDocumentPreviewKey, setDismissedDocumentPreviewKey] =
    useState("");
  const [documentPreviewClosing, setDocumentPreviewClosing] = useState(false);
  const [autoHideSessionDocumentPreview, setAutoHideSessionDocumentPreview] =
    useState(true);
  const [pageEntered, setPageEntered] = useState(false);

  const messageListRef = useRef(null);
  const chatInputWrapRef = useRef(null);
  const exportWrapRef = useRef(null);
  const documentPreviewCloseTimerRef = useRef(null);
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
  const persistReadyRef = useRef(false);
  const pendingMetaSaveRef = useRef(false);
  const messagePersistChainRef = useRef(new Map());
  const messagePersistRevisionRef = useRef(new Map());
  const homeStageSessionIdRef = useRef("");
  const startedSessionIdsRef = useRef(new Set());
  const stableCanUseMessageInputRef = useRef(false);
  const groupsRef = useRef(initialViewState.groups);
  const sessionsRef = useRef(initialViewState.sessions);
  const sessionMessagesRef = useRef(initialViewState.sessionMessages);
  const agentBySessionRef = useRef(initialViewState.agentBySession);
  const smartContextEnabledBySessionAgentRef = useRef(
    initialViewState.smartContextEnabledBySessionAgent,
  );
  const activeIdRef = useRef(initialViewState.activeId);
  const autoSessionTitleRequestRef = useRef(new Set());
  const pendingRouteSessionIdRef = useRef("");
  const pendingNavigationSessionIdRef = useRef("");
  const lastReportedRoutePathRef = useRef("");
  const buildFreshAutoSessionBundleRef = useRef(null);
  const persistSessionStateImmediatelyRef = useRef(null);

  useEffect(() => {
    let frameId = 0;
    frameId = window.requestAnimationFrame(() => {
      setPageEntered(true);
    });
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_STORAGE_KEY,
        sidebarCollapsed ? "1" : "0",
      );
    } catch {
      return;
    }
  }, [sidebarCollapsed]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  );
  const activeSessionStoredAgent = useMemo(
    () => readStoredAgentBySession(agentBySession, activeId),
    [agentBySession, activeId],
  );
  const activeSessionAgent = useMemo(
    () => readSelectableAgentBySession(agentBySession, activeId, "A"),
    [agentBySession, activeId],
  );
  const activeSessionUsesRemovedAgent = isRemovedAgentId(activeSessionStoredAgent);
  const messages = useMemo(
    () => sessionMessages[activeId] || [],
    [sessionMessages, activeId],
  );
  const activeSessionTitle = useMemo(
    () => String(activeSession?.title || "").trim() || `智能体 ${agent}`,
    [activeSession, agent],
  );
  const sessionDocumentEntries = useMemo(
    () => collectSessionDocumentEntries(activeId, messages),
    [activeId, messages],
  );
  const documentLibrary = useMemo(
    () => [...composerDocumentEntries, ...sessionDocumentEntries],
    [composerDocumentEntries, sessionDocumentEntries],
  );
  const activeDocumentPreview = useMemo(
    () =>
      documentLibrary.find((item) => item.key === activeDocumentKey) ||
      documentLibrary[0] ||
      null,
    [activeDocumentKey, documentLibrary],
  );
  const shouldAutoHideSessionPreview = Boolean(
    autoHideSessionDocumentPreview &&
      !activeDocumentKey &&
      activeDocumentPreview?.source === "session",
  );
  const isDocumentPreviewVisible = Boolean(
    activeDocumentPreview &&
      activeDocumentPreview.key !== dismissedDocumentPreviewKey &&
      !shouldAutoHideSessionPreview,
  );
  const hasHiddenDocumentPreview = Boolean(
    activeDocumentPreview && !isDocumentPreviewVisible,
  );
  const shouldRenderDocumentPreviewPane = Boolean(
    activeDocumentPreview && (!hasHiddenDocumentPreview || documentPreviewClosing),
  );
  const selectedContextDocuments = useMemo(
    () =>
      documentLibrary.filter(
        (item) =>
          item.source === "session" &&
          selectedContextDocumentKeys.includes(item.key),
      ),
    [documentLibrary, selectedContextDocumentKeys],
  );

  useLayoutEffect(() => {
    groupsRef.current = groups;
  }, [groups]);
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
  useLayoutEffect(() => {
    const source =
      sessionMessages && typeof sessionMessages === "object" ? sessionMessages : {};
    Object.entries(source).forEach(([sessionId, list]) => {
      if (!sessionId) return;
      if (!chatDataService.hasUserTurn(list)) return;
      startedSessionIdsRef.current.add(sessionId);
      if (homeStageSessionIdRef.current === sessionId) {
        homeStageSessionIdRef.current = "";
      }
    });
  }, [sessionMessages]);
  useLayoutEffect(() => {
    if (!activeId) return;
    if (!chatDataService.hasUserTurn(messages)) return;
    startedSessionIdsRef.current.add(activeId);
    if (homeStageSessionIdRef.current === activeId) {
      homeStageSessionIdRef.current = "";
    }
  }, [activeId, messages]);
  const hasStartedConversation = useMemo(
    () =>
      chatDataService.hasUserTurn(messages) ||
      startedSessionIdsRef.current.has(activeId) ||
      homeStageSessionIdRef.current !== activeId,
    [activeId, messages],
  );
  const displayedMessages = useMemo(
    () => (hasStartedConversation ? messages : []),
    [hasStartedConversation, messages],
  );
  const hasAtLeastOneSession = sessions.length > 0;
  useLayoutEffect(() => {
    if (hasAtLeastOneSession && activeSession) {
      stableCanUseMessageInputRef.current = true;
      return;
    }
    if (!hasAtLeastOneSession || !activeId) {
      stableCanUseMessageInputRef.current = false;
    }
  }, [hasAtLeastOneSession, activeId, activeSession]);
  const roundWarningDismissed = !!dismissedRoundWarningBySession[activeId];
  const userInfoComplete = useMemo(
    () => isUserInfoComplete(userInfo),
    [userInfo],
  );
  const isActiveSessionStreaming =
    isStreaming &&
    sanitizeSmartContextSessionId(streamTargetRef.current?.sessionId) === activeId;
  const interactionLocked = bootstrapLoading || forceUserInfoModal || userInfoSaving;
  const shouldConfirmStreamingExit = isStreaming;
  const teacherLockedAgentId = useMemo(
    () => resolveLockedAgentByTeacherScope(teacherScopeKey),
    [teacherScopeKey],
  );
  const teacherScopedAgentLocked = !!teacherLockedAgentId;
  const activeAgent = useMemo(() => AGENT_META[agent] || AGENT_META.A, [agent]);
  const activeAgentDisplayName = activeSessionUsesRemovedAgent
    ? `${REMOVED_AGENT_E_NAME}（已下线）`
    : activeAgent.name;
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
  const buildFreshAutoSessionBundle = useCallback(({
    agentBySession: sourceAgentBySession,
    smartContextEnabledBySessionAgent: sourceSmartContextMap,
    preferredAgentId = "",
  } = {}) => {
    const sessionRecord = chatDataService.createSessionRecord();
    const nextAgentId =
      teacherLockedAgentId ||
      sanitizeSmartContextAgentId(preferredAgentId) ||
      sanitizeSmartContextAgentId(agent) ||
      "A";
    const nextAgentBySession = patchAgentBySession(
      sourceAgentBySession,
      sessionRecord.session.id,
      nextAgentId,
    );
    let nextSmartContextEnabledBySessionAgent = sanitizeSmartContextEnabledMap(
      sourceSmartContextMap,
    );
    if (teacherScopedAgentLocked) {
      nextSmartContextEnabledBySessionAgent = patchSmartContextEnabledBySessionAgent(
        nextSmartContextEnabledBySessionAgent,
        sessionRecord.session.id,
        nextAgentId,
        true,
      );
    }
    return {
      sessionRecord,
      sessions: [sessionRecord.session],
      sessionMessages: {
        [sessionRecord.session.id]: sessionRecord.messages,
      },
      activeId: sessionRecord.session.id,
      agentBySession: nextAgentBySession,
      smartContextEnabledBySessionAgent: nextSmartContextEnabledBySessionAgent,
    };
  }, [agent, teacherLockedAgentId, teacherScopedAgentLocked]);
  useLayoutEffect(() => {
    buildFreshAutoSessionBundleRef.current = buildFreshAutoSessionBundle;
  }, [buildFreshAutoSessionBundle]);
  const agentSwitchLocked =
    teacherScopedAgentLocked || effectiveSmartContextEnabled || activeSessionUsesRemovedAgent;
  const agentSelectDisabledTitle = teacherScopedAgentLocked
    ? "当前授课教师下已锁定为“远程教育”智能体。"
    : activeSessionUsesRemovedAgent
      ? REMOVED_AGENT_E_NOTICE
      : "开启智能上下文管理后，需先关闭开关才能切换智能体。";
  const canonicalActiveHref = buildChatSessionHref(activeId);
  const isSessionRouteSyncPending =
    !!activeId && canonicalActiveHref !== currentRouteHref;
  const canUseMessageInput =
    hasAtLeastOneSession &&
    (!!activeSession ||
      (isSessionRouteSyncPending && stableCanUseMessageInputRef.current)) &&
    !activeSessionUsesRemovedAgent;
  const sessionActionsLocked =
    bootstrapPending ||
    sessionMutationPending ||
    isSessionRouteSyncPending;
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

  const clearFloatingStatus = useCallback(() => {
    setContextCompactingMessage("");
    setUpstreamReconnectMessage("");
  }, []);
  const streamingStatusText =
    upstreamReconnectMessage ||
    contextCompactingMessage ||
    (isStreaming ? "正在回答中..." : "");

  const syncImmediateRefs = useCallback((overrides = {}) => {
    if (Object.prototype.hasOwnProperty.call(overrides, "groups")) {
      groupsRef.current = overrides.groups;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "sessions")) {
      sessionsRef.current = overrides.sessions;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "sessionMessages")) {
      sessionMessagesRef.current = overrides.sessionMessages;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "agentBySession")) {
      agentBySessionRef.current = overrides.agentBySession;
    }
    if (
      Object.prototype.hasOwnProperty.call(
        overrides,
        "smartContextEnabledBySessionAgent",
      )
    ) {
      smartContextEnabledBySessionAgentRef.current =
        overrides.smartContextEnabledBySessionAgent;
    }
    if (Object.prototype.hasOwnProperty.call(overrides, "activeId")) {
      activeIdRef.current = overrides.activeId;
    }
  }, []);

  const abortActiveStream = useCallback((reason = "user") => {
    const controller = streamAbortControllerRef.current;
    if (!controller) return false;
    streamAbortReasonRef.current = String(reason || "user");
    controller.abort();
    return true;
  }, []);

  const confirmStreamingExit = useCallback((reason = "leave-page") => {
    if (!shouldConfirmStreamingExit) return true;
    const message =
      reason === "switch-session"
        ? CHAT_STREAMING_SWITCH_SESSION_CONFIRM_MESSAGE
        : reason === "logout"
          ? CHAT_STREAMING_LOGOUT_CONFIRM_MESSAGE
          : CHAT_STREAMING_LEAVE_PAGE_CONFIRM_MESSAGE;
    const confirmed = window.confirm(message);
    if (!confirmed) return false;
    abortActiveStream("navigation");
    return true;
  }, [abortActiveStream, shouldConfirmStreamingExit]);

  useBeforeUnload(
    useCallback(
      (event) => {
        if (!shouldConfirmStreamingExit) return;
        event.preventDefault();
        event.returnValue = "";
      },
      [shouldConfirmStreamingExit],
    ),
  );

  const activateSession = useCallback(
    (sessionId, { replace = false } = {}) => {
      const safeSessionId = sanitizeSmartContextSessionId(sessionId);
      const currentActiveId = sanitizeSmartContextSessionId(activeIdRef.current);
      if (
        safeSessionId &&
        safeSessionId !== currentActiveId &&
        !confirmStreamingExit("switch-session")
      ) {
        return;
      }
      if (
        currentActiveId &&
        safeSessionId !== currentActiveId &&
        homeStageSessionIdRef.current === currentActiveId
      ) {
        homeStageSessionIdRef.current = "";
      }
      syncImmediateRefs({
        activeId: safeSessionId,
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
      emitChatDebugLog,
      location.pathname,
      location.search,
      navigate,
      confirmStreamingExit,
      syncImmediateRefs,
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

  function patchAssistantMessage(sessionId, assistantId, updater) {
    if (typeof updater !== "function") return null;
    const currentMessages =
      sessionMessagesRef.current && typeof sessionMessagesRef.current === "object"
        ? sessionMessagesRef.current
        : {};
    const list = Array.isArray(currentMessages[sessionId])
      ? currentMessages[sessionId]
      : [];
    let touched = false;
    let patchedMessage = null;
    const nextList = list.map((item) => {
      if (item?.id !== assistantId || item?.role !== "assistant") return item;
      touched = true;
      const nextMessage = updater(item);
      patchedMessage = nextMessage;
      return nextMessage;
    });
    if (!touched) return null;
    const nextSessionMessages = {
      ...currentMessages,
      [sessionId]: nextList,
    };
    syncImmediateRefs({ sessionMessages: nextSessionMessages });
    setSessionMessages(nextSessionMessages);
    return patchedMessage;
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

    chatDataService.updateDraft(sessionId, (draft) => {
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

    chatDataService.updateDraft(sessionId, (draft) => {
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
    void persistMessageUpsertsImmediately([
      { sessionId, message: summaryMessage },
    ]);
  }

  function persistMessageUpsertsImmediately(
    upserts,
    { awaitCompletion = false } = {},
  ) {
    const safeUpserts = Array.isArray(upserts)
      ? upserts
          .map((item) => {
            const sessionId = String(item?.sessionId || "").trim();
            const messageId = String(item?.message?.id || "").trim();
            if (!sessionId || !messageId || !item?.message) return null;
            return { sessionId, message: item.message };
          })
          .filter(Boolean)
      : [];

    if (safeUpserts.length === 0) {
      return Promise.resolve({ ok: true, updated: 0 });
    }

    const revisionsByKey = new Map();
    const upsertsBySession = new Map();
    safeUpserts.forEach((item) => {
      const key = `${item.sessionId}::${item.message.id}`;
      const nextRevision =
        (messagePersistRevisionRef.current.get(key) || 0) + 1;
      messagePersistRevisionRef.current.set(key, nextRevision);
      revisionsByKey.set(key, nextRevision);
      const list = upsertsBySession.get(item.sessionId) || [];
      list.push(item);
      upsertsBySession.set(item.sessionId, list);
    });

    const tasks = Array.from(upsertsBySession.entries()).map(
      ([sessionId, sessionUpserts]) => {
        const previous = messagePersistChainRef.current.get(sessionId);
        const base = previous instanceof Promise ? previous : Promise.resolve();
        const next = base.catch(() => {}).then(async () => {
          const latestUpserts = sessionUpserts.filter((item) => {
            const key = `${item.sessionId}::${item.message.id}`;
            return (
              (messagePersistRevisionRef.current.get(key) || 0) ===
              revisionsByKey.get(key)
            );
          });
          if (latestUpserts.length === 0) {
            return { ok: true, updated: 0, skipped: true };
          }
          await saveChatSessionMessages({ upserts: latestUpserts });
          setStateSaveError("");
          return { ok: true, updated: latestUpserts.length };
        });
        let tracked = null;
        tracked = next.finally(() => {
          if (messagePersistChainRef.current.get(sessionId) === tracked) {
            messagePersistChainRef.current.delete(sessionId);
          }
          sessionUpserts.forEach((item) => {
            const key = `${item.sessionId}::${item.message.id}`;
            const latestRevision =
              messagePersistRevisionRef.current.get(key) || 0;
            if (latestRevision === revisionsByKey.get(key)) {
              messagePersistRevisionRef.current.delete(key);
            }
          });
        });
        messagePersistChainRef.current.set(sessionId, tracked);
        return tracked;
      },
    );

    const combined = Promise.all(tasks);
    if (awaitCompletion) {
      return combined;
    }

    void combined.catch((error) => {
      setStateSaveError(error?.message || "聊天记录保存失败");
    });
    return combined;
  }

  function clearSessionMessageQueue(sessionId) {
    const sid = String(sessionId || "").trim();
    if (!sid) return;
    messagePersistChainRef.current.delete(sid);
    const prefix = `${sid}::`;
    Array.from(messagePersistRevisionRef.current.keys()).forEach((key) => {
      if (key.startsWith(prefix)) {
        messagePersistRevisionRef.current.delete(key);
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

    autoSessionTitleRequestRef.current.add(sid);
    let nextTitle = "";
    try {
      nextTitle = await suggestSessionTitleForExchange({
        userMessage,
        assistantMessage,
        suggestTitle: ChatApiService.suggestChatSessionTitle,
      });
    } catch {
      nextTitle = "";
    } finally {
      autoSessionTitleRequestRef.current.delete(sid);
    }

    if (!nextTitle || isUntitledSessionTitle(nextTitle)) return;
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextSessions = currentSessions.map((session) => {
      if (session.id !== sid) return session;
      if (!isUntitledSessionTitle(session.title)) return session;
      return { ...session, title: nextTitle };
    });
    const persistResult = await persistSessionStateImmediately({
      nextGroups: groupsRef.current || [],
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setSessions(nextSessions);
    syncImmediateRefs({
      groups: groupsRef.current || [],
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
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

  const persistSessionStateImmediately = useCallback(async ({
    nextGroups,
    nextSessions,
    nextSessionMessages,
    nextActiveId,
    nextAgentBySession,
    nextSmartContextEnabledBySessionAgent,
  }) => {
    const safeGroups = Array.isArray(nextGroups)
      ? nextGroups
      : Array.isArray(groupsRef.current)
        ? groupsRef.current
        : [];
    const safeSessions = Array.isArray(nextSessions) ? nextSessions : [];
    const prunedSessionMessages = pruneSessionMessagesBySessions(
      nextSessionMessages,
      safeSessions,
    );
    const safeActiveId = sanitizeSmartContextSessionId(
      nextActiveId || safeSessions[0]?.id || "",
    );
    const safeAgentBySession = sanitizeAgentBySessionMap(nextAgentBySession);
    const safeSmartContextMap = sanitizeSmartContextEnabledMap(
      nextSmartContextEnabledBySessionAgent,
    );
    const fallbackAgent = teacherLockedAgentId || agent || "A";
    const nextAgentId = readAgentBySession(
      safeAgentBySession,
      safeActiveId,
      fallbackAgent,
    );
    const nextRuntimeConfig = resolveRuntimeConfigForAgent(
      nextAgentId,
      agentRuntimeConfigs,
    );
    const nextProvider = resolveAgentProvider(
      nextAgentId,
      nextRuntimeConfig,
      agentProviderDefaults,
    );
    const nextSmartContextEnabled = readSmartContextEnabledBySessionAgent(
      safeSmartContextMap,
      safeActiveId,
      nextAgentId,
    );
    const nextEffectiveSmartContextEnabled =
      nextProvider === "volcengine" &&
      (teacherScopedAgentLocked || nextSmartContextEnabled);

    if (metaSaveTimerRef.current) {
      clearTimeout(metaSaveTimerRef.current);
      metaSaveTimerRef.current = null;
    }
    pendingMetaSaveRef.current = false;
    setSessionMutationPending(true);
    try {
      await saveChatState({
        activeId: safeActiveId,
        groups: safeGroups,
        sessions: safeSessions,
        settings: {
          agent: nextAgentId,
          agentBySession: safeAgentBySession,
          apiTemperature: normalizeTemperature(nextRuntimeConfig.temperature),
          apiTopP: normalizeTopP(nextRuntimeConfig.topP),
          apiReasoningEffort: nextRuntimeConfig.enableThinking ? "high" : "none",
          lastAppliedReasoning: normalizeReasoningEffort(lastAppliedReasoning),
          smartContextEnabled: nextEffectiveSmartContextEnabled,
          smartContextEnabledBySessionAgent: safeSmartContextMap,
        },
      });
      setStateSaveError("");
      return {
        ok: true,
        activeId: safeActiveId,
        sessionMessages: prunedSessionMessages,
        agentBySession: safeAgentBySession,
        smartContextEnabledBySessionAgent: safeSmartContextMap,
        agent: nextAgentId,
      };
    } catch (error) {
      setStateSaveError(error?.message || "聊天记录保存失败");
      return { ok: false };
    } finally {
      setSessionMutationPending(false);
    }
  }, [
    agent,
    agentProviderDefaults,
    agentRuntimeConfigs,
    lastAppliedReasoning,
    teacherLockedAgentId,
    teacherScopedAgentLocked,
  ]);
  useLayoutEffect(() => {
    persistSessionStateImmediatelyRef.current = persistSessionStateImmediately;
  }, [persistSessionStateImmediately]);

  async function onNewChat() {
    if (sessionActionsLocked) return;
    const next = chatDataService.createSessionRecord();
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
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages,
      nextActiveId: next.session.id,
      nextAgentBySession,
      nextSmartContextEnabledBySessionAgent: nextSmartContextMap,
    });
    if (!persistResult.ok) return;
    homeStageSessionIdRef.current = next.session.id;
    try {
      await persistMessageUpsertsImmediately(
        next.messages.map((message) => ({
          sessionId: next.session.id,
          message,
        })),
        { awaitCompletion: true },
      );
    } catch (error) {
      setStateSaveError(error?.message || "聊天记录保存失败");
      return;
    }

    setSessions(nextSessions);
    setSessionMessages(persistResult.sessionMessages);
    setAgentBySession(persistResult.agentBySession);
    setSmartContextEnabledBySessionAgent(
      persistResult.smartContextEnabledBySessionAgent,
    );
    setAgent(persistResult.agent);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
    activateSession(next.session.id);
    setStreamError("");
    clearFloatingStatus();
    setSelectedAskText("");
    setFocusUserMessageId("");
  }

  function onOpenImageGeneration() {
    if (!confirmStreamingExit("leave-page")) return;
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
    if (nextReturnTarget === "teacher-home" && returnUrl) {
      appendReturnUrlParam(params, returnUrl);
    }
    navigate(withAuthSlot(`/image-generation?${params.toString()}`), {
      state: {
        returnContext: context,
      },
    });
  }

  function onOpenNotes() {
    if (!confirmStreamingExit("leave-page")) return;
    navigate(withAuthSlot("/notes"));
  }

  function onOpenGroupChat() {
    if (!confirmStreamingExit("leave-page")) return;
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
    if (nextReturnTarget === "teacher-home" && returnUrl) {
      appendReturnUrlParam(params, returnUrl);
    }
    navigate(withAuthSlot(`/party?${params.toString()}`));
  }

  function readMessageTextForNote(message) {
    const content = message?.content;
    if (typeof content === "string") {
      return content.trim();
    }
    if (Array.isArray(content)) {
      return content
        .map((part) => {
          if (typeof part === "string") return part;
          if (typeof part?.text === "string") return part.text;
          if (typeof part?.content === "string") return part.content;
          return "";
        })
        .join("\n")
        .trim();
    }
    return "";
  }

  async function onSaveMessageAsNote(message, payload = {}) {
    const safeMessageId = String(message?.id || "").trim();
    const safeSessionId = String(activeId || "").trim();
    const safeSelectedText =
      typeof payload === "string"
        ? String(payload || "").trim()
        : String(payload?.selectedText || "").trim();
    const safePromptMessageId =
      typeof payload === "string"
        ? ""
        : String(payload?.promptMessageId || "").trim();
    const safeMessageText = readMessageTextForNote(message);
    const currentMessages = Array.isArray(sessionMessages[safeSessionId])
      ? sessionMessages[safeSessionId]
      : [];
    const promptMessage =
      safePromptMessageId && message?.role === "assistant"
        ? currentMessages.find(
            (item) =>
              String(item?.id || "").trim() === safePromptMessageId && item?.role === "user",
          ) || null
        : null;
    const promptText = readMessageTextForNote(promptMessage);
    if (!safeSessionId || !safeMessageId || (!safeMessageText && !safeSelectedText)) {
      setNoteActionError("当前消息没有可保存的文本内容。");
      return;
    }

    setNoteActionError("");
    try {
      const activeSession = sessions.find((session) => session?.id === safeSessionId) || null;
      const data = await captureNoteFromChat({
        sessionId: safeSessionId,
        messageId: safeMessageId,
        selectedText: safeSelectedText,
        messageText: safeMessageText,
        messageRole: String(message?.role || "").trim(),
        promptMessageId: safePromptMessageId,
        promptText,
        sessionTitle: String(activeSession?.title || "").trim(),
      });
      const noteId = String(data?.note?.id || "").trim();
      if (!noteId) {
        throw new Error("笔记创建成功，但未返回笔记 ID。");
      }
      navigate(withAuthSlot(`/notes/${noteId}`));
    } catch (error) {
      setNoteActionError(error?.message || "保存为笔记失败，请稍后重试。");
    }
  }

  async function onDeleteSession(sessionId) {
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
    let nextSessions = currentSessions.filter((session) => session.id !== sessionId);
    let nextActiveSessionId =
      sessionId === currentActiveId ? nextSessions[0]?.id || "" : currentActiveId;
    let nextMessages = { ...currentMessages };
    delete nextMessages[sessionId];
    let nextSmartContextMap = removeSmartContextBySessions(
      currentSmartContextMap,
      new Set([sessionId]),
    );
    let nextAgentBySession = removeAgentBySessions(
      currentAgentBySession,
      new Set([sessionId]),
    );
    let autoCreatedSessionRecord = null;
    if (nextSessions.length === 0) {
      const freshBundle = buildFreshAutoSessionBundle({
        agentBySession: nextAgentBySession,
        smartContextEnabledBySessionAgent: nextSmartContextMap,
        preferredAgentId: readAgentBySession(
          currentAgentBySession,
          currentActiveId,
          teacherLockedAgentId || agent || "A",
        ),
      });
      autoCreatedSessionRecord = freshBundle.sessionRecord;
      homeStageSessionIdRef.current = freshBundle.activeId;
      nextSessions = freshBundle.sessions;
      nextMessages = freshBundle.sessionMessages;
      nextActiveSessionId = freshBundle.activeId;
      nextSmartContextMap = freshBundle.smartContextEnabledBySessionAgent;
      nextAgentBySession = freshBundle.agentBySession;
    }
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: nextMessages,
      nextActiveId: nextActiveSessionId || "",
      nextAgentBySession,
      nextSmartContextEnabledBySessionAgent: nextSmartContextMap,
    });
    if (!persistResult.ok) return;
    if (autoCreatedSessionRecord) {
      try {
        await persistMessageUpsertsImmediately(
          autoCreatedSessionRecord.messages.map((message) => ({
            sessionId: autoCreatedSessionRecord.session.id,
            message,
          })),
          { awaitCompletion: true },
        );
      } catch (error) {
        setStateSaveError(error?.message || "聊天记录保存失败");
        return;
      }
    }

    emitChatDebugLog("delete_session_apply", {
      clickedSessionId: sanitizeSmartContextSessionId(sessionId),
      sessionsRef: currentSessions.map((session) => session.id),
      currentActiveId,
      nextSessions: nextSessions.map((session) => session.id),
    });
    redirectAfterSessionRemoval([sessionId], nextActiveSessionId);
    setSessions(nextSessions);
    setSessionMessages(persistResult.sessionMessages);
    setSmartContextEnabledBySessionAgent(
      persistResult.smartContextEnabledBySessionAgent,
    );
    setAgentBySession(persistResult.agentBySession);
    setAgent(persistResult.agent);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
    if (sessionId === currentActiveId) {
      activateSession(nextActiveSessionId || nextSessions[0]?.id || "", {
        replace: autoCreatedSessionRecord !== null,
      });
    }
    setDismissedRoundWarningBySession((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    chatDataService.clearDraft(sessionId);
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

  async function onBatchDeleteSessions(sessionIds) {
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
    let nextSessions = currentSessions.filter((session) => !remove.has(session.id));
    let nextActiveSessionId = remove.has(currentActiveId)
      ? nextSessions[0]?.id || ""
      : currentActiveId;
    let nextMessages = { ...currentMessages };
    sessionIds.forEach((id) => {
      delete nextMessages[id];
    });
    let nextSmartContextMap = removeSmartContextBySessions(
      currentSmartContextMap,
      remove,
    );
    let nextAgentBySession = removeAgentBySessions(currentAgentBySession, remove);
    let autoCreatedSessionRecord = null;
    if (nextSessions.length === 0) {
      const freshBundle = buildFreshAutoSessionBundle({
        agentBySession: nextAgentBySession,
        smartContextEnabledBySessionAgent: nextSmartContextMap,
        preferredAgentId: readAgentBySession(
          currentAgentBySession,
          currentActiveId,
          teacherLockedAgentId || agent || "A",
        ),
      });
      autoCreatedSessionRecord = freshBundle.sessionRecord;
      homeStageSessionIdRef.current = freshBundle.activeId;
      nextSessions = freshBundle.sessions;
      nextMessages = freshBundle.sessionMessages;
      nextActiveSessionId = freshBundle.activeId;
      nextSmartContextMap = freshBundle.smartContextEnabledBySessionAgent;
      nextAgentBySession = freshBundle.agentBySession;
    }
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: nextMessages,
      nextActiveId: nextActiveSessionId || "",
      nextAgentBySession,
      nextSmartContextEnabledBySessionAgent: nextSmartContextMap,
    });
    if (!persistResult.ok) return;
    if (autoCreatedSessionRecord) {
      try {
        await persistMessageUpsertsImmediately(
          autoCreatedSessionRecord.messages.map((message) => ({
            sessionId: autoCreatedSessionRecord.session.id,
            message,
          })),
          { awaitCompletion: true },
        );
      } catch (error) {
        setStateSaveError(error?.message || "聊天记录保存失败");
        return;
      }
    }

    emitChatDebugLog("batch_delete_sessions_apply", {
      clickedSessionIds: Array.from(remove),
      sessionsRef: currentSessions.map((session) => session.id),
      currentActiveId,
      nextSessions: nextSessions.map((session) => session.id),
    });
    redirectAfterSessionRemoval(Array.from(remove), nextActiveSessionId);
    setSessions(nextSessions);
    setSessionMessages(persistResult.sessionMessages);
    setSmartContextEnabledBySessionAgent(
      persistResult.smartContextEnabledBySessionAgent,
    );
    setAgentBySession(persistResult.agentBySession);
    setAgent(persistResult.agent);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
    if (remove.has(currentActiveId)) {
      activateSession(nextActiveSessionId || nextSessions[0]?.id || "", {
        replace: autoCreatedSessionRecord !== null,
      });
    }
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
    chatDataService.clearDrafts(sessionIds);
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

  async function onMoveSessionToGroup(sessionId, groupId) {
    if (sessionActionsLocked) return;
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextSessions = currentSessions.map((session) => {
      if (session.id !== sessionId) return session;
      return { ...session, groupId: groupId || null };
    });
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setSessions(nextSessions);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onBatchMoveSessionsToGroup(sessionIds, groupId) {
    if (sessionActionsLocked) return;
    const selected = new Set(sessionIds);
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextSessions = currentSessions.map((session) => {
      if (!selected.has(session.id)) return session;
      return { ...session, groupId: groupId || null };
    });
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setSessions(nextSessions);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onRenameSession(sessionId, title) {
    if (sessionActionsLocked) return;
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextSessions = currentSessions.map((session) => {
      if (session.id !== sessionId) return session;
      return { ...session, title };
    });
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setSessions(nextSessions);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onToggleSessionPin(sessionId) {
    if (sessionActionsLocked) return;
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextSessions = currentSessions.map((session) => {
      if (session.id !== sessionId) return session;
      return { ...session, pinned: !session.pinned };
    });
    const persistResult = await persistSessionStateImmediately({
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setSessions(nextSessions);
    syncImmediateRefs({
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onCreateGroup(payload) {
    if (sessionActionsLocked) return;
    const currentGroups = Array.isArray(groupsRef.current) ? groupsRef.current : [];
    const item = {
      id: `g${Date.now()}`,
      name: payload.name,
      description: payload.description,
    };
    const nextGroups = [item, ...currentGroups];
    const persistResult = await persistSessionStateImmediately({
      nextGroups,
      nextSessions: sessionsRef.current || [],
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setGroups(nextGroups);
    syncImmediateRefs({
      groups: nextGroups,
      sessions: sessionsRef.current || [],
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onRenameGroup(groupId, payload) {
    if (sessionActionsLocked) return;
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    const currentGroups = Array.isArray(groupsRef.current) ? groupsRef.current : [];
    const nextGroups = currentGroups.map((group) => {
      if (group.id !== safeGroupId) return group;
      return {
        ...group,
        name: payload.name,
        description: payload.description,
      };
    });
    const persistResult = await persistSessionStateImmediately({
      nextGroups,
      nextSessions: sessionsRef.current || [],
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setGroups(nextGroups);
    syncImmediateRefs({
      groups: nextGroups,
      sessions: sessionsRef.current || [],
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  async function onDeleteGroup(groupId) {
    if (sessionActionsLocked) return;
    const safeGroupId = String(groupId || "").trim();
    if (!safeGroupId) return;
    const currentGroups = Array.isArray(groupsRef.current) ? groupsRef.current : [];
    const currentSessions = Array.isArray(sessionsRef.current)
      ? sessionsRef.current
      : [];
    const nextGroups = currentGroups.filter((group) => group.id !== safeGroupId);
    const nextSessions = currentSessions.map((session) => {
      if (session.groupId !== safeGroupId) return session;
      return { ...session, groupId: null };
    });
    const persistResult = await persistSessionStateImmediately({
      nextGroups,
      nextSessions,
      nextSessionMessages: sessionMessagesRef.current || {},
      nextActiveId: activeIdRef.current,
      nextAgentBySession: agentBySessionRef.current || {},
      nextSmartContextEnabledBySessionAgent:
        smartContextEnabledBySessionAgentRef.current || {},
    });
    if (!persistResult.ok) return;
    setGroups(nextGroups);
    setSessions(nextSessions);
    syncImmediateRefs({
      groups: nextGroups,
      sessions: nextSessions,
      sessionMessages: persistResult.sessionMessages,
      activeId: persistResult.activeId,
      agentBySession: persistResult.agentBySession,
      smartContextEnabledBySessionAgent:
        persistResult.smartContextEnabledBySessionAgent,
    });
  }

  function flushStreamBuffer() {
    const target = streamTargetRef.current;
    if (!target.sessionId || !target.assistantId) return;

    const { content, reasoning, firstTextAt } = streamBufferRef.current;
    if (!content && !reasoning && !firstTextAt) return;

    if (target.mode === "message") {
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
      chatDataService.updateDraft(target.sessionId, (draft) => {
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

  async function onPrepareFiles(pickedFiles) {
    const runtimeConfig = resolveRuntimeConfigForAgent(
      agent,
      agentRuntimeConfigs,
    );
    return prepareComposerFiles({
      pickedFiles,
      agentId: agent,
      sessionId: activeId,
      runtimeConfig,
      providerDefaults: agentProviderDefaults,
      deps: {
        buildImageThumbnailDataUrl,
        classifyUploadPreviewKind,
        prepareChatAttachments: ChatApiService.prepareChatAttachments,
        stageChatPreviewAttachments: ChatApiService.stageChatPreviewAttachments,
        uploadVolcengineChatFiles: ChatApiService.uploadVolcengineChatFiles,
      },
    });
  }

  async function onSend(text, files) {
    if (!activeId || isStreaming || interactionLocked || !userInfoComplete)
      return;
    if (activeSessionUsesRemovedAgent) {
      setStreamError(REMOVED_AGENT_E_NOTICE);
      return;
    }
    if (homeStageSessionIdRef.current === activeId) {
      homeStageSessionIdRef.current = "";
    }
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
    const stagedAttachmentRefs = [];
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
          url: String(item?.url || "").trim(),
          ossKey: String(item?.ossKey || "").trim(),
          thumbnailUrl: String(item?.thumbnailUrl || "").trim(),
        };
      }
      if (item?.kind === "staged_ref") {
        const stagedToken = String(item?.stagedToken || "").trim();
        if (stagedToken) {
          stagedAttachmentRefs.push({
            token: stagedToken,
            fileName: String(item?.name || ""),
            mimeType: String(item?.mimeType || item?.type || ""),
            size: Number(item?.size || 0),
          });
        } else if (item?.file instanceof File) {
          localFiles.push(item.file);
        }
        return {
          name: String(item?.name || "文件"),
          size: Number(item?.size || 0),
          type: String(item?.mimeType || item?.type || ""),
          url: String(item?.url || "").trim(),
          ossKey: String(item?.ossKey || "").trim(),
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
          url: String(item?.url || "").trim(),
          ossKey: String(item?.ossKey || "").trim(),
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
    try {
      await persistMessageUpsertsImmediately(
        [{ sessionId: currentSessionId, message: userMsg }],
        { awaitCompletion: true },
      );
    } catch (error) {
      setStreamError(error?.message || "聊天记录保存失败");
      return;
    }
    chatDataService.startDraft(currentSessionId, assistantMsg);

    const historyForApi = buildHistoryForApi({
      history: currentHistory,
      agentId: agent,
      runtimeConfig,
      providerDefaults: agentProviderDefaults,
    });

    const formData = ChatApiService.createChatStreamFormData({
      agentId: agent,
      runtimeConfig: {
        temperature: normalizeTemperature(runtimeConfig.temperature),
        topP: normalizeTopP(runtimeConfig.topP),
      },
      sessionId: currentSessionId,
      smartContextEnabled: effectiveSmartContextEnabled,
      contextMode: "append",
      messages: historyForApi,
      localFiles,
      volcengineFileRefs,
      preparedAttachmentRefs,
      stagedAttachmentRefs,
      selectedContextDocuments,
    });

    setFocusUserMessageId("");
    setIsAtLatest(true);
    clearFloatingStatus();
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
      await ChatApiService.streamChatCompletion({
        agentId: agent,
        formData,
        signal: requestController.signal,
        handlers: {
        onMeta: (meta) => {
          applyContextSummaryMessage(currentSessionId, meta?.contextSummaryMessage);
          const uploadedLinks = Array.isArray(meta?.uploadedAttachmentLinks)
            ? meta.uploadedAttachmentLinks
            : [];
          if (uploadedLinks.length > 0) {
            const changedMessages = [];
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
                changedMessages.push(changedMessage);
                return changedMessage;
              });
              return {
                ...prev,
                [currentSessionId]: nextList,
              };
            });
            if (changedMessages.length > 0) {
              void persistMessageUpsertsImmediately(
                changedMessages.map((message) => ({
                  sessionId: currentSessionId,
                  message,
                })),
              );
            }
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
        onContextCompacting: (payload) => {
          const phase = String(payload?.phase || "").trim().toLowerCase();
          if (phase === "start") {
            setContextCompactingMessage(
              String(payload?.message || "正在压缩背景信息").trim() ||
                "正在压缩背景信息",
            );
            return;
          }
          if (phase === "done" || phase === "error") {
            setContextCompactingMessage("");
          }
        },
        onUpstreamReconnecting: (payload) => {
          const phase = String(payload?.phase || "").trim().toLowerCase();
          if (phase === "retrying") {
            const retryAttempt = Number(payload?.retryAttempt || 0);
            if (retryAttempt < 2) {
              setUpstreamReconnectMessage("");
              return;
            }
            setUpstreamReconnectMessage(
              String(payload?.message || "").trim() ||
                `网络波动，重连 ${retryAttempt}/${payload?.totalRetries || 5}…`,
            );
            return;
          }
          if (phase === "recovered" || phase === "failed") {
            setUpstreamReconnectMessage("");
          }
        },
        onToken: (textChunk) => {
          if (!textChunk) return;
          clearFloatingStatus();
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
          clearFloatingStatus();
          throw new Error(msg || "stream error");
        },
      }});
    } catch (error) {
      const aborted =
        error?.name === "AbortError" || !!streamAbortReasonRef.current;
      if (!aborted) {
        clearFloatingStatus();
        const msg = error?.message || "请求失败";
        setStreamError(msg);
        flushStreamBuffer();
        chatDataService.updateDraft(currentSessionId, (draft) => {
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
      const completed = chatDataService.getDraft(currentSessionId);
      chatDataService.clearDraft(currentSessionId);
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
        try {
          await persistMessageUpsertsImmediately(
            [{ sessionId: currentSessionId, message: completedMsg }],
            { awaitCompletion: true },
          );
        } catch (error) {
          setStateSaveError(error?.message || "聊天记录保存失败");
        }
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
      clearFloatingStatus();
      setIsStreaming(false);
    }
  }

  async function onAssistantFeedback(messageId, feedback) {
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
    try {
      await persistMessageUpsertsImmediately(
        [{ sessionId: activeId, message: changedMessage }],
        { awaitCompletion: true },
      );
    } catch (error) {
      setStateSaveError(error?.message || "聊天记录保存失败");
    }
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
    setStreamError("");
    if (activeSessionUsesRemovedAgent) {
      setStreamError(REMOVED_AGENT_E_NOTICE);
      return;
    }

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
    const historyForApi = buildHistoryForApi({
      history: list.slice(0, promptIndex + 1),
      agentId: agent,
      runtimeConfig,
      providerDefaults: agentProviderDefaults,
    });

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

    const formData = ChatApiService.createChatStreamFormData({
      agentId: agent,
      runtimeConfig: {
        temperature: normalizeTemperature(runtimeConfig.temperature),
        topP: normalizeTopP(runtimeConfig.topP),
      },
      sessionId: currentSessionId,
      smartContextEnabled: effectiveSmartContextEnabled,
      contextMode: "regenerate",
      messages: historyForApi,
    });

    setFocusUserMessageId(promptMessageId);
    setIsStreaming(true);
    clearFloatingStatus();
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
      await ChatApiService.streamChatCompletion({
        agentId: agent,
        formData,
        signal: requestController.signal,
        handlers: {
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
        onContextCompacting: (payload) => {
          const phase = String(payload?.phase || "").trim().toLowerCase();
          if (phase === "start") {
            setContextCompactingMessage(
              String(payload?.message || "正在压缩背景信息").trim() ||
                "正在压缩背景信息",
            );
            return;
          }
          if (phase === "done" || phase === "error") {
            setContextCompactingMessage("");
          }
        },
        onUpstreamReconnecting: (payload) => {
          const phase = String(payload?.phase || "").trim().toLowerCase();
          if (phase === "retrying") {
            const retryAttempt = Number(payload?.retryAttempt || 0);
            if (retryAttempt < 2) {
              setUpstreamReconnectMessage("");
              return;
            }
            setUpstreamReconnectMessage(
              String(payload?.message || "").trim() ||
                `网络波动，重连 ${retryAttempt}/${payload?.totalRetries || 5}…`,
            );
            return;
          }
          if (phase === "recovered" || phase === "failed") {
            setUpstreamReconnectMessage("");
          }
        },
        onToken: (textChunk) => {
          if (!textChunk) return;
          hasReceivedRegeneratedOutput = true;
          clearFloatingStatus();
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
          clearFloatingStatus();
          throw new Error(msg || "stream error");
        },
      }});
    } catch (error) {
      const aborted =
        error?.name === "AbortError" || !!streamAbortReasonRef.current;
      if (!aborted) {
        clearFloatingStatus();
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
        const completedMessage = patchAssistantMessage(
          currentSessionId,
          assistantIdToRegenerate,
          () => ({
            ...previousAssistant,
            streaming: false,
          }),
        );
        if (completedMessage) {
          try {
            await persistMessageUpsertsImmediately(
              [{ sessionId: currentSessionId, message: completedMessage }],
              { awaitCompletion: true },
            );
          } catch (error) {
            setStateSaveError(error?.message || "聊天记录保存失败");
          }
        }
      } else {
        const completedMessage = patchAssistantMessage(
          currentSessionId,
          assistantIdToRegenerate,
          (message) => ({
            ...message,
            streaming: false,
          }),
        );
        if (completedMessage) {
          try {
            await persistMessageUpsertsImmediately(
              [{ sessionId: currentSessionId, message: completedMessage }],
              { awaitCompletion: true },
            );
          } catch (error) {
            setStateSaveError(error?.message || "聊天记录保存失败");
          }
        }
      }
      streamAbortReasonRef.current = "";
      streamTargetRef.current = {
        sessionId: "",
        assistantId: "",
        mode: "draft",
      };
      clearFloatingStatus();
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

  async function handleMessageAttachmentDownload(
    message,
    _attachment,
    attachmentIndex,
    options = {},
  ) {
    const sessionId = sanitizeSmartContextSessionId(activeIdRef.current);
    const messageId = sanitizeSmartContextSessionId(message?.id);
    const safeAttachmentIndex = Number(attachmentIndex);
    const mode =
      String(options?.mode || "").trim().toLowerCase() === "inline"
        ? "inline"
        : "download";
    if (!sessionId || !messageId || !Number.isInteger(safeAttachmentIndex)) {
      throw new Error("无效附件下载参数");
    }
    return downloadChatAttachment({
      sessionId,
      messageId,
      attachmentIndex: safeAttachmentIndex,
      mode,
      attachment: _attachment,
    });
  }

  async function handleDocumentPreviewDownload(documentEntry) {
    if (!documentEntry) return;

    if (documentEntry.source === "composer" && documentEntry.file instanceof File) {
      const objectUrl = URL.createObjectURL(documentEntry.file);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = String(documentEntry.name || documentEntry.file.name || "document").trim();
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
      return;
    }

    if (documentEntry.source === "session") {
      const result = await handleMessageAttachmentDownload(
        { id: documentEntry.messageId },
        documentEntry.attachment,
        documentEntry.attachmentIndex,
      );
      const downloadUrl = String(result?.downloadUrl || result?.url || "").trim();
      const fileName = String(
        result?.fileName || result?.filename || documentEntry.name || "document",
      ).trim();
      if (!downloadUrl) {
        throw new Error("文档下载地址生成失败");
      }
      const anchor = document.createElement("a");
      anchor.href = downloadUrl;
      if (fileName) {
        anchor.download = fileName;
      }
      anchor.rel = "noopener noreferrer";
      anchor.target = "_blank";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    }
  }

  function scrollToLatestRound(duration = 420) {
    messageListRef.current?.scrollToLatest?.(duration);
  }

  function closeStreamErrorBanner() {
    setStreamError("");
    setStateSaveError("");
    setBootstrapError("");
    setNoteActionError("");
  }

  function closeRoundWarning() {
    if (!activeId) return;
    setDismissedRoundWarningBySession((prev) => ({
      ...prev,
      [activeId]: true,
    }));
  }

  function runExport(kind, userInfo) {
    const liveDraft = chatDataService.getDraft(activeId);
    const exportMessages =
      liveDraft && liveDraft.id && !messages.some((m) => m.id === liveDraft.id)
        ? [...messages, liveDraft]
        : messages;

    const meta = buildExportMeta({
      activeSession,
      groups,
      messages: exportMessages,
      userInfo,
      activeAgentName: activeAgentDisplayName,
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
    if (!confirmStreamingExit("logout")) return;
    if (returnTarget === "mode-selection") {
      if (redirectToReturnUrl(returnUrl, { replace: true })) {
        return;
      }
      navigate(withAuthSlot("/mode-selection"), { replace: true });
      return;
    }
    if (returnTarget === "teacher-home") {
      if (redirectToReturnUrl(returnUrl, { replace: true })) {
        return;
      }
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
    chatDataService.replaceDrafts({});
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

  useEffect(
    () => () => {
      abortActiveStream("navigation");
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      if (metaSaveTimerRef.current) {
        clearTimeout(metaSaveTimerRef.current);
        metaSaveTimerRef.current = null;
      }
      pendingMetaSaveRef.current = false;
      messagePersistChainRef.current.clear();
      messagePersistRevisionRef.current.clear();
      streamAbortControllerRef.current = null;
      streamAbortReasonRef.current = "";
    },
    [abortActiveStream],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setBootstrapPending(true);
      setBootstrapLoading(true);
      setBootstrapError("");
      emitChatDebugLog("bootstrap_start", {
        routeSessionId,
        liveRouteSessionId: sanitizeSmartContextSessionId(
          pendingRouteSessionIdRef.current || routeSessionId,
        ),
        activeId: sanitizeSmartContextSessionId(activeIdRef.current),
        pendingNavigationSessionId: pendingNavigationSessionIdRef.current,
        sessionIds: (sessionsRef.current || []).map((session) =>
          sanitizeSmartContextSessionId(session?.id),
        ),
      });
      try {
        const data = await fetchChatBootstrap();
        if (cancelled) return;

        const state = data?.state || {};
        const hasStoredSessions = Array.isArray(state.sessions);
        let bootstrapAutoSessionBundle = null;
        let nextSessions = hasStoredSessions ? state.sessions : DEFAULT_SESSIONS;
        const nextGroups = stripLegacyPlaceholderGroups(
          Array.isArray(state.groups) ? state.groups : DEFAULT_GROUPS,
          nextSessions,
        );
        let nextSessionMessages =
          state.sessionMessages && typeof state.sessionMessages === "object"
            ? state.sessionMessages
            : nextSessions.length > 0
              ? DEFAULT_SESSION_MESSAGES
              : {};
        const stateSettings =
          state.settings && typeof state.settings === "object"
            ? state.settings
            : {};
        if (hasStoredSessions && nextSessions.length === 0) {
          bootstrapAutoSessionBundle = buildFreshAutoSessionBundleRef.current?.({
            agentBySession: stateSettings.agentBySession,
            smartContextEnabledBySessionAgent:
              stateSettings.smartContextEnabledBySessionAgent,
            preferredAgentId: stateSettings.agent,
          });
          nextSessions = bootstrapAutoSessionBundle.sessions;
          nextSessionMessages = bootstrapAutoSessionBundle.sessionMessages;
        }
        let rawActiveId = String(
          state.activeId || nextSessions[0]?.id || "",
        );
        if (bootstrapAutoSessionBundle) {
          rawActiveId = bootstrapAutoSessionBundle.activeId;
          homeStageSessionIdRef.current = bootstrapAutoSessionBundle.activeId;
        }
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
        let resolvedMessages = pruneSessionMessagesBySessions(
          nextSessionMessages,
          resolvedSessions,
        );
        let resolvedActiveId = rawActiveId;
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
        const canRestoreSession =
          !liveRouteSessionId &&
          !pendingNavigationSessionId &&
          !!restoreContext?.sessionId &&
          resolvedSessions.some((s) => s.id === restoreContext.sessionId);
        const preferredActiveIdCandidates = [
          pendingNavigationSessionId,
          liveRouteSessionId,
          canRestoreSession ? restoreContext.sessionId : "",
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
          rawActiveId,
          resolvedActiveId,
          resolvedSessionIds: Array.from(resolvedSessionIds),
        });

        let nextAgentBySession = bootstrapAutoSessionBundle
          ? bootstrapAutoSessionBundle.agentBySession
          : ensureAgentBySessionMap(
              stateSettings.agentBySession,
              resolvedSessions,
              fallbackAgent,
            );
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

        if (bootstrapAutoSessionBundle) {
          nextSmartContextEnabledMap =
            bootstrapAutoSessionBundle.smartContextEnabledBySessionAgent;
        }
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
        syncImmediateRefs({
          sessions: resolvedSessions,
          sessionMessages: resolvedMessages,
          activeId: resolvedActiveId,
          agentBySession: nextAgentBySession,
          smartContextEnabledBySessionAgent: nextSmartContextEnabledMap,
        });
        chatDataService.replaceDrafts({});

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

        if (bootstrapAutoSessionBundle && !cancelled) {
          const persistResult = await persistSessionStateImmediatelyRef.current?.({
            nextGroups,
            nextSessions: resolvedSessions,
            nextSessionMessages: resolvedMessages,
            nextActiveId: resolvedActiveId,
            nextAgentBySession,
            nextSmartContextEnabledBySessionAgent: nextSmartContextEnabledMap,
          });
          if (persistResult?.ok) {
            await persistMessageUpsertsImmediately(
              bootstrapAutoSessionBundle.sessionRecord.messages.map((message) => ({
                sessionId: bootstrapAutoSessionBundle.sessionRecord.session.id,
                message,
              })),
              { awaitCompletion: true },
            );
          }
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
          chatDataService.replaceDrafts({});
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
    emitChatDebugLog,
    location.state,
    navigate,
    routeSessionId,
    returnTarget,
    syncImmediateRefs,
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
  }, [emitChatDebugLog, location.pathname, location.search, routeSessionId]);

  useLayoutEffect(() => {
    if (bootstrapLoading) return;
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
    emitChatDebugLog,
    location.pathname,
    location.search,
    navigate,
    sessions,
  ]);

  useLayoutEffect(() => {
    if (bootstrapLoading) return;
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
      try {
        const payload = {
          activeId,
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
        await saveChatStateMeta(payload);
        setStateSaveError("");
      } catch (error) {
        setStateSaveError(error?.message || "聊天记录保存失败");
      } finally {
        metaSaveTimerRef.current = null;
      }
    }, 360);
  }, [
    activeId,
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
  ]);


  useEffect(() => {
    return () => {
      if (documentPreviewCloseTimerRef.current) {
        clearTimeout(documentPreviewCloseTimerRef.current);
        documentPreviewCloseTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    setSelectedAskText("");
    setFocusUserMessageId("");
    setIsAtLatest(true);
    setComposerDocumentEntries([]);
    setSelectedContextDocumentKeys([]);
    setActiveDocumentKey("");
    setDismissedDocumentPreviewKey("");
    setDocumentPreviewClosing(false);
    setAutoHideSessionDocumentPreview(true);
  }, [activeId]);

  useEffect(() => {
    if (documentLibrary.length === 0) {
      setDismissedDocumentPreviewKey("");
      setDocumentPreviewClosing(false);
    }
  }, [documentLibrary.length]);

  useEffect(() => {
    if (isDocumentPreviewVisible) {
      setDocumentPreviewClosing(false);
    }
  }, [isDocumentPreviewVisible]);

  useEffect(() => {
    if (
      activeDocumentKey &&
      documentLibrary.some((item) => item.key === activeDocumentKey)
    ) {
      return;
    }
    if (activeDocumentKey) {
      setActiveDocumentKey("");
    }
  }, [activeDocumentKey, documentLibrary]);

  useEffect(() => {
    setSelectedContextDocumentKeys((prev) =>
      prev.filter((key) =>
        documentLibrary.some(
          (item) => item.key === key && item.source === "session",
        ),
      ),
    );
  }, [documentLibrary]);

  const handleComposerFilesChange = useCallback((nextFiles) => {
    const nextEntries = collectComposerDocumentEntries(nextFiles);
    setComposerDocumentEntries(nextEntries);
    if (nextEntries.length > 0) {
      if (documentPreviewCloseTimerRef.current) {
        clearTimeout(documentPreviewCloseTimerRef.current);
        documentPreviewCloseTimerRef.current = null;
      }
      setDocumentPreviewClosing(false);
      setAutoHideSessionDocumentPreview(false);
      setActiveDocumentKey(nextEntries[nextEntries.length - 1].key);
      setDismissedDocumentPreviewKey("");
    }
  }, []);

  const handleSelectDocument = useCallback((documentEntry) => {
    const nextKey = String(documentEntry?.key || "").trim();
    if (!nextKey) return;
    if (documentPreviewCloseTimerRef.current) {
      clearTimeout(documentPreviewCloseTimerRef.current);
      documentPreviewCloseTimerRef.current = null;
    }
    setDocumentPreviewClosing(false);
    setAutoHideSessionDocumentPreview(false);
    setActiveDocumentKey(nextKey);
    setDismissedDocumentPreviewKey("");
  }, []);

  const handleToggleContextDocument = useCallback((documentEntry) => {
    if (documentEntry?.source !== "session") return;
    const nextKey = String(documentEntry?.key || "").trim();
    if (!nextKey) return;
    if (documentPreviewCloseTimerRef.current) {
      clearTimeout(documentPreviewCloseTimerRef.current);
      documentPreviewCloseTimerRef.current = null;
    }
    setDocumentPreviewClosing(false);
    setAutoHideSessionDocumentPreview(false);
    setSelectedContextDocumentKeys((prev) =>
      prev.includes(nextKey)
        ? prev.filter((key) => key !== nextKey)
        : [...prev, nextKey],
    );
    setActiveDocumentKey(nextKey);
    setDismissedDocumentPreviewKey("");
  }, []);

  const handleCloseDocumentPreview = useCallback(() => {
    const previewKey = String(activeDocumentPreview?.key || "").trim();
    if (!previewKey) return;
    if (documentPreviewCloseTimerRef.current) {
      clearTimeout(documentPreviewCloseTimerRef.current);
    }
    setDocumentPreviewClosing(true);
    documentPreviewCloseTimerRef.current = setTimeout(() => {
      setDismissedDocumentPreviewKey(previewKey);
      setDocumentPreviewClosing(false);
      documentPreviewCloseTimerRef.current = null;
    }, 220);
  }, [activeDocumentPreview]);

  const handleReopenDocumentPreview = useCallback(() => {
    if (documentPreviewCloseTimerRef.current) {
      clearTimeout(documentPreviewCloseTimerRef.current);
      documentPreviewCloseTimerRef.current = null;
    }
    setDocumentPreviewClosing(false);
    setAutoHideSessionDocumentPreview(false);
    if (!activeDocumentKey && activeDocumentPreview?.key) {
      setActiveDocumentKey(activeDocumentPreview.key);
    }
    setDismissedDocumentPreviewKey("");
  }, [activeDocumentKey, activeDocumentPreview]);

  return (
    <div className={`chat-layout chat-page-enter${pageEntered ? " is-page-entered" : ""}${sidebarCollapsed ? " is-sidebar-collapsed" : ""}`}>
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
        onOpenNotes={onOpenNotes}
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
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      <div
        className={`chat-main ${hasStartedConversation ? "is-thread-stage" : "is-home-stage"}${
          isDocumentPreviewVisible ? " has-document-preview" : ""
        }`}
      >
        <div className="chat-topbar">
          <div className="chat-topbar-left">
            {sidebarCollapsed ? (
              <button
                type="button"
                className="chat-sidebar-toggle floating"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="展开侧边栏"
                title="展开侧边栏"
              >
                <PanelLeftOpen size={18} />
              </button>
            ) : null}
            <AgentSelect
              key={agentSwitchLocked ? "agent-locked" : "agent-unlocked"}
              value={agent}
              onChange={onAgentChange}
              disabled={agentSwitchLocked}
              disabledTitle={agentSelectDisabledTitle}
              displayName={activeAgentDisplayName}
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
            {hasHiddenDocumentPreview ? (
              <button
                type="button"
                className="chat-doc-preview-toggle"
                onClick={handleReopenDocumentPreview}
                title={activeDocumentPreview?.name || "打开文档"}
                aria-label={activeDocumentPreview?.name || "打开文档"}
              >
                <PanelRightOpen size={17} />
              </button>
            ) : null}
            <div className="export-wrap" ref={exportWrapRef}>
              <button
                type="button"
                className="export-trigger"
                onClick={() => setShowExportMenu((v) => !v)}
                title="导出"
                aria-label="导出"
              >
                <FileOutput size={17} />
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
            >
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {(streamError ||
          stateSaveError ||
          bootstrapError ||
          noteActionError ||
          activeSessionUsesRemovedAgent) && (
          <div className="stream-error">
            <span>
              {[
                activeSessionUsesRemovedAgent ? REMOVED_AGENT_E_NOTICE : "",
                streamError,
                stateSaveError,
                bootstrapError,
                noteActionError,
              ]
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

        <div className="chat-body">
          <div className="chat-thread-pane">
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
              isStreaming={isActiveSessionStreaming}
              streamingStatusText={streamingStatusText}
              focusMessageId={focusUserMessageId}
              bottomInset={messageBottomInset}
              onDownloadAttachment={handleMessageAttachmentDownload}
              onAssistantFeedback={onAssistantFeedback}
              onAssistantRegenerate={onAssistantRegenerate}
              onSaveNote={onSaveMessageAsNote}
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
                onFilesChange={handleComposerFilesChange}
                disabled={interactionLocked || !canUseMessageInput || activeSessionUsesRemovedAgent}
                isStreaming={isActiveSessionStreaming}
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

          {shouldRenderDocumentPreviewPane ? (
            <div
              className={`chat-document-pane${isDocumentPreviewVisible ? " is-visible" : ""}${
                documentPreviewClosing ? " is-closing" : ""
              }`}
            >
              <ChatDocumentPreview
                document={activeDocumentPreview}
                documents={documentLibrary}
                selectedContextDocumentKeys={selectedContextDocumentKeys}
                onSelectDocument={handleSelectDocument}
                onToggleContextDocument={handleToggleContextDocument}
                onDownloadDocument={handleDocumentPreviewDownload}
                onClose={handleCloseDocumentPreview}
              />
            </div>
          ) : null}
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
