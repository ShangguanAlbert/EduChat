import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "../components/Sidebar.jsx";
import AgentSelect from "../components/AgentSelect.jsx";
import MessageList from "../components/MessageList.jsx";
import MessageInput from "../components/MessageInput.jsx";
import ExportUserInfoModal from "../components/chat/ExportUserInfoModal.jsx";
import {
  AGENT_META,
  CHAT_ROUND_WARNING_THRESHOLD,
  DEFAULT_USER_INFO,
  GENDER_OPTIONS,
  GRADE_OPTIONS,
} from "./chat/constants.js";
import {
  createRuntimeSnapshot,
  mergeRuntimeWithMeta,
  normalizeReasoningEffort,
  normalizeTemperature,
  normalizeTopP,
  readErrorMessage,
  readSseStream,
} from "./chat/chatHelpers.js";
import {
  buildExportMeta,
  formatMarkdownExport,
  formatTxtExport,
  getSafeFileBaseName,
} from "./chat/exportHelpers.js";
import {
  isUserInfoComplete,
  sanitizeUserInfo,
  validateUserInfo,
} from "./chat/userInfo.js";
import {
  clearManyStreamDrafts,
  clearStreamDraft,
  getStreamDraft,
  startStreamDraft,
  updateStreamDraft,
} from "./chat/streamDraftStore.js";
import {
  fetchChatBootstrap,
  getAuthTokenHeader,
  saveChatSessionMessages,
  saveChatStateMeta,
  saveUserProfile,
} from "./chat/stateApi.js";
import "../styles/chat.css";

const DEFAULT_GROUPS = [{ id: "g1", name: "新组", description: "" }];
const DEFAULT_SESSIONS = [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }];
const DEFAULT_SESSION_MESSAGES = {
  s1: [
    {
      id: "m1",
      role: "assistant",
      content: "你好，今天做点啥？",
      firstTextAt: new Date().toISOString(),
    },
  ],
};
const CONTEXT_USER_ROUNDS = 10;
const LOGIN_BOOTSTRAP_FLAG = "educhat_just_logged_in";

function createWelcomeMessage() {
  return {
    id: `m${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    role: "assistant",
    content: "你好，今天做点啥？",
    firstTextAt: new Date().toISOString(),
  };
}

function createNewSessionRecord() {
  const id = `s${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return {
    session: { id, title: "新对话", groupId: null, pinned: false },
    messages: [createWelcomeMessage()],
  };
}

function hasUserTurn(messages) {
  if (!Array.isArray(messages)) return false;
  return messages.some((m) => {
    if (m?.role !== "user") return false;
    const hasText = String(m?.content || "").trim().length > 0;
    const hasAttachments = Array.isArray(m?.attachments) && m.attachments.length > 0;
    return hasText || hasAttachments;
  });
}

export default function ChatPage() {
  const navigate = useNavigate();
  const [groups, setGroups] = useState(DEFAULT_GROUPS);
  const [sessions, setSessions] = useState(DEFAULT_SESSIONS);
  const [sessionMessages, setSessionMessages] = useState(DEFAULT_SESSION_MESSAGES);

  const [activeId, setActiveId] = useState("s1");
  const [agent, setAgent] = useState("A");
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [showApiSettings, setShowApiSettings] = useState(false);
  const [apiTemperature, setApiTemperature] = useState("0.6");
  const [apiTopP, setApiTopP] = useState("1");
  const [apiReasoningEffort, setApiReasoningEffort] = useState("low");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [stateSaveError, setStateSaveError] = useState("");
  const [lastAppliedReasoning, setLastAppliedReasoning] = useState("low");
  const [selectedAskText, setSelectedAskText] = useState("");
  const [focusUserMessageId, setFocusUserMessageId] = useState("");
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [pendingExportKind, setPendingExportKind] = useState("");
  const [showUserInfoModal, setShowUserInfoModal] = useState(false);
  const [forceUserInfoModal, setForceUserInfoModal] = useState(false);
  const [userInfo, setUserInfo] = useState(DEFAULT_USER_INFO);
  const [userInfoErrors, setUserInfoErrors] = useState({});
  const [userInfoSaving, setUserInfoSaving] = useState(false);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");

  const messageListRef = useRef(null);
  const exportWrapRef = useRef(null);
  const streamTargetRef = useRef({ sessionId: "", assistantId: "" });
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
  const userInfoComplete = useMemo(() => isUserInfoComplete(userInfo), [userInfo]);
  const interactionLocked = bootstrapLoading || forceUserInfoModal || userInfoSaving;
  const activeAgent = useMemo(() => AGENT_META[agent] || AGENT_META.A, [agent]);
  const makeRuntimeSnapshot = (agentId = agent) =>
    createRuntimeSnapshot({
      agentId,
      agentMeta: AGENT_META,
      apiTemperature,
      apiTopP,
      apiReasoningEffort,
    });

  function updateAssistantRuntimeFromMeta(sessionId, assistantId, meta) {
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
    clearStreamDraft(sessionId);
    clearSessionMessageQueue(sessionId);

    if (sessionId === activeId) {
      setSelectedAskText("");
    }
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
    clearManyStreamDrafts(sessionIds);
    sessionIds.forEach((id) => clearSessionMessageQueue(id));
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

    updateStreamDraft(target.sessionId, (draft) => {
      if (!draft || draft.id !== target.assistantId) return draft;
      return {
        ...draft,
        content: (draft.content || "") + content,
        reasoning: (draft.reasoning || "") + reasoning,
        firstTextAt: draft.firstTextAt || firstTextAt || null,
      };
    });

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

  function toApiMessages(list) {
    return list
      .map((m) => ({ role: m.role, content: m.content || "" }))
      .filter((m) => m.content.trim().length > 0);
  }

  async function onSend(text, files) {
    if (!activeId || isStreaming || interactionLocked || !userInfoComplete) return;

    setStreamError("");
    const askedAt = new Date().toISOString();

    const attachments = (files || []).map((f) => ({
      name: f.name,
      size: f.size,
      type: f.type,
    }));

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
      pickRecentRounds(currentHistory, CONTEXT_USER_ROUNDS),
    );

    const formData = new FormData();
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(apiTemperature)),
    );
    formData.append("topP", String(normalizeTopP(apiTopP)));
    formData.append("reasoningEffort", apiReasoningEffort);
    formData.append("messages", JSON.stringify(historyForApi));

    (files || []).forEach((f) => formData.append("files", f));

    setFocusUserMessageId(userMsg.id);
    setIsStreaming(true);
    streamReasoningEnabledRef.current = apiReasoningEffort !== "none";
    streamTargetRef.current = { sessionId: currentSessionId, assistantId };
    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };

    try {
      const resp = await fetch("/api/chat/stream", {
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
      streamTargetRef.current = { sessionId: "", assistantId: "" };
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

    const currentSessionId = activeId;
    const list = sessionMessages[currentSessionId] || [];
    const promptIndex = list.findIndex(
      (m) => m.id === promptMessageId && m.role === "user",
    );
    if (promptIndex === -1) return;

    const promptMsg = list[promptIndex];
    const historyForApi = toApiMessages(
      pickRecentRounds(list.slice(0, promptIndex + 1), CONTEXT_USER_ROUNDS),
    );

    const newAssistantId = `a${Date.now()}-regen`;
    const assistantMsg = {
      id: newAssistantId,
      role: "assistant",
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

    startStreamDraft(currentSessionId, assistantMsg);

    const formData = new FormData();
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(apiTemperature)),
    );
    formData.append("topP", String(normalizeTopP(apiTopP)));
    formData.append("reasoningEffort", apiReasoningEffort);
    formData.append("messages", JSON.stringify(historyForApi));

    setFocusUserMessageId(promptMessageId);
    setIsStreaming(true);
    streamReasoningEnabledRef.current = apiReasoningEffort !== "none";
    streamTargetRef.current = {
      sessionId: currentSessionId,
      assistantId: newAssistantId,
    };
    streamBufferRef.current = { content: "", reasoning: "", firstTextAt: "" };

    try {
      const resp = await fetch("/api/chat/stream", {
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
            newAssistantId,
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
      updateStreamDraft(currentSessionId, (draft) => {
        if (!draft || draft.id !== newAssistantId) return draft;
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
      if (completed && completed.id === newAssistantId) {
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
      streamTargetRef.current = { sessionId: "", assistantId: "" };
      setIsStreaming(false);
    }
  }

  function onAskSelection(text) {
    const trimmed = String(text || "").trim();
    if (!trimmed) return;
    setSelectedAskText(trimmed);
  }

  function scrollToLatestRound() {
    messageListRef.current?.scrollToLatest?.();
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
      apiTemperature,
      apiTopP,
      apiReasoningEffort,
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
        const nextAgent = AGENT_META[stateSettings.agent] ? stateSettings.agent : "A";
        const nextApiTemperature = String(
          normalizeTemperature(stateSettings.apiTemperature ?? 0.6),
        );
        const nextApiTopP = String(normalizeTopP(stateSettings.apiTopP ?? 1));
        const nextApiReasoning = normalizeReasoningEffort(
          stateSettings.apiReasoningEffort ?? "low",
        );
        const nextAppliedReasoning = normalizeReasoningEffort(
          stateSettings.lastAppliedReasoning ?? "low",
        );

        let resolvedSessions = nextSessions;
        let resolvedMessages = nextSessionMessages;
        let resolvedActiveId = rawActiveId;
        let freshSessionId = "";

        const justLoggedIn = sessionStorage.getItem(LOGIN_BOOTSTRAP_FLAG) === "1";
        if (justLoggedIn) {
          sessionStorage.removeItem(LOGIN_BOOTSTRAP_FLAG);
          const activeMessages = resolvedMessages[resolvedActiveId] || [];
          if (hasUserTurn(activeMessages)) {
            const fresh = createNewSessionRecord();
            resolvedSessions = [fresh.session, ...resolvedSessions];
            resolvedMessages = {
              ...resolvedMessages,
              [fresh.session.id]: fresh.messages,
            };
            resolvedActiveId = fresh.session.id;
            freshSessionId = fresh.session.id;
          }
        }

        if (!resolvedSessions.some((s) => s.id === resolvedActiveId)) {
          resolvedActiveId = resolvedSessions[0]?.id || "s1";
        }

        setGroups(nextGroups);
        setSessions(resolvedSessions);
        setSessionMessages(resolvedMessages);
        setActiveId(resolvedActiveId);
        setAgent(nextAgent);
        setApiTemperature(nextApiTemperature);
        setApiTopP(nextApiTopP);
        setApiReasoningEffort(nextApiReasoning);
        setLastAppliedReasoning(nextAppliedReasoning);
        if (freshSessionId) {
          const welcome = resolvedMessages[freshSessionId]?.[0];
          if (welcome) queueMessageUpsert(freshSessionId, welcome);
        }

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
  }, [navigate]);

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

  return (
    <div className="chat-layout">
      <Sidebar
        sessions={sessions}
        groups={groups}
        activeId={activeId}
        onSelect={setActiveId}
        onNewChat={onNewChat}
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

      <div className="chat-main">
        <div className="chat-topbar">
          <AgentSelect
            value={agent}
            onChange={setAgent}
            onOpenApiSettings={() => setShowApiSettings(true)}
          />
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
            <span className="chat-status">
              {isStreaming
                ? `流式生成中 · ${activeAgent.name}`
                : `${activeAgent.name} · 模型温度 : ${normalizeTemperature(apiTemperature)} · 推理 : ${apiReasoningEffort}`}
            </span>
          </div>
        </div>

        {(streamError || stateSaveError || bootstrapError) && (
          <div className="stream-error">
            {[streamError, stateSaveError, bootstrapError].filter(Boolean).join(" | ")}
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
          {roundCount >= CHAT_ROUND_WARNING_THRESHOLD && (
            <div className="chat-round-warning" role="status">
              继续当前对话可能导致页面卡顿，请新建一个对话。
            </div>
          )}

          {!isAtLatest && (
            <div className="chat-scroll-latest-row">
              <button
                type="button"
                className="chat-scroll-latest-btn"
                onClick={scrollToLatestRound}
                aria-label="滚动到最新"
                title="滚动到最新"
              >
                <span className="chat-scroll-latest-tip">滚动到最新</span>
                <span className="chat-scroll-latest-arrow" aria-hidden="true">
                  ↓
                </span>
              </button>
            </div>
          )}

          <MessageInput
            onSend={onSend}
            disabled={isStreaming || interactionLocked}
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

      {showApiSettings && (
        <div
          className="modal-overlay"
          role="presentation"
          onClick={() => setShowApiSettings(false)}
        >
          <div
            className="group-modal api-settings-modal"
            role="dialog"
            aria-modal="true"
            aria-label="API 设置"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="group-modal-title">API 参数设置</h3>
            <div className="group-modal-form">
              <label className="group-modal-label" htmlFor="temperature-input">
                Temperature（0 - 2）
              </label>
              <input
                id="temperature-input"
                className="group-modal-input"
                type="number"
                min="0"
                max="2"
                step="0.1"
                value={apiTemperature}
                onChange={(e) => setApiTemperature(e.target.value)}
              />

              <label className="group-modal-label" htmlFor="topp-input">
                Top-p（0 - 1）
              </label>
              <input
                id="topp-input"
                className="group-modal-input"
                type="number"
                min="0"
                max="1"
                step="0.05"
                value={apiTopP}
                onChange={(e) => setApiTopP(e.target.value)}
              />

              <label className="group-modal-label" htmlFor="reasoning-select">
                Reasoning（推理强度）
              </label>
              <select
                id="reasoning-select"
                className="group-modal-input"
                value={apiReasoningEffort}
                onChange={(e) => setApiReasoningEffort(e.target.value)}
              >
                <option value="none">关闭</option>
                <option value="low">浮想</option>
                <option value="medium">斟酌</option>
                <option value="high">沉思</option>
              </select>

              <p className="api-setting-hint">
                默认值：Temperature = 0.6，Top-p = 1，Reasoning =
                low。若模型不支持推理会自动降级为 none。
              </p>

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={() => {
                    setApiTemperature("0.6");
                    setApiTopP("1");
                    setApiReasoningEffort("low");
                  }}
                >
                  恢复默认
                </button>
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-primary"
                  onClick={() => {
                    setApiTemperature(
                      String(normalizeTemperature(apiTemperature)),
                    );
                    setApiTopP(String(normalizeTopP(apiTopP)));
                    setApiReasoningEffort(
                      normalizeReasoningEffort(apiReasoningEffort),
                    );
                    setShowApiSettings(false);
                  }}
                >
                  保存
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
