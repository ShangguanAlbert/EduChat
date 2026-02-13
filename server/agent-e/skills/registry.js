import { readSkillPackage } from "../../skills/skillLoader.js";

const PRIMARY_SKILL_ID = "ssci-reviewer";

const SKILL_DEFINITIONS = Object.freeze([
  {
    id: PRIMARY_SKILL_ID,
    name: "SSCI Reviewer (Orchestrator)",
    version: "1.0.0",
    defaultPriority: 100,
    enabledByDefault: true,
    versionPin: "1.x",
    triggers: [
      "ssci",
      "peer review",
      "reviewer",
      "education",
      "edtech",
      "manuscript",
      "major revision",
      "minor revision",
      "reject",
      "accept",
    ],
    promptFallback:
      "执行 SSCI 教育学/教育技术学论文审稿，输出结构化审稿报告并给出可执行修改建议与推荐结论。",
  },
]);

function hydrateSkill(def) {
  if (!def) return null;
  const skillPackage = readSkillPackage(def.id, {
    name: def.name,
    version: def.version,
    defaultPriority: def.defaultPriority,
    enabledByDefault: def.enabledByDefault,
    versionPin: def.versionPin,
    triggers: def.triggers,
    promptFallback: def.promptFallback,
  }, { resolveIncludes: true, maxIncludeDepth: 8 });
  if (!skillPackage) return null;

  return {
    id: skillPackage.id,
    name: skillPackage.name,
    version: skillPackage.version,
    priority: skillPackage.defaultPriority,
    enabledByDefault: skillPackage.enabledByDefault,
    versionPin: skillPackage.versionPin,
    triggers: skillPackage.triggers,
    description: skillPackage.description || "",
    prompt: skillPackage.prompt || def.promptFallback || "",
  };
}

const HYDRATED_SKILLS = SKILL_DEFINITIONS.map(hydrateSkill).filter(Boolean);
const SKILL_BY_ID = new Map(HYDRATED_SKILLS.map((item) => [item.id, item]));

export const AGENT_E_SKILL_REGISTRY = HYDRATED_SKILLS.map((item) => ({
  id: item.id,
  name: item.name,
  version: item.version,
  priority: item.priority,
  defaultPriority: item.priority,
  enabledByDefault: item.enabledByDefault,
  versionPin: item.versionPin,
  description: item.description,
}));

export function getAgentESkillById(id) {
  const key = String(id || "").trim();
  return SKILL_BY_ID.get(key) || null;
}

export function buildDefaultAgentESkillBindings() {
  return HYDRATED_SKILLS.map((item) => ({
    id: item.id,
    enabled: item.enabledByDefault !== false,
    priority: item.priority,
    versionPin: item.versionPin || "1.x",
  }));
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
  const fixed = Math.trunc(num);
  return Math.min(max, Math.max(min, fixed));
}

function sanitizeText(value, fallback = "", maxLen = 60) {
  const text = String(value ?? fallback).trim();
  if (!text) return fallback;
  return text.slice(0, maxLen);
}

export function sanitizeAgentESkillBindings(raw) {
  const source = Array.isArray(raw) ? raw : [];
  const byId = new Map();
  source.slice(0, 100).forEach((item) => {
    const id = sanitizeText(item?.id, "", 64);
    if (!id) return;
    const target = getAgentESkillById(id);
    if (!target) return;
    byId.set(id, {
      id,
      enabled: sanitizeBoolean(item?.enabled, true),
      priority: sanitizeInteger(item?.priority, target.priority, 1, 999),
      versionPin: sanitizeText(item?.versionPin, "1.x", 20),
    });
  });

  return HYDRATED_SKILLS.map((item) => {
    const existing = byId.get(item.id);
    if (existing) return existing;
    return {
      id: item.id,
      enabled: item.enabledByDefault !== false,
      priority: item.priority,
      versionPin: item.versionPin || "1.x",
    };
  });
}

function extractMessageText(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => {
      if (!part || typeof part !== "object") return "";
      if (typeof part.text === "string") return part.text;
      if (typeof part.content === "string") return part.content;
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

function getLastUserText(messages) {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message?.role !== "user") continue;
    return extractMessageText(message?.content)
      .trim()
      .toLowerCase();
  }
  return "";
}

function scoreSkillByText(skill, text) {
  if (!text) return 0;
  let score = 0;
  const triggers = Array.isArray(skill?.triggers) ? skill.triggers : [];
  triggers.forEach((word) => {
    const key = String(word || "")
      .trim()
      .toLowerCase();
    if (!key) return;
    if (text.includes(key)) score += 1;
  });
  return score;
}

export function selectAgentESkills({ messages, bindings, maxSkills = 3, autoSelect = true }) {
  const enabledBindings = (Array.isArray(bindings) ? bindings : [])
    .filter((item) => item?.enabled)
    .map((item) => {
      const skill = getAgentESkillById(item.id);
      if (!skill) return null;
      return {
        skill,
        priority: sanitizeInteger(item.priority, skill.priority, 1, 999),
      };
    })
    .filter(Boolean);

  if (enabledBindings.length === 0) return [];

  const safeMaxSkills = sanitizeInteger(maxSkills, 3, 1, 6);
  const lastUserText = getLastUserText(messages);

  const scored = enabledBindings.map(({ skill, priority }) => {
    const triggerScore = autoSelect ? scoreSkillByText(skill, lastUserText) : 0;
    const coreBoost = skill.id === PRIMARY_SKILL_ID ? 100 : 0;
    return {
      skill,
      priority,
      triggerScore,
      score: priority + triggerScore * 10 + coreBoost,
    };
  });

  const sorted = scored.sort((a, b) => b.score - a.score);
  const picked = [];
  for (const item of sorted) {
    if (picked.length >= safeMaxSkills) break;
    if (autoSelect && item.triggerScore <= 0 && item.skill.id !== PRIMARY_SKILL_ID) {
      continue;
    }
    picked.push(item.skill);
  }

  if (picked.length === 0) {
    const core = sorted.find((item) => item.skill.id === PRIMARY_SKILL_ID) || sorted[0];
    if (core) picked.push(core.skill);
  }

  return picked;
}
