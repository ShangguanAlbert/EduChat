import { getUserToken } from "../../app/authStorage.js";

function getToken() {
  return getUserToken();
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

export function clearChatSmartContext(sessionId) {
  return request("/api/chat/smart-context/clear", {
    method: "POST",
    body: JSON.stringify({
      sessionId: String(sessionId || "").trim(),
    }),
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

export async function uploadVolcengineChatFiles({ agentId = "A", files = [] } = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  formData.append("agentId", String(agentId || "A"));
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch("/api/chat/volcengine-files/upload", {
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

export async function prepareChatAttachments({
  agentId = "A",
  sessionId = "",
  files = [],
} = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  formData.append("agentId", String(agentId || "A"));
  formData.append("sessionId", String(sessionId || "").trim());
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch("/api/chat/attachments/prepare", {
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

export async function stageChatPreviewAttachments({
  files = [],
  sessionId = "",
} = {}) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });
  if (String(sessionId || "").trim()) {
    formData.append("sessionId", String(sessionId).trim());
  }

  const resp = await fetch("/api/chat/attachments/stage-preview", {
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

export async function fetchChatDocumentPreviewBlob({ file, signal } = {}) {
  if (!(file instanceof File)) {
    throw new Error("缺少可预览的文档文件。");
  }

  const formData = new FormData();
  formData.append("file", file);

  const resp = await fetch("/api/chat/document-preview", {
    method: "POST",
    headers: authHeaders(),
    body: formData,
    signal,
  });

  if (!resp.ok) {
    const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await readJson(resp);
      const message = data?.error || data?.message || `请求失败（${resp.status}）`;
      throw new Error(message);
    }
    const text = await resp.text().catch(() => "");
    throw new Error(text || `请求失败（${resp.status}）`);
  }

  return resp.blob();
}

export async function fetchChatAttachmentDocumentPreviewBlob({
  sessionId = "",
  messageId = "",
  attachmentIndex = -1,
  attachment = null,
  signal,
} = {}) {
  const params = new URLSearchParams();
  params.set("sessionId", String(sessionId || "").trim());
  params.set("messageId", String(messageId || "").trim());
  params.set("attachmentIndex", String(Number(attachmentIndex)));
  const ossKey = String(attachment?.ossKey || "").trim();
  const url = String(attachment?.url || attachment?.fileUrl || "").trim();
  const fileName = String(attachment?.name || attachment?.fileName || "").trim();
  const mimeType = String(attachment?.type || attachment?.mimeType || "").trim();
  if (ossKey) params.set("ossKey", ossKey);
  if (url) params.set("url", url);
  if (fileName) params.set("fileName", fileName);
  if (mimeType) params.set("mimeType", mimeType);

  const resp = await fetch(`/api/chat/document-preview/attachment?${params.toString()}`, {
    method: "GET",
    headers: authHeaders(),
    signal,
  });

  if (!resp.ok) {
    const contentType = String(resp.headers.get("content-type") || "").toLowerCase();
    if (contentType.includes("application/json")) {
      const data = await readJson(resp);
      const message = data?.error || data?.message || `请求失败（${resp.status}）`;
      throw new Error(message);
    }
    const text = await resp.text().catch(() => "");
    throw new Error(text || `请求失败（${resp.status}）`);
  }

  return resp.blob();
}

export async function fetchChatDocumentPreviewPdf(options = {}) {
  return fetchChatDocumentPreviewBlob(options);
}

export async function fetchChatAttachmentDocumentPreviewPdf(options = {}) {
  return fetchChatAttachmentDocumentPreviewBlob(options);
}

export function downloadChatAttachment({
  sessionId = "",
  messageId = "",
  attachmentIndex = -1,
  mode = "download",
  attachment = null,
} = {}) {
  const params = new URLSearchParams();
  params.set("sessionId", String(sessionId || "").trim());
  params.set("messageId", String(messageId || "").trim());
  params.set("attachmentIndex", String(Number(attachmentIndex)));
  if (String(mode || "").trim()) {
    params.set("mode", String(mode || "").trim());
  }
  const ossKey = String(attachment?.ossKey || "").trim();
  const url = String(attachment?.url || attachment?.fileUrl || "").trim();
  const fileName = String(attachment?.name || attachment?.fileName || "").trim();
  const mimeType = String(attachment?.type || attachment?.mimeType || "").trim();
  if (ossKey) params.set("ossKey", ossKey);
  if (url) params.set("url", url);
  if (fileName) params.set("fileName", fileName);
  if (mimeType) params.set("mimeType", mimeType);
  return request(`/api/chat/attachments/download?${params.toString()}`);
}

export function suggestChatSessionTitle({
  question = "",
  answer = "",
} = {}) {
  return request("/api/chat/sessions/suggest-title", {
    method: "POST",
    body: JSON.stringify({
      question: String(question || ""),
      answer: String(answer || ""),
    }),
  });
}

export async function reportChatClientDebug(event, payload = {}) {
  const safeEvent = String(event || "").trim();
  if (!safeEvent) return;
  try {
    await fetch("/api/chat/debug-log", {
      method: "POST",
      headers: authHeaders({
        "Content-Type": "application/json",
      }),
      body: JSON.stringify({
        event: safeEvent,
        payload,
      }),
      keepalive: true,
    });
  } catch {
    // Ignore debug reporting failures.
  }
}
