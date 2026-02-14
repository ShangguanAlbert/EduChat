async function readJson(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

function authHeader(adminToken, extra = {}) {
  const token = String(adminToken || "").trim();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

function readContentDispositionFilename(header) {
  const value = String(header || "");
  if (!value) return "";

  const utf8Match = value.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1].trim());
    } catch {
      // ignore
    }
  }

  const plainMatch = value.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (plainMatch?.[1]) return plainMatch[1].trim();
  return "";
}

async function request(path, adminToken, options = {}) {
  const resp = await fetch(path, {
    method: "GET",
    ...options,
    headers: authHeader(adminToken, {
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

export function fetchAdminAgentSettings(adminToken) {
  return request("/api/auth/admin/agent-settings", adminToken);
}

export function saveAdminAgentSettings(adminToken, payload) {
  return request("/api/auth/admin/agent-settings", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function exportAdminUsersTxt(adminToken) {
  return request("/api/auth/admin/export/users-txt", adminToken);
}

export function exportAdminChatsTxt(adminToken) {
  return request("/api/auth/admin/export/chats-txt", adminToken);
}

export async function exportAdminChatsZip(adminToken) {
  const resp = await fetch("/api/auth/admin/export/chats-zip", {
    headers: authHeader(adminToken),
  });

  if (!resp.ok) {
    let message = "";
    try {
      const data = await resp.json();
      message = data?.error || data?.message || "";
    } catch {
      try {
        message = await resp.text();
      } catch {
        message = "";
      }
    }
    throw new Error(message || `请求失败（${resp.status}）`);
  }

  const blob = await resp.blob();
  const filename =
    readContentDispositionFilename(resp.headers.get("Content-Disposition")) ||
    "educhat-chats-by-user.zip";

  return { blob, filename };
}

export function deleteAllUserChats(adminToken) {
  return request("/api/auth/admin/chats", adminToken, {
    method: "DELETE",
  });
}

export async function streamAdminAgentDebug(adminToken, payload, handlers = {}) {
  const safePayload =
    payload && typeof payload === "object" ? payload : {};
  const agentId = String(safePayload.agentId || "A")
    .trim()
    .toUpperCase();
  const isAgentE = agentId === "E";
  const endpoint = isAgentE
    ? "/api/auth/admin/agent-e/debug-stream"
    : "/api/auth/admin/agent-debug-stream";
  const runtimeKey = isAgentE ? "runtimeOverride" : "runtimeConfig";
  const runtimePayload =
    safePayload.runtimeOverride && typeof safePayload.runtimeOverride === "object"
      ? safePayload.runtimeOverride
      : safePayload.runtimeConfig && typeof safePayload.runtimeConfig === "object"
        ? safePayload.runtimeConfig
        : {};
  const files = Array.isArray(safePayload.files)
    ? safePayload.files.filter(Boolean)
    : [];
  const volcengineFileRefs = Array.isArray(safePayload.volcengineFileRefs)
    ? safePayload.volcengineFileRefs.filter(Boolean)
    : [];

  let body;
  let headers;

  if (files.length > 0 || volcengineFileRefs.length > 0) {
    const formData = new FormData();
    formData.append("agentId", agentId);
    formData.append(
      "messages",
      JSON.stringify(
        Array.isArray(safePayload.messages) ? safePayload.messages : [],
      ),
    );
    formData.append(runtimeKey, JSON.stringify(runtimePayload));
    if (volcengineFileRefs.length > 0) {
      formData.append("volcengineFileRefs", JSON.stringify(volcengineFileRefs));
    }
    files.forEach((file) => {
      formData.append("files", file);
    });
    body = formData;
    headers = authHeader(adminToken, {
      Accept: "text/event-stream",
    });
  } else {
    body = JSON.stringify({
      agentId,
      messages: Array.isArray(safePayload.messages) ? safePayload.messages : [],
      [runtimeKey]: runtimePayload,
      volcengineFileRefs,
    });
    headers = authHeader(adminToken, {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    });
  }

  const resp = await fetch(endpoint, {
    method: "POST",
    headers,
    body,
  });

  if (!resp.ok || !resp.body) {
    let message = "";
    try {
      const data = await resp.json();
      message = data?.error || data?.message || "";
    } catch {
      try {
        message = await resp.text();
      } catch {
        message = "";
      }
    }
    throw new Error(message || `请求失败（${resp.status}）`);
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const block = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const event = parseSseEvent(block);
      if (event) {
        handleSseEvent(event, handlers);
      }
      boundary = buffer.indexOf("\n\n");
    }
  }

  const tail = parseSseEvent(buffer);
  if (tail) {
    handleSseEvent(tail, handlers);
  }
}

export async function uploadAdminVolcengineDebugFiles(
  adminToken,
  { agentId = "A", files = [] } = {},
) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  formData.append("agentId", String(agentId || "A"));
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch("/api/auth/admin/volcengine-files/upload", {
    method: "POST",
    headers: authHeader(adminToken),
    body: formData,
  });
  const data = await readJson(resp);
  if (!resp.ok) {
    const message = data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

function parseSseEvent(block) {
  const raw = String(block || "").trim();
  if (!raw) return null;

  const lines = raw.split("\n");
  let event = "message";
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
      return;
    }
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });

  if (dataLines.length === 0) return null;

  let data = {};
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    data = { text: dataLines.join("\n") };
  }

  return { event, data };
}

function handleSseEvent(evt, handlers) {
  if (evt.event === "token") {
    handlers.onToken?.(evt.data?.text || "");
    return;
  }

  if (evt.event === "reasoning_token") {
    handlers.onReasoningToken?.(evt.data?.text || "");
    return;
  }

  if (evt.event === "search_usage") {
    handlers.onSearchUsage?.(evt.data || {});
    return;
  }

  if (evt.event === "meta") {
    handlers.onMeta?.(evt.data || {});
    return;
  }

  if (evt.event === "error") {
    handlers.onError?.(evt.data?.message || "stream error");
    return;
  }

  if (evt.event === "done") {
    handlers.onDone?.(evt.data || {});
  }
}
