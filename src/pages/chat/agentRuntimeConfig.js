export const AGENT_IDS = ["A", "B", "C", "D"];

export const DEFAULT_AGENT_RUNTIME_CONFIG = Object.freeze({
  protocol: "chat",
  creativityMode: "balanced",
  temperature: 0.6,
  topP: 1,
  frequencyPenalty: 0,
  presencePenalty: 0,
  contextRounds: 10,
  maxOutputTokens: 4096,
  maxReasoningTokens: 0,
  reasoningEffort: "low",
  includeCurrentTime: false,
  injectSafetyPrompt: false,
});

export const CREATIVITY_PRESET_OPTIONS = [
  { value: "precise", label: "精确模式" },
  { value: "balanced", label: "平衡模式" },
  { value: "creative", label: "创意模式" },
  { value: "custom", label: "自定义" },
];

export function createDefaultAgentRuntimeConfigMap() {
  return {
    A: { ...DEFAULT_AGENT_RUNTIME_CONFIG },
    B: { ...DEFAULT_AGENT_RUNTIME_CONFIG },
    C: { ...DEFAULT_AGENT_RUNTIME_CONFIG },
    D: { ...DEFAULT_AGENT_RUNTIME_CONFIG },
  };
}

export function sanitizeSingleRuntimeConfig(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const creativityMode = sanitizeCreativityMode(source.creativityMode);
  const preset = getPresetDefaults(creativityMode);
  const isCustom = creativityMode === "custom";

  return {
    protocol: sanitizeProtocol(source.protocol),
    creativityMode,
    temperature: isCustom
      ? sanitizeNumber(source.temperature, DEFAULT_AGENT_RUNTIME_CONFIG.temperature, 0, 2)
      : preset.temperature,
    topP: isCustom
      ? sanitizeNumber(source.topP, DEFAULT_AGENT_RUNTIME_CONFIG.topP, 0, 1)
      : preset.topP,
    frequencyPenalty: isCustom
      ? sanitizeNumber(source.frequencyPenalty, DEFAULT_AGENT_RUNTIME_CONFIG.frequencyPenalty, -2, 2)
      : preset.frequencyPenalty,
    presencePenalty: isCustom
      ? sanitizeNumber(source.presencePenalty, DEFAULT_AGENT_RUNTIME_CONFIG.presencePenalty, -2, 2)
      : preset.presencePenalty,
    contextRounds: sanitizeInteger(source.contextRounds, DEFAULT_AGENT_RUNTIME_CONFIG.contextRounds, 1, 20),
    maxOutputTokens: sanitizeInteger(
      source.maxOutputTokens,
      DEFAULT_AGENT_RUNTIME_CONFIG.maxOutputTokens,
      64,
      8192,
    ),
    maxReasoningTokens: sanitizeInteger(
      source.maxReasoningTokens,
      DEFAULT_AGENT_RUNTIME_CONFIG.maxReasoningTokens,
      0,
      8192,
    ),
    reasoningEffort: sanitizeReasoningEffort(source.reasoningEffort),
    includeCurrentTime: !!source.includeCurrentTime,
    injectSafetyPrompt: !!source.injectSafetyPrompt,
  };
}

export function sanitizeRuntimeConfigMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = createDefaultAgentRuntimeConfigMap();
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = sanitizeSingleRuntimeConfig(source[agentId]);
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
  if (key === "responses") return "responses";
  return "chat";
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

function sanitizeReasoningEffort(value) {
  const key = String(value || "")
    .trim()
    .toLowerCase();
  if (key === "none" || key === "low" || key === "medium" || key === "high") {
    return key;
  }
  return "low";
}
