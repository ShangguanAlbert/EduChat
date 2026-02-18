import {
  ALIYUN_BEIJING_CHAT_ENDPOINT,
  ALIYUN_DASHSCOPE_MULTIMODAL_MODEL_PREFIXES,
  ALIYUN_DASHSCOPE_TEXT_MODEL_PREFIXES,
  ALIYUN_BEIJING_DASHSCOPE_ENDPOINT,
  ALIYUN_BEIJING_DASHSCOPE_MULTIMODAL_ENDPOINT,
  ALIYUN_BEIJING_RESPONSES_ENDPOINT,
  ALIYUN_SEARCH_CITATION_FORMATS,
  ALIYUN_SEARCH_FRESHNESS_OPTIONS,
  ALIYUN_SEARCH_STRATEGIES,
} from "./constants.js";

const DEFAULT_MAX_TOOL_CALLS = 3;
const MAX_TOOL_CALLS = 10;
const MAX_ASSIGNED_SITE_COUNT = 25;
const MAX_PROMPT_INTERVENE_LENGTH = 240;
const MAX_REASONING_BUDGET = 128000;
const ALIYUN_MINIMAX_FIXED_TEMPERATURE = 1;
const ALIYUN_MINIMAX_FIXED_TOP_P = 0.95;
const ALIYUN_KIMI_PREFIX = "kimi-";
const ALIYUN_KIMI_K2_5_PREFIXES = Object.freeze(["kimi-k2.5", "kimi-2.5"]);
const ALIYUN_GLM_PREFIXES = Object.freeze(["glm-", "chatglm"]);
const ALIYUN_MINIMAX_M2_PREFIXES = Object.freeze([
  "minimax/minimax-m2.5",
  "minimax/minimax-m2.1",
  "minimax-m2.5",
  "minimax-m2.1",
]);

export function resolveAliyunProtocol(protocol) {
  const key = String(protocol || "")
    .trim()
    .toLowerCase();
  if (key === "responses" || key === "response") return "responses";
  if (key === "dashscope" || key === "native") return "dashscope";
  return "chat";
}

export function buildAliyunProviderConfig({ env = {}, apiKey = "" } = {}) {
  const sourceEnv = env && typeof env === "object" ? env : {};
  return {
    chatEndpoint: sanitizeHttpEndpoint(
      sourceEnv.ALIYUN_CHAT_ENDPOINT,
      ALIYUN_BEIJING_CHAT_ENDPOINT,
    ),
    responsesEndpoint: sanitizeHttpEndpoint(
      sourceEnv.ALIYUN_RESPONSES_ENDPOINT,
      ALIYUN_BEIJING_RESPONSES_ENDPOINT,
    ),
    dashscopeEndpoint: sanitizeHttpEndpoint(
      sourceEnv.ALIYUN_DASHSCOPE_ENDPOINT,
      ALIYUN_BEIJING_DASHSCOPE_ENDPOINT,
    ),
    dashscopeMultimodalEndpoint: sanitizeHttpEndpoint(
      sourceEnv.ALIYUN_DASHSCOPE_MULTIMODAL_ENDPOINT,
      ALIYUN_BEIJING_DASHSCOPE_MULTIMODAL_ENDPOINT,
    ),
    apiKey: String(apiKey || "").trim(),
    missingKeyMessage:
      "未检测到阿里云 API Key。请在 .env 中配置 ALIYUN_API_KEY（或 DASHSCOPE_API_KEY）。",
  };
}

export function resolveAliyunModelPolicy(model = "") {
  const candidates = buildModelCandidates(model);
  const normalizedModel = candidates[0] || "";

  if (candidates.some((item) => startsWithAny(item, ALIYUN_GLM_PREFIXES))) {
    return {
      key: "glm_blocked",
      supported: false,
      forceProtocol: "",
      allowWebSearch: false,
      allowImageInput: false,
      fixedSampling: null,
      forceDashscopeMultimodal: false,
      matchedModelId: normalizedModel,
      errorMessage: "阿里云当前接入已禁用 GLM 系列模型调用，请更换模型。",
    };
  }

  const kimiModel = candidates.some((item) => item.startsWith(ALIYUN_KIMI_PREFIX));
  const kimiK2_5 = candidates.some((item) => startsWithAny(item, ALIYUN_KIMI_K2_5_PREFIXES));
  if (kimiModel && !kimiK2_5) {
    return {
      key: "kimi_blocked",
      supported: false,
      forceProtocol: "",
      allowWebSearch: false,
      allowImageInput: false,
      fixedSampling: null,
      forceDashscopeMultimodal: false,
      matchedModelId: normalizedModel,
      errorMessage: "阿里云 Kimi 仅支持 kimi-k2.5（多模态），请更换模型。",
    };
  }

  if (kimiK2_5) {
    return {
      key: "kimi_k2_5",
      supported: true,
      forceProtocol: "dashscope",
      allowWebSearch: false,
      allowImageInput: true,
      fixedSampling: null,
      forceDashscopeMultimodal: true,
      matchedModelId: normalizedModel,
      errorMessage: "",
    };
  }

  const minimaxM2 = candidates.some((item) => startsWithAny(item, ALIYUN_MINIMAX_M2_PREFIXES));
  if (minimaxM2) {
    return {
      key: "minimax_m2",
      supported: true,
      forceProtocol: "chat",
      allowWebSearch: false,
      allowImageInput: false,
      fixedSampling: {
        temperature: ALIYUN_MINIMAX_FIXED_TEMPERATURE,
        topP: ALIYUN_MINIMAX_FIXED_TOP_P,
      },
      forceDashscopeMultimodal: false,
      matchedModelId: normalizedModel,
      errorMessage: "",
    };
  }

  return {
    key: "default",
    supported: true,
    forceProtocol: "",
    allowWebSearch: true,
    allowImageInput: true,
    fixedSampling: null,
    forceDashscopeMultimodal: false,
    matchedModelId: normalizedModel,
    errorMessage: "",
  };
}

export function shouldUseAliyunDashScopeMultimodalEndpoint({
  model = "",
  messages = [],
} = {}) {
  const policy = resolveAliyunModelPolicy(model);
  if (policy.forceDashscopeMultimodal) return true;

  const classification = classifyAliyunDashScopeModel(model);
  if (classification === "multimodal") return true;
  if (classification === "text") return false;
  return hasMultimodalMessageParts(messages);
}

export function resolveAliyunWebSearchRuntime({
  protocol = "chat",
  config = {},
  model = "",
} = {}) {
  const policy = resolveAliyunModelPolicy(model);
  const mode = resolveAliyunProtocol(protocol);
  const requested = sanitizeBoolean(config?.enableWebSearch, false);
  const maxToolCalls = sanitizeInteger(
    config?.webSearchMaxToolCalls,
    DEFAULT_MAX_TOOL_CALLS,
    1,
    MAX_TOOL_CALLS,
  );
  const enabled = !!requested && !!policy.allowWebSearch;
  const searchOptions = enabled ? buildAliyunSearchOptions(config, { protocol: mode }) : {};

  const tools = [];
  if (enabled && mode === "responses") {
    tools.push({ type: "web_search" });
    if (sanitizeBoolean(config?.aliyunResponsesEnableWebExtractor, false)) {
      tools.push({ type: "web_extractor" });
    }
    if (sanitizeBoolean(config?.aliyunResponsesEnableCodeInterpreter, false)) {
      tools.push({ type: "code_interpreter" });
    }
  }

  return {
    requested,
    enabled,
    maxToolCalls,
    protocol: mode,
    options: searchOptions,
    tools,
    forcedOffReason:
      requested && !enabled ? "当前模型策略不支持联网搜索，已自动关闭。" : "",
  };
}

export function buildAliyunChatPayload({
  model,
  messages,
  systemPrompt = "",
  config = {},
  thinkingEnabled = false,
  webSearchRuntime = null,
  temperature = 0.6,
  topP = 1,
  frequencyPenalty = 0,
  presencePenalty = 0,
} = {}) {
  const policy = resolveAliyunModelPolicy(model);
  const fixedSampling =
    policy.fixedSampling && typeof policy.fixedSampling === "object"
      ? policy.fixedSampling
      : null;
  const finalMessages = [];
  if (systemPrompt) {
    finalMessages.push({ role: "system", content: systemPrompt });
  }
  finalMessages.push(...(Array.isArray(messages) ? messages : []));

  const payload = {
    model,
    stream: true,
    messages: finalMessages,
    temperature: sanitizeNumber(fixedSampling?.temperature ?? temperature, 0.6, 0, 2),
    top_p: sanitizeNumber(fixedSampling?.topP ?? topP, 1, 0, 1),
    frequency_penalty: sanitizeNumber(frequencyPenalty, 0, -2, 2),
    presence_penalty: sanitizeNumber(presencePenalty, 0, -2, 2),
    enable_thinking: !!thinkingEnabled,
  };

  const thinkingBudget = sanitizeInteger(
    config?.aliyunThinkingBudget,
    0,
    0,
    MAX_REASONING_BUDGET,
  );
  if (thinkingBudget > 0) {
    payload.thinking_budget = thinkingBudget;
  }

  if (webSearchRuntime?.enabled) {
    payload.enable_search = true;
    if (isNonEmptyObject(webSearchRuntime?.options)) {
      payload.search_options = webSearchRuntime.options;
    }
  }

  return payload;
}

export function buildAliyunResponsesPayload({
  model,
  messages,
  instructions = "",
  config = {},
  thinkingEnabled = false,
  webSearchRuntime = null,
  previousResponseId = "",
  forceStore = false,
  maxToolCalls = DEFAULT_MAX_TOOL_CALLS,
  buildResponsesInputItems,
} = {}) {
  const inputBuilder =
    typeof buildResponsesInputItems === "function"
      ? buildResponsesInputItems
      : defaultBuildResponsesInputItems;
  const payload = {
    model,
    stream: true,
    input: inputBuilder(Array.isArray(messages) ? messages : []),
    enable_thinking: !!thinkingEnabled,
  };

  const safeInstructions = sanitizeText(instructions, "", 24000);
  if (safeInstructions) {
    payload.instructions = safeInstructions;
  }

  const thinkingBudget = sanitizeInteger(
    config?.aliyunThinkingBudget,
    0,
    0,
    MAX_REASONING_BUDGET,
  );
  if (thinkingBudget > 0) {
    payload.thinking_budget = thinkingBudget;
  }

  if (webSearchRuntime?.enabled && Array.isArray(webSearchRuntime?.tools)) {
    if (webSearchRuntime.tools.length > 0) {
      payload.tools = webSearchRuntime.tools;
      payload.max_tool_calls = sanitizeInteger(
        maxToolCalls,
        DEFAULT_MAX_TOOL_CALLS,
        1,
        MAX_TOOL_CALLS,
      );
    }
  }

  const safePreviousResponseId = sanitizeText(previousResponseId, "", 160);
  if (safePreviousResponseId) {
    payload.previous_response_id = safePreviousResponseId;
  }
  if (forceStore) {
    payload.store = true;
  }

  return payload;
}

export function buildAliyunDashScopePayload({
  model,
  messages,
  systemPrompt = "",
  config = {},
  thinkingEnabled = false,
  webSearchRuntime = null,
  temperature = 0.6,
  topP = 1,
} = {}) {
  const finalMessages = [];
  if (systemPrompt) {
    finalMessages.push({ role: "system", content: systemPrompt });
  }
  finalMessages.push(...(Array.isArray(messages) ? messages : []));
  const useMultimodalEndpoint = shouldUseAliyunDashScopeMultimodalEndpoint({
    model,
    messages: finalMessages,
  });
  const normalizedMessages = useMultimodalEndpoint
    ? finalMessages.map((item) => normalizeDashScopeMultimodalMessage(item)).filter(Boolean)
    : finalMessages;

  const parameters = {
    result_format: "message",
    incremental_output: true,
    enable_thinking: !!thinkingEnabled,
    temperature: sanitizeNumber(temperature, 0.6, 0, 2),
    top_p: sanitizeNumber(topP, 1, 0, 1),
  };

  const thinkingBudget = sanitizeInteger(
    config?.aliyunThinkingBudget,
    0,
    0,
    MAX_REASONING_BUDGET,
  );
  if (thinkingBudget > 0) {
    parameters.thinking_budget = thinkingBudget;
  }

  if (webSearchRuntime?.enabled) {
    parameters.enable_search = true;
    if (isNonEmptyObject(webSearchRuntime?.options)) {
      parameters.search_options = webSearchRuntime.options;
    }
  }

  return {
    model,
    input: {
      messages: normalizedMessages,
    },
    parameters,
  };
}

export function buildAliyunHeaders({
  apiKey,
  protocol = "chat",
} = {}) {
  const mode = resolveAliyunProtocol(protocol);
  if (mode === "dashscope") {
    return {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "text/event-stream, application/json",
      "X-DashScope-SSE": "enable",
    };
  }

  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    Accept: mode === "responses" ? "text/event-stream, application/json" : "text/event-stream",
  };
}

export function formatAliyunUpstreamError({
  status = 500,
  code = "",
  message = "",
  raw = "",
} = {}) {
  const key = String(code || "")
    .trim()
    .toLowerCase();
  const detail = String(message || "").trim() || String(raw || "").trim();

  if (status === 401 || key.includes("invalidapikey") || key.includes("apikeyinvalid")) {
    return "阿里云认证失败：请检查 ALIYUN_API_KEY（或 DASHSCOPE_API_KEY）是否正确且仍有效。";
  }
  if (status === 403 || key.includes("accessdenied")) {
    return "阿里云请求被拒绝：请检查 API Key 权限、模型可用性或业务空间配置。";
  }
  if (status === 429 || key.includes("ratelimit") || key.includes("throttled")) {
    return "阿里云请求过于频繁（限流），请稍后重试。";
  }
  if (key.includes("modelnotfound")) {
    return "阿里云模型不存在或当前地域不可用，请检查模型 ID。";
  }
  if (/url error/i.test(detail)) {
    return "阿里云 URL 错误：请确认模型与端点匹配。纯文本模型使用 text-generation（或 OpenAI 兼容 Chat）；多模态模型使用 multimodal-generation。";
  }

  return `aliyun error (${status}): ${detail || "unknown error"}`;
}

export async function pipeAliyunDashScopeSse(
  upstream,
  res,
  {
    reasoningEnabled = false,
    emitSearchUsage = false,
    writeEvent = null,
  } = {},
) {
  if (!upstream?.body) {
    throw new Error("上游未返回有效流式内容。");
  }
  if (typeof writeEvent !== "function") {
    throw new Error("缺少 writeEvent 回调。");
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawContent = false;
  let sawReasoning = false;
  let searchUsageEmitted = false;
  let pendingSearchUsage = null;

  const processSseBlock = (block) => {
    const data = extractSseDataPayload(block);
    if (!data) return false;
    if (data === "[DONE]") return true;

    let json;
    try {
      json = JSON.parse(data);
    } catch {
      return false;
    }

    if (isDashScopeStreamError(json)) {
      const code = sanitizeText(json?.code, "", 120);
      const message = sanitizeText(json?.message, "", 500);
      throw new Error(
        formatAliyunUpstreamError({
          status: sanitizeInteger(json?.status_code, 500, 100, 599),
          code,
          message,
          raw: data,
        }),
      );
    }

    if (emitSearchUsage) {
      pendingSearchUsage = extractAliyunDashScopeSearchUsage(json);
    }

    const choices = Array.isArray(json?.output?.choices) ? json.output.choices : [];
    const choice = choices[0] && typeof choices[0] === "object" ? choices[0] : null;
    const message = choice?.message && typeof choice.message === "object" ? choice.message : {};

    const content = extractDashScopeMessageText(message?.content);
    const reasoning = extractDashScopeMessageText(
      message?.reasoning_content ?? message?.reasoningContent,
    );
    const finishReason = String(choice?.finish_reason ?? choice?.finishReason ?? "")
      .trim()
      .toLowerCase();

    if (content) {
      sawContent = true;
      writeEvent(res, "token", { text: content });
    }
    if (reasoningEnabled && reasoning) {
      sawReasoning = true;
      writeEvent(res, "reasoning_token", { text: reasoning });
    }

    if (emitSearchUsage && !searchUsageEmitted && isFinalDashScopeChunk(finishReason)) {
      writeEvent(res, "search_usage", pendingSearchUsage || buildZeroDashScopeSearchUsage());
      searchUsageEmitted = true;
    }

    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    let boundary = findSseEventBoundary(buffer);
    while (boundary.index !== -1) {
      const block = buffer.slice(0, boundary.index);
      buffer = buffer.slice(boundary.index + boundary.separatorLength);
      const gotDone = processSseBlock(block);
      if (gotDone) {
        if (emitSearchUsage && !searchUsageEmitted) {
          writeEvent(res, "search_usage", pendingSearchUsage || buildZeroDashScopeSearchUsage());
        }
        return;
      }
      boundary = findSseEventBoundary(buffer);
    }
  }

  const tail = buffer.trim();
  if (tail) {
    processSseBlock(tail);
  }

  if (emitSearchUsage && !searchUsageEmitted) {
    writeEvent(res, "search_usage", pendingSearchUsage || buildZeroDashScopeSearchUsage());
  }
  if (!sawContent && sawReasoning) {
    throw new Error("上游仅返回了思路内容，未返回最终回答。");
  }
  if (!sawContent) {
    throw new Error("上游未返回有效回答内容。");
  }
}

function buildAliyunSearchOptions(config, { protocol = "chat" } = {}) {
  const mode = resolveAliyunProtocol(protocol);
  const options = {};

  const strategy = sanitizeSearchStrategy(config?.aliyunSearchStrategy);
  const forcedSearch = sanitizeBoolean(config?.aliyunSearchForced, false);
  const enableExtension = sanitizeBoolean(
    config?.aliyunSearchEnableSearchExtension,
    false,
  );
  const freshness = sanitizeFreshness(config?.aliyunSearchFreshness);
  const assignedSiteList = sanitizeAssignedSiteList(config?.aliyunSearchAssignedSiteList);
  const promptIntervene = sanitizePromptIntervene(config?.aliyunSearchPromptIntervene);

  if (forcedSearch) {
    options.forced_search = true;
  }
  if (strategy !== "turbo") {
    options.search_strategy = strategy;
  }
  if (enableExtension) {
    options.enable_search_extension = true;
  }
  if (freshness > 0) {
    options.freshness = freshness;
  }
  if (assignedSiteList.length > 0) {
    options.assigned_site_list = assignedSiteList;
  }
  if (promptIntervene) {
    options.intention_options = { prompt_intervene: promptIntervene };
  }

  if (mode === "dashscope") {
    const enableSource = sanitizeBoolean(config?.aliyunSearchEnableSource, false);
    const enableCitation = sanitizeBoolean(config?.aliyunSearchEnableCitation, false);
    const citationFormat = sanitizeCitationFormat(config?.aliyunSearchCitationFormat);
    const prependSearchResult = sanitizeBoolean(
      config?.aliyunSearchPrependSearchResult,
      false,
    );

    if (enableSource) {
      options.enable_source = true;
    }
    if (enableCitation) {
      options.enable_citation = true;
      options.citation_format = citationFormat;
    }
    if (prependSearchResult) {
      options.prepend_search_result = true;
    }
  }

  return options;
}

function sanitizeHttpEndpoint(value, fallback) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  if (!/^https?:\/\//i.test(text)) return fallback;
  return text;
}

function sanitizeSearchStrategy(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (ALIYUN_SEARCH_STRATEGIES.includes(key)) return key;
  return "turbo";
}

function sanitizeCitationFormat(value) {
  const key = String(value || "").trim();
  if (ALIYUN_SEARCH_CITATION_FORMATS.includes(key)) return key;
  return "[<number>]";
}

function sanitizeFreshness(value) {
  const num = sanitizeInteger(value, 0, 0, 365);
  if (!ALIYUN_SEARCH_FRESHNESS_OPTIONS.includes(num)) return 0;
  return num;
}

function sanitizeAssignedSiteList(value) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(/[\n,]/)
        .map((item) => item.trim())
        .filter(Boolean);
  const uniq = new Set();
  const list = [];
  source.slice(0, MAX_ASSIGNED_SITE_COUNT * 2).forEach((item) => {
    const normalized = normalizeAssignedSite(String(item || ""));
    if (!normalized) return;
    if (uniq.has(normalized)) return;
    uniq.add(normalized);
    list.push(normalized);
  });
  return list.slice(0, MAX_ASSIGNED_SITE_COUNT);
}

function normalizeAssignedSite(value) {
  const stripped = value
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\/.*$/, "")
    .toLowerCase();
  if (!stripped) return "";
  if (!/^[a-z0-9.-]+$/.test(stripped)) return "";
  if (!stripped.includes(".")) return "";
  return stripped.slice(0, 120);
}

function sanitizePromptIntervene(value) {
  const text = String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!text) return "";
  return text.slice(0, MAX_PROMPT_INTERVENE_LENGTH);
}

function sanitizeText(value, fallback = "", maxLength = 300) {
  const text = String(value || "").trim();
  if (!text) return fallback;
  return text.slice(0, maxLength);
}

function sanitizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return fallback;
  if (key === "1" || key === "true" || key === "yes" || key === "on") return true;
  if (key === "0" || key === "false" || key === "no" || key === "off") return false;
  return fallback;
}

function sanitizeInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const normalized = Math.round(num);
  return Math.min(max, Math.max(min, normalized));
}

function sanitizeNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function isNonEmptyObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.keys(value).length > 0;
}

function defaultBuildResponsesInputItems(messages) {
  return (Array.isArray(messages) ? messages : []).map((message) => ({
    role: message?.role,
    content:
      typeof message?.content === "string"
        ? [{ type: "input_text", text: message.content }]
        : message?.content,
  }));
}

function isDashScopeStreamError(json) {
  if (!json || typeof json !== "object") return false;
  if (
    Number.isFinite(Number(json?.status_code)) &&
    Number(json.status_code) >= 400
  ) {
    return true;
  }
  return !!json?.code && !!json?.message;
}

function extractDashScopeMessageText(value) {
  if (typeof value === "string") return value;
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return "";
      if (typeof item.text === "string") return item.text;
      if (typeof item.content === "string") return item.content;
      return "";
    })
    .filter(Boolean)
    .join("");
}

function isFinalDashScopeChunk(finishReason) {
  return finishReason === "stop" || finishReason === "length" || finishReason === "tool_calls";
}

function buildZeroDashScopeSearchUsage() {
  return {
    webSearchCalls: 0,
    details: {},
    sourceCount: 0,
    text: "联网搜索用量：web_search=0（本轮未触发搜索）",
  };
}

function extractAliyunDashScopeSearchUsage(json) {
  const usage = json?.usage && typeof json.usage === "object" ? json.usage : {};
  const searchInfo =
    json?.output?.search_info && typeof json.output.search_info === "object"
      ? json.output.search_info
      : {};
  const searchResults = Array.isArray(searchInfo.search_results)
    ? searchInfo.search_results
    : [];

  let webSearchCalls = 0;
  const plugins = usage?.plugins && typeof usage.plugins === "object" ? usage.plugins : {};
  const searchPlugin = plugins?.search && typeof plugins.search === "object" ? plugins.search : {};
  const count = sanitizeInteger(searchPlugin?.count, 0, 0, 1000000);
  if (count > 0) {
    webSearchCalls = count;
  } else if (searchResults.length > 0) {
    webSearchCalls = 1;
  }

  const details = {};
  if (count > 0) {
    details.search = count;
  }

  return {
    webSearchCalls,
    details,
    sourceCount: searchResults.length,
    text:
      webSearchCalls > 0
        ? `联网搜索用量：web_search=${webSearchCalls}，search_results=${searchResults.length}`
        : "联网搜索用量：web_search=0（本轮未触发搜索）",
  };
}

function findSseEventBoundary(buffer) {
  if (!buffer) return { index: -1, separatorLength: 0 };
  const linux = buffer.indexOf("\n\n");
  const windows = buffer.indexOf("\r\n\r\n");
  if (linux === -1 && windows === -1) return { index: -1, separatorLength: 0 };
  if (linux === -1) return { index: windows, separatorLength: 4 };
  if (windows === -1) return { index: linux, separatorLength: 2 };
  if (linux < windows) return { index: linux, separatorLength: 2 };
  return { index: windows, separatorLength: 4 };
}

function extractSseDataPayload(block) {
  const lines = String(block || "").split(/\r?\n/);
  const chunks = [];
  lines.forEach((line) => {
    if (!line.startsWith("data:")) return;
    chunks.push(line.slice(5).trim());
  });
  return chunks.join("\n").trim();
}

function startsWithAny(value, prefixes = []) {
  const normalized = String(value || "")
    .trim()
    .toLowerCase();
  if (!normalized) return false;
  return prefixes.some((prefixRaw) => {
    const prefix = String(prefixRaw || "")
      .trim()
      .toLowerCase();
    if (!prefix) return false;
    if (normalized === prefix) return true;
    if (normalized.startsWith(`${prefix}-`)) return true;
    return normalized.startsWith(prefix);
  });
}

function classifyAliyunDashScopeModel(model) {
  const candidates = buildModelCandidates(model);
  if (candidates.length === 0) return "unknown";

  if (
    candidates.some((item) =>
      ALIYUN_DASHSCOPE_MULTIMODAL_MODEL_PREFIXES.some((prefix) =>
        item.startsWith(prefix),
      ),
    )
  ) {
    return "multimodal";
  }

  if (
    candidates.some((item) =>
      ALIYUN_DASHSCOPE_TEXT_MODEL_PREFIXES.some((prefix) =>
        item.startsWith(prefix),
      ),
    )
  ) {
    return "text";
  }

  return "unknown";
}

function buildModelCandidates(model) {
  const normalized = String(model || "")
    .trim()
    .toLowerCase();
  if (!normalized) return [];
  const set = new Set([normalized]);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex > -1 && slashIndex < normalized.length - 1) {
    set.add(normalized.slice(slashIndex + 1));
  }
  return Array.from(set);
}

function hasMultimodalMessageParts(messages) {
  const list = Array.isArray(messages) ? messages : [];
  return list.some((item) => containsMultimodalContent(item?.content));
}

function containsMultimodalContent(content) {
  if (!content) return false;
  if (Array.isArray(content)) {
    return content.some((part) => isMultimodalContentPart(part));
  }
  if (typeof content === "object") {
    return isMultimodalContentPart(content);
  }
  return false;
}

function isMultimodalContentPart(part) {
  if (!part || typeof part !== "object") return false;
  if (typeof part.image === "string") return true;
  if (typeof part.audio === "string") return true;
  if (typeof part.video === "string" || Array.isArray(part.video)) return true;
  if (typeof part.file === "string") return true;
  if (typeof part.file_url === "string") return true;
  if (part.file_url && typeof part.file_url === "object") {
    const nestedUrl = String(part.file_url.url || "").trim();
    if (nestedUrl) return true;
  }
  const type = String(part.type || "")
    .trim()
    .toLowerCase();
  if (
    type === "image" ||
    type === "image_url" ||
    type === "input_image" ||
    type === "video" ||
    type === "video_url" ||
    type === "input_video" ||
    type === "audio" ||
    type === "input_audio"
  ) {
    return true;
  }
  if (
    type === "file" ||
    type === "file_url" ||
    type === "input_file" ||
    type === "input_file_url" ||
    type === "document" ||
    type === "input_document"
  ) {
    return !!extractAliyunFileValue(part);
  }
  return false;
}

function normalizeDashScopeMultimodalMessage(message) {
  if (!message || typeof message !== "object") return null;
  const role = String(message.role || "user")
    .trim()
    .toLowerCase();
  const safeRole = role === "assistant" || role === "system" ? role : "user";
  const normalizedContent = normalizeDashScopeMultimodalContent(message.content);
  if (normalizedContent.length === 0) {
    return {
      role: safeRole,
      content: [{ text: "" }],
    };
  }
  return {
    role: safeRole,
    content: normalizedContent,
  };
}

function normalizeDashScopeMultimodalContent(content) {
  if (Array.isArray(content)) {
    return content
      .map((part) => normalizeDashScopeMultimodalContentPart(part))
      .filter(Boolean);
  }
  if (typeof content === "string") {
    const text = content.trim();
    return text ? [{ text }] : [];
  }
  if (content && typeof content === "object") {
    const normalized = normalizeDashScopeMultimodalContentPart(content);
    return normalized ? [normalized] : [];
  }
  return [];
}

function normalizeDashScopeMultimodalContentPart(part) {
  if (typeof part === "string") {
    const text = part.trim();
    return text ? { text } : null;
  }
  if (!part || typeof part !== "object") return null;

  if (typeof part.text === "string" && part.text.trim()) {
    return { text: part.text };
  }
  if (typeof part.image === "string" && part.image.trim()) {
    return { image: part.image };
  }
  if (typeof part.audio === "string" && part.audio.trim()) {
    return { audio: part.audio };
  }
  if (typeof part.video === "string" && part.video.trim()) {
    return { video: part.video };
  }
  if (Array.isArray(part.video) && part.video.length > 0) {
    const list = part.video
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    if (list.length > 0) return { video: list };
  }
  if (typeof part.file === "string" && part.file.trim()) {
    return { file: part.file };
  }
  if (typeof part.file_url === "string" && part.file_url.trim()) {
    return { file: part.file_url };
  }
  if (part.file_url && typeof part.file_url === "object") {
    const fileUrl = String(part.file_url.url || "").trim();
    if (fileUrl) return { file: fileUrl };
  }

  const type = String(part.type || "")
    .trim()
    .toLowerCase();
  if (type === "text" || type === "input_text" || type === "output_text") {
    const text =
      typeof part.text === "string"
        ? part.text
        : typeof part.content === "string"
          ? part.content
          : "";
    return text.trim() ? { text } : null;
  }
  if (type === "image" || type === "image_url" || type === "input_image") {
    const image = extractAliyunImageValue(part);
    return image ? { image } : null;
  }
  if (type === "video" || type === "video_url" || type === "input_video") {
    const video = extractAliyunVideoValue(part);
    return video ? { video } : null;
  }
  if (type === "audio" || type === "input_audio") {
    const audio = extractAliyunAudioValue(part);
    return audio ? { audio } : null;
  }
  if (
    type === "file" ||
    type === "file_url" ||
    type === "input_file" ||
    type === "input_file_url" ||
    type === "document" ||
    type === "input_document"
  ) {
    const file = extractAliyunFileValue(part);
    return file ? { file } : null;
  }

  return null;
}

function extractAliyunImageValue(part) {
  if (typeof part.image === "string" && part.image.trim()) return part.image;
  const imageUrl =
    part.image_url && typeof part.image_url === "object"
      ? part.image_url.url
      : part.image_url;
  if (typeof imageUrl === "string" && imageUrl.trim()) return imageUrl;
  if (typeof part.url === "string" && part.url.trim()) return part.url;
  return "";
}

function extractAliyunVideoValue(part) {
  if (typeof part.video === "string" && part.video.trim()) return part.video;
  if (Array.isArray(part.video) && part.video.length > 0) {
    const list = part.video
      .map((item) => String(item || "").trim())
      .filter(Boolean);
    return list.length > 0 ? list : "";
  }
  const videoUrl =
    part.video_url && typeof part.video_url === "object"
      ? part.video_url.url
      : part.video_url;
  if (typeof videoUrl === "string" && videoUrl.trim()) return videoUrl;
  if (typeof part.url === "string" && part.url.trim()) return part.url;
  return "";
}

function extractAliyunAudioValue(part) {
  if (typeof part.audio === "string" && part.audio.trim()) return part.audio;
  const inputAudio = part.input_audio && typeof part.input_audio === "object" ? part.input_audio : {};
  if (typeof inputAudio.url === "string" && inputAudio.url.trim()) return inputAudio.url;
  if (typeof inputAudio.data === "string" && inputAudio.data.trim()) {
    const format = String(inputAudio.format || "wav")
      .trim()
      .toLowerCase();
    return `data:audio/${format};base64,${inputAudio.data}`;
  }
  return "";
}

function extractAliyunFileValue(part) {
  if (typeof part.file === "string" && part.file.trim()) return part.file;

  if (typeof part.file_url === "string" && part.file_url.trim()) return part.file_url;
  if (part.file_url && typeof part.file_url === "object") {
    const fileUrl = String(part.file_url.url || "").trim();
    if (fileUrl) return fileUrl;
  }

  if (typeof part.fileUrl === "string" && part.fileUrl.trim()) return part.fileUrl;
  if (part.fileUrl && typeof part.fileUrl === "object") {
    const fileUrl = String(part.fileUrl.url || "").trim();
    if (fileUrl) return fileUrl;
  }

  if (part.file && typeof part.file === "object") {
    const fileUrl = String(
      part.file.url || part.file.file_url || part.file.fileUrl || "",
    ).trim();
    if (fileUrl) return fileUrl;
  }

  if (typeof part.url === "string" && part.url.trim()) return part.url;
  return "";
}
