import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SKILLS_ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "skills",
);

function sanitizeText(value, fallback = "", maxLen = 400) {
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

function sanitizeInteger(value, fallback, min, max) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const fixed = Math.trunc(num);
  return Math.min(max, Math.max(min, fixed));
}

function sanitizeSkillId(value, fallback = "") {
  const text = String(value ?? fallback)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return text.slice(0, 64);
}

function sanitizeStringArray(value, maxItems = 100) {
  const source = Array.isArray(value)
    ? value
    : String(value || "")
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
  return source
    .map((item) => sanitizeText(item, "", 80).toLowerCase())
    .filter(Boolean)
    .slice(0, maxItems);
}

function mergeUniqueStrings(...groups) {
  const next = [];
  const seen = new Set();
  groups
    .flat()
    .map((item) => sanitizeText(item, "", 120))
    .filter(Boolean)
    .forEach((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      next.push(item);
    });
  return next;
}

function parseSimpleFrontmatter(markdown) {
  const text = String(markdown || "").replace(/\r\n/g, "\n");
  if (!text.startsWith("---\n")) {
    return { frontmatter: {}, body: text.trim() };
  }

  const marker = "\n---\n";
  const endIndex = text.indexOf(marker, 4);
  if (endIndex < 0) {
    return { frontmatter: {}, body: text.trim() };
  }

  const rawFrontmatter = text.slice(4, endIndex);
  const body = text.slice(endIndex + marker.length).trim();
  const frontmatter = {};

  rawFrontmatter.split("\n").forEach((line) => {
    const match = line.match(/^([a-zA-Z0-9_-]+)\s*:\s*(.*)$/);
    if (!match) return;
    const key = sanitizeText(match[1], "", 64);
    if (!key) return;
    const rawValue = String(match[2] || "").trim();
    const unquoted =
      (rawValue.startsWith('"') && rawValue.endsWith('"')) ||
      (rawValue.startsWith("'") && rawValue.endsWith("'"))
        ? rawValue.slice(1, -1)
        : rawValue;
    frontmatter[key] = unquoted;
  });

  return { frontmatter, body };
}

function readJsonIfExists(filePath) {
  if (!existsSync(filePath)) return {};
  try {
    const text = readFileSync(filePath, "utf8");
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
    return {};
  } catch {
    return {};
  }
}

export function getSkillsRootDir() {
  return SKILLS_ROOT_DIR;
}

export function listTopLevelSkillIds({ includeTemplates = false } = {}) {
  if (!existsSync(SKILLS_ROOT_DIR)) return [];
  return readdirSync(SKILLS_ROOT_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith("."))
    .filter((name) => includeTemplates || !name.startsWith("_"))
    .map((name) => sanitizeSkillId(name))
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b));
}

function readSkillPackageInternal(skillId, defaults = {}, options = {}, visited = new Set(), depth = 0) {
  const id = sanitizeSkillId(skillId);
  if (!id) return null;
  if (visited.has(id)) return null;
  if (depth > sanitizeInteger(options.maxIncludeDepth, 6, 1, 20)) return null;

  const skillDir = path.join(SKILLS_ROOT_DIR, id);
  const markdownPath = path.join(skillDir, "SKILL.md");
  const manifestPath = path.join(skillDir, "skill.json");
  const manifest = readJsonIfExists(manifestPath);

  const markdownRaw = existsSync(markdownPath) ? readFileSync(markdownPath, "utf8") : "";
  const { frontmatter, body } = parseSimpleFrontmatter(markdownRaw);
  const markdownName = sanitizeSkillId(frontmatter?.name);

  const version = sanitizeText(manifest.version, sanitizeText(defaults.version, "1.0.0", 32), 32);
  const defaultPriority = sanitizeInteger(
    manifest.defaultPriority,
    sanitizeInteger(defaults.defaultPriority, 50, 1, 999),
    1,
    999,
  );
  const enabledByDefault = sanitizeBoolean(
    manifest.enabledByDefault,
    sanitizeBoolean(defaults.enabledByDefault, true),
  );
  const versionPin = sanitizeText(manifest.versionPin, sanitizeText(defaults.versionPin, "1.x", 20), 20);
  const triggers = sanitizeStringArray(manifest.triggers, 100);
  const includes = sanitizeStringArray(manifest.includes, 20).map((item) => sanitizeSkillId(item)).filter(Boolean);
  const promptFallback = sanitizeText(
    manifest.promptFallback,
    sanitizeText(defaults.promptFallback, "", 4000),
    4000,
  );
  const description = sanitizeText(
    frontmatter?.description,
    sanitizeText(manifest.description, sanitizeText(defaults.description, "", 1000), 1000),
    1000,
  );
  const prompt = sanitizeText(body, "", 200000) || promptFallback;

  const baseResult = {
    id,
    name: sanitizeText(manifest.name, sanitizeText(defaults.name, markdownName || id, 80), 80),
    version,
    defaultPriority,
    enabledByDefault,
    versionPin,
    triggers: triggers.length > 0 ? triggers : sanitizeStringArray(defaults.triggers, 100),
    prompt,
    promptFallback,
    description,
    includes,
    paths: {
      skillDir,
      markdownPath,
      manifestPath,
    },
    exists: {
      markdown: existsSync(markdownPath),
      manifest: existsSync(manifestPath),
    },
  };

  if (!options.resolveIncludes || includes.length === 0) {
    return baseResult;
  }

  const nextVisited = new Set(visited);
  nextVisited.add(id);
  const includedPackages = includes
    .map((childId) =>
      readSkillPackageInternal(
        childId,
        options.defaultsById?.[childId] || {},
        options,
        nextVisited,
        depth + 1,
      ),
    )
    .filter(Boolean);

  if (includedPackages.length === 0) {
    return baseResult;
  }

  const mergedPrompt = [
    baseResult.prompt,
    ...includedPackages.map((pkg) =>
      [
        `## Included Skill: ${pkg.name} (${pkg.id})`,
        pkg.prompt,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    ...baseResult,
    triggers: mergeUniqueStrings(
      baseResult.triggers,
      ...includedPackages.map((item) => item.triggers),
    ),
    prompt: sanitizeText(mergedPrompt, baseResult.promptFallback, 200000),
  };
}

// Unified runtime contract for all agents:
// skills/<id>/SKILL.md + optional skills/<id>/skill.json
export function readSkillPackage(skillId, defaults = {}, options = {}) {
  return readSkillPackageInternal(skillId, defaults, options, new Set(), 0);
}

export function readSkillPackages(skillIds = [], defaultsById = {}, options = {}) {
  const ids = Array.isArray(skillIds) && skillIds.length > 0
    ? skillIds
    : listTopLevelSkillIds();
  return ids
    .map((id) =>
      readSkillPackage(id, defaultsById?.[id] || {}, options),
    )
    .filter(Boolean);
}
