export const IMAGE_RETURN_CONTEXT_KEY = "educhat_image_return_context";

export function normalizeImageReturnContext(raw) {
  if (!raw || typeof raw !== "object") return null;

  const sessionId = String(raw.sessionId || "").trim();
  const agentId = String(raw.agentId || "")
    .trim()
    .toUpperCase();
  const timestamp = Number(raw.timestamp);

  return {
    sessionId,
    agentId: ["A", "B", "C", "D"].includes(agentId) ? agentId : "",
    timestamp: Number.isFinite(timestamp) ? timestamp : Date.now(),
  };
}

export function saveImageReturnContext(context) {
  const normalized = normalizeImageReturnContext(context);
  if (!normalized) return;
  try {
    sessionStorage.setItem(IMAGE_RETURN_CONTEXT_KEY, JSON.stringify(normalized));
  } catch {
    // ignore storage failures
  }
}

export function loadImageReturnContext() {
  try {
    const raw = sessionStorage.getItem(IMAGE_RETURN_CONTEXT_KEY);
    if (!raw) return null;
    return normalizeImageReturnContext(JSON.parse(raw));
  } catch {
    return null;
  }
}
