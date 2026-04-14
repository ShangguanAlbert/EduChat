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

function withTeacherScopeQuery(path, teacherScopeKey) {
  const key = String(teacherScopeKey || "").trim();
  if (!key) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}teacherScopeKey=${encodeURIComponent(key)}`;
}

function withExportDateQuery(path, exportDate) {
  const safeExportDate = String(exportDate || "").trim();
  if (!safeExportDate) return path;
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}exportDate=${encodeURIComponent(safeExportDate)}`;
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
    const message =
      data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export function fetchAdminAgentSettings(adminToken) {
  return request("/api/auth/admin/agent-settings", adminToken);
}

export function fetchAdminMe(adminToken) {
  return request("/api/auth/admin/me", adminToken);
}

export function fetchAdminUserDirectory(adminToken) {
  return request("/api/auth/admin/user-directory", adminToken);
}

export function createAdminUserDirectoryUser(adminToken, payload = {}) {
  return request("/api/auth/admin/user-directory/users", adminToken, {
    method: "POST",
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
}

export function createAdminUserDirectoryClassCategory(
  adminToken,
  payload = {},
) {
  return request(
    "/api/auth/admin/user-directory/class-categories",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify(
        payload && typeof payload === "object" ? payload : {},
      ),
    },
  );
}

export function updateAdminUserDirectoryUser(adminToken, userId, payload) {
  const safeUserId = String(userId || "").trim();
  return request(
    `/api/auth/admin/user-directory/users/${encodeURIComponent(safeUserId)}`,
    adminToken,
    {
      method: "PUT",
      body: JSON.stringify(
        payload && typeof payload === "object" ? payload : {},
      ),
    },
  );
}

export function deleteAdminUserDirectoryUser(adminToken, userId, payload = {}) {
  const safeUserId = String(userId || "").trim();
  return request(
    `/api/auth/admin/user-directory/users/${encodeURIComponent(safeUserId)}`,
    adminToken,
    {
      method: "DELETE",
      body: JSON.stringify(
        payload && typeof payload === "object" ? payload : {},
      ),
    },
  );
}

export function mergeAdminUserDirectoryUsers(adminToken, payload = {}) {
  return request("/api/auth/admin/user-directory/merge", adminToken, {
    method: "POST",
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
}

export function createAdminChatSession(adminToken, payload = {}) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  return request("/api/auth/admin/chat-session", adminToken, {
    method: "POST",
    body: JSON.stringify(safePayload),
  });
}

export function fetchAdminGeneratedImageGroups(adminToken, keyword = "") {
  const safeKeyword = String(keyword || "").trim();
  const path = safeKeyword
    ? `/api/auth/admin/images/history?keyword=${encodeURIComponent(safeKeyword)}`
    : "/api/auth/admin/images/history";
  return request(path, adminToken);
}

export function backfillAdminGeneratedImageThumbnails(
  adminToken,
  payload = {},
) {
  return request(
    "/api/auth/admin/images/history/backfill-thumbnails",
    adminToken,
    {
      method: "POST",
      body: JSON.stringify(
        payload && typeof payload === "object" ? payload : {},
      ),
    },
  );
}

export async function downloadAdminGeneratedImage(adminToken, imageId) {
  const safeImageId = String(imageId || "").trim();
  const resp = await fetch(
    `/api/auth/admin/images/history/${encodeURIComponent(safeImageId)}/content?download=1`,
    {
      method: "GET",
      headers: authHeader(adminToken),
    },
  );
  const contentType = String(
    resp.headers.get("content-type") || "",
  ).toLowerCase();

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

  if (contentType.includes("application/json")) {
    const data = await readJson(resp);
    const downloadUrl = String(data?.downloadUrl || "").trim();
    if (downloadUrl) {
      return {
        downloadUrl,
        filename: String(data?.fileName || "图片.png").trim() || "图片.png",
        mimeType: String(data?.mimeType || ""),
      };
    }
  }

  const blob = await resp.blob();
  const filename =
    readContentDispositionFilename(resp.headers.get("Content-Disposition")) ||
    "图片.png";
  return { blob, filename };
}

export function fetchAdminOnlinePresence(adminToken, className = "") {
  const safeClassName = String(className || "").trim();
  const path = safeClassName
    ? `/api/auth/admin/online-presence?className=${encodeURIComponent(safeClassName)}`
    : "/api/auth/admin/online-presence";
  return request(path, adminToken);
}

export function saveAdminAgentSettings(adminToken, payload) {
  return request("/api/auth/admin/agent-settings", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminClassroomSettings(adminToken) {
  return request("/api/auth/admin/classroom-settings", adminToken);
}

export function saveAdminClassroomSettings(adminToken, payload) {
  return request("/api/auth/admin/classroom-settings", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminClassroomPlans(adminToken) {
  return request("/api/auth/admin/classroom-plans", adminToken);
}

export function saveAdminClassroomPlans(adminToken, payload) {
  return request("/api/auth/admin/classroom-plans", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminClassroomSeatLayouts(adminToken) {
  return request("/api/auth/admin/classroom-seat-layouts", adminToken);
}

export function saveAdminClassroomSeatLayouts(adminToken, payload = {}) {
  return request("/api/auth/admin/classroom-seat-layouts", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
}

export function fetchAdminClassroomHomeworkOverview(adminToken) {
  return request("/api/auth/admin/classroom-homework/overview", adminToken);
}

export function fetchAdminGroupChatRooms(adminToken) {
  return request("/api/auth/admin/group-chat/rooms", adminToken);
}

export function createAdminGroupChatRoom(adminToken, payload = {}) {
  return request("/api/auth/admin/group-chat/rooms", adminToken, {
    method: "POST",
    body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
  });
}

export function dissolveAdminGroupChatRoom(adminToken, roomId) {
  const safeRoomId = String(roomId || "").trim();
  return request(
    `/api/auth/admin/group-chat/rooms/${encodeURIComponent(safeRoomId)}`,
    adminToken,
    {
      method: "DELETE",
    },
  );
}

export async function uploadAdminClassroomLessonFiles(
  adminToken,
  lessonId,
  files = [],
) {
  const safeLessonId = String(lessonId || "").trim();
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch(
    `/api/auth/admin/classroom-plans/${encodeURIComponent(safeLessonId)}/files`,
    {
      method: "POST",
      headers: authHeader(adminToken),
      body: formData,
    },
  );
  const data = await readJson(resp);
  if (!resp.ok) {
    const message =
      data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export async function uploadAdminClassroomTaskFiles(
  adminToken,
  lessonId,
  taskId,
  files = [],
) {
  const safeLessonId = String(lessonId || "").trim();
  const safeTaskId = String(taskId || "").trim();
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch(
    `/api/auth/admin/classroom-plans/${encodeURIComponent(
      safeLessonId,
    )}/tasks/${encodeURIComponent(safeTaskId)}/files`,
    {
      method: "POST",
      headers: authHeader(adminToken),
      body: formData,
    },
  );
  const data = await readJson(resp);
  if (!resp.ok) {
    const message =
      data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export function deleteAdminClassroomLessonFile(adminToken, lessonId, fileId) {
  const safeLessonId = String(lessonId || "").trim();
  const safeFileId = String(fileId || "").trim();
  return request(
    `/api/auth/admin/classroom-plans/${encodeURIComponent(
      safeLessonId,
    )}/files/${encodeURIComponent(safeFileId)}`,
    adminToken,
    { method: "DELETE" },
  );
}

export function deleteAdminClassroomTaskFile(
  adminToken,
  lessonId,
  taskId,
  fileId,
) {
  const safeLessonId = String(lessonId || "").trim();
  const safeTaskId = String(taskId || "").trim();
  const safeFileId = String(fileId || "").trim();
  return request(
    `/api/auth/admin/classroom-plans/${encodeURIComponent(
      safeLessonId,
    )}/tasks/${encodeURIComponent(safeTaskId)}/files/${encodeURIComponent(safeFileId)}`,
    adminToken,
    { method: "DELETE" },
  );
}

export async function downloadAdminClassroomLessonFile(adminToken, fileId) {
  const safeFileId = String(fileId || "").trim();
  const resp = await fetch(
    `/api/auth/admin/classroom-plans/files/${encodeURIComponent(safeFileId)}/download`,
    {
      method: "GET",
      headers: authHeader(adminToken),
    },
  );
  const contentType = String(
    resp.headers.get("content-type") || "",
  ).toLowerCase();

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

  if (contentType.includes("application/json")) {
    const data = await readJson(resp);
    const downloadUrl = String(data?.downloadUrl || "").trim();
    if (downloadUrl) {
      return {
        downloadUrl,
        filename:
          String(data?.fileName || "课程文件.bin").trim() || "课程文件.bin",
        mimeType: String(data?.mimeType || ""),
      };
    }
  }

  const blob = await resp.blob();
  const filename =
    readContentDispositionFilename(resp.headers.get("Content-Disposition")) ||
    "课程文件.bin";
  return { blob, filename };
}

export async function downloadAdminClassroomHomeworkFile(adminToken, fileId) {
  const safeFileId = String(fileId || "").trim();
  const resp = await fetch(
    `/api/auth/admin/classroom-homework/files/${encodeURIComponent(safeFileId)}/download`,
    {
      method: "GET",
      headers: authHeader(adminToken),
    },
  );
  const contentType = String(
    resp.headers.get("content-type") || "",
  ).toLowerCase();

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

  if (contentType.includes("application/json")) {
    const data = await readJson(resp);
    const downloadUrl = String(data?.downloadUrl || "").trim();
    if (downloadUrl) {
      return {
        downloadUrl,
        filename:
          String(data?.fileName || "作业文件.bin").trim() || "作业文件.bin",
        mimeType: String(data?.mimeType || ""),
      };
    }
  }

  const blob = await resp.blob();
  const filename =
    readContentDispositionFilename(resp.headers.get("Content-Disposition")) ||
    "作业文件.bin";
  return { blob, filename };
}

export async function exportAdminClassroomHomeworkLessonZip(
  adminToken,
  lessonId,
) {
  const safeLessonId = String(lessonId || "").trim();
  const resp = await fetch(
    `/api/auth/admin/classroom-homework/lessons/${encodeURIComponent(safeLessonId)}/export`,
    {
      method: "GET",
      headers: authHeader(adminToken),
    },
  );

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
    "课时作业批量导出.zip";
  return { blob, filename };
}

export function exportAdminUsersTxt(adminToken) {
  return request("/api/auth/admin/export/users-txt", adminToken);
}

export function exportAdminChatsTxt(adminToken, teacherScopeKey) {
  return request(
    withTeacherScopeQuery("/api/auth/admin/export/chats-txt", teacherScopeKey),
    adminToken,
  );
}

export function exportAdminGroupChatsTxt(
  adminToken,
  teacherScopeKey,
  options = {},
) {
  return request(
    withExportDateQuery(
      withTeacherScopeQuery(
        "/api/auth/admin/export/group-chats-txt",
        teacherScopeKey,
      ),
      options?.exportDate,
    ),
    adminToken,
  );
}

export function exportAdminGeneratedImagesTxt(adminToken, teacherScopeKey) {
  return request(
    withTeacherScopeQuery(
      "/api/auth/admin/export/generated-images-txt",
      teacherScopeKey,
    ),
    adminToken,
  );
}

export async function exportAdminChatsZip(
  adminToken,
  teacherScopeKey,
  options = {},
) {
  const path = withExportDateQuery(
    withTeacherScopeQuery("/api/auth/admin/export/chats-zip", teacherScopeKey),
    options?.exportDate,
  );
  const resp = await fetch(path, {
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

export async function exportAdminAllRecordsZip(adminToken, teacherScopeKey) {
  const resp = await fetch(
    withTeacherScopeQuery(
      "/api/auth/admin/export/all-records-zip",
      teacherScopeKey,
    ),
    {
      headers: authHeader(adminToken),
    },
  );

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
    "educhat-all-records.zip";
  return { blob, filename };
}

export function deleteAllUserChats(adminToken, teacherScopeKey) {
  return request(
    withTeacherScopeQuery("/api/auth/admin/chats", teacherScopeKey),
    adminToken,
    {
      method: "DELETE",
    },
  );
}

export async function streamAdminAgentDebug(
  adminToken,
  payload,
  handlers = {},
) {
  const safePayload = payload && typeof payload === "object" ? payload : {};
  const agentId = String(safePayload.agentId || "A")
    .trim()
    .toUpperCase();
  const endpoint = "/api/auth/admin/agent-debug-stream";
  const runtimeKey = "runtimeConfig";
  const runtimePayload =
    safePayload.runtimeOverride &&
    typeof safePayload.runtimeOverride === "object"
      ? safePayload.runtimeOverride
      : safePayload.runtimeConfig &&
          typeof safePayload.runtimeConfig === "object"
        ? safePayload.runtimeConfig
        : {};
  const files = Array.isArray(safePayload.files)
    ? safePayload.files.filter(Boolean)
    : [];
  const volcengineFileRefs = Array.isArray(safePayload.volcengineFileRefs)
    ? safePayload.volcengineFileRefs.filter(Boolean)
    : [];
  const preparedAttachmentRefs = Array.isArray(
    safePayload.preparedAttachmentRefs,
  )
    ? safePayload.preparedAttachmentRefs.filter(Boolean)
    : [];
  const sessionId = String(safePayload.sessionId || "").trim();

  let body;
  let headers;

  if (
    files.length > 0 ||
    volcengineFileRefs.length > 0 ||
    preparedAttachmentRefs.length > 0
  ) {
    const formData = new FormData();
    formData.append("agentId", agentId);
    if (sessionId) {
      formData.append("sessionId", sessionId);
    }
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
    if (preparedAttachmentRefs.length > 0) {
      formData.append(
        "preparedAttachmentRefs",
        JSON.stringify(preparedAttachmentRefs),
      );
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
      sessionId,
      messages: Array.isArray(safePayload.messages) ? safePayload.messages : [],
      [runtimeKey]: runtimePayload,
      volcengineFileRefs,
      preparedAttachmentRefs,
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
    const message =
      data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export async function prepareAdminDebugAttachments(
  adminToken,
  { agentId = "A", sessionId = "", files = [] } = {},
) {
  const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
  const formData = new FormData();
  formData.append("agentId", String(agentId || "A"));
  formData.append("sessionId", String(sessionId || "").trim());
  safeFiles.forEach((file) => {
    formData.append("files", file);
  });

  const resp = await fetch("/api/auth/admin/attachments/prepare", {
    method: "POST",
    headers: authHeader(adminToken),
    body: formData,
  });
  const data = await readJson(resp);
  if (!resp.ok) {
    const message =
      data?.error || data?.message || `请求失败（${resp.status}）`;
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
