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

export function markPartyRoomRead(roomId, { messageId = "" } = {}) {
  const safeRoomId = String(roomId || "").trim();
  return request(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/read`, {
    method: "POST",
    body: JSON.stringify({
      messageId: String(messageId || "").trim(),
    }),
  });
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
    formData.append("fileName", String(file?.name || ""));
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

export async function sendPartyFileMessage(roomId, { file, replyToMessageId = "" } = {}) {
  const safeRoomId = String(roomId || "").trim();
  const formData = new FormData();
  if (file) {
    formData.append("file", file);
    formData.append("fileName", String(file?.name || ""));
  }
  if (replyToMessageId) {
    formData.append("replyToMessageId", String(replyToMessageId).trim());
  }

  const resp = await fetch(`/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages/file`, {
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

export async function downloadPartyFile(roomId, fileId) {
  const safeRoomId = String(roomId || "").trim();
  const safeFileId = String(fileId || "").trim();
  const resp = await fetch(
    `/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/files/${encodeURIComponent(safeFileId)}/download`,
    {
      method: "GET",
      headers: authHeaders(),
    },
  );
  const contentType = String(resp.headers.get("content-type") || "").toLowerCase();

  if (!resp.ok) {
    const data = contentType.includes("application/json") ? await readJson(resp) : null;
    const message = data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }

  if (contentType.includes("application/json")) {
    const data = await readJson(resp);
    const downloadUrl = String(data?.downloadUrl || "").trim();
    if (downloadUrl) {
      return {
        downloadUrl,
        fileName: String(data?.fileName || "").trim(),
        mimeType: String(data?.mimeType || ""),
      };
    }
  }

  const blob = await resp.blob();
  return {
    blob,
    fileName: parseFileNameFromContentDisposition(resp.headers.get("content-disposition")),
    mimeType: String(resp.headers.get("content-type") || ""),
  };
}

export function deletePartyFileMessage(roomId, messageId) {
  const safeRoomId = String(roomId || "").trim();
  const safeMessageId = String(messageId || "").trim();
  return request(
    `/api/group-chat/rooms/${encodeURIComponent(safeRoomId)}/messages/${encodeURIComponent(
      safeMessageId,
    )}/file`,
    {
      method: "DELETE",
    },
  );
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

function parseFileNameFromContentDisposition(disposition) {
  const text = String(disposition || "");
  if (!text) return "";

  const utf8Match = text.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match && utf8Match[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }

  const plainMatch = text.match(/filename="([^"]+)"/i) || text.match(/filename=([^;]+)/i);
  if (!plainMatch || !plainMatch[1]) return "";
  return String(plainMatch[1]).trim();
}
