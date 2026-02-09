export async function readSseStream(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    let boundary;
    while ((boundary = buffer.indexOf("\n\n")) !== -1) {
      const raw = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      const evt = parseSseEvent(raw);
      if (!evt) continue;

      if (evt.event === "token") {
        handlers.onToken?.(evt.data?.text || "");
      } else if (evt.event === "reasoning_token") {
        handlers.onReasoningToken?.(evt.data?.text || "");
      } else if (evt.event === "meta") {
        handlers.onMeta?.(evt.data || {});
      } else if (evt.event === "error") {
        handlers.onError?.(evt.data?.message || "unknown error");
      }
    }
  }
}

function parseSseEvent(block) {
  const lines = block.split("\n");
  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    if (line.startsWith("event:")) {
      event = line.slice(6).trim();
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trim());
    }
  }

  if (dataLines.length === 0) return null;

  let data;
  try {
    data = JSON.parse(dataLines.join("\n"));
  } catch {
    data = { text: dataLines.join("\n") };
  }

  return { event, data };
}

async function safeReadText(resp) {
  try {
    return await resp.text();
  } catch {
    return "";
  }
}

export async function readErrorMessage(resp) {
  const text = await safeReadText(resp);
  if (!text) return "";

  try {
    const json = JSON.parse(text);
    return json?.error || text;
  } catch {
    return text;
  }
}

export function normalizeTemperature(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0.6;
  return Math.max(0, Math.min(2, n));
}

export function normalizeTopP(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(1, n));
}

export function normalizeReasoningEffort(value) {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (v === "none" || v === "off" || v === "no" || v === "false" || v === "0") {
    return "none";
  }
  if (v === "low" || v === "medium" || v === "high") return v;
  return "low";
}

export function normalizeReasoningLabel(value, fallback = "none") {
  const v = String(value || "")
    .trim()
    .toLowerCase();
  if (!v) return fallback;
  if (v === "pending") return "pending";
  if (v === "none" || v === "off" || v === "no" || v === "false" || v === "0") {
    return "none";
  }
  if (v === "low" || v === "medium" || v === "high") return v;
  return fallback;
}

export function formatTimestamp(iso) {
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) return iso;
  return dt.toLocaleString("zh-CN", { hour12: false });
}

export function normalizeRuntimeSnapshot(runtime) {
  if (!runtime || typeof runtime !== "object") return null;
  const agentId = String(runtime.agentId || "-");
  const agentName = String(runtime.agentName || "-");
  const provider = String(runtime.provider || "pending");
  const model = String(runtime.model || "pending");
  const requested = normalizeReasoningLabel(runtime.reasoningRequested, "low");
  const applied = normalizeReasoningLabel(runtime.reasoningApplied, "pending");
  const temperature = Number(runtime.temperature);
  const topP = Number(runtime.topP);

  return {
    agentId,
    agentName,
    provider,
    model,
    temperature: Number.isFinite(temperature) ? normalizeTemperature(temperature) : "-",
    topP: Number.isFinite(topP) ? normalizeTopP(topP) : "-",
    reasoningRequested: requested,
    reasoningApplied: applied,
  };
}

export function createRuntimeSnapshot({
  agentId,
  agentMeta,
  apiTemperature,
  apiTopP,
  apiReasoningEffort,
}) {
  const current = agentMeta[agentId] || agentMeta.A;
  return {
    agentId,
    agentName: current.name,
    temperature: normalizeTemperature(apiTemperature),
    topP: normalizeTopP(apiTopP),
    reasoningRequested: normalizeReasoningEffort(apiReasoningEffort),
    reasoningApplied: "pending",
    provider: "pending",
    model: "pending",
  };
}

export function mergeRuntimeWithMeta(runtime, meta) {
  return {
    ...(runtime || {}),
    provider: String(meta?.provider || runtime?.provider || "pending"),
    model: String(meta?.model || runtime?.model || "pending"),
    reasoningRequested: normalizeReasoningLabel(
      meta?.reasoningRequested || runtime?.reasoningRequested,
      "low",
    ),
    reasoningApplied: normalizeReasoningLabel(
      meta?.reasoningApplied || runtime?.reasoningApplied,
      "pending",
    ),
  };
}
