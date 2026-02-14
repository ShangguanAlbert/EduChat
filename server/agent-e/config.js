import {
  AGENT_E_CONFIG_KEY,
  AGENT_E_DEFAULT_PROVIDER_POLICY,
  AGENT_E_DEFAULT_REVIEW_POLICY,
  AGENT_E_DEFAULT_RUNTIME,
  AGENT_E_DEFAULT_SKILL_POLICY,
  AGENT_E_FIXED_MAX_OUTPUT_TOKENS,
  AGENT_E_FIXED_MODEL,
  AGENT_E_FIXED_PROTOCOL,
  AGENT_E_FIXED_PROVIDER,
  AGENT_E_FIXED_TEMPERATURE,
  AGENT_E_FIXED_TOP_P,
} from "./constants.js";
import {
  AGENT_E_SKILL_REGISTRY,
  buildDefaultAgentESkillBindings,
  sanitizeAgentESkillBindings,
} from "./skills/registry.js";

function sanitizeText(value, fallback = "", maxLen = 160) {
  const text = String(value ?? fallback).trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
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

function sanitizeNumber(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.min(max, Math.max(min, num));
}

function sanitizeInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const fixed = Math.trunc(num);
  return Math.min(max, Math.max(min, fixed));
}

export function buildDefaultAgentEConfig() {
  return {
    key: AGENT_E_CONFIG_KEY,
    enabled: true,
    schemaVersion: 1,
    providerPolicy: { ...AGENT_E_DEFAULT_PROVIDER_POLICY },
    runtime: { ...AGENT_E_DEFAULT_RUNTIME },
    reviewPolicy: { ...AGENT_E_DEFAULT_REVIEW_POLICY },
    skillPolicy: { ...AGENT_E_DEFAULT_SKILL_POLICY },
    skills: buildDefaultAgentESkillBindings(),
    updatedAt: null,
  };
}

export function sanitizeAgentERuntime(raw, fallback = AGENT_E_DEFAULT_RUNTIME) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    provider: AGENT_E_FIXED_PROVIDER,
    model: AGENT_E_FIXED_MODEL,
    protocol: AGENT_E_FIXED_PROTOCOL,
    temperature: AGENT_E_FIXED_TEMPERATURE,
    topP: AGENT_E_FIXED_TOP_P,
    frequencyPenalty: sanitizeNumber(
      source.frequencyPenalty,
      fallback.frequencyPenalty,
      -2,
      2,
    ),
    presencePenalty: sanitizeNumber(source.presencePenalty, fallback.presencePenalty, -2, 2),
    contextRounds: sanitizeInteger(source.contextRounds, fallback.contextRounds, 1, 20),
    maxOutputTokens: AGENT_E_FIXED_MAX_OUTPUT_TOKENS,
    maxReasoningTokens: sanitizeInteger(
      source.maxReasoningTokens,
      fallback.maxReasoningTokens,
      0,
      131072,
    ),
    enableThinking: sanitizeBoolean(source.enableThinking, fallback.enableThinking),
    includeCurrentTime: sanitizeBoolean(source.includeCurrentTime, fallback.includeCurrentTime),
    injectSafetyPrompt: sanitizeBoolean(source.injectSafetyPrompt, fallback.injectSafetyPrompt),
    preventPromptLeak: sanitizeBoolean(source.preventPromptLeak, fallback.preventPromptLeak),
    openrouterPdfEngine: sanitizeText(source.openrouterPdfEngine, fallback.openrouterPdfEngine, 20),
  };
}

function sanitizeProviderPolicy() {
  return {
    mode: "locked",
    lockedProvider: AGENT_E_FIXED_PROVIDER,
  };
}

function sanitizeReviewPolicy(raw, fallback = AGENT_E_DEFAULT_REVIEW_POLICY) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    language: "zh-CN",
    requireEvidenceAnchors: sanitizeBoolean(
      source.requireEvidenceAnchors,
      fallback.requireEvidenceAnchors,
    ),
    forceStructuredOutput: sanitizeBoolean(
      source.forceStructuredOutput,
      fallback.forceStructuredOutput,
    ),
  };
}

function sanitizeSkillPolicy(raw, fallback = AGENT_E_DEFAULT_SKILL_POLICY) {
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    autoSelect: sanitizeBoolean(source.autoSelect, fallback.autoSelect),
    strictMode: sanitizeBoolean(source.strictMode, fallback.strictMode),
    maxSkillsPerTurn: sanitizeInteger(source.maxSkillsPerTurn, fallback.maxSkillsPerTurn, 1, 6),
    allowFallbackGeneralAnswer: sanitizeBoolean(
      source.allowFallbackGeneralAnswer,
      fallback.allowFallbackGeneralAnswer,
    ),
  };
}

export function sanitizeAgentEConfigPayload(raw, fallback = null) {
  const defaults = buildDefaultAgentEConfig();
  const safeFallback =
    fallback && typeof fallback === "object"
      ? fallback
      : {};
  const base = {
    ...defaults,
    enabled:
      typeof safeFallback.enabled === "boolean"
        ? safeFallback.enabled
        : defaults.enabled,
    schemaVersion: sanitizeInteger(
      safeFallback.schemaVersion,
      defaults.schemaVersion,
      1,
      100,
    ),
    providerPolicy: {
      ...defaults.providerPolicy,
      ...(safeFallback.providerPolicy && typeof safeFallback.providerPolicy === "object"
        ? safeFallback.providerPolicy
        : {}),
    },
    runtime: {
      ...defaults.runtime,
      ...(safeFallback.runtime && typeof safeFallback.runtime === "object"
        ? safeFallback.runtime
        : {}),
    },
    reviewPolicy: {
      ...defaults.reviewPolicy,
      ...(safeFallback.reviewPolicy && typeof safeFallback.reviewPolicy === "object"
        ? safeFallback.reviewPolicy
        : {}),
    },
    skillPolicy: {
      ...defaults.skillPolicy,
      ...(safeFallback.skillPolicy && typeof safeFallback.skillPolicy === "object"
        ? safeFallback.skillPolicy
        : {}),
    },
    skills: Array.isArray(safeFallback.skills) ? safeFallback.skills : defaults.skills,
  };
  const source = raw && typeof raw === "object" ? raw : {};
  return {
    key: AGENT_E_CONFIG_KEY,
    enabled: sanitizeBoolean(source.enabled, base.enabled),
    schemaVersion: sanitizeInteger(source.schemaVersion, 1, 1, 100),
    providerPolicy: sanitizeProviderPolicy(source.providerPolicy, base.providerPolicy),
    runtime: sanitizeAgentERuntime(source.runtime, base.runtime),
    reviewPolicy: sanitizeReviewPolicy(source.reviewPolicy, base.reviewPolicy),
    skillPolicy: sanitizeSkillPolicy(source.skillPolicy, base.skillPolicy),
    skills: sanitizeAgentESkillBindings(source.skills || base.skills),
    updatedAt: null,
  };
}

export function normalizeAgentEConfigDoc(doc) {
  if (!doc) return buildDefaultAgentEConfig();
  const normalized = sanitizeAgentEConfigPayload(doc, buildDefaultAgentEConfig());
  normalized.updatedAt = doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null;
  return normalized;
}

export function createAgentEConfigModel(mongoose) {
  const schema = new mongoose.Schema(
    {
      key: {
        type: String,
        required: true,
        unique: true,
        default: AGENT_E_CONFIG_KEY,
        index: true,
      },
      enabled: { type: Boolean, default: true },
      schemaVersion: { type: Number, default: 1 },
      providerPolicy: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...AGENT_E_DEFAULT_PROVIDER_POLICY }) },
      runtime: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...AGENT_E_DEFAULT_RUNTIME }) },
      reviewPolicy: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...AGENT_E_DEFAULT_REVIEW_POLICY }) },
      skillPolicy: { type: mongoose.Schema.Types.Mixed, default: () => ({ ...AGENT_E_DEFAULT_SKILL_POLICY }) },
      skills: { type: [mongoose.Schema.Types.Mixed], default: () => buildDefaultAgentESkillBindings() },
    },
    {
      timestamps: true,
      collection: "agent_e_configs",
    },
  );

  return mongoose.models.AgentEConfig || mongoose.model("AgentEConfig", schema);
}

export function buildAgentEAdminSettingsResponse(config) {
  const normalized = normalizeAgentEConfigDoc(config);
  return {
    ok: true,
    config: normalized,
    availableSkills: AGENT_E_SKILL_REGISTRY.map((skill) => ({
      id: skill.id,
      name: skill.name,
      version: skill.version,
      defaultPriority: skill.defaultPriority || skill.priority,
      versionPin: skill.versionPin || "1.x",
      enabledByDefault: skill.enabledByDefault !== false,
      description: skill.description || "",
    })),
    defaultRuntime: { ...AGENT_E_DEFAULT_RUNTIME },
  };
}
