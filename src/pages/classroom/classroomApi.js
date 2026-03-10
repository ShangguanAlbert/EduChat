import { getUserToken } from "../../app/authStorage.js";

function authHeaders(extra = {}) {
  const token = String(getUserToken() || "").trim();
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

export function fetchClassroomTaskSettings() {
  return request("/api/classroom/tasks/settings");
}

export async function downloadClassroomLessonFile(fileId) {
  const safeFileId = String(fileId || "").trim();
  const resp = await fetch(
    `/api/classroom/lessons/files/${encodeURIComponent(safeFileId)}/download`,
    {
      method: "GET",
      headers: authHeaders(),
    },
  );
  const contentType = String(resp.headers.get("content-type") || "").toLowerCase();

  if (!resp.ok) {
    const data = await readJson(resp);
    const message = data?.error || data?.message || `请求失败（${resp.status}）`;
    throw new Error(message);
  }

  if (contentType.includes("application/json")) {
    const data = await readJson(resp);
    const downloadUrl = String(data?.downloadUrl || "").trim();
    if (downloadUrl) {
      return {
        downloadUrl,
        fileName: String(data?.fileName || "课程文件.bin").trim() || "课程文件.bin",
        mimeType: String(data?.mimeType || ""),
      };
    }
  }

  const blob = await resp.blob();
  const disposition = String(resp.headers.get("content-disposition") || "");
  let fileName = "";
  const utf8Match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8Match?.[1]) {
    try {
      fileName = decodeURIComponent(utf8Match[1]);
    } catch {
      fileName = utf8Match[1];
    }
  } else {
    const plainMatch = disposition.match(/filename="?([^";]+)"?/i);
    if (plainMatch?.[1]) fileName = plainMatch[1];
  }

  return {
    blob,
    fileName: fileName || "课程文件.bin",
  };
}
