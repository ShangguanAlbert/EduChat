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

export function fetchChatBootstrap() {
  return request("/api/chat/bootstrap");
}

export function saveChatState(payload) {
  return request("/api/chat/state", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveChatStateMeta(payload) {
  return request("/api/chat/state/meta", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveChatSessionMessages(payload) {
  return request("/api/chat/state/messages", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function saveUserProfile(payload) {
  return request("/api/user/profile", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getAuthTokenHeader() {
  return authHeaders();
}
