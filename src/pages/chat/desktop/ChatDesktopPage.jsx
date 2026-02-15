import { useEffect, useMemo, useRef, useState } from "react";
import { Info, LogOut, Menu, X } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
  createDefaultAgentRuntimeConfigMap,
  sanitizeRuntimeConfigMap,
} from "../agentRuntimeConfig.js";
import {
  createRuntimeSnapshot,
  mergeRuntimeWithMeta,
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
  getStreamDraft,
  startStreamDraft,
  updateStreamDraft,
} from "../streamDraftStore.js";
import {
  clearChatSmartContext,
  fetchChatBootstrap,
  getAuthTokenHeader,
  saveChatSessionMessages,
  saveChatStateMeta,
  saveUserProfile,
  uploadVolcengineChatFiles,
} from "../stateApi.js";
import {
  createNewSessionRecord,
  createWelcomeMessage,
} from "../sessionFactory.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "../../image/returnContext.js";
import "../../../styles/chat.css";
import "../../../styles/chat-motion.css";

const DEFAULT_GROUPS = [{ id: "g1", name: "新组", description: "" }];
const DEFAULT_SESSIONS = [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }];
const DEFAULT_SESSION_MESSAGES = {
  s1: [
    createWelcomeMessage(),
  ],
};
const CONTEXT_USER_ROUNDS = 10;
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);
const CHAT_AGENT_IDS = Object.freeze(["A", "B", "C", "D", "E"]);
const DEFAULT_AGENT_PROVIDER_MAP = Object.freeze({
  A: "volcengine",
  B: "volcengine",
  C: "volcengine",
  D: "openrouter",
  E: "openrouter",
});
const SIDEBAR_VISIBILITY_STORAGE_KEY = "chat_sidebar_visible";

function detectMobileViewport() {
  if (typeof window === "undefined") return false;
  return window.innerWidth <= 720;
}

function readInitialSidebarVisible() {
  if (typeof window === "undefined") return true;
  try {
    const raw = localStorage.getItem(SIDEBAR_VISIBILITY_STORAGE_KEY);
    if (raw === "1") return true;
    if (raw === "0") return false;
  } catch {
    // Ignore localStorage errors and fall back to viewport-based defaults.
  }
  return !detectMobileViewport();
}

function sanitizeProvider(value, fallback = "openrouter") {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "openrouter" || key === "volcengine" || key === "aliyun") {
    return key;
  }
  return fallback;
}

function sanitizeAgentProviderDefaults(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    A: sanitizeProvider(source.A, DEFAULT_AGENT_PROVIDER_MAP.A),
    B: sanitizeProvider(source.B, DEFAULT_AGENT_PROVIDER_MAP.B),
    C: sanitizeProvider(source.C, DEFAULT_AGENT_PROVIDER_MAP.C),
    D: sanitizeProvider(source.D, DEFAULT_AGENT_PROVIDER_MAP.D),
    E: sanitizeProvider(source.E, DEFAULT_AGENT_PROVIDER_MAP.E),
  };
}

function resolveAgentProvider(agentId, runtimeConfig, providerDefaults) {
  const runtimeProvider = String(runtimeConfig?.provider || "")
    .trim()
    .toLowerCase();
  if (runtimeProvider && runtimeProvider !== "inherit") {
    return sanitizeProvider(runtimeProvider, "openrouter");
  }
  const safeAgentId = AGENT_META[agentId] ? agentId : "A";
  return sanitizeProvider(providerDefaults?.[safeAgentId], DEFAULT_AGENT_PROVIDER_MAP[safeAgentId]);
}

function resolveRuntimeConfigForAgent(agentId, runtimeConfigs) {
  const safeAgentId = AGENT_META[agentId] ? agentId : "A";
  const base = runtimeConfigs?.[safeAgentId] || DEFAULT_AGENT_RUNTIME_CONFIG;
  if (safeAgentId !== "E") return base;
  return {
    ...base,
    provider: "volcengine",
    protocol: "responses",
  };
}

function getSmartContextDefaultEnabled(agentId) {
  return String(agentId || "")
    .trim()
    .toUpperCase() === "E";
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
      if (rawValue && typeof rawValue === "object" && !Array.isArray(rawValue)) {
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

function patchSmartContextEnabledBySessionAgent(map, sessionId, agentId, enabled) {
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

export default function ChatDesktopPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [sessions, setSessions] = useState(DEFAULT_SESSIONS);
  const [sessionMessages, setSessionMessages] = useState(DEFAULT_SESSION_MESSAGES);

  const [activeId, setActiveId] = useState("s1");
  const [agent, setAgent] = useState("A");
  const [agentRuntimeConfigs, setAgentRuntimeConfigs] = useState(
    createDefaultAgentRuntimeConfigMap(),
  );
  const [agentProviderDefaults, setAgentProviderDefaults] = useState(
    sanitizeAgentProviderDefaults(DEFAULT_AGENT_PROVIDER_MAP),
  );
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [apiTemperature, setApiTemperature] = useState("0.6");
  const [apiTopP, setApiTopP] = useState("1");
  const [apiReasoningEffort, setApiReasoningEffort] = useState("high");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [stateSaveError, setStateSaveError] = useState("");
  const [lastAppliedReasoning, setLastAppliedReasoning] = useState("high");
  const [smartContextEnabledBySessionAgent, setSmartContextEnabledBySessionAgent] = useState({});
  const [selectedAskText, setSelectedAskText] = useState("");
  const [focusUserMessageId, setFocusUserMessageId] = useState("");
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [pendingExportKind, setPendingExportKind] = useState("");
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [forceUserInfoModal, setForceUserInfoModal] = useState(false);
  const [userInfo, setUserInfo] = useState(DEFAULT_USER_INFO);
  const [userInfoErrors, setUserInfoErrors] = useState({});
  const [userInfoSaving, setUserInfoSaving] = useState(false);
  const [sidebarVisible, setSidebarVisible] = useState(readInitialSidebarVisible);
  const [isMobileViewport, setIsMobileViewport] = useState(detectMobileViewport);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [dismissedRoundWarningBySession, setDismissedRoundWarningBySession] = useState({});

  const messageListRef = useRef(null);
  const exportWrapRef = useRef(null);
  const streamTargetRef = useRef({ sessionId: "", assistantId: "", mode: "draft" });
  const streamBufferRef = useRef({
    content: "",
    reasoning: "",
    firstTextAt: "",
  });
  const streamFlushTimerRef = useRef(null);
  const streamReasoningEnabledRef = useRef(true);
  const metaSaveTimerRef = useRef(null);
  const messageSaveTimerRef = useRef(null);
  const persistReadyRef = useRef(false);
  const pendingMetaSaveRef = useRef(false);
  const messageUpsertQueueRef = useRef(new Map());
  const messageUpsertRevisionRef = useRef(new Map());

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeId) || null,
    [sessions, activeId],
  );
  const messages = useMemo(
    () => sessionMessages[activeId] || [],
    [sessionMessages, activeId],
  );
  const roundCount = useMemo(
    () => messages.filter((m) => m.role === "user").length,
    [messages],
  );
  const hasAtLeastOneSession = sessions.length > 0;
  const canUseMessageInput = hasAtLeastOneSession && !!activeSession;
  const roundWarningDismissed = !!dismissedRoundWarningBySession[activeId];
  const userInfoComplete = useMemo(() => isUserInfoComplete(userInfo), [userInfo]);
  const interactionLocked = bootstrapLoading || forceUserInfoModal || userInfoSaving;
  const activeAgent = useMemo(() => AGENT_META[agent] || AGENT_META.A, [agent]);
  const activeRuntimeConfig = useMemo(
    () => resolveRuntimeConfigForAgent(agent, agentRuntimeConfigs),
    [agentRuntimeConfigs, agent],
  );
  const activeProvider = useMemo(
    () => resolveAgentProvider(agent, activeRuntimeConfig, agentProviderDefaults),
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
  const effectiveSmartContextEnabled = smartContextSupported && smartContextEnabled;
  const smartContextToggleDisabled =
    isStreaming || interactionLocked || !smartContextSupported;
  const smartContextInfoTitle = smartContextSupported
    ? "开启后将锁定当前智能体进行对话，不得切换智能体"
    : "仅火山引擎智能体支持智能上下文管理，当前智能体已默认关闭";
  const agentSwitchLocked = effectiveSmartContextEnabled;
  const makeRuntimeSnapshot = (agentId = agent) => {
    const runtime = resolveRuntimeConfigForAgent(agentId, agentRuntimeConfigs);
    return createRuntimeSnapshot({
      agentId,
      agentMeta: AGENT_META,
      apiTemperature: runtime?.temperature ?? DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
      apiTopP: runtime?.topP ?? DEFAULT_AGENT_RUNTIME_CONFIG.topP,
      enableThinking:
        runtime?.enableThinking ?? DEFAULT_AGENT_RUNTIME_CONFIG.enableThinking,
    });
  };

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
    const next = createNewSessionRecord();
    setSessions((prev) => [next.session, ...prev]);
    setSessionMessages((prev) => ({ ...prev, [next.session.id]: next.messages }));
    if (next.messages[0]) {
      queueMessageUpsert(next.session.id, next.messages[0]);
    }
    setActiveId(next.session.id);
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
    navigate("/image-generation", {
      state: {
        returnContext: context,
      },
    });
  }

  function onOpenGroupChat() {
    navigate("/party");
  }

  function onDeleteSession(sessionId) {
    setSessions((prev) => {
      const next = prev.filter((s) => s.id !== sessionId);

      if (sessionId === activeId) {
        if (next.length > 0) {
          setActiveId(next[0].id);
        } else {
          setActiveId("");
        }
      }

      return next;
    });

    setSessionMessages((prev) => {
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setDismissedRoundWarningBySession((prev) => {
      if (!prev[sessionId]) return prev;
      const next = { ...prev };
      delete next[sessionId];
      return next;
    });
    setSmartContextEnabledBySessionAgent((prev) =>
      removeSmartContextBySessions(prev, new Set([sessionId])),
    );
    clearStreamDraft(sessionId);
    clearSessionMessageQueue(sessionId);

    if (sessionId === activeId) {
      setSelectedAskText("");
    }
  }

  function onAgentChange(nextAgent) {
    if (agentSwitchLocked) return;
    setAgent(nextAgent);
  }

  function onBatchDeleteSessions(sessionIds) {
    const remove = new Set(sessionIds);

    setSessions((prev) => {
      const next = prev.filter((s) => !remove.has(s.id));

      if (remove.has(activeId)) {
        if (next.length > 0) {
          setActiveId(next[0].id);
        } else {
          setActiveId("");
        }
      }

      return next;
    });

    setSessionMessages((prev) => {
      const next = { ...prev };
      sessionIds.forEach((id) => delete next[id]);
      return next;
    });
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
    setSmartContextEnabledBySessionAgent((prev) =>
      removeSmartContextBySessions(prev, remove),
    );
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
    const nextEnabled = !!enabled;
    setSmartContextEnabledBySessionAgent((prev) =>
      patchSmartContextEnabledBySessionAgent(prev, activeId, agent, nextEnabled),
    );
    if (!nextEnabled) {
      void clearSmartContextReferenceBySession(activeId);
    }
  }

  function onMoveSessionToGroup(sessionId, groupId) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, groupId: groupId || null };
      }),
    );
  }

  function onBatchMoveSessionsToGroup(sessionIds, groupId) {
    const selected = new Set(sessionIds);

    setSessions((prev) =>
      prev.map((s) => {
        if (!selected.has(s.id)) return s;
        return { ...s, groupId: groupId || null };
      }),
    );
  }

  function onRenameSession(sessionId, title) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, title };
      }),
    );
  }

  function onToggleSessionPin(sessionId) {
    setSessions((prev) =>
      prev.map((s) => {
        if (s.id !== sessionId) return s;
        return { ...s, pinned: !s.pinned };
      }),
    );
  }

  function onCreateGroup(payload) {
    const item = {
      id: `g${Date.now()}`,
      name: payload.name,
      description: payload.description,
    };

    setGroups((prev) => [item, ...prev]);
  }

  function onDeleteGroup(groupId) {
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

    if (target.mode === "message") {
      patchAssistantMessage(target.sessionId, target.assistantId, (message) => ({
        ...message,
        content: (message.content || "") + content,
        reasoning: (message.reasoning || "") + reasoning,
        firstTextAt: message.firstTextAt || firstTextAt || null,
      }));
    } else {
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
    { useVolcengineResponsesFileRefs = false } = {},
  ) {
    return list
      .map((m) => {
        const content = buildApiMessageContentFromMessage(
          m,
          useVolcengineResponsesFileRefs,
        );
        return {
          id: String(m?.id || ""),
          role: m.role,
          content,
        };
      })
      .filter((m) => {
        if (m.role === "user") return true;
        if (typeof m.content === "string") return m.content.trim().length > 0;
        return Array.isArray(m.content) && m.content.length > 0;
      });
  }

  function buildApiMessageContentFromMessage(message, useVolcengineResponsesFileRefs) {
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
    const provider = String(runtimeConfig?.provider || "")
      .trim()
      .toLowerCase();
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
    if (mime.startsWith("video/") || VIDEO_EXTENSIONS.has(ext)) return "input_video";
    return "";
  }

  async function onPrepareFiles(pickedFiles) {
    const safePicked = Array.isArray(pickedFiles) ? pickedFiles.filter(Boolean) : [];
    if (safePicked.length === 0) return [];

    const runtimeConfig = resolveRuntimeConfigForAgent(agent, agentRuntimeConfigs);
    if (!shouldUseVolcengineFilesApi(runtimeConfig)) {
      return safePicked.map((file) => ({
        kind: "local",
        file,
        name: String(file?.name || ""),
        size: Number(file?.size || 0),
        type: String(file?.type || ""),
      }));
    }

    const indexedPicked = safePicked.map((file, index) => ({
      index,
      file,
      inputType: classifyVolcengineFilesApiType(file),
    }));
    const remoteCandidates = indexedPicked.filter((item) => !!item.inputType);
    const localCandidates = indexedPicked.filter((item) => !item.inputType);
    const localItems = localCandidates.map((item) => ({
      index: item.index,
      kind: "local",
      file: item.file,
      name: String(item.file?.name || ""),
      size: Number(item.file?.size || 0),
      type: String(item.file?.type || ""),
    }));

    if (remoteCandidates.length === 0) {
      return localItems.sort((a, b) => a.index - b.index);
    }

    const uploadResult = await uploadVolcengineChatFiles({
      agentId: agent,
      files: remoteCandidates.map((item) => item.file),
    });
    const remoteRefs = Array.isArray(uploadResult?.files) ? uploadResult.files : [];
    if (remoteRefs.length !== remoteCandidates.length) {
      throw new Error("文件上传结果异常，请重试。");
    }

    const remoteItems = remoteRefs.map((ref, idx) => ({
      index: remoteCandidates[idx].index,
      kind: "volc_ref",
      // Keep the original File for local preview in composer.
      file: remoteCandidates[idx].file,
      name: String(remoteCandidates[idx].file?.name || ref?.name || ""),
      size: Number(ref?.size || remoteCandidates[idx].file?.size || 0),
      type: String(ref?.mimeType || remoteCandidates[idx].file?.type || ""),
      mimeType: String(ref?.mimeType || remoteCandidates[idx].file?.type || ""),
      inputType: String(ref?.inputType || remoteCandidates[idx].inputType || ""),
      fileId: String(ref?.fileId || ""),
    }));

    return [...localItems, ...remoteItems]
      .sort((a, b) => a.index - b.index)
      .map((item) => {
        const nextItem = { ...item };
        delete nextItem.index;
        return nextItem;
      });
  }

  async function onSend(text, files) {
    if (!activeId || isStreaming || interactionLocked || !userInfoComplete) return;
    const runtimeConfig = resolveRuntimeConfigForAgent(agent, agentRuntimeConfigs);

    setStreamError("");
    const askedAt = new Date().toISOString();

    const fileItems = Array.isArray(files) ? files.filter(Boolean) : [];
    const localFiles = [];
    const volcengineFileRefs = [];
    const attachments = fileItems.map((item) => {
      if (item?.kind === "volc_ref") {
        const fileId = String(item?.fileId || "").trim();
        const inputType = String(item?.inputType || "").trim().toLowerCase();
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
        };
      }

      const rawFile = item?.kind === "local" ? item.file : item;
      if (rawFile instanceof File) {
        localFiles.push(rawFile);
        return {
          name: rawFile.name,
          size: rawFile.size,
          type: rawFile.type,
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
    const currentHistory = [
      ...(sessionMessages[currentSessionId] || []),
      userMsg,
    ];

    setSessionMessages((prev) => {
      const list = prev[currentSessionId] || [];
      return { ...prev, [currentSessionId]: [...list, userMsg] };
    });
    queueMessageUpsert(currentSessionId, userMsg);
    startStreamDraft(currentSessionId, assistantMsg);

    const historyForApi = toApiMessages(
      pickRecentRounds(currentHistory, runtimeConfig.contextRounds || CONTEXT_USER_ROUNDS),
      {
        useVolcengineResponsesFileRefs: shouldUseVolcengineFilesApi(runtimeConfig),
      },
    );

    const formData = new FormData();
    const streamEndpoint = agent === "E" ? "/api/chat/stream-e" : "/api/chat/stream";
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append("smartContextEnabled", String(effectiveSmartContextEnabled));
    formData.append("contextMode", "append");
    formData.append("messages", JSON.stringify(historyForApi));

    localFiles.forEach((f) => formData.append("files", f));
    if (volcengineFileRefs.length > 0) {
      formData.append("volcengineFileRefs", JSON.stringify(volcengineFileRefs));
    }

    setFocusUserMessageId("");
    setIsAtLatest(true);
    requestAnimationFrame(() => {
      scrollToLatestRound(220);
    });
    setIsStreaming(true);
    streamReasoningEnabledRef.current = !!runtimeConfig.enableThinking;
    streamTargetRef.current = { sessionId: currentSessionId, assistantId, mode: "draft" };
    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };

    try {
      const resp = await fetch(streamEndpoint, {
        method: "POST",
        headers: {
          ...getAuthTokenHeader(),
        },
        body: formData,
      });

      if (!resp.ok || !resp.body) {
        const errText = await readErrorMessage(resp);
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      await readSseStream(resp, {
        onMeta: (meta) => {
          const enabled = !!meta?.reasoningEnabled;
          const applied = meta?.reasoningApplied || "none";
          streamReasoningEnabledRef.current = enabled;
          setLastAppliedReasoning(applied);
          updateAssistantRuntimeFromMeta(currentSessionId, assistantId, meta);
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
    } finally {
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      flushStreamBuffer();
      const completed = getStreamDraft(currentSessionId);
      clearStreamDraft(currentSessionId);
      if (completed && completed.id === assistantId) {
        const completedMsg = { ...completed, streaming: false };
        setSessionMessages((prev) => {
          const list = prev[currentSessionId] || [];
          return {
            ...prev,
            [currentSessionId]: [...list, completedMsg],
          };
        });
        queueMessageUpsert(currentSessionId, completedMsg);
      }
      streamTargetRef.current = { sessionId: "", assistantId: "", mode: "draft" };
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
    if (!activeId || isStreaming || !promptMessageId || interactionLocked || !userInfoComplete) {
      return;
    }
    const runtimeConfig = resolveRuntimeConfigForAgent(agent, agentRuntimeConfigs);

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
      pickRecentRounds(
        list.slice(0, promptIndex + 1),
        runtimeConfig.contextRounds || CONTEXT_USER_ROUNDS,
      ),
      {
        useVolcengineResponsesFileRefs: shouldUseVolcengineFilesApi(runtimeConfig),
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

    patchAssistantMessage(
      currentSessionId,
      assistantIdToRegenerate,
      () => regeneratingAssistant,
    );

    const formData = new FormData();
    const streamEndpoint = agent === "E" ? "/api/chat/stream-e" : "/api/chat/stream";
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append("smartContextEnabled", String(effectiveSmartContextEnabled));
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

    try {
      const resp = await fetch(streamEndpoint, {
        method: "POST",
        headers: {
          ...getAuthTokenHeader(),
        },
        body: formData,
      });

      if (!resp.ok || !resp.body) {
        const errText = await readErrorMessage(resp);
        throw new Error(errText || `HTTP ${resp.status}`);
      }

      await readSseStream(resp, {
        onMeta: (meta) => {
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
      const msg = error?.message || "请求失败";
      setStreamError(msg);
      flushStreamBuffer();
      patchAssistantMessage(currentSessionId, assistantIdToRegenerate, (message) => ({
        ...message,
        content: `${message.content || ""}\n\n> 请求失败：${msg}`,
      }));
    } finally {
      if (streamFlushTimerRef.current) {
        clearTimeout(streamFlushTimerRef.current);
        streamFlushTimerRef.current = null;
      }
      flushStreamBuffer();
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
      streamTargetRef.current = { sessionId: "", assistantId: "", mode: "draft" };
      setIsStreaming(false);
    }
  }

  function onAskSelection(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    setSelectedAskText(trimmed);
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
    localStorage.removeItem("token");
    localStorage.removeItem("auth_user");
    navigate("/login", { replace: true });
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

  useEffect(
    () => () => {
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
      pendingMetaSaveRef.current = false;
      messageUpsertQueueRef.current.clear();
      messageUpsertRevisionRef.current.clear();
    },
    [],
  );

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      setBootstrapLoading(true);
      setBootstrapError("");
      try {
        const data = await fetchChatBootstrap();
        if (cancelled) return;

        const state = data?.state || {};
        const nextGroups =
          Array.isArray(state.groups) && state.groups.length > 0
            ? state.groups
            : DEFAULT_GROUPS;
        const nextSessions =
          Array.isArray(state.sessions) && state.sessions.length > 0
            ? state.sessions
            : DEFAULT_SESSIONS;
        const nextSessionMessages =
          state.sessionMessages && typeof state.sessionMessages === "object"
            ? state.sessionMessages
            : DEFAULT_SESSION_MESSAGES;
        const rawActiveId = String(state.activeId || nextSessions[0]?.id || "s1");
        const stateSettings =
          state.settings && typeof state.settings === "object" ? state.settings : {};
        const nextRuntimeConfigs = sanitizeRuntimeConfigMap(data?.agentRuntimeConfigs);
        const nextProviderDefaults = sanitizeAgentProviderDefaults(data?.agentProviderDefaults);
        const restoreContext = location.state?.fromImageGeneration
          ? normalizeImageReturnContext(
              location.state?.restoreContext || loadImageReturnContext(),
            )
          : null;

        let nextAgent = AGENT_META[stateSettings.agent] ? stateSettings.agent : "A";
        if (restoreContext?.agentId && AGENT_META[restoreContext.agentId]) {
          nextAgent = restoreContext.agentId;
        }
        const nextRuntime = nextRuntimeConfigs[nextAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
        const nextApiTemperature = String(normalizeTemperature(nextRuntime.temperature));
        const nextApiTopP = String(normalizeTopP(nextRuntime.topP));
        const nextApiReasoning = nextRuntime.enableThinking ? "high" : "none";
        const nextAppliedReasoning = normalizeReasoningEffort(
          stateSettings.lastAppliedReasoning ?? "high",
        );
        const nextProvider = resolveAgentProvider(
          nextAgent,
          nextRuntime,
          nextProviderDefaults,
        );
        const nextSmartContextEnabledMap = sanitizeSmartContextEnabledMap(
          stateSettings.smartContextEnabledBySessionAgent,
        );

        let resolvedSessions = nextSessions;
        let resolvedMessages = nextSessionMessages;
        let resolvedActiveId = rawActiveId;

        if (!resolvedSessions.some((s) => s.id === resolvedActiveId)) {
          resolvedActiveId = resolvedSessions[0]?.id || "s1";
        }
        if (
          restoreContext?.sessionId &&
          resolvedSessions.some((s) => s.id === restoreContext.sessionId)
        ) {
          resolvedActiveId = restoreContext.sessionId;
        }

        if (stateSettings.smartContextEnabled && nextProvider === "volcengine") {
          const legacyKey = buildSmartContextKey(resolvedActiveId, nextAgent);
          if (
            legacyKey &&
            !Object.prototype.hasOwnProperty.call(nextSmartContextEnabledMap, legacyKey)
          ) {
            nextSmartContextEnabledMap[legacyKey] = true;
          }
        }

        setGroups(nextGroups);
        setSessions(resolvedSessions);
        setSessionMessages(resolvedMessages);
        setActiveId(resolvedActiveId);
        setAgent(nextAgent);
        setAgentRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setApiTemperature(nextApiTemperature);
        setApiTopP(nextApiTopP);
        setApiReasoningEffort(nextApiReasoning);
        setLastAppliedReasoning(nextAppliedReasoning);
        setSmartContextEnabledBySessionAgent(nextSmartContextEnabledMap);

        const profile = sanitizeUserInfo(data?.profile);
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
          localStorage.removeItem("token");
          localStorage.removeItem("auth_user");
          navigate("/login", { replace: true });
          return;
        }
        persistReadyRef.current = true;
      } finally {
        if (!cancelled) {
          setBootstrapLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [navigate, location.state]);

  useEffect(() => {
    setApiTemperature(String(normalizeTemperature(activeRuntimeConfig.temperature)));
    setApiTopP(String(normalizeTopP(activeRuntimeConfig.topP)));
    setApiReasoningEffort(activeRuntimeConfig.enableThinking ? "high" : "none");
  }, [activeRuntimeConfig]);

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
        await saveChatStateMeta({
          activeId,
          groups,
          sessions,
          settings: {
            agent,
            apiTemperature: normalizeTemperature(apiTemperature),
            apiTopP: normalizeTopP(apiTopP),
            apiReasoningEffort: normalizeReasoningEffort(apiReasoningEffort),
            lastAppliedReasoning: normalizeReasoningEffort(lastAppliedReasoning),
            smartContextEnabled: effectiveSmartContextEnabled,
            smartContextEnabledBySessionAgent: sanitizeSmartContextEnabledMap(
              smartContextEnabledBySessionAgent,
            ),
          },
        });
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
          const currentRevision = messageUpsertRevisionRef.current.get(key) || 0;
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

  useEffect(() => {
    function onWindowResize() {
      setIsMobileViewport(detectMobileViewport());
    }

    onWindowResize();
    window.addEventListener("resize", onWindowResize);
    return () => window.removeEventListener("resize", onWindowResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(
        SIDEBAR_VISIBILITY_STORAGE_KEY,
        sidebarVisible ? "1" : "0",
      );
    } catch {
      // Ignore localStorage errors.
    }
  }, [sidebarVisible]);

  useEffect(() => {
    if (!isMobileViewport || !sidebarVisible) return undefined;

    function onKeyDown(e) {
      if (e.key === "Escape") {
        setSidebarVisible(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [isMobileViewport, sidebarVisible]);

  const chatLayoutClassName = `chat-layout${sidebarVisible ? "" : " sidebar-hidden"}${
    isMobileViewport && sidebarVisible ? " sidebar-mobile-open" : ""
  }`;

  return (
    <div className={chatLayoutClassName}>
      <Sidebar
        sessions={sessions}
        groups={groups}
        activeId={activeId}
        onSelect={(sessionId) => {
          setActiveId(sessionId);
          if (isMobileViewport) {
            setSidebarVisible(false);
          }
        }}
        onNewChat={() => {
          onNewChat();
          if (isMobileViewport) {
            setSidebarVisible(false);
          }
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
        onDeleteGroup={onDeleteGroup}
        hasUserInfo={userInfoComplete}
        onOpenUserInfoModal={() => openUserInfoModal(false)}
      />
      {isMobileViewport && sidebarVisible ? (
        <button
          type="button"
          className="sidebar-backdrop"
          onClick={() => setSidebarVisible(false)}
          aria-label="关闭侧边栏"
        />
      ) : null}

      <div className="chat-main">
        <div className="chat-topbar">
          <div className="chat-topbar-left">
            <button
              type="button"
              className="chat-sidebar-toggle"
              onClick={() => setSidebarVisible((prev) => !prev)}
              aria-label={sidebarVisible ? "隐藏侧边栏" : "展开侧边栏"}
              title={sidebarVisible ? "隐藏侧边栏" : "展开侧边栏"}
            >
              <Menu size={16} aria-hidden="true" />
            </button>
            <AgentSelect
              key={agentSwitchLocked ? "agent-locked" : "agent-unlocked"}
              value={agent}
              onChange={onAgentChange}
              disabled={agentSwitchLocked}
              disabledTitle="开启智能上下文管理后，需先关闭开关才能切换智能体。"
            />
            <div
              className={`smart-context-control${!smartContextSupported ? " is-disabled" : ""}`}
            >
              <label className="smart-context-switch" htmlFor="smart-context-toggle">
                <input
                  id="smart-context-toggle"
                  type="checkbox"
                  checked={effectiveSmartContextEnabled}
                  onChange={(e) => onToggleSmartContext(e.target.checked)}
                  disabled={smartContextToggleDisabled}
                />
                <span className="smart-context-slider" aria-hidden="true" />
                <span className="smart-context-label">智能上下文管理</span>
              </label>
              <span
                className="smart-context-info"
                title={smartContextInfoTitle}
                aria-label={smartContextInfoTitle}
              >
                <Info size={14} />
              </span>
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
              aria-label="退出登录"
              title="退出登录"
            >
              <span className="chat-logout-tip">退出登录</span>
              <LogOut size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {(streamError || stateSaveError || bootstrapError) && (
          <div className="stream-error">
            <span>{[streamError, stateSaveError, bootstrapError].filter(Boolean).join(" | ")}</span>
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

        <MessageList
          ref={messageListRef}
          activeSessionId={activeId}
          messages={messages}
          isStreaming={isStreaming}
          focusMessageId={focusUserMessageId}
          onAssistantFeedback={onAssistantFeedback}
          onAssistantRegenerate={onAssistantRegenerate}
          onAskSelection={onAskSelection}
          onLatestChange={setIsAtLatest}
        />

        <div className="chat-input-wrap">
          {roundCount >= CHAT_ROUND_WARNING_THRESHOLD && !roundWarningDismissed && (
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
                onClick={scrollToLatestRound}
                aria-label="跳转到最新消息"
                title="跳转到最新消息"
              >
                跳转到最新消息
              </button>
            </div>
          )}

          <MessageInput
            onSend={onSend}
            onPrepareFiles={onPrepareFiles}
            disabled={isStreaming || interactionLocked || !canUseMessageInput}
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
          userInfoSaving
            ? "保存中…"
            : pendingExportKind
              ? "保存并导出"
              : "保存"
        }
        showCancel={!forceUserInfoModal && !userInfoSaving}
        lockOverlayClose={forceUserInfoModal || userInfoSaving}
        dialogLabel={forceUserInfoModal ? "首次填写用户信息" : "编辑用户信息"}
      />
    </div>
  );
}
