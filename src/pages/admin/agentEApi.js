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

export function fetchAdminAgentESettings(adminToken) {
  return request("/api/auth/admin/agent-e/settings", adminToken);
}

export function saveAdminAgentESettings(adminToken, payload) {
  return request("/api/auth/admin/agent-e/settings", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminAgentESkills(adminToken) {
  return request("/api/auth/admin/agent-e/skills", adminToken);
}

export function saveAdminAgentESkills(adminToken, payload) {
  return request("/api/auth/admin/agent-e/skills", adminToken, {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}
