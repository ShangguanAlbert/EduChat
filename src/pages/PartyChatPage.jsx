import {
  AtSign,
  ArrowLeft,
  Copy,
  FileUp,
  MoreHorizontal,
  ImagePlus,
  Loader2,
  MessageSquareQuote,
  Smile,
  SmilePlus,
  Plus,
  SquarePen,
  SendHorizonal,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createPartyRoom,
  dissolvePartyRoom,
  fetchPartyBootstrap,
  fetchPartyMessages,
  joinPartyRoom,
  renamePartyRoom,
  sendPartyImageMessage,
  sendPartyTextMessage,
  togglePartyMessageReaction,
} from "./party/partyApi.js";
import { createPartySocketClient } from "./party/partySocket.js";
import "../styles/party-chat.css";

const FALLBACK_SYNC_MS = 60 * 1000;
const SOCKET_PING_MS = 20 * 1000;
const QUICK_REACTION_EMOJIS = Object.freeze(["👍", "👏", "🎉", "😄", "🤝"]);
const COMPOSER_TOOL_EMOJIS = Object.freeze(["😀", "🤔", "👍", "🎯", "🎉", "🙏"]);

const DEFAULT_LIMITS = Object.freeze({
  maxCreatedRoomsPerUser: 2,
  maxJoinedRoomsPerUser: 8,
  maxMembersPerRoom: 5,
});

const DEFAULT_COUNTS = Object.freeze({
  createdRooms: 0,
  joinedRooms: 0,
});

export default function PartyChatPage() {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  const socketRef = useRef(null);
  const currentRoomRef = useRef("");
  const latestMessageAtRef = useRef("");
  const activeRoomIdRef = useRef("");
  const sideMenuRef = useRef(null);
  const messageMenuRef = useRef(null);
  const composerToolbarRef = useRef(null);
  const [bootstrapLoading, setBootstrapLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState("");
  const [actionError, setActionError] = useState("");

  const [me, setMe] = useState({ id: "", name: "我" });
  const [limits, setLimits] = useState(DEFAULT_LIMITS);
  const [counts, setCounts] = useState(DEFAULT_COUNTS);
  const [usersById, setUsersById] = useState({});
  const [rooms, setRooms] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState("");

  const [messagesByRoom, setMessagesByRoom] = useState({});
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messagesError, setMessagesError] = useState("");

  const [createRoomName, setCreateRoomName] = useState("");
  const [createSubmitting, setCreateSubmitting] = useState(false);
  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinSubmitting, setJoinSubmitting] = useState(false);
  const [showSideMenu, setShowSideMenu] = useState(false);
  const [showCreateRoomModal, setShowCreateRoomModal] = useState(false);
  const [showJoinRoomModal, setShowJoinRoomModal] = useState(false);
  const [showRenameRoomModal, setShowRenameRoomModal] = useState(false);
  const [renameRoomName, setRenameRoomName] = useState("");
  const [renameSubmitting, setRenameSubmitting] = useState(false);
  const [showDissolveRoomModal, setShowDissolveRoomModal] = useState(false);
  const [dissolveConfirmText, setDissolveConfirmText] = useState("");
  const [dissolveSubmitting, setDissolveSubmitting] = useState(false);

  const [composeText, setComposeText] = useState("");
  const [sendingText, setSendingText] = useState(false);
  const [selectedImageFile, setSelectedImageFile] = useState(null);
  const [selectedImagePreviewUrl, setSelectedImagePreviewUrl] = useState("");
  const [sendingImage, setSendingImage] = useState(false);
  const [showComposerEmojiPanel, setShowComposerEmojiPanel] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [messageMenuState, setMessageMenuState] = useState({
    messageId: "",
    showReactions: false,
  });

  const activeRoom = useMemo(
    () => rooms.find((room) => room.id === activeRoomId) || null,
    [rooms, activeRoomId],
  );
  const activeMessages = useMemo(
    () => messagesByRoom[activeRoomId] || [],
    [messagesByRoom, activeRoomId],
  );
  const activeMembers = useMemo(() => {
    if (!activeRoom) return [];
    return activeRoom.memberUserIds.map((userId) => {
      const found = usersById[userId];
      if (found) return found;
      return { id: userId, name: "用户" };
    });
  }, [activeRoom, usersById]);
  const latestMessageAt = useMemo(() => {
    if (!activeMessages.length) return "";
    return activeMessages[activeMessages.length - 1]?.createdAt || "";
  }, [activeMessages]);
  const composerSending = sendingText || sendingImage;
  const canSendComposer =
    !!activeRoomId &&
    (composeText.trim().length > 0 || !!selectedImageFile) &&
    !composerSending;
  const canManageActiveRoom = !!activeRoom && activeRoom.ownerUserId === me.id;
  const bannerMessage = actionError || messagesError || bootstrapError;

  const mergeMessages = useCallback((roomId, incoming, { replace = false } = {}) => {
    const safeRoomId = String(roomId || "").trim();
    const safeIncoming = Array.isArray(incoming) ? incoming.filter(Boolean) : [];
    if (!safeRoomId) return;
    setMessagesByRoom((prev) => {
      const current = replace ? [] : prev[safeRoomId] || [];
      const map = new Map();
      current.forEach((item) => map.set(item.id, item));
      safeIncoming.forEach((item) => map.set(item.id, item));
      const merged = Array.from(map.values())
        .sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt))
        .slice(-300);
      return {
        ...prev,
        [safeRoomId]: merged,
      };
    });
  }, []);

  const touchRoom = useCallback((roomId, updatedAt = new Date().toISOString()) => {
    const safeRoomId = String(roomId || "").trim();
    if (!safeRoomId) return;
    setRooms((prev) =>
      [...prev]
        .map((room) => (room.id === safeRoomId ? { ...room, updatedAt } : room))
        .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)),
    );
  }, []);

  const applyRoomUpsert = useCallback((rawRoom) => {
    const nextRoom = normalizeRoom(rawRoom);
    if (!nextRoom) return;
    setRooms((prev) => {
      const existed = prev.some((room) => room.id === nextRoom.id);
      const nextRooms = existed
        ? prev.map((room) => (room.id === nextRoom.id ? { ...room, ...nextRoom } : room))
        : [...prev, nextRoom];
      return nextRooms.sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt));
    });
  }, []);

  const removeRoom = useCallback((roomId) => {
    const safeRoomId = String(roomId || "").trim();
    if (!safeRoomId) return;
    setRooms((prev) => prev.filter((room) => room.id !== safeRoomId));
    setMessagesByRoom((prev) => {
      if (!(safeRoomId in prev)) return prev;
      const next = { ...prev };
      delete next[safeRoomId];
      return next;
    });
    setActiveRoomId((prev) => (prev === safeRoomId ? "" : prev));
    if (currentRoomRef.current === safeRoomId) {
      currentRoomRef.current = "";
    }
  }, []);

  const applyMessageReactions = useCallback((roomId, messageId, reactions) => {
    const safeRoomId = String(roomId || "").trim();
    const safeMessageId = String(messageId || "").trim();
    if (!safeRoomId || !safeMessageId) return;
    const normalizedReactions = normalizeMessageReactions(reactions);
    setMessagesByRoom((prev) => {
      const current = Array.isArray(prev[safeRoomId]) ? prev[safeRoomId] : [];
      if (!current.length) return prev;
      let changed = false;
      const next = current.map((message) => {
        if (message.id !== safeMessageId) return message;
        changed = true;
        return {
          ...message,
          reactions: normalizedReactions,
        };
      });
      if (!changed) return prev;
      return {
        ...prev,
        [safeRoomId]: next,
      };
    });
  }, []);

  const applyMemberJoined = useCallback((roomId, user) => {
    const safeRoomId = String(roomId || "").trim();
    const safeUserId = String(user?.id || "").trim();
    const safeUserName = String(user?.name || "用户").trim() || "用户";
    if (!safeRoomId || !safeUserId) return;

    setUsersById((prev) => ({
      ...prev,
      [safeUserId]: {
        id: safeUserId,
        name: safeUserName,
      },
    }));

    setRooms((prev) =>
      [...prev]
        .map((room) => {
          if (room.id !== safeRoomId) return room;
          if (room.memberUserIds.includes(safeUserId)) return room;
          const nextMemberUserIds = [...room.memberUserIds, safeUserId];
          return {
            ...room,
            memberUserIds: nextMemberUserIds,
            memberCount: Math.max(room.memberCount, nextMemberUserIds.length),
            updatedAt: new Date().toISOString(),
          };
        })
        .sort((a, b) => toTimestamp(b.updatedAt) - toTimestamp(a.updatedAt)),
    );
  }, []);

  const loadBootstrap = useCallback(async ({ silent = false } = {}) => {
    if (!silent) {
      setBootstrapLoading(true);
    }
    try {
      const result = await fetchPartyBootstrap();
      const nextRooms = normalizeRooms(result?.rooms);
      const nextUsers = normalizeUsers(result?.users);

      setMe({
        id: String(result?.me?.id || ""),
        name: String(result?.me?.name || "我"),
      });
      setLimits({
        maxCreatedRoomsPerUser:
          Number(result?.limits?.maxCreatedRoomsPerUser) || DEFAULT_LIMITS.maxCreatedRoomsPerUser,
        maxJoinedRoomsPerUser:
          Number(result?.limits?.maxJoinedRoomsPerUser) || DEFAULT_LIMITS.maxJoinedRoomsPerUser,
        maxMembersPerRoom:
          Number(result?.limits?.maxMembersPerRoom) || DEFAULT_LIMITS.maxMembersPerRoom,
      });
      setCounts({
        createdRooms: Number(result?.counts?.createdRooms) || 0,
        joinedRooms: Number(result?.counts?.joinedRooms) || 0,
      });
      setUsersById(nextUsers);
      setRooms(nextRooms);
      setActiveRoomId((prev) => {
        if (prev && nextRooms.some((room) => room.id === prev)) {
          return prev;
        }
        return nextRooms[0]?.id || "";
      });
      setBootstrapError("");
      if (!silent) {
        setActionError("");
      }
    } catch (error) {
      if (!silent) {
        setBootstrapError(error?.message || "派数据加载失败，请稍后重试。");
      }
    } finally {
      if (!silent) {
        setBootstrapLoading(false);
      }
    }
  }, []);

  const loadMessages = useCallback(async (roomId, { after = "", replace = false, silent = false } = {}) => {
    const safeRoomId = String(roomId || "").trim();
    if (!safeRoomId) return;
    if (!silent) {
      setMessagesLoading(true);
    }
    try {
      const result = await fetchPartyMessages(safeRoomId, {
        after,
        limit: after ? 120 : 80,
      });
      const incoming = normalizeMessages(result?.messages);
      mergeMessages(safeRoomId, incoming, { replace });
      setMessagesError("");
      if (result?.room) {
        touchRoom(safeRoomId, result.room.updatedAt);
      }
    } catch (error) {
      if (!silent) {
        setMessagesError(error?.message || "消息加载失败，请稍后重试。");
      }
    } finally {
      if (!silent) {
        setMessagesLoading(false);
      }
    }
  }, [mergeMessages, touchRoom]);

  useEffect(() => {
    latestMessageAtRef.current = latestMessageAt;
  }, [latestMessageAt]);

  useEffect(() => {
    activeRoomIdRef.current = activeRoomId;
  }, [activeRoomId]);

  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);

  useEffect(() => {
    const token = String(localStorage.getItem("token") || "").trim();
    if (!token) return undefined;

    const socketClient = createPartySocketClient({
      token,
      onMessageCreated: (payload) => {
        const roomId = String(payload?.roomId || payload?.message?.roomId || "").trim();
        const message = normalizeMessage(payload?.message);
        if (!roomId || !message) return;
        mergeMessages(roomId, [message], { replace: false });
        touchRoom(roomId, message.createdAt || new Date().toISOString());
      },
      onMessageReactionsUpdated: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        const messageId = String(payload?.messageId || "").trim();
        if (!roomId || !messageId) return;
        applyMessageReactions(roomId, messageId, payload?.reactions);
      },
      onRoomUpdated: (payload) => {
        applyRoomUpsert(payload?.room);
      },
      onRoomDissolved: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        if (!roomId) return;
        removeRoom(roomId);
        void loadBootstrap({ silent: true });
      },
      onMemberJoined: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        if (!roomId) return;
        applyMemberJoined(roomId, payload?.user);
      },
      onError: (payload) => {
        const message = String(payload?.message || "").trim();
        if (message) {
          setActionError(message);
        }
      },
    });

    socketClient.connect();
    socketRef.current = socketClient;

    return () => {
      if (currentRoomRef.current) {
        socketClient.leaveRoom(currentRoomRef.current);
      }
      socketClient.close();
      socketRef.current = null;
      currentRoomRef.current = "";
    };
  }, [
    applyMemberJoined,
    applyMessageReactions,
    applyRoomUpsert,
    loadBootstrap,
    mergeMessages,
    removeRoom,
    touchRoom,
  ]);

  useEffect(() => {
    const previousRoomId = currentRoomRef.current;
    if (previousRoomId && previousRoomId !== activeRoomId) {
      socketRef.current?.leaveRoom(previousRoomId);
    }

    if (activeRoomId) {
      socketRef.current?.joinRoom(activeRoomId);
      void loadMessages(activeRoomId, { replace: true });
    }

    currentRoomRef.current = activeRoomId;
  }, [activeRoomId, loadMessages]);

  useEffect(() => {
    setShowMentionPicker(false);
  }, [activeRoomId]);

  useEffect(() => {
    if (!rooms.length) {
      if (activeRoomId) {
        setActiveRoomId("");
      }
      return;
    }
    if (activeRoomId && rooms.some((room) => room.id === activeRoomId)) {
      return;
    }
    setActiveRoomId(rooms[0]?.id || "");
  }, [rooms, activeRoomId]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      socketRef.current?.ping();
    }, SOCKET_PING_MS);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadBootstrap({ silent: true });
      const roomId = activeRoomIdRef.current;
      if (!roomId) return;
      void loadMessages(roomId, {
        after: latestMessageAtRef.current,
        replace: false,
        silent: true,
      });
    }, FALLBACK_SYNC_MS);
    return () => window.clearInterval(timer);
  }, [loadBootstrap, loadMessages]);

  useEffect(() => {
    if (!showSideMenu) return undefined;

    function onDocMouseDown(event) {
      if (sideMenuRef.current?.contains(event.target)) return;
      setShowSideMenu(false);
    }

    function onDocKeyDown(event) {
      if (event.key === "Escape") {
        setShowSideMenu(false);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [showSideMenu]);

  useEffect(() => {
    if (!showCreateRoomModal && !showJoinRoomModal && !showRenameRoomModal && !showDissolveRoomModal) {
      return undefined;
    }

    function onDocKeyDown(event) {
      if (event.key !== "Escape") return;
      if (showCreateRoomModal && !createSubmitting) {
        setShowCreateRoomModal(false);
      }
      if (showJoinRoomModal && !joinSubmitting) {
        setShowJoinRoomModal(false);
      }
      if (showRenameRoomModal && !renameSubmitting) {
        setShowRenameRoomModal(false);
      }
      if (showDissolveRoomModal && !dissolveSubmitting) {
        setShowDissolveRoomModal(false);
      }
    }

    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [
    showCreateRoomModal,
    showJoinRoomModal,
    showRenameRoomModal,
    showDissolveRoomModal,
    createSubmitting,
    joinSubmitting,
    renameSubmitting,
    dissolveSubmitting,
  ]);

  useEffect(() => {
    if (!messageMenuState.messageId) return undefined;

    function onDocMouseDown(event) {
      if (messageMenuRef.current?.contains(event.target)) return;
      setMessageMenuState({ messageId: "", showReactions: false });
    }

    function onDocKeyDown(event) {
      if (event.key === "Escape") {
        setMessageMenuState({ messageId: "", showReactions: false });
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [messageMenuState.messageId]);

  useEffect(() => {
    if (!selectedImageFile) {
      setSelectedImagePreviewUrl("");
      return undefined;
    }
    const objectUrl = URL.createObjectURL(selectedImageFile);
    setSelectedImagePreviewUrl(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [selectedImageFile]);

  useEffect(() => {
    if (!actionError) return undefined;
    const timer = window.setTimeout(() => {
      setActionError("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    if (!showComposerEmojiPanel && !showMentionPicker) return undefined;

    function onDocMouseDown(event) {
      if (composerToolbarRef.current?.contains(event.target)) return;
      setShowComposerEmojiPanel(false);
      setShowMentionPicker(false);
    }

    function onDocKeyDown(event) {
      if (event.key === "Escape") {
        setShowComposerEmojiPanel(false);
        setShowMentionPicker(false);
      }
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
    };
  }, [showComposerEmojiPanel, showMentionPicker]);

  async function handleCreateRoom(event) {
    event.preventDefault();
    if (!createRoomName.trim() || createSubmitting) return;
    setCreateSubmitting(true);
    try {
      const result = await createPartyRoom(createRoomName);
      const room = normalizeRoom(result?.room);
      setCreateRoomName("");
      setShowCreateRoomModal(false);
      setActionError("");
      await loadBootstrap({ silent: true });
      if (room) {
        setActiveRoomId(room.id);
      }
    } catch (error) {
      setActionError(error?.message || "创建派失败，请稍后重试。");
    } finally {
      setCreateSubmitting(false);
    }
  }

  async function handleJoinRoom(event) {
    event.preventDefault();
    const roomCode = normalizeRoomCodeInput(joinRoomCode);
    if (!roomCode || joinSubmitting) return;
    setJoinSubmitting(true);
    try {
      const result = await joinPartyRoom(roomCode);
      const room = normalizeRoom(result?.room);
      setJoinRoomCode("");
      setShowJoinRoomModal(false);
      setActionError("");
      await loadBootstrap({ silent: true });
      if (room) {
        setActiveRoomId(room.id);
      }
    } catch (error) {
      setActionError(error?.message || "加群失败，请稍后重试。");
    } finally {
      setJoinSubmitting(false);
    }
  }

  async function handleRenameRoom(event) {
    event.preventDefault();
    if (!activeRoom || !renameRoomName.trim() || renameSubmitting) return;
    setRenameSubmitting(true);
    try {
      const result = await renamePartyRoom(activeRoom.id, renameRoomName);
      applyRoomUpsert(result?.room);
      setShowRenameRoomModal(false);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "重命名失败，请稍后重试。");
    } finally {
      setRenameSubmitting(false);
    }
  }

  async function handleDissolveRoom(event) {
    event.preventDefault();
    if (!activeRoom || !canManageActiveRoom || dissolveSubmitting) return;
    if (dissolveConfirmText.trim() !== "解散") return;
    setDissolveSubmitting(true);
    const roomId = activeRoom.id;
    try {
      await dissolvePartyRoom(roomId);
      removeRoom(roomId);
      setShowDissolveRoomModal(false);
      setShowRenameRoomModal(false);
      setDissolveConfirmText("");
      setActionError("");
      await loadBootstrap({ silent: true });
    } catch (error) {
      setActionError(error?.message || "解散派失败，请稍后重试。");
    } finally {
      setDissolveSubmitting(false);
    }
  }

  async function dispatchTextMessage(content, replyToMessageId = "") {
    const result = await sendPartyTextMessage(activeRoomId, {
      content,
      replyToMessageId,
    });
    const message = normalizeMessage(result?.message);
    if (message) {
      mergeMessages(activeRoomId, [message], { replace: false });
      touchRoom(activeRoomId, message.createdAt || new Date().toISOString());
    }
  }

  async function dispatchImageMessage(file, replyToMessageId = "") {
    const result = await sendPartyImageMessage(activeRoomId, {
      file,
      replyToMessageId,
    });
    const message = normalizeMessage(result?.message);
    if (message) {
      mergeMessages(activeRoomId, [message], { replace: false });
      touchRoom(activeRoomId, message.createdAt || new Date().toISOString());
    }
  }

  async function handleSendComposer() {
    if (!activeRoomId || composerSending) return;

    const textPayload = composeText.trim();
    const imageFile = selectedImageFile;
    if (!textPayload && !imageFile) return;

    const replyToMessageId = replyTarget?.id || "";
    setSendingText(!!textPayload);
    setSendingImage(!!imageFile);
    try {
      if (textPayload) {
        await dispatchTextMessage(textPayload, replyToMessageId);
      }
      if (imageFile) {
        const imageReplyTo = textPayload ? "" : replyToMessageId;
        await dispatchImageMessage(imageFile, imageReplyTo);
      }

      setComposeText("");
      setSelectedImageFile(null);
      setSelectedImagePreviewUrl("");
      setShowComposerEmojiPanel(false);
      setShowMentionPicker(false);
      setReplyTarget(null);
      setActionError("");
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
    } catch (error) {
      setActionError(error?.message || "发送失败，请稍后重试。");
    } finally {
      setSendingText(false);
      setSendingImage(false);
    }
  }

  function onPickImageFile(event) {
    const file = event.target.files?.[0] || null;
    if (!file) {
      setSelectedImageFile(null);
      setSelectedImagePreviewUrl("");
      return;
    }
    if (!String(file.type || "").startsWith("image/")) {
      setSelectedImageFile(null);
      setSelectedImagePreviewUrl("");
      setActionError("仅支持图片文件。");
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      return;
    }
    setSelectedImageFile(file);
    setActionError("");
  }

  function onComposerEmojiSelect(emoji) {
    const safeEmoji = String(emoji || "").trim();
    if (!safeEmoji) return;
    setComposeText((prev) => {
      const current = String(prev || "");
      if (!current.trim()) return `${safeEmoji} `;
      const needSpace = /\s$/.test(current) ? "" : " ";
      return `${current}${needSpace}${safeEmoji} `;
    });
  }

  function toggleMentionPicker() {
    setShowComposerEmojiPanel(false);
    setShowMentionPicker((prev) => !prev);
  }

  function openImagePicker() {
    imageInputRef.current?.click();
  }

  function removeSelectedImage() {
    setSelectedImageFile(null);
    setSelectedImagePreviewUrl("");
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
  }

  function onComposeFileFeatureClick() {
    setActionError("发送文件功能正在开发中");
  }

  function openRenameRoomModal() {
    if (!activeRoom || !canManageActiveRoom) return;
    setRenameRoomName(activeRoom.name || "");
    setShowRenameRoomModal(true);
    setActionError("");
  }

  function closeRenameRoomModal() {
    if (renameSubmitting) return;
    setShowRenameRoomModal(false);
  }

  function openDissolveRoomModal() {
    if (!activeRoom || !canManageActiveRoom) return;
    setDissolveConfirmText("");
    setShowDissolveRoomModal(true);
    setActionError("");
  }

  function closeDissolveRoomModal() {
    if (dissolveSubmitting) return;
    setShowDissolveRoomModal(false);
  }

  function insertMention(name) {
    const memberName = String(name || "").trim();
    if (!memberName) return;
    const mention = `@${memberName}`;
    setComposeText((prev) => {
      const current = String(prev || "");
      const mentionPattern = new RegExp(
        `(?:^|\\s)${escapeRegExpForRegex(mention)}(?=\\s|$)`,
      );
      if (mentionPattern.test(current)) {
        return current;
      }
      if (!current.trim()) return `${mention} `;
      const needSpace = /\s$/.test(current) ? "" : " ";
      return `${current}${needSpace}${mention} `;
    });
  }

  function pickMention(name) {
    insertMention(name);
    setShowMentionPicker(false);
  }

  function openCreateRoomModal() {
    setShowSideMenu(false);
    setActionError("");
    setShowCreateRoomModal(true);
  }

  function openJoinRoomModal() {
    setShowSideMenu(false);
    setActionError("");
    setShowJoinRoomModal(true);
  }

  function dismissBanner() {
    if (actionError) {
      setActionError("");
      return;
    }
    if (messagesError) {
      setMessagesError("");
      return;
    }
    if (bootstrapError) {
      setBootstrapError("");
    }
  }

  function closeCreateRoomModal() {
    if (createSubmitting) return;
    setShowCreateRoomModal(false);
  }

  function closeJoinRoomModal() {
    if (joinSubmitting) return;
    setShowJoinRoomModal(false);
  }

  async function copyMessage(message) {
    if (!message || !message.content) return;
    try {
      await navigator.clipboard.writeText(message.content);
    } catch {
      // ignore
    }
  }

  function closeMessageMenu() {
    setMessageMenuState({ messageId: "", showReactions: false });
  }

  function toggleMessageMenu(messageId) {
    const safeMessageId = String(messageId || "").trim();
    if (!safeMessageId) return;
    setMessageMenuState((prev) => {
      if (prev.messageId === safeMessageId) {
        return { messageId: "", showReactions: false };
      }
      return { messageId: safeMessageId, showReactions: false };
    });
  }

  function toggleReactionPanel(messageId) {
    const safeMessageId = String(messageId || "").trim();
    if (!safeMessageId) return;
    setMessageMenuState((prev) => {
      if (prev.messageId !== safeMessageId) {
        return { messageId: safeMessageId, showReactions: true };
      }
      return {
        messageId: safeMessageId,
        showReactions: !prev.showReactions,
      };
    });
  }

  function handleQuoteMessage(message) {
    setReplyTarget(createReplyTarget(message));
    closeMessageMenu();
  }

  async function handleCopyMessage(message) {
    await copyMessage(message);
    closeMessageMenu();
  }

  async function handleQuickReaction(message, emoji) {
    const messageId = String(message?.id || "").trim();
    const roomId = String(message?.roomId || activeRoomId || "").trim();
    const safeEmoji = String(emoji || "").trim();
    if (!safeEmoji || !messageId || !roomId) return;
    closeMessageMenu();
    try {
      const result = await togglePartyMessageReaction(roomId, messageId, safeEmoji);
      applyMessageReactions(roomId, messageId, result?.reactions);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "表情回复失败，请稍后重试。");
    }
  }

  const contentClassName = `party-content${activeRoom ? "" : " is-empty"}`;

  return (
    <div className="party-page">
      <header className="party-header">
        <div className="party-header-left">
          <button type="button" className="party-back-btn" onClick={() => navigate("/chat")}>
            <ArrowLeft size={16} />
            返回
          </button>
          <div>
            <h1 className="party-title">派 · 协作</h1>
          </div>
        </div>
        <div className="party-header-right">
          <span className="party-limit-chip">
            已建 {counts.createdRooms}/{limits.maxCreatedRoomsPerUser}
          </span>
          <span className="party-limit-chip">
            已加 {counts.joinedRooms}/{limits.maxJoinedRoomsPerUser}
          </span>
        </div>
      </header>

      <div className="party-workspace">
        <aside className="party-side">
          <div className="party-side-head">
            <div>
              <h2 className="party-side-title">派</h2>
              <p className="party-side-subtitle">创建或加入派开始协作学习</p>
            </div>
            <div className="party-side-menu-wrap" ref={sideMenuRef}>
              <button
                type="button"
                className="party-side-plus-btn"
                title="创建或加入"
                onClick={() => setShowSideMenu((prev) => !prev)}
              >
                <Plus size={18} />
              </button>

              {showSideMenu ? (
                <div className="party-side-menu" role="menu" aria-label="派操作">
                  <button type="button" className="party-side-menu-item" onClick={openCreateRoomModal}>
                    创建派
                  </button>
                  <button type="button" className="party-side-menu-item" onClick={openJoinRoomModal}>
                    加入派
                  </button>
                </div>
              ) : null}
            </div>
          </div>

          <section className="party-card party-room-list-card">
            <h2 className="party-card-title">我的派</h2>
            {bootstrapLoading ? (
              <p className="party-tip">加载中...</p>
            ) : rooms.length === 0 ? (
              <p className="party-tip">还没有派，先创建或加入一个。</p>
            ) : (
              <div className="party-room-list">
                {rooms.map((room) => {
                  const active = room.id === activeRoomId;
                  return (
                    <button
                      key={room.id}
                      type="button"
                      className={`party-room-item${active ? " active" : ""}`}
                      onClick={() => setActiveRoomId(room.id)}
                    >
                      <div className="party-room-item-top">
                        <span className="party-room-name">{room.name}</span>
                        <span className="party-room-count">
                          <Users size={12} /> {room.memberCount}/{limits.maxMembersPerRoom}
                        </span>
                      </div>
                      <p className="party-room-meta">
                        派号：{room.roomCode} · {formatTime(room.updatedAt)}
                      </p>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          <section className="party-card party-members-card">
            <div className="party-member-list-head">
              <h2 className="party-card-title">成员</h2>
              <span className="party-member-count-badge">
                {activeRoom ? `${activeRoom.memberCount}/${limits.maxMembersPerRoom}` : "--"}
              </span>
            </div>

            {!activeRoom ? (
              <p className="party-tip">请选择一个派查看成员。</p>
            ) : (
              <div className="party-side-members-list">
                {activeMembers.map((member) => {
                  const isOwner = member.id === activeRoom.ownerUserId;
                  const isSelf = member.id === me.id;
                  return (
                    <button
                      key={member.id}
                      type="button"
                      className={`party-side-member-item${isSelf ? " is-self" : ""}`}
                      onClick={() => insertMention(member.name)}
                      title="点击可 @Ta"
                    >
                      <NameAvatar name={member.name} />
                      <span className="party-side-member-name">{member.name}</span>
                      {isOwner ? <span className="party-side-member-owner">派主</span> : null}
                      {isSelf ? <span className="party-side-member-self">我</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </aside>

        <main className={contentClassName}>
          {activeRoom ? (
            <>
              <header className="party-room-header">
                <div>
                  <div className="party-room-title-row">
                    <h2 className="party-room-title">{activeRoom.name}</h2>
                    {canManageActiveRoom ? (
                      <button
                        type="button"
                        className="party-room-rename-icon-btn"
                        title="重命名派"
                        onClick={openRenameRoomModal}
                      >
                        <SquarePen size={14} />
                      </button>
                    ) : null}
                  </div>
                  <p className="party-room-code">派号：{activeRoom.roomCode}</p>
                </div>
                {canManageActiveRoom ? (
                  <button type="button" className="party-room-dissolve-btn" onClick={openDissolveRoomModal}>
                    解散派
                  </button>
                ) : null}
              </header>

              <section className="party-messages">
                {messagesLoading && activeMessages.length === 0 ? (
                  <p className="party-tip">正在加载消息...</p>
                ) : activeMessages.length === 0 ? (
                  <p className="party-tip">还没有消息，发一条开始协作讨论。</p>
                ) : (
                  activeMessages.map((message) => {
                    const isMine = message.senderUserId === me.id;
                    const isMenuOpen = messageMenuState.messageId === message.id;
                    const showReactions = isMenuOpen && messageMenuState.showReactions;
                    const messageReactions = Array.isArray(message.reactions) ? message.reactions : [];

                    return (
                      <article
                        key={message.id}
                        className={`party-message ${isMine ? "mine" : ""} ${
                          message.type === "system" ? "system" : ""
                        }`}
                      >
                        {message.type === "system" ? (
                          <p className="party-system-text">{message.content}</p>
                        ) : (
                          <div className="party-message-row">
                            <NameAvatar name={message.senderName} />
                            <div className="party-message-main">
                              <div className="party-message-head">
                                <span className="party-message-sender">{message.senderName}</span>
                                <time className="party-message-time">{formatTime(message.createdAt)}</time>
                              </div>

                              <div className={`party-message-bubble-wrap${isMine ? " mine" : ""}`}>
                                <div className="party-message-bubble">
                                  {message.replyToMessageId ? (
                                    <div className="party-reply-ref">
                                      <span className="party-reply-ref-name">{message.replySenderName}</span>
                                      <span className="party-reply-ref-text">{message.replyPreviewText}</span>
                                    </div>
                                  ) : null}

                                  {message.type === "text" ? (
                                    <div className="party-message-text">{renderTextWithMentions(message.content)}</div>
                                  ) : (
                                    <button
                                      type="button"
                                      className="party-image-thumb-btn"
                                      onClick={() => setPreviewImage(message.image)}
                                    >
                                      <img
                                        src={message.image?.dataUrl}
                                        alt={message.image?.fileName || "派图片"}
                                        className="party-image-thumb"
                                      />
                                    </button>
                                  )}

                                  {messageReactions.length > 0 ? (
                                    <div className="party-message-emoji-replies">
                                      {messageReactions.map((item, index) => {
                                        const canCancel = item.userId === me.id;
                                        return (
                                          <span
                                            key={`${message.id}-${item.userId}-${item.emoji}-${index}`}
                                            className={`party-message-emoji-chip${canCancel ? " mine" : ""}`}
                                          >
                                            <span>{item.emoji}</span>
                                            {canCancel ? (
                                              <button
                                                type="button"
                                                className="party-message-emoji-name-btn"
                                                title="点击取消我的表情回复"
                                                onClick={() => void handleQuickReaction(message, item.emoji)}
                                              >
                                                {item.userName}
                                              </button>
                                            ) : (
                                              <span className="party-message-emoji-name">{item.userName}</span>
                                            )}
                                          </span>
                                        );
                                      })}
                                    </div>
                                  ) : null}
                                </div>

                                <div
                                  className={`party-msg-menu-wrap${isMine ? " mine" : ""}`}
                                  ref={isMenuOpen ? messageMenuRef : null}
                                >
                                  <button
                                    type="button"
                                    className="party-msg-menu-trigger"
                                    title="更多操作"
                                    onClick={() => toggleMessageMenu(message.id)}
                                  >
                                    <MoreHorizontal size={16} />
                                  </button>

                                  {isMenuOpen ? (
                                    <div
                                      className={`party-msg-menu-panel${isMine ? " align-left" : " align-right"}`}
                                      role="menu"
                                    >
                                      {message.type === "text" ? (
                                        <button
                                          type="button"
                                          className="party-msg-menu-item"
                                          onClick={() => void handleCopyMessage(message)}
                                        >
                                          <Copy size={15} />
                                          复制
                                        </button>
                                      ) : null}

                                      <button
                                        type="button"
                                        className="party-msg-menu-item"
                                        onClick={() => handleQuoteMessage(message)}
                                      >
                                        <MessageSquareQuote size={15} />
                                        引用
                                      </button>

                                      <button
                                        type="button"
                                        className="party-msg-menu-item"
                                        onClick={() => toggleReactionPanel(message.id)}
                                      >
                                        <SmilePlus size={15} />
                                        表情回复
                                      </button>

                                      {showReactions ? (
                                        <div className="party-msg-reaction-row">
                                          {QUICK_REACTION_EMOJIS.map((emoji) => (
                                            <button
                                              key={`${message.id}-${emoji}`}
                                              type="button"
                                              className="party-msg-reaction-btn"
                                              onClick={() => void handleQuickReaction(message, emoji)}
                                            >
                                              {emoji}
                                            </button>
                                          ))}
                                        </div>
                                      ) : null}
                                    </div>
                                  ) : null}
                                </div>

                              </div>
                            </div>
                          </div>
                        )}
                      </article>
                    );
                  })
                )}
              </section>

              <section className="party-composer">
                {replyTarget ? (
                  <div className="party-reply-bar">
                    <span className="party-reply-label">引用 {replyTarget.senderName}</span>
                    <span className="party-reply-text">{replyTarget.previewText}</span>
                    <button
                      type="button"
                      className="party-clear-reply-btn"
                      onClick={() => setReplyTarget(null)}
                      title="取消引用"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ) : null}

                <div className="party-compose-editor">
                  <input
                    ref={imageInputRef}
                    type="file"
                    accept="image/*"
                    onChange={onPickImageFile}
                    className="party-file-input"
                  />

                  <div className="party-compose-toolbar" ref={composerToolbarRef}>
                    <button
                      type="button"
                      className={`party-tool-btn${showComposerEmojiPanel ? " active" : ""}`}
                      title="表情"
                      onClick={() => {
                        setShowMentionPicker(false);
                        setShowComposerEmojiPanel((prev) => !prev);
                      }}
                    >
                      <Smile size={17} />
                    </button>
                    <button
                      type="button"
                      className={`party-tool-btn${showMentionPicker ? " active" : ""}`}
                      title="@成员"
                      onClick={toggleMentionPicker}
                    >
                      <AtSign size={17} />
                    </button>
                    <button
                      type="button"
                      className="party-tool-btn"
                      title="发送图片"
                      onClick={openImagePicker}
                    >
                      <ImagePlus size={17} />
                    </button>
                    <button
                      type="button"
                      className="party-tool-btn"
                      title="发送文件（开发中）"
                      onClick={onComposeFileFeatureClick}
                    >
                      <FileUp size={17} />
                    </button>

                    {showComposerEmojiPanel ? (
                      <div className="party-compose-emoji-panel">
                        {COMPOSER_TOOL_EMOJIS.map((emoji) => (
                          <button
                            key={`compose-emoji-${emoji}`}
                            type="button"
                            className="party-compose-emoji-btn"
                            onClick={() => onComposerEmojiSelect(emoji)}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    ) : null}

                    {showMentionPicker ? (
                      <div className="party-mention-picker" role="dialog" aria-label="成员">
                        <div className="party-mention-picker-head">
                          <span className="party-mention-picker-title">成员</span>
                        </div>
                        <div className="party-mention-picker-list">
                          <button
                            type="button"
                            className="party-mention-picker-item is-all"
                            onClick={() => pickMention("所有人")}
                          >
                            <span className="party-mention-picker-at">@</span>
                            <span className="party-mention-picker-name">所有人 ({activeMembers.length})</span>
                          </button>
                          {activeMembers.map((member) => (
                            <button
                              key={`mention-${member.id}`}
                              type="button"
                              className="party-mention-picker-item"
                              onClick={() => pickMention(member.name)}
                            >
                              <NameAvatar name={member.name} small />
                              <span className="party-mention-picker-name">{member.name}</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="party-compose-input-area">
                    {selectedImageFile ? (
                      <div className="party-compose-image-chip">
                        {selectedImagePreviewUrl ? (
                          <img src={selectedImagePreviewUrl} alt={selectedImageFile.name || "待发送图片"} />
                        ) : null}
                        <span className="party-compose-image-name">{selectedImageFile.name || "图片"}</span>
                        <button
                          type="button"
                          className="party-compose-image-remove"
                          onClick={removeSelectedImage}
                          title="移除图片"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ) : null}

                    <textarea
                      className="party-compose-textarea"
                      placeholder="请输入消息"
                      value={composeText}
                      onChange={(event) => setComposeText(event.target.value)}
                      rows={4}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" && !event.shiftKey) {
                          event.preventDefault();
                          void handleSendComposer();
                        }
                      }}
                    />
                  </div>

                  <div className="party-compose-footer">
                    <span className="party-compose-hint">Enter 发送 / Shift+Enter 换行</span>
                    <button
                      type="button"
                      className="party-send-btn"
                      disabled={!canSendComposer}
                      onClick={() => void handleSendComposer()}
                    >
                      {composerSending ? <Loader2 size={16} className="spin" /> : <SendHorizonal size={16} />}
                      发送
                    </button>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <section className="party-empty">
              <h2>欢迎来到派</h2>
              <p>创建或加入一个派，开始协作学习对话。</p>
            </section>
          )}
        </main>
      </div>

      {showCreateRoomModal ? (
        <div className="modal-overlay" role="presentation" onClick={closeCreateRoomModal}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="创建派"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="group-modal-title">创建派</h3>
            <form onSubmit={handleCreateRoom} className="group-modal-form">
              <label className="group-modal-label" htmlFor="party-create-room-name">
                派名称
              </label>
              <input
                id="party-create-room-name"
                className="group-modal-input"
                value={createRoomName}
                maxLength={30}
                autoFocus
                placeholder="输入派名称（最多30字）"
                onChange={(event) => setCreateRoomName(event.target.value)}
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeCreateRoomModal}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn group-modal-btn-primary"
                  disabled={!createRoomName.trim() || createSubmitting}
                >
                  {createSubmitting ? "创建中..." : "创建"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showJoinRoomModal ? (
        <div className="modal-overlay" role="presentation" onClick={closeJoinRoomModal}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="加入派"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="group-modal-title">加入派</h3>
            <form onSubmit={handleJoinRoom} className="group-modal-form">
              <label className="group-modal-label" htmlFor="party-join-room-code">
                派号
              </label>
              <input
                id="party-join-room-code"
                className="group-modal-input"
                value={joinRoomCode}
                autoFocus
                placeholder="输入派号（例：327-139-586）"
                onChange={(event) => setJoinRoomCode(formatRoomCodeInput(event.target.value))}
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeJoinRoomModal}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn group-modal-btn-primary"
                  disabled={!normalizeRoomCodeInput(joinRoomCode) || joinSubmitting}
                >
                  {joinSubmitting ? "加入中..." : "加入"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showRenameRoomModal ? (
        <div className="modal-overlay" role="presentation" onClick={closeRenameRoomModal}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="重命名派"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="group-modal-title">重命名派</h3>
            <form onSubmit={handleRenameRoom} className="group-modal-form">
              <label className="group-modal-label" htmlFor="party-rename-room-name">
                新派名称
              </label>
              <input
                id="party-rename-room-name"
                className="group-modal-input"
                value={renameRoomName}
                maxLength={30}
                autoFocus
                placeholder="输入派名称（最多30字）"
                onChange={(event) => setRenameRoomName(event.target.value)}
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeRenameRoomModal}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn group-modal-btn-primary"
                  disabled={!renameRoomName.trim() || renameSubmitting}
                >
                  {renameSubmitting ? "保存中..." : "保存"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {showDissolveRoomModal ? (
        <div className="modal-overlay" role="presentation" onClick={closeDissolveRoomModal}>
          <div
            className="group-modal"
            role="dialog"
            aria-modal="true"
            aria-label="解散派"
            onClick={(event) => event.stopPropagation()}
          >
            <h3 className="group-modal-title">解散派</h3>
            <form onSubmit={handleDissolveRoom} className="group-modal-form">
              <p className="party-danger-tip">
                解散后全部成员将被移出，且派消息会被永久删除。输入“解散”完成二次确认。
              </p>
              <input
                className="group-modal-input"
                value={dissolveConfirmText}
                autoFocus
                placeholder="请输入 解散"
                onChange={(event) => setDissolveConfirmText(event.target.value)}
              />

              <div className="group-modal-actions">
                <button
                  type="button"
                  className="group-modal-btn group-modal-btn-secondary"
                  onClick={closeDissolveRoomModal}
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="group-modal-btn party-danger-btn"
                  disabled={dissolveConfirmText.trim() !== "解散" || dissolveSubmitting}
                >
                  {dissolveSubmitting ? "解散中..." : "确认解散"}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {bannerMessage ? (
        <div className="party-error-banner" role="status">
          <span className="party-error-banner-text">{bannerMessage}</span>
          <button
            type="button"
            className="party-error-banner-close"
            aria-label="关闭提示"
            onClick={dismissBanner}
          >
            <X size={14} />
          </button>
        </div>
      ) : null}

      {previewImage?.dataUrl ? (
        <div className="party-image-modal" role="presentation" onClick={() => setPreviewImage(null)}>
          <div className="party-image-modal-card" role="dialog" onClick={(event) => event.stopPropagation()}>
            <img src={previewImage.dataUrl} alt={previewImage.fileName || "图片预览"} />
            <div className="party-image-modal-actions">
              <a href={previewImage.dataUrl} download={previewImage.fileName || "party-image.png"}>
                保存到本地
              </a>
              <button type="button" onClick={() => setPreviewImage(null)}>
                关闭
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function normalizeRooms(rawRooms) {
  if (!Array.isArray(rawRooms)) return [];
  return rawRooms.map((room) => normalizeRoom(room)).filter(Boolean);
}

function normalizeRoom(raw) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const memberUserIds = Array.isArray(raw?.memberUserIds)
    ? Array.from(new Set(raw.memberUserIds.map((item) => String(item || "").trim()).filter(Boolean)))
    : [];
  const memberCount = Math.max(
    memberUserIds.length,
    Number.isFinite(Number(raw?.memberCount)) ? Number(raw.memberCount) : memberUserIds.length,
  );

  return {
    id,
    roomCode: String(raw?.roomCode || "").trim(),
    name: String(raw?.name || "未命名派"),
    ownerUserId: String(raw?.ownerUserId || "").trim(),
    memberUserIds,
    memberCount,
    updatedAt: String(raw?.updatedAt || ""),
  };
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages.map((message) => normalizeMessage(message)).filter(Boolean);
}

function normalizeMessage(raw) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const type = String(raw?.type || "").trim().toLowerCase();
  if (type !== "text" && type !== "image" && type !== "system") return null;
  const image = raw?.image && typeof raw.image === "object"
    ? {
        dataUrl: String(raw.image.dataUrl || "").trim(),
        fileName: String(raw.image.fileName || "group-image.png"),
      }
    : null;

  return {
    id,
    roomId: String(raw?.roomId || ""),
    type,
    senderUserId: String(raw?.senderUserId || ""),
    senderName: String(raw?.senderName || (type === "system" ? "系统" : "用户")),
    content:
      type === "system"
        ? normalizeSystemMessageContent(raw?.content)
        : String(raw?.content || ""),
    replyToMessageId: String(raw?.replyToMessageId || ""),
    replyPreviewText: String(raw?.replyPreviewText || ""),
    replySenderName: String(raw?.replySenderName || ""),
    createdAt: String(raw?.createdAt || ""),
    image,
    reactions: normalizeMessageReactions(raw?.reactions),
  };
}

function normalizeSystemMessageContent(text) {
  return String(text || "")
    .replaceAll("创建了群聊", "创建了派")
    .replaceAll("加入了群聊", "加入了派");
}

function normalizeMessageReactions(rawReactions) {
  if (!Array.isArray(rawReactions)) return [];
  const byUser = new Map();
  rawReactions.forEach((item) => {
    const userId = String(item?.userId || "").trim();
    const userName = String(item?.userName || "").trim();
    const emoji = String(item?.emoji || "").trim();
    const createdAt = String(item?.createdAt || "");
    if (!userId || !emoji) return;
    byUser.set(userId, {
      userId,
      userName: userName || "用户",
      emoji,
      createdAt,
    });
  });
  return Array.from(byUser.values())
    .sort((a, b) => toTimestamp(a.createdAt) - toTimestamp(b.createdAt))
    .slice(-32);
}

function normalizeUsers(rawUsers) {
  if (!rawUsers || typeof rawUsers !== "object") return {};
  const map = {};
  Object.entries(rawUsers).forEach(([id, value]) => {
    const key = String(id || "").trim();
    if (!key) return;
    map[key] = {
      id: key,
      name: String(value?.name || "用户"),
    };
  });
  return map;
}

function formatRoomCodeInput(value) {
  const digits = String(value || "").replace(/\D/g, "").slice(0, 9);
  const chunks = digits.match(/.{1,3}/g) || [];
  return chunks.join("-");
}

function normalizeRoomCodeInput(value) {
  const text = formatRoomCodeInput(value);
  return /^\d{3}-\d{3}-\d{3}$/.test(text) ? text : "";
}

function formatTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return "--:--";
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function createReplyTarget(message) {
  if (!message) return null;
  const previewText = message.type === "image"
    ? "[图片]"
    : String(message.content || "").trim().slice(0, 120);
  return {
    id: String(message.id || ""),
    senderName: String(message.senderName || "用户"),
    previewText: previewText || "(空消息)",
  };
}

function renderTextWithMentions(text) {
  const parts = String(text || "").split(/(@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}$/.test(part)) {
      return (
        <mark key={`m-${index}`} className="party-mention">
          {part}
        </mark>
      );
    }
    return <span key={`t-${index}`}>{part}</span>;
  });
}

function toTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 0;
  return date.getTime();
}

function NameAvatar({ name = "", small = false }) {
  const label = String(name || "用户").trim();
  const firstChar = label.slice(0, 1) || "用";
  const hue = computeHue(label);
  const size = small ? 22 : 30;
  return (
    <span className={`name-avatar${small ? " small" : ""}`} style={{ width: size, height: size }}>
      <svg viewBox="0 0 36 36" aria-hidden="true">
        <circle cx="18" cy="18" r="18" fill={`hsl(${hue} 72% 43%)`} />
        <text
          x="18"
          y="22"
          textAnchor="middle"
          fontSize="16"
          fontWeight="700"
          fill="#ffffff"
          fontFamily="Segoe UI, PingFang SC, sans-serif"
        >
          {firstChar}
        </text>
      </svg>
    </span>
  );
}

function computeHue(text) {
  const value = String(text || "");
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) % 360;
  }
  return Math.abs(hash);
}

function escapeRegExpForRegex(text) {
  return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
