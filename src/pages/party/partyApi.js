function getToken() {
  return String(localStorage.getItem("token") || "");
}

function authHeaders(extra = {}) {
  const token = getToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function readJson(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

async function request(path, options = {}) {
  const resp = await fetch(path, {
    method: "GET",
    ...options,
    headers: authHeaders({
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    }),
  });
  const data = await readJson(resp);
  if (!resp.ok) {
    const message = data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export function fetchPartyBootstrap() {
  return request("/api/group-chat/bootstrap");
}

export function createPartyRoom(name) {
  return request("/api/group-chat/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: String(name || "").trim(),
    }),
  });
}

export function joinPartyRoom(roomCode) {
  return request("/api/group-chat/rooms/join", {
    method: "POST",
    body: JSON.stringify({
      roomCode: String(roomCode || "").trim(),
    }),
  });
}

export function renamePartyRoom(roomId, name) {
  const safeRoomId = String(roomId || "").trim();
  return request(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}`, {
    method: "PATCH",
    body: JSON.stringify({
      name: String(name || "").trim(),
    }),
  });
}

export function dissolvePartyRoom(roomId) {
  const safeRoomId = String(roomId || "").trim();
  return request(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}`, {
    method: "DELETE",
  });
}

export function fetchPartyMessages(roomId, { after = "", limit = 80 } = {}) {
  const safeRoomId = String(roomId || "").trim();
  const params = new URLSearchParams();
  if (after) params.set("after", String(after));
  if (limit) params.set("limit", String(limit));
  const query = params.toString();
  return request(
    `/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages${query ? `?${query}` : ""}`,
  );
}

export function sendPartyTextMessage(roomId, { content = "", replyToMessageId = "" } = {}) {
  const safeRoomId = String(roomId || "").trim();
  return request(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages/text`, {
    method: "POST",
    body: JSON.stringify({
      content: String(content || ""),
      replyToMessageId: String(replyToMessageId || "").trim(),
    }),
  });
}

export async function sendPartyImageMessage(roomId, { file, replyToMessageId = "" } = {}) {
  const safeRoomId = String(roomId || "").trim();
  const formData = new FormData();
  if (file) {
    formData.append("image", file);
  }
  if (replyToMessageId) {
    formData.append("replyToMessageId", String(replyToMessageId).trim());
  }

  const resp = await fetch(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages/image`, {
    method: "POST",
    headers: authHeaders(),
    body: formData,
  });
  const data = await readJson(resp);
  if (!resp.ok) {
    const message = data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export function togglePartyMessageReaction(roomId, messageId, emoji) {
  const safeRoomId = String(roomId || "").trim();
  const safeMessageId = String(messageId || "").trim();
  return request(
    `/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(
      safeMessageId,
    )}/reactions/toggle`,
    {
      method: "POST",
      body: JSON.stringify({
        emoji: String(emoji || ""),
      }),
    },
  );
}
