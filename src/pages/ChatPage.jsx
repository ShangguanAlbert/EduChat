import { useEffect, useMemo, useRef, useState } from "react";
import { Info, LogOut } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
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
  DEFAULT_AGENT_RUNTIME_CONFIG,
  createDefaultAgentRuntimeConfigMap,
  sanitizeRuntimeConfigMap,
} from "./chat/agentRuntimeConfig.js";
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
  uploadVolcengineChatFiles,
} from "./chat/stateApi.js";
import {
  createNewSessionRecord,
  createWelcomeMessage,
} from "./chat/sessionFactory.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "./image/returnContext.js";
import "../styles/chat.css";

const DEFAULT_GROUPS = [{ id: "g1", name: "新组", description: "" }];
const DEFAULT_SESSIONS = [{ id: "s1", title: "新对话 1", groupId: null, pinned: false }];
const DEFAULT_SESSION_MESSAGES = {
  s1: [
    createWelcomeMessage(),
  ],
};
const CONTEXT_USER_ROUNDS = 10;
const VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);

export default function ChatPage() {
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
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [apiTemperature, setApiTemperature] = useState("0.6");
  const [apiTopP, setApiTopP] = useState("1");
  const [apiReasoningEffort, setApiReasoningEffort] = useState("high");
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState("");
  const [stateSaveError, setStateSaveError] = useState("");
  const [lastAppliedReasoning, setLastAppliedReasoning] = useState("high");
  const [smartContextEnabled, setSmartContextEnabled] = useState(false);
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
  const activeRuntimeConfig = useMemo(
    () => agentRuntimeConfigs[agent] || DEFAULT_AGENT_RUNTIME_CONFIG,
    [agentRuntimeConfigs, agent],
  );
  const agentSwitchLocked = smartContextEnabled;
  const makeRuntimeSnapshot = (agentId = agent) =>
    createRuntimeSnapshot({
      agentId,
      agentMeta: AGENT_META,
      apiTemperature:
        agentRuntimeConfigs[agentId]?.temperature ??
        DEFAULT_AGENT_RUNTIME_CONFIG.temperature,
      apiTopP: agentRuntimeConfigs[agentId]?.topP ?? DEFAULT_AGENT_RUNTIME_CONFIG.topP,
      enableThinking:
        agentRuntimeConfigs[agentId]?.enableThinking ??
        DEFAULT_AGENT_RUNTIME_CONFIG.enableThinking,
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

    const runtimeConfig = agentRuntimeConfigs[agent] || DEFAULT_AGENT_RUNTIME_CONFIG;
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
      name: String(ref?.name || remoteCandidates[idx].file?.name || ""),
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
    const runtimeConfig = agentRuntimeConfigs[agent] || DEFAULT_AGENT_RUNTIME_CONFIG;

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
    formData.append("agentId", agent);
    formData.append(
      "temperature",
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append("smartContextEnabled", String(smartContextEnabled));
    formData.append("contextMode", "append");
    formData.append("messages", JSON.stringify(historyForApi));

    localFiles.forEach((f) => formData.append("files", f));
    if (volcengineFileRefs.length > 0) {
      formData.append("volcengineFileRefs", JSON.stringify(volcengineFileRefs));
    }

    setFocusUserMessageId(userMsg.id);
    setIsStreaming(true);
    streamReasoningEnabledRef.current = !!runtimeConfig.enableThinking;
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
    const runtimeConfig = agentRuntimeConfigs[agent] || DEFAULT_AGENT_RUNTIME_CONFIG;

    const currentSessionId = activeId;
    const list = sessionMessages[currentSessionId] || [];
    const promptIndex = list.findIndex(
      (m) => m.id === promptMessageId && m.role === "user",
    );
    if (promptIndex === -1) return;

    const promptMsg = list[promptIndex];
    const historyForApi = toApiMessages(
      pickRecentRounds(
        list.slice(0, promptIndex + 1),
        runtimeConfig.contextRounds || CONTEXT_USER_ROUNDS,
      ),
      {
        useVolcengineResponsesFileRefs: shouldUseVolcengineFilesApi(runtimeConfig),
      },
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
      String(normalizeTemperature(runtimeConfig.temperature)),
    );
    formData.append("topP", String(normalizeTopP(runtimeConfig.topP)));
    formData.append("sessionId", currentSessionId);
    formData.append("smartContextEnabled", String(smartContextEnabled));
    formData.append("contextMode", "regenerate");
    formData.append("messages", JSON.stringify(historyForApi));

    setFocusUserMessageId(promptMessageId);
    setIsStreaming(true);
    streamReasoningEnabledRef.current = !!runtimeConfig.enableThinking;
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
        const nextSmartContextEnabled = !!stateSettings.smartContextEnabled;

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

        setGroups(nextGroups);
        setSessions(resolvedSessions);
        setSessionMessages(resolvedMessages);
        setActiveId(resolvedActiveId);
        setAgent(nextAgent);
        setAgentRuntimeConfigs(nextRuntimeConfigs);
        setApiTemperature(nextApiTemperature);
        setApiTopP(nextApiTopP);
        setApiReasoningEffort(nextApiReasoning);
        setLastAppliedReasoning(nextAppliedReasoning);
        setSmartContextEnabled(nextSmartContextEnabled);

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
            smartContextEnabled,
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
    smartContextEnabled,
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
        onOpenImageGeneration={onOpenImageGeneration}
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
          <div className="chat-topbar-left">
            <AgentSelect
              key={agentSwitchLocked ? "agent-locked" : "agent-unlocked"}
              value={agent}
              onChange={onAgentChange}
              disabled={agentSwitchLocked}
              disabledTitle="开启智能上下文管理后，需先关闭开关才能切换智能体。"
            />
            <div className="smart-context-control">
              <label className="smart-context-switch" htmlFor="smart-context-toggle">
                <input
                  id="smart-context-toggle"
                  type="checkbox"
                  checked={smartContextEnabled}
                  onChange={(e) => setSmartContextEnabled(e.target.checked)}
                  disabled={isStreaming || interactionLocked}
                />
                <span className="smart-context-slider" aria-hidden="true" />
                <span className="smart-context-label">智能上下文管理</span>
              </label>
              <span
                className="smart-context-info"
                title="开启后将锁定当前智能体进行对话，不得切换智能体"
                aria-label="开启后将锁定当前智能体进行对话，不得切换智能体"
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
            onPrepareFiles={onPrepareFiles}
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
    </div>
  );
}
