async function readJson(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
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

async function request(path, options = {}) {
  const resp = await fetch(path, {
    method: "GET",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await readJson(resp);
  if (!resp.ok) {
    const message =
      data?.error ||
      data?.message ||
      `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return data;
}

export function fetchAuthStatus() {
  return request("/api/auth/status");
}

export function registerAccount(payload) {
  return request("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function loginAccount(payload) {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyForgotAccount(payload) {
  return request("/api/auth/forgot/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function resetForgotPassword(payload) {
  return request("/api/auth/forgot/reset", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function adminLogin(payload) {
  return request("/api/auth/admin/login", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchAdminUsers(adminToken) {
  return request("/api/auth/admin/users", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

export function exportAdminUsersTxt(adminToken) {
  return request("/api/auth/admin/export/users-txt", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

export function exportAdminChatsTxt(adminToken) {
  return request("/api/auth/admin/export/chats-txt", {
    headers: { Authorization: `Bearer ${adminToken}` },
  });
}

export async function exportAdminChatsZip(adminToken) {
  const resp = await fetch("/api/auth/admin/export/chats-zip", {
    headers: { Authorization: `Bearer ${adminToken}` },
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
