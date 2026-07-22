const DEFAULT_MINIMAX_MUSIC_ENDPOINT =
  "https://api.minimaxi.com/v1/music_generation";
const DEFAULT_MINIMAX_LYRICS_ENDPOINT =
  "https://api.minimaxi.com/v1/lyrics_generation";

function sanitizeHttpEndpoint(value, fallback = "") {
  const text = String(value || "").trim();
  if (!text) return fallback;
  try {
    const url = new URL(text);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return fallback;
    }
    return url.toString().replace(/\/+$/, "");
  } catch {
    return fallback;
  }
}

function readApiKey(...candidates) {
  for (const item of candidates) {
    const key = String(item || "").trim();
    if (key) return key;
  }
  return "";
}

export function buildMiniMaxProviderConfig({ env = {}, apiKey = "" } = {}) {
  const sourceEnv = env && typeof env === "object" ? env : {};
  return {
    musicEndpoint: sanitizeHttpEndpoint(
      sourceEnv.MINIMAX_MUSIC_ENDPOINT,
      DEFAULT_MINIMAX_MUSIC_ENDPOINT,
    ),
    lyricsEndpoint: sanitizeHttpEndpoint(
      sourceEnv.MINIMAX_LYRICS_ENDPOINT,
      DEFAULT_MINIMAX_LYRICS_ENDPOINT,
    ),
    apiKey: readApiKey(apiKey, sourceEnv.MINIMAX_API_KEY),
    missingKeyMessage:
      "未检测到 MiniMax API Key。请在 .env 中配置 MINIMAX_API_KEY。",
  };
}

export function formatMiniMaxUpstreamError({
  status = 0,
  code = "",
  message = "",
  raw = "",
} = {}) {
  const safeCode = String(code || "").trim();
  const safeMessage = String(message || raw || "").trim();

  if (status === 401 || safeCode === "1004" || safeCode === "2049") {
    return "MiniMax 认证失败：请检查 MINIMAX_API_KEY 是否正确且仍有效。";
  }
  if (safeCode === "1002") {
    return "MiniMax 当前触发限流，请稍后重试。";
  }
  if (safeCode === "1008") {
    return "MiniMax 账号余额不足，请充值后重试。";
  }
  if (safeCode === "2013") {
    return "MiniMax 请求参数不符合要求，请检查输入内容后重试。";
  }
  if (status === 429) {
    return "MiniMax 当前请求过于频繁，请稍后再试。";
  }
  if (status >= 500) {
    return "MiniMax 服务暂时不可用，请稍后重试。";
  }

  return `MiniMax 请求失败${status ? `（${status}）` : ""}：${
    safeMessage || "未知错误"
  }`;
}
