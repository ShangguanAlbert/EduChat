import {
  AtSign,
  ArrowLeft,
  Copy,
  Download,
  File as FileIcon,
  FileUp,
  MoreHorizontal,
  ImagePlus,
  Loader2,
  MessageSquareQuote,
  Smile,
  SmilePlus,
  Plus,
  PanelLeft,
  SquarePen,
  SendHorizonal,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  createPartyRoom,
  deletePartyFileMessage,
  dissolvePartyRoom,
  fetchPartyBootstrap,
  fetchPartyMessages,
  joinPartyRoom,
  markPartyRoomRead,
  renamePartyRoom,
  downloadPartyFile,
  sendPartyFileMessage,
  sendPartyImageMessage,
  sendPartyTextMessage,
  togglePartyMessageReaction,
} from "../../party/partyApi.js";
import { createPartySocketClient } from "../../party/partySocket.js";
import "../../../styles/party-chat.css";

const FALLBACK_SYNC_MS = 60 * 1000;
const SOCKET_PING_MS = 20 * 1000;
const PARTY_UPLOAD_FILE_MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
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

export default function PartyChatDesktopPage({
  isMobileSidebarDrawer = false,
  isSidebarDrawerOpen = false,
  onToggleSidebarDrawer = null,
} = {}) {
  const navigate = useNavigate();
  const imageInputRef = useRef(null);
  const fileInputRef = useRef(null);
  const messagesViewportRef = useRef(null);
  const socketRef = useRef(null);
  const joinedRoomIdsRef = useRef(new Set());
  const latestMessageAtRef = useRef("");
  const activeRoomIdRef = useRef("");
  const latestMessageIdByRoomRef = useRef(new Map());
  const lastReadSyncedMessageIdByRoomRef = useRef(new Map());
  const isAtLatestRef = useRef(true);
  const forceScrollToLatestRef = useRef(true);
  const readSyncTimerRef = useRef(0);
  const copyImageToastTimerRef = useRef(0);
  const sideMenuRef = useRef(null);
  const messageMenuRef = useRef(null);
  const composerToolbarRef = useRef(null);
  const composeTextareaRef = useRef(null);
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
  const [isSidebarExpanded, setIsSidebarExpanded] = useState(true);
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
  const [selectedImageFiles, setSelectedImageFiles] = useState([]);
  const [selectedImagePreviewUrls, setSelectedImagePreviewUrls] = useState([]);
  const [sendingImage, setSendingImage] = useState(false);
  const [selectedUploadFiles, setSelectedUploadFiles] = useState([]);
  const [sendingFile, setSendingFile] = useState(false);
  const [downloadingFileMessageId, setDownloadingFileMessageId] = useState("");
  const [showComposerEmojiPanel, setShowComposerEmojiPanel] = useState(false);
  const [showMentionPicker, setShowMentionPicker] = useState(false);
  const [replyTarget, setReplyTarget] = useState(null);
  const [previewImage, setPreviewImage] = useState(null);
  const [isAtLatest, setIsAtLatest] = useState(true);
  const [showCopyImageToast, setShowCopyImageToast] = useState(false);
  const [readReceiptModal, setReadReceiptModal] = useState({
    open: false,
    messageId: "",
    unreadUserIds: [],
    readUserIds: [],
  });
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
  const activeOnlineUserIdSet = useMemo(() => {
    return new Set(
      (Array.isArray(activeRoom?.onlineMemberUserIds) ? activeRoom.onlineMemberUserIds : [])
        .map((item) => String(item || "").trim())
        .filter(Boolean),
    );
  }, [activeRoom]);
  const latestMessageAt = useMemo(() => {
    if (!activeMessages.length) return "";
    return activeMessages[activeMessages.length - 1]?.createdAt || "";
  }, [activeMessages]);
  const composerSending = sendingText || sendingImage || sendingFile;
  const canSendComposer =
    !!activeRoomId &&
    (composeText.trim().length > 0 || selectedImageFiles.length > 0 || selectedUploadFiles.length > 0) &&
    !composerSending;
  const canManageActiveRoom = !!activeRoom && activeRoom.ownerUserId === me.id;
  const bannerMessage = actionError || messagesError || bootstrapError;
  const activeReadStateMap = useMemo(() => {
    const map = new Map();
    if (!canManageActiveRoom) return map;
    const readStates = Array.isArray(activeRoom?.readStates) ? activeRoom.readStates : [];
    readStates.forEach((item) => {
      const userId = String(item?.userId || "").trim();
      if (!userId) return;
      map.set(userId, {
        userId,
        lastReadAt: String(item?.lastReadAt || ""),
        lastReadMessageId: String(item?.lastReadMessageId || ""),
      });
    });
    return map;
  }, [activeRoom, canManageActiveRoom]);
  const showSidebar = isMobileSidebarDrawer ? isSidebarDrawerOpen : isSidebarExpanded;

  const resizeComposeTextarea = useCallback(() => {
    const textarea = composeTextareaRef.current;
    if (!textarea) return;

    if (!isMobileSidebarDrawer) {
      textarea.style.removeProperty("height");
      textarea.style.removeProperty("overflow-y");
      return;
    }

    const minHeight = 40;
    const maxHeight = 132;
    textarea.style.height = "0px";
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, textarea.scrollHeight));
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [isMobileSidebarDrawer]);

  const isNearLatest = useCallback((root) => {
    if (!root) return true;
    const remain = root.scrollHeight - (root.scrollTop + root.clientHeight);
    const threshold = isAtLatestRef.current ? 72 : 40;
    return remain <= threshold;
  }, []);

  const syncLatestState = useCallback(() => {
    const next = isNearLatest(messagesViewportRef.current);
    isAtLatestRef.current = next;
    setIsAtLatest(next);
    return next;
  }, [isNearLatest]);

  const scrollToLatestMessages = useCallback((behavior = "smooth") => {
    const root = messagesViewportRef.current;
    if (!root) return;
    root.scrollTo({ top: root.scrollHeight, behavior });
    isAtLatestRef.current = true;
    setIsAtLatest(true);
  }, []);

  const onMessageImageLoaded = useCallback(() => {
    if (isAtLatestRef.current || forceScrollToLatestRef.current) {
      requestAnimationFrame(() => {
        scrollToLatestMessages("auto");
      });
      return;
    }
    syncLatestState();
  }, [scrollToLatestMessages, syncLatestState]);

  const handleBackToChat = useCallback(() => {
    if (readSyncTimerRef.current) {
      clearTimeout(readSyncTimerRef.current);
      readSyncTimerRef.current = 0;
    }
    if (copyImageToastTimerRef.current) {
      clearTimeout(copyImageToastTimerRef.current);
      copyImageToastTimerRef.current = 0;
    }
    joinedRoomIdsRef.current = new Set();
    socketRef.current?.close();
    socketRef.current = null;
    navigate("/chat", { replace: true });
  }, [navigate]);

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
        ? prev.map((room) => {
            if (room.id !== nextRoom.id) return room;
            const merged = { ...room, ...nextRoom };
            if (!nextRoom.readStatesProvided) {
              merged.readStates = Array.isArray(room.readStates) ? room.readStates : [];
            }
            return merged;
          })
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
    latestMessageIdByRoomRef.current.delete(safeRoomId);
    lastReadSyncedMessageIdByRoomRef.current.delete(safeRoomId);
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

  const applyMessageDeleted = useCallback((roomId, messageId) => {
    const safeRoomId = String(roomId || "").trim();
    const safeMessageId = String(messageId || "").trim();
    if (!safeRoomId || !safeMessageId) return;
    setMessagesByRoom((prev) => {
      const current = Array.isArray(prev[safeRoomId]) ? prev[safeRoomId] : [];
      if (!current.length) return prev;
      const next = current.filter((message) => message.id !== safeMessageId);
      if (next.length === current.length) return prev;
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

  const applyRoomPresence = useCallback((roomId, onlineUserIds) => {
    const safeRoomId = String(roomId || "").trim();
    if (!safeRoomId) return;
    const normalizedOnlineUserIds = Array.from(
      new Set(
        (Array.isArray(onlineUserIds) ? onlineUserIds : [])
          .map((item) => String(item || "").trim())
          .filter(Boolean),
      ),
    );
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== safeRoomId) return room;
        return {
          ...room,
          onlineMemberUserIds: normalizedOnlineUserIds,
        };
      }),
    );
  }, []);

  const applyRoomReadState = useCallback((roomId, readState) => {
    const safeRoomId = String(roomId || "").trim();
    const safeUserId = String(readState?.userId || "").trim();
    if (!safeRoomId || !safeUserId) return;
    const safeLastReadAt = String(readState?.lastReadAt || "").trim();
    const safeLastReadMessageId = String(readState?.lastReadMessageId || "").trim();
    setRooms((prev) =>
      prev.map((room) => {
        if (room.id !== safeRoomId) return room;
        const currentReadStates = Array.isArray(room.readStates) ? room.readStates : [];
        const nextReadState = {
          userId: safeUserId,
          lastReadAt: safeLastReadAt,
          lastReadMessageId: safeLastReadMessageId,
        };
        const exists = currentReadStates.some((item) => item.userId === safeUserId);
        const merged = exists
          ? currentReadStates.map((item) => (item.userId === safeUserId ? nextReadState : item))
          : [...currentReadStates, nextReadState];
        return {
          ...room,
          readStates: merged,
        };
      }),
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
        applyRoomUpsert(result.room);
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
  }, [mergeMessages, applyRoomUpsert]);

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
      onMessageDeleted: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        const messageId = String(payload?.messageId || "").trim();
        if (!roomId || !messageId) return;
        applyMessageDeleted(roomId, messageId);
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
      onMemberPresenceUpdated: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        if (!roomId) return;
        applyRoomPresence(roomId, payload?.onlineUserIds);
      },
      onRoomReadStateUpdated: (payload) => {
        const roomId = String(payload?.roomId || "").trim();
        if (!roomId) return;
        applyRoomReadState(roomId, payload?.readState);
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
      joinedRoomIdsRef.current = new Set();
      socketClient.close();
      socketRef.current = null;
    };
  }, [
    applyMemberJoined,
    applyMessageDeleted,
    applyMessageReactions,
    applyRoomPresence,
    applyRoomReadState,
    applyRoomUpsert,
    loadBootstrap,
    mergeMessages,
    removeRoom,
    touchRoom,
  ]);

  useEffect(() => {
    if (!activeRoomId) return;
    void loadMessages(activeRoomId, { replace: true });
  }, [activeRoomId, loadMessages]);

  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    const nextRoomIds = new Set(
      rooms
        .map((room) => String(room?.id || "").trim())
        .filter(Boolean),
    );
    nextRoomIds.forEach((roomId) => socket.joinRoom(roomId));
    joinedRoomIdsRef.current.forEach((roomId) => {
      if (!nextRoomIds.has(roomId)) {
        socket.leaveRoom(roomId);
      }
    });
    joinedRoomIdsRef.current = nextRoomIds;
  }, [rooms]);

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
    if (showSidebar) return;
    setShowSideMenu(false);
  }, [showSidebar]);

  useEffect(() => {
    if (
      !showCreateRoomModal &&
      !showJoinRoomModal &&
      !showRenameRoomModal &&
      !showDissolveRoomModal &&
      !readReceiptModal.open
    ) {
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
      if (readReceiptModal.open) {
        setReadReceiptModal({
          open: false,
          messageId: "",
          unreadUserIds: [],
          readUserIds: [],
        });
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
    readReceiptModal.open,
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
    if (selectedImageFiles.length === 0) {
      setSelectedImagePreviewUrls([]);
      return undefined;
    }
    const objectUrls = selectedImageFiles.map((file) => URL.createObjectURL(file));
    setSelectedImagePreviewUrls(objectUrls);
    return () => {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [selectedImageFiles]);

  useEffect(() => {
    if (!actionError) return undefined;
    const timer = window.setTimeout(() => {
      setActionError("");
    }, 3000);
    return () => window.clearTimeout(timer);
  }, [actionError]);

  useEffect(() => {
    resizeComposeTextarea();
  }, [composeText, replyTarget?.id, resizeComposeTextarea]);

  useEffect(
    () => () => {
      if (readSyncTimerRef.current) {
        clearTimeout(readSyncTimerRef.current);
        readSyncTimerRef.current = 0;
      }
      if (copyImageToastTimerRef.current) {
        clearTimeout(copyImageToastTimerRef.current);
        copyImageToastTimerRef.current = 0;
      }
    },
    [],
  );

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
    const uploadFile = await compressPartyImageForUpload(file);
    const result = await sendPartyImageMessage(activeRoomId, {
      file: uploadFile,
      replyToMessageId,
    });
    const message = normalizeMessage(result?.message);
    if (message) {
      mergeMessages(activeRoomId, [message], { replace: false });
      touchRoom(activeRoomId, message.createdAt || new Date().toISOString());
    }
  }

  async function dispatchFileMessage(file, replyToMessageId = "") {
    const result = await sendPartyFileMessage(activeRoomId, {
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
    const imageFiles = [...selectedImageFiles];
    const uploadFiles = [...selectedUploadFiles];
    if (!textPayload && imageFiles.length === 0 && uploadFiles.length === 0) return;

    const replyToMessageId = replyTarget?.id || "";
    setSendingText(!!textPayload);
    setSendingImage(imageFiles.length > 0);
    setSendingFile(uploadFiles.length > 0);
    forceScrollToLatestRef.current = true;
    try {
      if (textPayload) {
        await dispatchTextMessage(textPayload, replyToMessageId);
      }
      if (imageFiles.length > 0) {
        for (let index = 0; index < imageFiles.length; index += 1) {
          const imageReplyTo = textPayload ? "" : index === 0 ? replyToMessageId : "";
          await dispatchImageMessage(imageFiles[index], imageReplyTo);
        }
      }
      if (uploadFiles.length > 0) {
        for (let index = 0; index < uploadFiles.length; index += 1) {
          const fileReplyTo = !textPayload && imageFiles.length === 0 && index === 0
            ? replyToMessageId
            : "";
          await dispatchFileMessage(uploadFiles[index], fileReplyTo);
        }
      }

      setComposeText("");
      setSelectedImageFiles([]);
      setSelectedImagePreviewUrls([]);
      setSelectedUploadFiles([]);
      setShowComposerEmojiPanel(false);
      setShowMentionPicker(false);
      setReplyTarget(null);
      setActionError("");
      if (imageInputRef.current) {
        imageInputRef.current.value = "";
      }
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      requestAnimationFrame(() => {
        scrollToLatestMessages("auto");
      });
    } catch (error) {
      setActionError(error?.message || "发送失败，请稍后重试。");
    } finally {
      setSendingText(false);
      setSendingImage(false);
      setSendingFile(false);
    }
  }

  function onPickImageFile(event) {
    const files = Array.from(event.target.files || []);
    if (imageInputRef.current) {
      imageInputRef.current.value = "";
    }
    appendComposerImageFiles(files);
  }

  function onComposerPaste(event) {
    const pastedImageFiles = pickImageFilesFromClipboard(event);
    if (pastedImageFiles.length === 0) return;
    event.preventDefault();
    appendComposerImageFiles(pastedImageFiles);
  }

  function onPickUploadFile(event) {
    const files = Array.from(event.target.files || []);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    appendComposerUploadFiles(files);
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

  function openFilePicker() {
    fileInputRef.current?.click();
  }

  function removeSelectedImage(index) {
    setSelectedImageFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }

  function removeSelectedUploadFile(index) {
    setSelectedUploadFiles((prev) => prev.filter((_, fileIndex) => fileIndex !== index));
  }

  function appendComposerImageFiles(files) {
    const pickedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (pickedFiles.length === 0) return;

    const validImageFiles = pickedFiles.filter((file) => {
      return String(file?.type || "").trim().toLowerCase().startsWith("image/");
    });
    if (validImageFiles.length === 0) {
      setActionError("仅支持图片文件。");
      return;
    }
    if (validImageFiles.length < pickedFiles.length) {
      setActionError("已忽略非图片文件，仅保留图片。");
    } else {
      setActionError("");
    }
    setSelectedImageFiles((prev) => [...prev, ...validImageFiles]);
  }

  function appendComposerUploadFiles(files) {
    const pickedFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (pickedFiles.length === 0) return;

    const nextFiles = [];
    let skippedImage = false;
    let skippedTooLarge = false;
    pickedFiles.forEach((file) => {
      if (!(file instanceof File)) return;
      const mimeType = String(file.type || "").trim().toLowerCase();
      if (mimeType.startsWith("image/")) {
        skippedImage = true;
        return;
      }
      if (Number(file.size || 0) > PARTY_UPLOAD_FILE_MAX_FILE_SIZE_BYTES) {
        skippedTooLarge = true;
        return;
      }
      nextFiles.push(file);
    });

    if (nextFiles.length > 0) {
      setSelectedUploadFiles((prev) => [...prev, ...nextFiles]);
    }
    if (skippedTooLarge) {
      setActionError("文件超过10MB，已自动忽略。");
      return;
    }
    if (skippedImage) {
      setActionError("图片请使用图片按钮发送。");
      return;
    }
    if (nextFiles.length === 0) {
      setActionError("请选择可发送的文件。");
      return;
    }
    setActionError("");
  }

  async function handleDownloadFileMessage(message) {
    const messageId = String(message?.id || "").trim();
    const roomId = String(message?.roomId || activeRoomId || "").trim();
    const fileId = String(message?.file?.fileId || "").trim();
    if (!roomId || !fileId || !messageId) return;

    const expiresAt = String(message?.file?.expiresAt || "").trim();
    if (isFileExpired(expiresAt)) {
      setActionError("文件已过期。");
      return;
    }

    setDownloadingFileMessageId(messageId);
    try {
      const result = await downloadPartyFile(roomId, fileId);
      const blob = result?.blob;
      if (!blob) {
        throw new Error("文件下载失败");
      }
      const fileName = String(result?.fileName || message?.file?.fileName || "group-file.bin");
      const blobUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = blobUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(blobUrl);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "文件下载失败，请稍后重试。");
    } finally {
      setDownloadingFileMessageId("");
    }
  }

  function onMessagesScroll() {
    syncLatestState();
  }

  const syncRoomReadThroughMessage = useCallback(
    async (roomId, messageId) => {
      const safeRoomId = String(roomId || "").trim();
      const safeMessageId = String(messageId || "").trim();
      if (!safeRoomId || !safeMessageId) return;

      const lastSynced = lastReadSyncedMessageIdByRoomRef.current.get(safeRoomId) || "";
      if (lastSynced === safeMessageId) return;
      lastReadSyncedMessageIdByRoomRef.current.set(safeRoomId, safeMessageId);

      try {
        const result = await markPartyRoomRead(safeRoomId, {
          messageId: safeMessageId,
        });
        if (result?.room) {
          applyRoomUpsert(result.room);
        }
      } catch {
        const current = lastReadSyncedMessageIdByRoomRef.current.get(safeRoomId) || "";
        if (current === safeMessageId) {
          lastReadSyncedMessageIdByRoomRef.current.delete(safeRoomId);
        }
      }
    },
    [applyRoomUpsert],
  );

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

  function showImageCopiedNotice() {
    setShowCopyImageToast(true);
    if (copyImageToastTimerRef.current) {
      clearTimeout(copyImageToastTimerRef.current);
    }
    copyImageToastTimerRef.current = window.setTimeout(() => {
      setShowCopyImageToast(false);
      copyImageToastTimerRef.current = 0;
    }, 2000);
  }

  async function copyImageMessage(message) {
    const dataUrl = String(message?.image?.dataUrl || "").trim();
    if (!dataUrl) {
      setActionError("图片复制失败，请稍后重试。");
      return;
    }

    const ClipboardItemCtor = typeof window !== "undefined" ? window.ClipboardItem : undefined;
    if (!navigator.clipboard?.write || !ClipboardItemCtor) {
      setActionError("当前浏览器不支持复制图片。");
      return;
    }

    try {
      const response = await fetch(dataUrl);
      const blob = await response.blob();
      const mimeType = String(blob?.type || "").startsWith("image/") ? blob.type : "image/png";
      await navigator.clipboard.write([
        new ClipboardItemCtor({
          [mimeType]: blob,
        }),
      ]);
      setActionError("");
      showImageCopiedNotice();
    } catch (error) {
      setActionError(error?.message || "图片复制失败，请稍后重试。");
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

  async function handleCopyImageMessage(message) {
    await copyImageMessage(message);
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

  async function handleDeleteFileMessage(message) {
    const messageId = String(message?.id || "").trim();
    const roomId = String(message?.roomId || activeRoomId || "").trim();
    if (!messageId || !roomId) return;

    const confirmed = window.confirm("删除后不可恢复，确认删除该文件消息吗？");
    if (!confirmed) return;
    closeMessageMenu();
    try {
      await deletePartyFileMessage(roomId, messageId);
      applyMessageDeleted(roomId, messageId);
      setActionError("");
    } catch (error) {
      setActionError(error?.message || "删除文件失败，请稍后重试。");
    }
  }

  function buildMessageReadReceipt(message) {
    if (!canManageActiveRoom || !activeRoom || !message || message.type === "system") {
      return null;
    }
    const senderUserId = String(message.senderUserId || "").trim();
    const memberUserIds = Array.isArray(activeRoom.memberUserIds) ? activeRoom.memberUserIds : [];
    const others = memberUserIds.filter((userId) => userId && userId !== senderUserId);
    if (others.length === 0) {
      return {
        label: "全部已读",
        unreadUserIds: [],
        readUserIds: [],
      };
    }

    const messageTs = toTimestamp(message.createdAt);
    const unreadUserIds = [];
    const readUserIds = [];
    others.forEach((userId) => {
      const readState = activeReadStateMap.get(userId);
      const lastReadTs = toTimestamp(readState?.lastReadAt);
      if (messageTs > 0 && lastReadTs >= messageTs) {
        readUserIds.push(userId);
      } else {
        unreadUserIds.push(userId);
      }
    });

    const label =
      unreadUserIds.length === 0
        ? "全部已读"
        : readUserIds.length === 0
          ? "全部未读"
          : `${unreadUserIds.length}人未读`;

    return {
      label,
      unreadUserIds,
      readUserIds,
    };
  }

  function openReadReceiptModal(message) {
    const receipt = buildMessageReadReceipt(message);
    if (!receipt) return;
    setReadReceiptModal({
      open: true,
      messageId: String(message?.id || ""),
      unreadUserIds: receipt.unreadUserIds,
      readUserIds: receipt.readUserIds,
    });
  }

  function closeReadReceiptModal() {
    setReadReceiptModal({
      open: false,
      messageId: "",
      unreadUserIds: [],
      readUserIds: [],
    });
  }

  const contentClassName = `party-content${activeRoom ? "" : " is-empty"}`;

  useEffect(() => {
    forceScrollToLatestRef.current = true;
    isAtLatestRef.current = true;
    setIsAtLatest(true);
    setReadReceiptModal({
      open: false,
      messageId: "",
      unreadUserIds: [],
      readUserIds: [],
    });
    if (readSyncTimerRef.current) {
      clearTimeout(readSyncTimerRef.current);
      readSyncTimerRef.current = 0;
    }
  }, [activeRoomId]);

  useEffect(() => {
    const roomId = String(activeRoomId || "").trim();
    if (!roomId) return;

    const latestId = String(activeMessages[activeMessages.length - 1]?.id || "");
    const prevLatestId = latestMessageIdByRoomRef.current.get(roomId) || "";
    const hasNewTailMessage = !!latestId && latestId !== prevLatestId;
    latestMessageIdByRoomRef.current.set(roomId, latestId);

    if (!hasNewTailMessage && !forceScrollToLatestRef.current) {
      syncLatestState();
      return;
    }

    const shouldForceFollow = forceScrollToLatestRef.current;
    const shouldFollow = shouldForceFollow || isAtLatestRef.current;
    forceScrollToLatestRef.current = false;
    if (!shouldFollow) {
      syncLatestState();
      return;
    }

    requestAnimationFrame(() => {
      scrollToLatestMessages("auto");
    });
  }, [activeMessages, activeRoomId, scrollToLatestMessages, syncLatestState]);

  useEffect(() => {
    const roomId = String(activeRoomId || "").trim();
    if (!roomId || !isAtLatest || activeMessages.length === 0) return undefined;
    const latestMessageId = String(activeMessages[activeMessages.length - 1]?.id || "").trim();
    if (!latestMessageId) return undefined;

    if (readSyncTimerRef.current) {
      clearTimeout(readSyncTimerRef.current);
      readSyncTimerRef.current = 0;
    }
    readSyncTimerRef.current = window.setTimeout(() => {
      readSyncTimerRef.current = 0;
      void syncRoomReadThroughMessage(roomId, latestMessageId);
    }, 140);

    return () => {
      if (readSyncTimerRef.current) {
        clearTimeout(readSyncTimerRef.current);
        readSyncTimerRef.current = 0;
      }
    };
  }, [activeRoomId, activeMessages, isAtLatest, syncRoomReadThroughMessage]);

  return (
    <div className="party-page">
      <header className="party-header">
        <div className="party-header-left">
          <button type="button" className="party-back-btn" onClick={handleBackToChat}>
            <ArrowLeft size={16} />
            返回
          </button>
          <div>
            <h1 className="party-title">派 · 协作</h1>
          </div>
        </div>
        <div className="party-header-right">
          {isMobileSidebarDrawer ? (
            <button
              type="button"
              className="party-mobile-side-icon-btn"
              aria-controls="party-side-panel"
              aria-expanded={showSidebar}
              onClick={() => onToggleSidebarDrawer?.(!showSidebar)}
              title="派侧栏"
            >
              <PanelLeft size={16} />
            </button>
          ) : (
            <button
              type="button"
              className="party-side-toggle-btn"
              aria-controls="party-side-panel"
              aria-expanded={showSidebar}
              onClick={() => setIsSidebarExpanded((prev) => !prev)}
            >
              {showSidebar ? "隐藏侧栏" : "显示侧栏"}
            </button>
          )}
        </div>
      </header>

      <div className={`party-workspace${showSidebar ? "" : " is-side-collapsed"}`}>
        <aside
          id="party-side-panel"
          className={`party-side${showSidebar ? "" : " is-collapsed"}${
            isMobileSidebarDrawer ? " party-side-mobile-drawer" : ""
          }${isMobileSidebarDrawer && showSidebar ? " is-drawer-open" : ""}`}
          aria-hidden={!showSidebar}
        >
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
            <div className="party-room-list-head">
              <h2 className="party-card-title">我的派</h2>
              <div className="party-room-list-chip-group">
                <span className="party-limit-chip">
                  已建 {counts.createdRooms}/{limits.maxCreatedRoomsPerUser}
                </span>
                <span className="party-limit-chip">
                  已加 {counts.joinedRooms}/{limits.maxJoinedRoomsPerUser}
                </span>
              </div>
            </div>
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
                      onClick={() => {
                        setActiveRoomId(room.id);
                        if (isMobileSidebarDrawer) {
                          onToggleSidebarDrawer?.(false);
                        }
                      }}
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
                  const isOnline = isSelf || activeOnlineUserIdSet.has(member.id);
                  return (
                    <div
                      key={member.id}
                      className={`party-side-member-item${isSelf ? " is-self" : ""}`}
                    >
                      <NameAvatar name={member.name} />
                      <span className="party-side-member-name">{member.name}</span>
                      <span className={`party-side-member-status${isOnline ? " online" : ""}`}>
                        {isOnline ? "在线" : "离线"}
                      </span>
                      {isOwner ? <span className="party-side-member-owner">派主</span> : null}
                      {isSelf ? <span className="party-side-member-self">我</span> : null}
                    </div>
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

              <div className="party-messages-wrap">
                <section className="party-messages" ref={messagesViewportRef} onScroll={onMessagesScroll}>
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
                      const readReceipt = buildMessageReadReceipt(message);

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
                                  <div className={`party-message-bubble${message.type !== "text" ? " is-media" : ""}`}>
                                    {message.replyToMessageId ? (
                                      <div className="party-reply-ref">
                                        <span className="party-reply-ref-name">{message.replySenderName}</span>
                                        <span className="party-reply-ref-text">{message.replyPreviewText}</span>
                                      </div>
                                    ) : null}

                                    {message.type === "text" ? (
                                      <div className="party-message-text">{renderTextWithMentions(message.content)}</div>
                                    ) : message.type === "image" ? (
                                      <button
                                        type="button"
                                        className="party-image-thumb-btn"
                                        onClick={() => setPreviewImage(message.image)}
                                      >
                                        <img
                                          src={message.image?.dataUrl}
                                          alt={message.image?.fileName || "派图片"}
                                          className="party-image-thumb"
                                          onLoad={onMessageImageLoaded}
                                          onError={onMessageImageLoaded}
                                        />
                                      </button>
                                    ) : (
                                      <button
                                        type="button"
                                        className="party-file-msg-btn"
                                        onClick={() => void handleDownloadFileMessage(message)}
                                        disabled={downloadingFileMessageId === message.id}
                                      >
                                        <div className="party-file-msg-icon">
                                          {downloadingFileMessageId === message.id ? (
                                            <Loader2 size={15} className="spin" />
                                          ) : (
                                            <FileIcon size={15} />
                                          )}
                                        </div>
                                        <div className="party-file-msg-main">
                                          <span className="party-file-msg-name">
                                            {message?.file?.fileName || "文件"}
                                          </span>
                                          <span className="party-file-msg-meta">
                                            {isFileExpired(message?.file?.expiresAt)
                                              ? "文件已过期"
                                              : `${formatFileSize(message?.file?.size)} · 点击下载`}
                                          </span>
                                        </div>
                                        <Download size={14} />
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

                                        {message.type === "image" ? (
                                          <button
                                            type="button"
                                            className="party-msg-menu-item"
                                            onClick={() => void handleCopyImageMessage(message)}
                                          >
                                            <Copy size={15} />
                                            复制图片
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

                                        {message.type === "file" && (isMine || canManageActiveRoom) ? (
                                          <button
                                            type="button"
                                            className="party-msg-menu-item danger"
                                            onClick={() => void handleDeleteFileMessage(message)}
                                          >
                                            <Trash2 size={15} />
                                            删除文件
                                          </button>
                                        ) : null}

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
                                {readReceipt ? (
                                  <button
                                    type="button"
                                    className={`party-read-receipt-btn${isMine ? " mine" : " other"}`}
                                    onClick={() => openReadReceiptModal(message)}
                                  >
                                    {readReceipt.label}
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })
                  )}
                </section>
                {activeMessages.length > 0 ? (
                  <div
                    className={`party-jump-latest-wrap${isAtLatest ? " is-hidden" : " is-visible"}`}
                  >
                    <button
                      type="button"
                      className="party-jump-latest-btn"
                      onClick={() => scrollToLatestMessages("auto")}
                      disabled={isAtLatest}
                      tabIndex={isAtLatest ? -1 : 0}
                    >
                      跳转到最新消息
                    </button>
                  </div>
                ) : null}
                {showCopyImageToast ? (
                  <div className="party-copy-image-toast" role="status" aria-live="polite">
                    图片已复制
                  </div>
                ) : null}
              </div>

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
                    multiple
                    onChange={onPickImageFile}
                    className="party-file-input"
                  />
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    onChange={onPickUploadFile}
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
                      title="发送文件"
                      onClick={openFilePicker}
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
                    {selectedUploadFiles.length > 0 ? (
                      <div className="party-compose-file-strip" aria-label="待发送文件列表">
                        {selectedUploadFiles.map((file, index) => (
                          <div
                            key={`${file.name || "file"}-${file.size}-${file.lastModified}-${index}`}
                            className="party-compose-file-chip"
                          >
                            <FileIcon size={14} />
                            <span className="party-compose-file-name" title={file.name || "文件"}>
                              {file.name || "文件"}
                            </span>
                            <button
                              type="button"
                              className="party-compose-file-remove"
                              onClick={() => removeSelectedUploadFile(index)}
                              title="移除文件"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : null}

                    {selectedImageFiles.length > 0 ? (
                      <div className="party-compose-image-strip" aria-label="待发送图片列表">
                        {selectedImageFiles.map((file, index) => {
                          const previewUrl = selectedImagePreviewUrls[index] || "";
                          return (
                            <div
                              key={`${file.name || "image"}-${file.size}-${file.lastModified}-${index}`}
                              className="party-compose-image-thumb-wrap"
                            >
                              {previewUrl ? (
                                <img src={previewUrl} alt={file.name || "待发送图片"} />
                              ) : (
                                <span className="party-compose-image-fallback">图</span>
                              )}
                              <button
                                type="button"
                                className="party-compose-image-remove"
                                onClick={() => removeSelectedImage(index)}
                                title="移除图片"
                              >
                                <X size={13} />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    ) : null}

                    <textarea
                      ref={composeTextareaRef}
                      className="party-compose-textarea"
                      placeholder="请输入消息"
                      value={composeText}
                      onChange={(event) => setComposeText(event.target.value)}
                      onPaste={onComposerPaste}
                      rows={isMobileSidebarDrawer ? 1 : 4}
                      onFocus={() => {
                        resizeComposeTextarea();
                      }}
                      onKeyDown={(event) => {
                        if (event.key !== "Enter" || event.shiftKey) return;
                        const composing =
                          Boolean(event.nativeEvent?.isComposing) ||
                          Number(event.nativeEvent?.keyCode) === 229;
                        if (composing) return;
                        event.preventDefault();
                        void handleSendComposer();
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

      {readReceiptModal.open ? (
        <div className="modal-overlay" role="presentation" onClick={closeReadReceiptModal}>
          <div
            className="party-read-receipt-modal"
            role="dialog"
            aria-modal="true"
            aria-label="消息接收人列表"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="party-read-receipt-head">
              <h3 className="party-read-receipt-title">消息接收人列表</h3>
              <button
                type="button"
                className="party-read-receipt-close"
                onClick={closeReadReceiptModal}
                aria-label="关闭"
              >
                <X size={16} />
              </button>
            </div>
            <div className="party-read-receipt-body">
              <section className="party-read-receipt-col">
                <h4>{readReceiptModal.unreadUserIds.length} 人未读</h4>
                {readReceiptModal.unreadUserIds.length === 0 ? (
                  <p className="party-read-receipt-empty">暂无未读成员</p>
                ) : (
                  <div className="party-read-receipt-list">
                    {readReceiptModal.unreadUserIds.map((userId) => {
                      const user = usersById[userId];
                      const name = String(user?.name || "用户");
                      return (
                        <div key={`unread-${userId}`} className="party-read-receipt-item">
                          <NameAvatar name={name} small />
                          <span>{name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
              <section className="party-read-receipt-col">
                <h4>{readReceiptModal.readUserIds.length} 人已读</h4>
                {readReceiptModal.readUserIds.length === 0 ? (
                  <p className="party-read-receipt-empty">暂无已读成员</p>
                ) : (
                  <div className="party-read-receipt-list">
                    {readReceiptModal.readUserIds.map((userId) => {
                      const user = usersById[userId];
                      const name = String(user?.name || "用户");
                      return (
                        <div key={`read-${userId}`} className="party-read-receipt-item">
                          <NameAvatar name={name} small />
                          <span>{name}</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
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

function pickImageFilesFromClipboard(event) {
  const clipboard = event?.clipboardData;
  if (!clipboard) return [];

  const imageFiles = [];
  const seen = new Set();
  const appendFile = (file) => {
    if (!(file instanceof File)) return;
    const type = String(file.type || "").trim().toLowerCase();
    if (!type.startsWith("image/")) return;
    const key = `${file.name || ""}::${file.size}::${type}::${file.lastModified}`;
    if (seen.has(key)) return;
    seen.add(key);
    imageFiles.push(file);
  };

  const clipboardItems = Array.from(clipboard.items || []);
  clipboardItems.forEach((item) => {
    if (!item || item.kind !== "file") return;
    appendFile(item.getAsFile());
  });

  if (imageFiles.length === 0) {
    Array.from(clipboard.files || []).forEach((file) => appendFile(file));
  }
  return imageFiles;
}

async function compressPartyImageForUpload(file) {
  const rawFile = file instanceof File ? file : null;
  if (!rawFile) return file;
  const mimeType = String(rawFile.type || "").trim().toLowerCase();
  if (!mimeType.startsWith("image/")) return rawFile;
  if (mimeType === "image/gif" || mimeType === "image/svg+xml") return rawFile;
  if (rawFile.size <= 420 * 1024) return rawFile;

  try {
    const source = await loadImageSource(rawFile);
    const longestEdge = Math.max(source.width, source.height) || 1;
    const scale = Math.min(1, 1920 / longestEdge);
    const targetWidth = Math.max(1, Math.round(source.width * scale));
    const targetHeight = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const context = canvas.getContext("2d");
    if (!context) {
      source.release();
      return rawFile;
    }
    context.drawImage(source.node, 0, 0, targetWidth, targetHeight);
    source.release();

    const targetBytes = Math.min(Math.max(380 * 1024, Math.round(rawFile.size * 0.72)), 1300 * 1024);
    let quality = 0.9;
    let blob = await canvasToBlob(canvas, "image/webp", quality);
    while (blob && blob.size > targetBytes && quality > 0.62) {
      quality -= 0.08;
      blob = await canvasToBlob(canvas, "image/webp", quality);
    }
    if (!blob) return rawFile;
    if (blob.size >= rawFile.size * 0.95) return rawFile;

    const nextName = replaceFileExtension(rawFile.name || "party-image", "webp");
    return new File([blob], nextName, {
      type: blob.type || "image/webp",
      lastModified: Date.now(),
    });
  } catch {
    return rawFile;
  }
}

async function loadImageSource(file) {
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

  const dataUrl = await readFileAsDataUrl(file);
  const image = await loadImageFromDataUrl(dataUrl);
  return {
    node: image,
    width: image.naturalWidth || image.width,
    height: image.naturalHeight || image.height,
    release: () => {},
  };
}

function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), mimeType, quality);
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("read file failed"));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("decode image failed"));
    image.src = dataUrl;
  });
}

function replaceFileExtension(fileName, nextExt) {
  const baseName = String(fileName || "party-image").trim().replace(/\s+/g, " ");
  const safeExt = String(nextExt || "webp")
    .trim()
    .replace(/^\./, "");
  if (!baseName) return `party-image.${safeExt}`;
  const index = baseName.lastIndexOf(".");
  if (index <= 0) return `${baseName}.${safeExt}`;
  return `${baseName.slice(0, index)}.${safeExt}`;
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
  const readStatesProvided = Array.isArray(raw?.readStates);

  return {
    id,
    roomCode: String(raw?.roomCode || "").trim(),
    name: String(raw?.name || "未命名派"),
    ownerUserId: String(raw?.ownerUserId || "").trim(),
    memberUserIds,
    memberCount,
    updatedAt: String(raw?.updatedAt || ""),
    readStates: readStatesProvided ? normalizeRoomReadStates(raw?.readStates) : [],
    readStatesProvided,
    onlineMemberUserIds: normalizeRoomOnlineUserIds(raw?.onlineMemberUserIds, memberUserIds),
  };
}

function normalizeRoomReadStates(rawReadStates) {
  if (!Array.isArray(rawReadStates)) return [];
  const deduped = new Map();
  rawReadStates.forEach((item) => {
    const userId = String(item?.userId || "").trim();
    if (!userId) return;
    deduped.set(userId, {
      userId,
      lastReadAt: String(item?.lastReadAt || ""),
      lastReadMessageId: String(item?.lastReadMessageId || ""),
    });
  });
  return Array.from(deduped.values());
}

function normalizeRoomOnlineUserIds(rawOnlineUserIds, memberUserIds = []) {
  const memberSet = new Set(Array.isArray(memberUserIds) ? memberUserIds : []);
  return Array.from(
    new Set(
      (Array.isArray(rawOnlineUserIds) ? rawOnlineUserIds : [])
        .map((item) => String(item || "").trim())
        .filter((userId) => userId && memberSet.has(userId)),
    ),
  );
}

function normalizeMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages.map((message) => normalizeMessage(message)).filter(Boolean);
}

function normalizeMessage(raw) {
  const id = String(raw?.id || "").trim();
  if (!id) return null;
  const type = String(raw?.type || "").trim().toLowerCase();
  if (type !== "text" && type !== "image" && type !== "file" && type !== "system") return null;
  const image = raw?.image && typeof raw.image === "object"
    ? {
        dataUrl: String(raw.image.dataUrl || "").trim(),
        fileName: String(raw.image.fileName || "group-image.png"),
      }
    : null;
  const file = raw?.file && typeof raw.file === "object"
    ? {
        fileId: String(raw.file.fileId || "").trim(),
        fileName: String(raw.file.fileName || "group-file.bin"),
        mimeType: String(raw.file.mimeType || "application/octet-stream"),
        size: Number(raw.file.size || 0),
        expiresAt: String(raw.file.expiresAt || ""),
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
    file,
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

function formatFileSize(bytes) {
  const safeBytes = Number(bytes);
  if (!Number.isFinite(safeBytes) || safeBytes <= 0) return "0 B";
  if (safeBytes < 1024) return `${safeBytes} B`;
  const kb = safeBytes / 1024;
  if (kb < 1024) return `${kb.toFixed(kb >= 100 ? 0 : 1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(mb >= 100 ? 0 : 1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(gb >= 100 ? 0 : 1)} GB`;
}

function isFileExpired(expiresAt) {
  const text = String(expiresAt || "").trim();
  if (!text) return false;
  const timestamp = new Date(text).getTime();
  if (!Number.isFinite(timestamp)) return false;
  return timestamp <= Date.now();
}

function createReplyTarget(message) {
  if (!message) return null;
  const previewText = message.type === "image"
    ? "[图片]"
    : message.type === "file"
      ? "[文件]"
      : String(message.content || "").trim().slice(0, 120);
  return {
    id: String(message.id || ""),
    senderName: String(message.senderName || "用户"),
    previewText: previewText || "(空消息)",
  };
}

function renderTextWithMentions(text) {
  const rawText = String(text || "");
  if (!rawText) return null;

  const nodes = [];
  let cursor = 0;
  let keyIndex = 0;
  let matched;
  const linkRegex =
    /(?:https?:\/\/[^\s<>"'`]+|www\.[^\s<>"'`]+|(?:\d{1,3}\.){3}\d{1,3}(?::\d{2,5})?(?:\/[^\s<>"'`]*)?|(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>"'`]*)?)/gi;

  while ((matched = linkRegex.exec(rawText)) !== null) {
    const matchedText = String(matched[0] || "");
    const start = matched.index;
    const end = start + matchedText.length;
    if (start > cursor) {
      nodes.push(...renderMentionSegment(rawText.slice(cursor, start), `seg-${keyIndex}`));
      keyIndex += 1;
    }

    const { urlText, trailing } = splitLinkAndTrailingPunctuation(matchedText);
    if (shouldLinkifyToken(urlText, rawText, start)) {
      const href = normalizeUrlHref(urlText);
      nodes.push(
        <a
          key={`link-${keyIndex}`}
          className="party-message-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
        >
          {urlText}
        </a>,
      );
      keyIndex += 1;
    } else {
      nodes.push(...renderMentionSegment(matchedText, `seg-${keyIndex}`));
      keyIndex += 1;
      cursor = end;
      continue;
    }
    if (trailing) {
      nodes.push(<span key={`trail-${keyIndex}`}>{trailing}</span>);
      keyIndex += 1;
    }

    cursor = end;
  }

  if (cursor < rawText.length) {
    nodes.push(...renderMentionSegment(rawText.slice(cursor), `seg-${keyIndex}`));
  }

  return nodes;
}

function renderMentionSegment(segment, keyPrefix) {
  const parts = String(segment || "").split(/(@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20})/g);
  return parts.map((part, index) => {
    if (!part) return null;
    if (/^@[\u4e00-\u9fa5A-Za-z0-9_-]{1,20}$/.test(part)) {
      return (
        <mark key={`${keyPrefix}-m-${index}`} className="party-mention">
          {part}
        </mark>
      );
    }
    return <span key={`${keyPrefix}-t-${index}`}>{part}</span>;
  });
}

function splitLinkAndTrailingPunctuation(text) {
  const value = String(text || "");
  if (!value) {
    return { urlText: "", trailing: "" };
  }
  const match = value.match(/[),.!?:;'"`，。！？；：、）】》]+$/u);
  if (!match) {
    return { urlText: value, trailing: "" };
  }
  const trailing = match[0];
  const urlText = value.slice(0, value.length - trailing.length);
  if (!urlText) {
    return { urlText: value, trailing: "" };
  }
  return { urlText, trailing };
}

function shouldLinkifyToken(token, sourceText, startIndex) {
  const value = String(token || "").trim();
  if (!value) return false;

  const host = extractHostFromLinkToken(value);
  if (!host) return false;

  const withProtocol = /^https?:\/\//i.test(value);
  const startsWithWww = /^www\./i.test(value);
  const hostIsIPv4 = isValidIPv4Host(host);
  const hostIsDomain = isValidDomainHost(host);
  if (!hostIsIPv4 && !hostIsDomain) return false;

  if (!withProtocol && !startsWithWww) {
    const prevChar = startIndex > 0 ? sourceText.charAt(startIndex - 1) : "";
    if (prevChar === "@") {
      return false;
    }
  }

  return true;
}

function extractHostFromLinkToken(token) {
  let value = String(token || "").trim();
  if (!value) return "";

  value = value.replace(/^[a-z]+:\/\//i, "");
  const pathIndex = value.search(/[/?#]/);
  if (pathIndex >= 0) {
    value = value.slice(0, pathIndex);
  }
  const atIndex = value.lastIndexOf("@");
  if (atIndex >= 0) {
    value = value.slice(atIndex + 1);
  }
  if (!value) return "";

  const colonIndex = value.lastIndexOf(":");
  if (colonIndex > 0 && value.indexOf(":") === colonIndex) {
    const portText = value.slice(colonIndex + 1);
    if (/^\d{2,5}$/.test(portText)) {
      value = value.slice(0, colonIndex);
    }
  }
  return value.toLowerCase();
}

function isValidDomainHost(host) {
  const value = String(host || "").trim().toLowerCase();
  if (!value || !value.includes(".") || value.length > 253) return false;

  const labels = value.split(".");
  if (labels.some((label) => !label || label.length > 63)) {
    return false;
  }
  const tld = labels[labels.length - 1];
  if (!/^[a-z]{2,63}$/.test(tld)) {
    return false;
  }
  return labels.every(
    (label) => /^[a-z0-9-]+$/i.test(label) && !label.startsWith("-") && !label.endsWith("-"),
  );
}

function isValidIPv4Host(host) {
  const parts = String(host || "").split(".");
  if (parts.length !== 4) return false;
  return parts.every((part) => {
    if (!/^\d{1,3}$/.test(part)) return false;
    const value = Number(part);
    return value >= 0 && value <= 255;
  });
}

function normalizeUrlHref(text) {
  const value = String(text || "").trim();
  if (!value) return "";
  if (/^https?:\/\//i.test(value)) return value;
  const host = extractHostFromLinkToken(value);
  if (isValidIPv4Host(host)) {
    return `http://${value}`;
  }
  return `https://${value}`;
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
