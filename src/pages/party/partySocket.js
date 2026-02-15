const PARTY_WS_PATH = "/ws/group-chat";
const RECONNECT_BASE_DELAY_MS = 1000;
const RECONNECT_MAX_DELAY_MS = 16000;

function resolvePartySocketUrl() {
  if (typeof window === "undefined") return "";
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${PARTY_WS_PATH}`;
}

function sanitizeRoomId(value) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/[.$]/g, "")
    .slice(0, 80);
}

function readJsonMessage(raw) {
  const text = typeof raw === "string" ? raw : String(raw || "");
  if (!text) return null;
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function createPartySocketClient({
  token = "",
  onAuthed,
  onJoined,
  onMessageCreated,
  onMessageDeleted,
  onMessageReactionsUpdated,
  onRoomUpdated,
  onRoomDissolved,
  onMemberJoined,
  onMemberPresenceUpdated,
  onRoomReadStateUpdated,
  onError,
  onStatus,
} = {}) {
  const authToken = String(token || "").trim();
  const desiredRooms = new Set();
  let ws = null;
  let authed = false;
  let closedManually = false;
  let reconnectTimer = 0;
  let reconnectAttempt = 0;

  function emitStatus(status, extra = {}) {
    onStatus?.({
      status,
      ...extra,
    });
  }

  function clearReconnectTimer() {
    if (!reconnectTimer) return;
    clearTimeout(reconnectTimer);
    reconnectTimer = 0;
  }

  function send(payload) {
    if (!ws || ws.readyState !== WebSocket.OPEN) return false;
    try {
      ws.send(JSON.stringify(payload || {}));
      return true;
    } catch {
      return false;
    }
  }

  function scheduleReconnect() {
    if (closedManually) return;
    clearReconnectTimer();
    const delay = Math.min(
      RECONNECT_MAX_DELAY_MS,
      RECONNECT_BASE_DELAY_MS * 2 ** Math.min(4, reconnectAttempt),
    );
    reconnectAttempt += 1;
    emitStatus("reconnecting", { attempt: reconnectAttempt, delayMs: delay });
    reconnectTimer = window.setTimeout(() => {
      reconnectTimer = 0;
      connect();
    }, delay);
  }

  function handleServerMessage(payload) {
    const type = String(payload?.type || "")
      .trim()
      .toLowerCase();
    if (!type) return;

    if (type === "authed") {
      authed = true;
      reconnectAttempt = 0;
      emitStatus("authed");
      onAuthed?.(payload);
      desiredRooms.forEach((roomId) => {
        send({ type: "join_room", roomId });
      });
      return;
    }

    if (type === "joined") {
      onJoined?.(payload);
      return;
    }

    if (type === "message_created") {
      onMessageCreated?.(payload);
      return;
    }

    if (type === "message_reactions_updated") {
      onMessageReactionsUpdated?.(payload);
      return;
    }

    if (type === "message_deleted") {
      onMessageDeleted?.(payload);
      return;
    }

    if (type === "room_updated") {
      onRoomUpdated?.(payload);
      return;
    }

    if (type === "room_dissolved") {
      onRoomDissolved?.(payload);
      return;
    }

    if (type === "member_joined") {
      onMemberJoined?.(payload);
      return;
    }

    if (type === "member_presence_updated") {
      onMemberPresenceUpdated?.(payload);
      return;
    }

    if (type === "room_read_state_updated") {
      onRoomReadStateUpdated?.(payload);
      return;
    }

    if (type === "error") {
      onError?.(payload);
      return;
    }
  }

  function connect() {
    clearReconnectTimer();
    if (closedManually) return;
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = resolvePartySocketUrl();
    if (!url) return;

    emitStatus("connecting");
    ws = new WebSocket(url);

    ws.onopen = () => {
      emitStatus("open");
      send({
        type: "auth",
        token: authToken,
      });
    };

    ws.onmessage = (event) => {
      const payload = readJsonMessage(event.data);
      if (!payload) return;
      handleServerMessage(payload);
    };

    ws.onerror = () => {
      emitStatus("error");
    };

    ws.onclose = () => {
      ws = null;
      authed = false;
      emitStatus("closed");
      scheduleReconnect();
    };
  }

  function close() {
    closedManually = true;
    clearReconnectTimer();
    authed = false;
    if (!ws) return;
    if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) {
      ws.close(1000, "client_close");
    }
    ws = null;
  }

  function joinRoom(roomId) {
    const safeRoomId = sanitizeRoomId(roomId);
    if (!safeRoomId) return;
    desiredRooms.add(safeRoomId);
    if (authed) {
      send({ type: "join_room", roomId: safeRoomId });
    }
  }

  function leaveRoom(roomId) {
    const safeRoomId = sanitizeRoomId(roomId);
    if (!safeRoomId) return;
    desiredRooms.delete(safeRoomId);
    if (authed) {
      send({ type: "leave_room", roomId: safeRoomId });
    }
  }

  function ping() {
    if (!authed) return;
    send({
      type: "ping",
      at: new Date().toISOString(),
    });
  }

  return {
    connect,
    close,
    joinRoom,
    leaveRoom,
    ping,
  };
}
