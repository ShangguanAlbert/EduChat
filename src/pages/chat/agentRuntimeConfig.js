export const AGENT_IDS = ["A", "B", "C", "D"];
const RUNTIME_MAX_CONTEXT_WINDOW_TOKENS = 512000;
const RUNTIME_MAX_INPUT_TOKENS = 512000;
const RUNTIME_MAX_OUTPUT_TOKENS = 128000;
const RUNTIME_MAX_REASONING_TOKENS = 128000;
const DEFAULT_AGENT_MODEL_BY_AGENT = Object.freeze({
  A: "doubao-seed-1-6-251015",
  B: "glm-4-7-251222",
  C: "deepseek-v3-2-251201",
  D: "z-ai/glm-4.7-flash",
});
const RESPONSE_MODEL_TOKEN_PROFILES = Object.freeze([
  {
    id: "doubao-seed-1-8-251228",
    aliases: ["doubao-seed-1-8-251228", "doubao-seed-1-8"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-251015",
    aliases: ["doubao-seed-1-6-251015", "doubao-seed-1-6"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 64000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-250615",
    aliases: ["doubao-seed-1-6-250615"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-lite-251015",
    aliases: ["doubao-seed-1-6-lite-251015", "doubao-seed-1-6-lite"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-flash-250828",
    aliases: [
      "doubao-seed-1-6-flash-250828",
      "doubao-seed-1-6-flash-250715",
      "doubao-seed-1-6-flash-250615",
      "doubao-seed-1-6-flash",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-vision-250815",
    aliases: ["doubao-seed-1-6-vision-250815", "doubao-seed-1-6-vision"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-1-6-thinking-250715",
    aliases: [
      "doubao-seed-1-6-thinking-250715",
      "doubao-seed-1-6-thinking-250615",
      "doubao-seed-1-6-thinking",
    ],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-seed-code-preview-251028",
    aliases: ["doubao-seed-code-preview-251028", "doubao-seed-code"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "glm-4-7-251222",
    aliases: ["glm-4-7-251222", "glm-4-7"],
    contextWindowTokens: 200000,
    maxInputTokens: 200000,
    maxOutputTokens: 128000,
    maxReasoningTokens: 128000,
  },
  {
    id: "deepseek-v3-2-251201",
    aliases: ["deepseek-v3-2-251201", "deepseek-v3-2"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-1-terminus",
    aliases: ["deepseek-v3-1-terminus", "deepseek-v3-1"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-1-250821",
    aliases: ["deepseek-v3-1-250821"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "deepseek-v3-250324",
    aliases: ["deepseek-v3-250324", "deepseek-v3"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "deepseek-r1-250528",
    aliases: ["deepseek-r1-250528", "deepseek-r1"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "kimi-k2-thinking-251104",
    aliases: ["kimi-k2-thinking-251104", "kimi-k2-thinking"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 32000,
  },
  {
    id: "kimi-k2-250905",
    aliases: ["kimi-k2-250905", "kimi-k2"],
    contextWindowTokens: 256000,
    maxInputTokens: 224000,
    maxOutputTokens: 32000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-thinking-pro-250415",
    aliases: ["doubao-1-5-thinking-pro-250415", "doubao-1-5-thinking-pro"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-thinking-pro-m-250428",
    aliases: ["doubao-1-5-thinking-pro-m-250428", "doubao-1-5-thinking-pro-m"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-thinking-vision-pro-250428",
    aliases: [
      "doubao-1-5-thinking-vision-pro-250428",
      "doubao-1-5-thinking-vision-pro",
    ],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-ui-tars-250428",
    aliases: ["doubao-1-5-ui-tars-250428", "doubao-1-5-ui-tars"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-vision-pro-250328",
    aliases: ["doubao-1-5-vision-pro-250328", "doubao-1-5-vision-pro"],
    contextWindowTokens: 128000,
    maxInputTokens: 96000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 32000,
  },
  {
    id: "doubao-1-5-pro-32k-250115",
    aliases: ["doubao-1-5-pro-32k-250115", "doubao-1-5-pro-32k"],
    contextWindowTokens: 128000,
    maxInputTokens: 128000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-lite-32k-250115",
    aliases: ["doubao-1-5-lite-32k-250115", "doubao-1-5-lite-32k"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-pro-32k-character-250715",
    aliases: [
      "doubao-1-5-pro-32k-character-250715",
      "doubao-1-5-pro-32k-character-250228",
      "doubao-1-5-pro-32k-character",
    ],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-vision-pro-32k-250115",
    aliases: ["doubao-1-5-vision-pro-32k-250115", "doubao-1-5-vision-pro-32k"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 12000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-1-5-vision-lite-250315",
    aliases: ["doubao-1-5-vision-lite-250315", "doubao-1-5-vision-lite"],
    contextWindowTokens: 128000,
    maxInputTokens: 128000,
    maxOutputTokens: 16000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-lite-32k-character-250228",
    aliases: ["doubao-lite-32k-character-250228", "doubao-lite-32k-character"],
    contextWindowTokens: 32000,
    maxInputTokens: 32000,
    maxOutputTokens: 4000,
    maxReasoningTokens: 0,
  },
  {
    id: "doubao-seed-translation-250915",
    aliases: ["doubao-seed-translation-250915", "doubao-seed-translation"],
    contextWindowTokens: 4000,
    maxInputTokens: 1000,
    maxOutputTokens: 3000,
    maxReasoningTokens: 0,
  },
]);

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
  includeCurrentTime: false,
  preventPromptLeak: false,
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

function getDefaultModelByAgent(agentId = "A") {
  const key = AGENT_IDS.includes(agentId) ? agentId : "A";
  return DEFAULT_AGENT_MODEL_BY_AGENT[key] || DEFAULT_AGENT_MODEL_BY_AGENT.A;
}

function getNormalizedModelCandidates(model) {
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

export function resolveRuntimeTokenProfileByModel(model) {
  const candidates = getNormalizedModelCandidates(model);
  if (candidates.length === 0) return null;

  let best = null;
  RESPONSE_MODEL_TOKEN_PROFILES.forEach((profile) => {
    const aliases = Array.isArray(profile.aliases) ? profile.aliases : [];
    aliases.forEach((aliasRaw) => {
      const alias = String(aliasRaw || "")
        .trim()
        .toLowerCase();
      if (!alias) return;

      candidates.forEach((candidate) => {
        if (!candidate) return;
        const exact = candidate === alias;
        const includes = !exact && candidate.includes(alias);
        if (!exact && !includes) return;

        const score = (exact ? 1000 : 100) + alias.length;
        if (!best || score > best.score) {
          best = { profile, score };
        }
      });
    });
  });

  if (!best) return null;
  return {
    contextWindowTokens: best.profile.contextWindowTokens,
    maxInputTokens: best.profile.maxInputTokens,
    maxOutputTokens: best.profile.maxOutputTokens,
    maxReasoningTokens: best.profile.maxReasoningTokens,
    matchedModelId: best.profile.id,
  };
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
  const normalizedAgentId = AGENT_IDS.includes(agentId) ? agentId : "A";
  const defaults = getDefaultRuntimeConfigByAgent(normalizedAgentId);
  const protocol = sanitizeProtocol(source.protocol);
  const model = sanitizeModel(source.model);
  const modelForMatching = model || getDefaultModelByAgent(normalizedAgentId);
  const tokenProfile = resolveRuntimeTokenProfileByModel(modelForMatching);
  const tokenDefaults = tokenProfile || defaults;
  const lockTokenFields = protocol === "responses";
  const creativityMode = sanitizeCreativityMode(source.creativityMode);
  const preset = getPresetDefaults(creativityMode);
  const isCustom = creativityMode === "custom";

  return {
    provider: sanitizeProvider(source.provider),
    model,
    protocol,
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
      lockTokenFields ? tokenDefaults.contextWindowTokens : source.contextWindowTokens,
      tokenDefaults.contextWindowTokens,
      1024,
      RUNTIME_MAX_CONTEXT_WINDOW_TOKENS,
    ),
    maxInputTokens: sanitizeInteger(
      lockTokenFields ? tokenDefaults.maxInputTokens : source.maxInputTokens,
      tokenDefaults.maxInputTokens,
      1024,
      RUNTIME_MAX_INPUT_TOKENS,
    ),
    maxOutputTokens: sanitizeInteger(
      source.maxOutputTokens,
      tokenDefaults.maxOutputTokens,
      64,
      RUNTIME_MAX_OUTPUT_TOKENS,
    ),
    maxReasoningTokens: sanitizeInteger(
      lockTokenFields ? tokenDefaults.maxReasoningTokens : source.maxReasoningTokens,
      tokenDefaults.maxReasoningTokens,
      0,
      RUNTIME_MAX_REASONING_TOKENS,
    ),
    enableThinking: sanitizeBoolean(
      source.enableThinking,
      defaults.enableThinking,
    ),
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
