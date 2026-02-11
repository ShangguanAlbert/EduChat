export const AGENT_IDS = ["A", "B", "C", "D"];
const RUNTIME_MAX_CONTEXT_WINDOW_TOKENS = 512000;
const RUNTIME_MAX_INPUT_TOKENS = 512000;
const RUNTIME_MAX_OUTPUT_TOKENS = 128000;
const RUNTIME_MAX_REASONING_TOKENS = 128000;

export const DEFAULT_AGENT_RUNTIME_CONFIG = Object.freeze({
  provider: "inherit",
  model: "",
  protocol: "chat",
  creativityMode: "balanced",
  temperature: 0.6,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  contextRounds: 10,
  contextWindowTokens: 128000,
  maxInputTokens: 96000,
  maxOutputTokens: 4096,
  maxReasoningTokens: 0,
  enableThinking: true,
  reasoningEffort: "low",
  includeCurrentTime: false,
  preventPromptLeak: true,
  injectSafetyPrompt: false,
  enableWebSearch: false,
  webSearchMaxKeyword: 2,
  webSearchResultLimit: 10,
  webSearchMaxToolCalls: 3,
  webSearchSourceDouyin: true,
  webSearchSourceMoji: true,
  webSearchSourceToutiao: true,
});
const AGENT_RUNTIME_DEFAULT_OVERRIDES = Object.freeze({
  A: Object.freeze({
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 64000,
    maxReasoningTokens: 32000,
  }),
  B: Object.freeze({
    contextWindowTokens: 200000,
    maxInputTokens: 200000,
    maxOutputTokens: 128000,
    maxReasoningTokens: 128000,
  }),
  C: Object.freeze({
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  }),
  D: Object.freeze({}),
});
const AGENT_RUNTIME_DEFAULTS = Object.freeze({
  A: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.A,
  }),
  B: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.B,
  }),
  C: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.C,
  }),
  D: Object.freeze({
    ...DEFAULT_AGENT_RUNTIME_CONFIG,
    ...AGENT_RUNTIME_DEFAULT_OVERRIDES.D,
  }),
});

function getDefaultRuntimeConfigByAgent(agentId = "A") {
  const key = AGENT_IDS.includes(agentId) ? agentId : "A";
  return AGENT_RUNTIME_DEFAULTS[key] || AGENT_RUNTIME_DEFAULTS.A;
}

export const CREATIVITY_PRESET_OPTIONS = [
  { value: "precise", label: "精确模式" },
  { value: "balanced", label: "平衡模式" },
  { value: "creative", label: "创意模式" },
  { value: "custom", label: "自定义" },
];

export function createDefaultAgentRuntimeConfigMap() {
  const next = {};
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = { ...getDefaultRuntimeConfigByAgent(agentId) };
  });
  return next;
}

export function sanitizeSingleRuntimeConfig(raw, agentId = "A") {
  const source = raw && typeof raw === "object" ? raw : {};
  const defaults = getDefaultRuntimeConfigByAgent(agentId);
  const creativityMode = sanitizeCreativityMode(source.creativityMode);
  const preset = getPresetDefaults(creativityMode);
  const isCustom = creativityMode === "custom";

  return {
    provider: sanitizeProvider(source.provider),
    model: sanitizeModel(source.model),
    protocol: sanitizeProtocol(source.protocol),
    creativityMode,
    temperature: isCustom
      ? sanitizeNumber(source.temperature, defaults.temperature, 0, 2)
      : preset.temperature,
    topP: isCustom
      ? sanitizeNumber(source.topP, defaults.topP, 0, 1)
      : preset.topP,
    frequencyPenalty: isCustom
      ? sanitizeNumber(source.frequencyPenalty, defaults.frequencyPenalty, -2, 2)
      : preset.frequencyPenalty,
    presencePenalty: isCustom
      ? sanitizeNumber(source.presencePenalty, defaults.presencePenalty, -2, 2)
      : preset.presencePenalty,
    contextRounds: sanitizeInteger(source.contextRounds, defaults.contextRounds, 1, 20),
    contextWindowTokens: sanitizeInteger(
      source.contextWindowTokens,
      defaults.contextWindowTokens,
      1024,
      RUNTIME_MAX_CONTEXT_WINDOW_TOKENS,
    ),
    maxInputTokens: sanitizeInteger(
      source.maxInputTokens,
      defaults.maxInputTokens,
      1024,
      RUNTIME_MAX_INPUT_TOKENS,
    ),
    maxOutputTokens: sanitizeInteger(
      source.maxOutputTokens,
      defaults.maxOutputTokens,
      64,
      RUNTIME_MAX_OUTPUT_TOKENS,
    ),
    maxReasoningTokens: sanitizeInteger(
      source.maxReasoningTokens,
      defaults.maxReasoningTokens,
      0,
      RUNTIME_MAX_REASONING_TOKENS,
    ),
    enableThinking: sanitizeBoolean(
      source.enableThinking,
      defaults.enableThinking,
    ),
    reasoningEffort: sanitizeReasoningEffort(source.reasoningEffort),
    includeCurrentTime: sanitizeBoolean(
      source.includeCurrentTime,
      defaults.includeCurrentTime,
    ),
    preventPromptLeak: sanitizeBoolean(
      source.preventPromptLeak,
      defaults.preventPromptLeak,
    ),
    injectSafetyPrompt: sanitizeBoolean(
      source.injectSafetyPrompt,
      defaults.injectSafetyPrompt,
    ),
    enableWebSearch: sanitizeBoolean(
      source.enableWebSearch,
      defaults.enableWebSearch,
    ),
    webSearchMaxKeyword: sanitizeInteger(
      source.webSearchMaxKeyword,
      defaults.webSearchMaxKeyword,
      1,
      50,
    ),
    webSearchResultLimit: sanitizeInteger(
      source.webSearchResultLimit,
      defaults.webSearchResultLimit,
      1,
      50,
    ),
    webSearchMaxToolCalls: sanitizeInteger(
      source.webSearchMaxToolCalls,
      defaults.webSearchMaxToolCalls,
      1,
      10,
    ),
    webSearchSourceDouyin: sanitizeBoolean(
      source.webSearchSourceDouyin,
      defaults.webSearchSourceDouyin,
    ),
    webSearchSourceMoji: sanitizeBoolean(
      source.webSearchSourceMoji,
      defaults.webSearchSourceMoji,
    ),
    webSearchSourceToutiao: sanitizeBoolean(
      source.webSearchSourceToutiao,
      defaults.webSearchSourceToutiao,
    ),
  };
}

export function sanitizeRuntimeConfigMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = createDefaultAgentRuntimeConfigMap();
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = sanitizeSingleRuntimeConfig(source[agentId], agentId);
  });
  return next;
}

export function getPresetDefaults(mode) {
  if (mode === "precise") {
    return {
      temperature: 0.2,
      topP: 0.8,
      frequencyPenalty: 0,
      presencePenalty: -0.1,
    };
  }

  if (mode === "creative") {
    return {
      temperature: 1.1,
      topP: 1,
      frequencyPenalty: 0.2,
      presencePenalty: 0.3,
    };
  }

  return {
    temperature: 0.6,
    topP: 1,
    frequencyPenalty: 0,
    presencePenalty: 0,
  };
}

function sanitizeProtocol(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "responses" || key === "response") return "responses";
  return "chat";
}

function sanitizeProvider(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (!key) return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
  if (key === "inherit" || key === "default" || key === "auto") return "inherit";
  if (key === "openrouter") return "openrouter";
  if (key === "aliyun" || key === "alibaba" || key === "dashscope") return "aliyun";
  if (key === "volcengine" || key === "volc" || key === "ark") return "volcengine";
  return DEFAULT_AGENT_RUNTIME_CONFIG.provider;
}

function sanitizeModel(value) {
  return String(value || "")
    .trim()
    .slice(0, 180);
}

function sanitizeCreativityMode(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "precise" || key === "balanced" || key === "creative" || key === "custom") {
    return key;
  }
  return "balanced";
}

function sanitizeNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, Math.round(num)));
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

function sanitizeReasoningEffort(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "minimal") return "none";
  if (key === "none" || key === "low" || key === "medium" || key === "high") {
    return key;
  }
  return "low";
}
