import { readErrorMessage } from "../chat/chatHelpers.js";
import { getAuthTokenHeader } from "../chat/stateApi.js";

async function readJsonSafe(resp) {
  try {
    return await resp.json();
  } catch {
    return {};
  }
}

export async function streamSeedreamGeneration({
  prompt,
  size,
  sequentialMode,
  maxImages,
  watermark,
  responseFormat,
  stream,
  imageUrls,
  files,
  handlers = {},
}) {
  const formData = new FormData();
  formData.append("prompt", String(prompt || ""));
  formData.append("size", String(size || ""));
  formData.append("mode", String(sequentialMode || "disabled"));
  formData.append("maxImages", String(maxImages || 15));
  formData.append("watermark", String(!!watermark));
  formData.append("responseFormat", String(responseFormat || "url"));
  formData.append("stream", String(!!stream));
  formData.append("imageUrls", JSON.stringify(Array.isArray(imageUrls) ? imageUrls : []));
  (Array.isArray(files) ? files : []).forEach((file) => {
    formData.append("images", file);
  });

  const resp = await fetch("/api/images/seedream/stream", {
    method: "POST",
    headers: {
      ...getAuthTokenHeader(),
    },
    body: formData,
  });

  if (!resp.ok || !resp.body) {
    const message = await readErrorMessage(resp);
    throw new Error(message || `HTTP ${resp.status}`);
  }

  await readImageSseStream(resp, handlers);
}

export async function fetchImageGenerationHistory({ limit = 80 } = {}) {
  const safeLimit = Math.max(1, Math.min(200, Number(limit) || 80));
  const resp = await fetch(`/api/images/history?limit=${safeLimit}`, {
    method: "GET",
    headers: {
      ...getAuthTokenHeader(),
    },
  });
  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    const message =
      String(data?.error || data?.message || "").trim() || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  const items = Array.isArray(data?.items) ? data.items : [];
  return {
    ok: !!data?.ok,
    items,
  };
}

export async function deleteImageGenerationHistoryItem(imageId) {
  const safeId = String(imageId || "").trim();
  if (!safeId) {
    throw new Error("无效图片 ID。");
  }
  const resp = await fetch(`/api/images/history/${encodeURIComponent(safeId)}`, {
    method: "DELETE",
    headers: {
      ...getAuthTokenHeader(),
    },
  });
  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    const message =
      String(data?.error || data?.message || "").trim() || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return {
    ok: !!data?.ok,
    deleted: !!data?.deleted,
  };
}

export async function clearImageGenerationHistory() {
  const resp = await fetch("/api/images/history", {
    method: "DELETE",
    headers: {
      ...getAuthTokenHeader(),
    },
  });
  const data = await readJsonSafe(resp);
  if (!resp.ok) {
    const message =
      String(data?.error || data?.message || "").trim() || `请求失败（${resp.status}）`;
    throw new Error(message);
  }
  return {
    ok: !!data?.ok,
    deletedCount: Number(data?.deletedCount || 0),
  };
}

async function readImageSseStream(response, handlers) {
  const reader = response.body.getReader();
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
      if (!event) {
        boundary = buffer.indexOf("\n\n");
        continue;
      }

      if (event.event === "meta") {
        handlers.onMeta?.(event.data || {});
      } else if (event.event === "image_partial") {
        handlers.onImagePartial?.(event.data || {});
      } else if (event.event === "image_failed") {
        handlers.onImageFailed?.(event.data || {});
      } else if (event.event === "usage") {
        handlers.onUsage?.(event.data || {});
      } else if (event.event === "error") {
        handlers.onError?.(event.data?.message || "图片生成失败");
      } else if (event.event === "done") {
        handlers.onDone?.(event.data || {});
      }

      boundary = buffer.indexOf("\n\n");
    }
  }
}

function parseSseEvent(block) {
  const lines = String(block || "").split("\n");
  let event = "message";
  const dataLines = [];

  lines.forEach((line) => {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  });

  if (dataLines.length === 0) return null;

  let data;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    data = {};
  }

  return { event, data };
}
