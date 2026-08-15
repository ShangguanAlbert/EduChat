async function readJson(response) {
  try {
    return await response.json();
  } catch {
    return {};
  }
}

async function request(path, adminToken, options = {}) {
  const response = await fetch(path, {
    method: "GET",
    ...options,
    headers: {
      ...(adminToken ? { Authorization: `Bearer ${adminToken}` } : {}),
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });
  const data = await readJson(response);
  if (!response.ok) {
    const error = new Error(data?.error || data?.message || `请求失败（${response.status}）`);
    error.status = response.status;
    throw error;
  }
  return data;
}

function roomMemoryPath(roomId, suffix = "") {
  const safeRoomId = String(roomId || "").trim();
  return `/api/auth/admin/collaboration-classrooms/${encodeURIComponent(safeRoomId)}/memories${suffix}`;
}

export function fetchCollaborationRoomMemories(adminToken, roomId) {
  return request(roomMemoryPath(roomId), adminToken);
}

export function fetchCollaborationMemoryEvidence(adminToken, roomId, memoryId) {
  const safeMemoryId = String(memoryId || "").trim();
  return request(
    roomMemoryPath(roomId, `/${encodeURIComponent(safeMemoryId)}/evidence`),
    adminToken,
  );
}

export function updateCollaborationMemory(adminToken, roomId, memoryId, payload = {}) {
  const safeMemoryId = String(memoryId || "").trim();
  return request(
    roomMemoryPath(roomId, `/${encodeURIComponent(safeMemoryId)}`),
    adminToken,
    {
      method: "PATCH",
      body: JSON.stringify(payload && typeof payload === "object" ? payload : {}),
    },
  );
}

export function deleteCollaborationMemory(adminToken, roomId, memoryId) {
  const safeMemoryId = String(memoryId || "").trim();
  return request(
    roomMemoryPath(roomId, `/${encodeURIComponent(safeMemoryId)}`),
    adminToken,
    { method: "DELETE" },
  );
}
