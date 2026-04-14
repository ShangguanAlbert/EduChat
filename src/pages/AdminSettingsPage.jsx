import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CircleAlert,
  Info,
  Save,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import MessageInput from "../components/MessageInput.jsx";
import MessageList from "../components/MessageList.jsx";
import PortalSelect from "../components/PortalSelect.jsx";
import {
  fetchAdminAgentSettings,
  prepareAdminDebugAttachments,
  uploadAdminVolcengineDebugFiles,
  saveAdminAgentSettings,
  streamAdminAgentDebug,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import { resolveActiveAuthSlot, withAuthSlot } from "../app/authStorage.js";
import {
  AGENT_IDS,
  ALIYUN_MINIMAX_FIXED_TOP_P,
  ALIYUN_MINIMAX_FIXED_TEMPERATURE,
  DEFAULT_AGENT_RUNTIME_CONFIG,
  PACKYCODE_DEFAULT_THINKING_EFFORT,
  VOLCENGINE_FIXED_SAMPLING_MODEL_ID,
  VOLCENGINE_FIXED_TOP_P,
  VOLCENGINE_FIXED_TEMPERATURE,
  createDefaultAgentRuntimeConfigMap,
  isVolcengineFixedSamplingModel,
  resolveAliyunModelPolicyForRuntime,
  resolveProviderDefaultModel,
  resolveRuntimeTokenProfileByModel,
  sanitizeRuntimeConfigMap,
  sanitizeSingleRuntimeConfig,
} from "./chat/agentRuntimeConfig.js";
import "../styles/chat.css";
import "../styles/admin-settings.css";

const AUTO_SAVE_MS = 5 * 60 * 1000;
const PROVIDER_OPTIONS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "packycode", label: "PackyCode" },
  { value: "volcengine", label: "Volcengine Ark" },
  { value: "aliyun", label: "Aliyun DashScope" },
];
const KNOWN_PROVIDERS = new Set([
  "openrouter",
  "packycode",
  "volcengine",
  "aliyun",
]);
const AGENT_A_FIXED_PROVIDER = "packycode";
const AGENT_A_FIXED_MODEL = "gpt-5.4";
const AGENT_C_FIXED_MODEL = "doubao-seed-2-0-pro-260215";
const AGENT_A_LOCKED_RUNTIME_FIELDS = new Set(["provider", "model"]);
const AGENT_D_LOCKED_RUNTIME_FIELDS = new Set([
  "provider",
  "model",
  "includeCurrentTime",
  "maxOutputTokens",
]);
const AGENT_C_LOCKED_RUNTIME_FIELDS = new Set([
  "provider",
  "model",
  "protocol",
  "maxOutputTokens",
  "thinkingEffort",
]);
const OPENROUTER_PDF_ENGINE_OPTIONS = [
  { value: "auto", label: "Auto (default)" },
  { value: "pdf-text", label: "pdf-text (free)" },
  { value: "mistral-ocr", label: "mistral-ocr (OCR)" },
  { value: "native", label: "native (model-native)" },
];
const ALIYUN_PROTOCOL_OPTIONS = [
  { value: "chat", label: "Chat API" },
  { value: "responses", label: "Responses API" },
  { value: "dashscope", label: "DashScope native API" },
];
const ALIYUN_FILE_PROCESS_MODE_OPTIONS = [
  { value: "local_parse", label: "Local parse (compatibility)" },
  { value: "native_oss_url", label: "Native file URL (debug)" },
];
const ALIYUN_SEARCH_STRATEGY_OPTIONS = [
  { value: "turbo", label: "Turbo (default)" },
  { value: "max", label: "Maximum recall" },
  { value: "agent", label: "Multi-step retrieval" },
  { value: "agent_max", label: "Multi-step + web crawl" },
];
const ALIYUN_SEARCH_CITATION_FORMAT_OPTIONS = [
  { value: "[<number>]", label: "[1]" },
  { value: "[ref_<number>]", label: "[ref 1]" },
];
const ALIYUN_SEARCH_FRESHNESS_OPTIONS = [
  { value: 0, label: "Any time (default)" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 180, label: "Last 180 days" },
  { value: 365, label: "Last 365 days" },
];
const DEBUG_VIDEO_EXTENSIONS = new Set(["mp4", "avi", "mov"]);
const DEBUG_IMAGE_EXTENSIONS = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "bmp",
  "svg",
  "heic",
  "avif",
]);
const VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES = [
  {
    id: "doubao-seed-2-0-pro-260215",
    aliases: [
      "doubao-seed-2-0-pro-260215",
      "doubao-seed-2-0-pro",
      "doubao-seed-2.0-pro-260215",
      "doubao-seed-2.0-pro",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-2-0-lite-260215",
    aliases: [
      "doubao-seed-2-0-lite-260215",
      "doubao-seed-2-0-lite",
      "doubao-seed-2.0-lite-260215",
      "doubao-seed-2.0-lite",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-2-0-mini-260215",
    aliases: [
      "doubao-seed-2-0-mini-260215",
      "doubao-seed-2-0-mini",
      "doubao-seed-2.0-mini-260215",
      "doubao-seed-2.0-mini",
    ],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-8-251228",
    aliases: ["doubao-seed-1-8-251228", "doubao-seed-1-8"],
    supportsThinking: true,
  },
  {
    id: "deepseek-v3-2-251201",
    aliases: ["deepseek-v3-2-251201", "deepseek-v3-2"],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-6-251015",
    aliases: ["doubao-seed-1-6-251015", "doubao-seed-1-6-250615", "doubao-seed-1-6"],
    supportsThinking: true,
  },
  {
    id: "doubao-seed-1-6-thinking-250715",
    aliases: ["doubao-seed-1-6-thinking-250715", "doubao-seed-1-6-thinking"],
    supportsThinking: true,
  },
  {
    id: "deepseek-v3-1-terminus",
    aliases: ["deepseek-v3-1-terminus", "deepseek-v3-1-250821", "deepseek-v3-1"],
    supportsThinking: true,
  },
  {
    id: "kimi-k2-thinking-251104",
    aliases: ["kimi-k2-thinking-251104"],
    supportsThinking: true,
  },
  {
    id: "kimi-k2-250905",
    aliases: ["kimi-k2-250905", "kimi-k2"],
    supportsThinking: false,
  },
];
const VOLCENGINE_WEB_SEARCH_SOURCE_OPTIONS = [
  { key: "webSearchSourceDouyin", value: "douyin", label: "Douyin encyclopedia (douyin)" },
  { key: "webSearchSourceMoji", value: "moji", label: "Moji weather (moji)" },
  { key: "webSearchSourceToutiao", value: "toutiao", label: "Toutiao articles (toutiao)" },
];
const ADMIN_AGENT_META = Object.freeze({
  A: {
    label: "Agent A",
    summary: "Locked to the PackyCode route for a stable flagship setup.",
  },
  B: {
    label: "Agent B",
    summary: "The most flexible sandbox for provider and model experimentation.",
  },
  C: {
    label: "Remote Learning",
    summary: "A search-heavy Volcengine profile tuned for remote education flows.",
  },
  D: {
    label: "Qwen 3.5",
    summary: "An Aliyun-native profile with provider-specific controls and search policies.",
  },
});
const PROVIDER_LABEL_MAP = new Map(
  PROVIDER_OPTIONS.map((item) => [item.value, item.label]),
);

function createDefaultAgentProviderMap() {
  return {
    A: "volcengine",
    B: "volcengine",
    C: "volcengine",
    D: "aliyun",
  };
}

function createDefaultAgentModelMap() {
  return {
    A: "doubao-seed-1-6-251015",
    B: "glm-4-7-251222",
    C: AGENT_C_FIXED_MODEL,
    D: "qwen3.5-plus",
  };
}

function sanitizeAgentProviderMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const fallback = createDefaultAgentProviderMap();
  const next = { ...fallback };
  AGENT_IDS.forEach((agentId) => {
    const key = String(source?.[agentId] || "")
      .trim()
      .toLowerCase();
    if (KNOWN_PROVIDERS.has(key)) {
      next[agentId] = key;
    }
  });
  next.C = "volcengine";
  next.D = "aliyun";
  return next;
}

function sanitizeAgentModelMap(raw) {
  const source = raw && typeof raw === "object" ? raw : {};
  const next = createDefaultAgentModelMap();
  AGENT_IDS.forEach((agentId) => {
    next[agentId] = String(source?.[agentId] || "")
      .trim()
      .slice(0, 180);
  });
  next.C = AGENT_C_FIXED_MODEL;
  next.D = "qwen3.5-plus";
  return next;
}

function clampNumber(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getStepPrecision(step) {
  const text = String(step);
  const dotIndex = text.indexOf(".");
  return dotIndex >= 0 ? text.length - dotIndex - 1 : 0;
}

function formatByStep(value, step) {
  const digits = getStepPrecision(step);
  if (!Number.isFinite(value)) return "";
  if (digits <= 0) return String(Math.round(value));
  return String(Number(value.toFixed(digits)));
}

function normalizeNumberValue(rawValue, options) {
  const { min, max, step, fallback } = options;
  const parsed = Number(rawValue);
  const base = Number.isFinite(parsed) ? parsed : Number(fallback);
  const bounded = clampNumber(base, min, max);
  const snapped = min + Math.round((bounded - min) / step) * step;
  const clamped = clampNumber(snapped, min, max);
  const digits = getStepPrecision(step);
  return Number(clamped.toFixed(digits));
}

function StepIcon({ type }) {
  const isPlus = type === "plus";
  return (
    <svg
      className="admin-step-icon"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M3.2 8H12.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      {isPlus ? (
        <path d="M8 3.2V12.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      ) : null}
    </svg>
  );
}

function CloseXIcon() {
  return (
    <svg
      className="admin-close-x-icon"
      viewBox="0 0 16 16"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path d="M4 4L12 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M12 4L4 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function createEmptyDebugState() {
  return {
    A: [],
    B: [],
    C: [],
    D: [],
  };
}

function formatClock(isoText) {
  if (!isoText) return "";
  const date = new Date(isoText);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour12: false });
}

function readErrorMessage(error) {
  return error?.message || "Request failed. Please try again.";
}

function shouldRelogin(error) {
  const msg = String(error?.message || "");
  return (
    msg.includes("管理员身份无效") ||
    msg.includes("仅管理员可访问") ||
    msg.toLowerCase().includes("admin session is invalid") ||
    msg.toLowerCase().includes("admin only")
  );
}

function formatToggleState(enabled) {
  return enabled ? "On" : "Off";
}

function getAdminAgentLabel(agentId) {
  return ADMIN_AGENT_META[agentId]?.label || `Agent ${agentId}`;
}

function getProviderLabel(provider) {
  return PROVIDER_LABEL_MAP.get(provider) || provider || "Provider default";
}

function getAliyunPolicyMessage(policy) {
  switch (policy?.key) {
    case "glm_blocked":
      return "GLM models are disabled on the Aliyun route. Please switch to another model.";
    case "kimi_blocked":
      return "Aliyun currently supports only `kimi-k2.5` for Kimi. Please switch models.";
    default:
      return String(policy?.errorMessage || "").trim();
  }
}

function resolveVolcengineWebSearchCapability(model) {
  const normalized = String(model || "")
    .trim()
    .toLowerCase();
  if (!normalized) {
    return { supported: false, supportsThinking: false, matchedModelId: "" };
  }

  const candidates = new Set([normalized]);
  const slashIndex = normalized.lastIndexOf("/");
  if (slashIndex > -1 && slashIndex < normalized.length - 1) {
    candidates.add(normalized.slice(slashIndex + 1));
  }

  let best = null;
  VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES.forEach((item) => {
    const aliases = Array.isArray(item.aliases) ? item.aliases : [];
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
          best = { item, score };
        }
      });
    });
  });

  if (!best) {
    return { supported: false, supportsThinking: false, matchedModelId: "" };
  }

  return {
    supported: true,
    supportsThinking: !!best.item.supportsThinking,
    matchedModelId: best.item.id,
  };
}

function isLikelyImageFile(file) {
  const mime = String(file?.type || "")
    .trim()
    .toLowerCase();
  if (mime.startsWith("image/")) return true;
  const name = String(file?.name || "")
    .trim()
    .toLowerCase();
  if (!name.includes(".")) return false;
  const ext = name.split(".").pop();
  return DEBUG_IMAGE_EXTENSIONS.has(ext);
}

function toPreviewMessages(list) {
  return (list || [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({
      id: String(item.id || ""),
      role: item.role,
      content: String(item.content || ""),
    }))
    .filter((item) => item.content.trim().length > 0);
}

function sanitizeUploadedAttachmentLinks(raw) {
  const source = Array.isArray(raw) ? raw : [];
  return source
    .map((item) => ({
      name: String(item?.fileName || item?.name || "")
        .trim()
        .slice(0, 240),
      type: String(item?.mimeType || item?.type || "")
        .trim()
        .toLowerCase(),
      size: Number(item?.size || 0),
      url: String(item?.url || "").trim(),
      ossKey: String(item?.ossKey || "").trim(),
    }))
    .filter((item) => !!item.url);
}

function mergeAttachmentsWithUploadedLinks(attachments, rawLinks) {
  const list = Array.isArray(attachments) ? attachments : [];
  const links = sanitizeUploadedAttachmentLinks(rawLinks);
  if (list.length === 0 || links.length === 0) return list;

  const nextLinks = [...links];
  return list.map((attachment) => {
    const normalizedName = String(attachment?.name || "").trim();
    const normalizedType = String(attachment?.type || "")
      .trim()
      .toLowerCase();
    const normalizedSize = Number(attachment?.size || 0);
    const exactIndex = nextLinks.findIndex((item) => {
      const sameName = item.name && normalizedName && item.name === normalizedName;
      const sameType = item.type && normalizedType && item.type === normalizedType;
      const sameSize = item.size > 0 && normalizedSize > 0 && item.size === normalizedSize;
      return sameName || (sameType && sameSize);
    });
    const fallbackIndex = exactIndex >= 0 ? exactIndex : 0;
    const matched = nextLinks[fallbackIndex] || null;
    if (!matched) return attachment;
    nextLinks.splice(fallbackIndex, 1);
    return {
      ...attachment,
      url: matched.url,
      ossKey: matched.ossKey || attachment?.ossKey || "",
    };
  });
}

function stripVolcengineReadonlyTokenFields(runtimeConfigs) {
  const source =
    runtimeConfigs && typeof runtimeConfigs === "object" ? runtimeConfigs : {};
  const next = {};

  AGENT_IDS.forEach((agentId) => {
    const current = sanitizeSingleRuntimeConfig(
      source[agentId] || DEFAULT_AGENT_RUNTIME_CONFIG,
      agentId,
    );
    const provider = String(current.provider || "")
      .trim()
      .toLowerCase();
    if (provider !== "volcengine") {
      next[agentId] = current;
      return;
    }

    const { contextWindowTokens, maxInputTokens, ...rest } = current;
    void contextWindowTokens;
    void maxInputTokens;
    next[agentId] = rest;
  });

  return next;
}

function InfoHint({ text }) {
  const iconRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [tipPos, setTipPos] = useState({ top: 0, left: 0, xMode: "-50%" });

  const updateTipPosition = useCallback(() => {
    const node = iconRef.current;
    if (!node) return;

    const rect = node.getBoundingClientRect();
    const edgePadding = 12;
    const tooltipHalfWidth = 150;
    let left = rect.left + rect.width / 2;
    let xMode = "-50%";

    if (left - tooltipHalfWidth < edgePadding) {
      left = rect.left;
      xMode = "0";
    } else if (left + tooltipHalfWidth > window.innerWidth - edgePadding) {
      left = rect.right;
      xMode = "-100%";
    }

    setTipPos({
      top: rect.bottom + 10,
      left,
      xMode,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateTipPosition();

    function onViewChanged() {
      updateTipPosition();
    }

    window.addEventListener("resize", onViewChanged);
    window.addEventListener("scroll", onViewChanged, true);
    return () => {
      window.removeEventListener("resize", onViewChanged);
      window.removeEventListener("scroll", onViewChanged, true);
    };
  }, [open, updateTipPosition]);

  return (
    <span
      ref={iconRef}
      className="admin-info-hint"
      tabIndex={0}
      aria-label={text}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      <Info size={14} />
      {open &&
        createPortal(
          <span
            className="admin-info-tooltip-layer"
            style={{
              top: `${tipPos.top}px`,
              left: `${tipPos.left}px`,
              "--admin-tooltip-x": tipPos.xMode,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

function NumberRuntimeInput({
  id,
  value,
  onChange,
  min,
  max,
  step,
  disabled = false,
}) {
  const [draft, setDraft] = useState(() => formatByStep(Number(value), step));

  useEffect(() => {
    setDraft(formatByStep(Number(value), step));
  }, [step, value]);

  const commitValue = useCallback(
    (nextRaw) => {
      const normalized = normalizeNumberValue(nextRaw, {
        min,
        max,
        step,
        fallback: value,
      });
      onChange(normalized);
      setDraft(formatByStep(normalized, step));
    },
    [max, min, onChange, step, value],
  );

  const adjustByStep = useCallback(
    (delta) => {
      if (disabled) return;
      const current = Number(draft);
      const seed = Number.isFinite(current) ? current : Number(value);
      commitValue(seed + delta * step);
    },
    [commitValue, disabled, draft, step, value],
  );

  return (
    <div className="admin-number-control">
      <button
        type="button"
        className="admin-number-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => adjustByStep(-1)}
        disabled={disabled}
        aria-label="Decrease value"
      >
        <StepIcon type="minus" />
      </button>

      <input
        id={id}
        type="text"
        className="admin-number-input"
        inputMode={step < 1 ? "decimal" : "numeric"}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commitValue(draft)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commitValue(draft);
          } else if (e.key === "Escape") {
            setDraft(formatByStep(Number(value), step));
            e.currentTarget.blur();
          }
        }}
        disabled={disabled}
      />

      <button
        type="button"
        className="admin-number-btn"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => adjustByStep(1)}
        disabled={disabled}
        aria-label="Increase value"
      >
        <StepIcon type="plus" />
      </button>
    </div>
  );
}

export default function AdminSettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const activeSlot = resolveActiveAuthSlot(location.search);
  const draftRef = useRef({
    prompts: { A: "", B: "", C: "", D: "" },
    runtimeConfigs: createDefaultAgentRuntimeConfigMap(),
  });
  const dirtyRef = useRef(false);

  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [prompts, setPrompts] = useState({ A: "", B: "", C: "", D: "" });
  const [runtimeConfigs, setRuntimeConfigs] = useState(
    createDefaultAgentRuntimeConfigMap(),
  );
  const [agentProviderDefaults, setAgentProviderDefaults] = useState(
    createDefaultAgentProviderMap(),
  );
  const [agentModelDefaults, setAgentModelDefaults] = useState(
    createDefaultAgentModelMap(),
  );
  const [selectedAgent, setSelectedAgent] = useState("A");

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  const [debugByAgent, setDebugByAgent] = useState(createEmptyDebugState);
  const [debugLoading, setDebugLoading] = useState(false);
  const [debugError, setDebugError] = useState("");

  const selectedRuntime = useMemo(
    () => runtimeConfigs[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG,
    [runtimeConfigs, selectedAgent],
  );
  const selectedProviderDefault = agentProviderDefaults[selectedAgent] || "openrouter";
  const selectedProvider =
    selectedRuntime.provider === "inherit"
      ? selectedProviderDefault
      : selectedRuntime.provider;
  const showVolcenginePanel = selectedProvider === "volcengine";
  const showOpenRouterPanel = selectedProvider === "openrouter";
  const showAliyunPanel = selectedProvider === "aliyun";
  const showPackyCodePanel = selectedProvider === "packycode";
  const providerSupportsReasoning = true;
  const aliyunProtocol = useMemo(() => {
    const key = String(selectedRuntime.protocol || "")
      .trim()
      .toLowerCase();
    if (key === "responses") return "responses";
    if (key === "dashscope") return "dashscope";
    return "chat";
  }, [selectedRuntime.protocol]);
  const selectedModelDefault = useMemo(() => {
    const configuredDefault = String(agentModelDefaults[selectedAgent] || "").trim();
    if (configuredDefault && selectedProvider !== "packycode") {
      return configuredDefault;
    }
    return resolveProviderDefaultModel(selectedProvider, selectedAgent);
  }, [agentModelDefaults, selectedAgent, selectedProvider]);
  const selectedModelForMatching = String(
    selectedRuntime.model || selectedModelDefault || "",
  ).trim();
  const aliyunModelPolicy = useMemo(
    () => resolveAliyunModelPolicyForRuntime(selectedModelForMatching),
    [selectedModelForMatching],
  );
  const aliyunModelUnsupported = showAliyunPanel && !aliyunModelPolicy.supported;
  const aliyunProtocolOptions = useMemo(() => {
    if (!showAliyunPanel || !aliyunModelPolicy.forceProtocol) {
      return ALIYUN_PROTOCOL_OPTIONS;
    }
    return ALIYUN_PROTOCOL_OPTIONS.filter(
      (item) => item.value === aliyunModelPolicy.forceProtocol,
    );
  }, [showAliyunPanel, aliyunModelPolicy.forceProtocol]);
  const aliyunProtocolLocked = showAliyunPanel && !!aliyunModelPolicy.forceProtocol;
  const aliyunExpectedProtocol =
    showAliyunPanel && aliyunModelPolicy.forceProtocol
      ? aliyunModelPolicy.forceProtocol
      : aliyunProtocol;
  const aliyunWebSearchAllowed =
    !showAliyunPanel || !!aliyunModelPolicy.allowWebSearch;
  const aliyunSamplingFixed = showAliyunPanel && !!aliyunModelPolicy.fixedSampling;
  const aliyunSearchDisabled =
    loading || !selectedRuntime.enableWebSearch || !aliyunWebSearchAllowed;
  const aliyunDashscopeSearchOnlyDisabled = loading || aliyunProtocol !== "dashscope";
  const aliyunFileProcessModeDisabled =
    loading || aliyunModelUnsupported || aliyunProtocol !== "dashscope";
  const aliyunAssignedSiteListText = useMemo(
    () =>
      Array.isArray(selectedRuntime.aliyunSearchAssignedSiteList)
        ? selectedRuntime.aliyunSearchAssignedSiteList.join("\n")
        : "",
    [selectedRuntime.aliyunSearchAssignedSiteList],
  );
  const samplingLockedByModel = useMemo(
    () => isVolcengineFixedSamplingModel(selectedModelForMatching),
    [selectedModelForMatching],
  );
  const volcWebSearchCapability = useMemo(
    () => resolveVolcengineWebSearchCapability(selectedModelForMatching),
    [selectedModelForMatching],
  );
  const webSearchSupported = showVolcenginePanel && volcWebSearchCapability.supported;
  const webSearchSwitchDisabled = loading || !webSearchSupported;

  const isAgentASelected = selectedAgent === "A";
  const isAgentCSelected = selectedAgent === "C";
  const isAgentDSelected = selectedAgent === "D";
  const isCoreAgentSelected = AGENT_IDS.includes(selectedAgent);
  const selectedPrompt = prompts[selectedAgent] || "";
  const selectedAgentName = getAdminAgentLabel(selectedAgent);
  const selectedProviderLabel = getProviderLabel(selectedProvider);
  const saveStatusText = saving
    ? "Saving changes..."
    : lastSavedAt
      ? `Saved at ${formatClock(lastSavedAt)}`
      : "Not saved yet";
  const previewMessages = debugByAgent[selectedAgent] || [];
  const agentOptions = useMemo(
    () =>
      AGENT_IDS.map((agentId) => ({
        value: agentId,
        label: getAdminAgentLabel(agentId),
      })),
    [],
  );
  const markDirty = useCallback(() => {
    dirtyRef.current = true;
    setSaveError("");
  }, []);

  const handleAuthError = useCallback(
    (error) => {
      if (!shouldRelogin(error)) return false;
      clearAdminToken();
      setAdminToken("");
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return true;
    },
    [activeSlot, navigate],
  );

  const persistSettings = useCallback(
    async () => {
      if (!adminToken) {
        clearAdminToken();
        navigate(withAuthSlot("/login", activeSlot), { replace: true });
        return false;
      }

      setSaving(true);
      setSaveError("");
      try {
        const payload = {
          prompts: draftRef.current.prompts,
          runtimeConfigs: stripVolcengineReadonlyTokenFields(
            draftRef.current.runtimeConfigs,
          ),
        };
        const data = await saveAdminAgentSettings(adminToken, payload);

        const nextPrompts = {
          A: String(data?.prompts?.A || ""),
          B: String(data?.prompts?.B || ""),
          C: String(data?.prompts?.C || ""),
          D: String(data?.prompts?.D || ""),
        };
        const nextRuntimeConfigs = sanitizeRuntimeConfigMap(
          data?.runtimeConfigs || data?.resolvedRuntimeConfigs,
        );
        const nextProviderDefaults = sanitizeAgentProviderMap(
          data?.agentProviderDefaults,
        );
        const nextModelDefaults = sanitizeAgentModelMap(data?.agentModelDefaults);

        setPrompts(nextPrompts);
        setRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setAgentModelDefaults(nextModelDefaults);
        draftRef.current = {
          prompts: nextPrompts,
          runtimeConfigs: nextRuntimeConfigs,
        };
        dirtyRef.current = false;
        const candidateTimes = [
          String(data?.updatedAt || ""),
          new Date().toISOString(),
        ]
          .map((iso) => new Date(iso))
          .filter((date) => !Number.isNaN(date.getTime()));
        const latest =
          candidateTimes.length > 0
            ? candidateTimes.sort((a, b) => b.getTime() - a.getTime())[0].toISOString()
            : "";
        setLastSavedAt(latest);
        return true;
      } catch (error) {
        if (handleAuthError(error)) return false;
        setSaveError(readErrorMessage(error));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [activeSlot, adminToken, handleAuthError, navigate],
  );

  useEffect(() => {
    if (!adminToken) {
      navigate(withAuthSlot("/login", activeSlot), { replace: true });
      return;
    }

    let cancelled = false;
    async function bootstrap() {
      setLoading(true);
      setLoadError("");

      try {
        const data = await fetchAdminAgentSettings(adminToken);
        if (cancelled) return;

        const nextPrompts = {
          A: String(data?.prompts?.A || ""),
          B: String(data?.prompts?.B || ""),
          C: String(data?.prompts?.C || ""),
          D: String(data?.prompts?.D || ""),
        };
        const nextRuntimeConfigs = sanitizeRuntimeConfigMap(
          data?.runtimeConfigs || data?.resolvedRuntimeConfigs,
        );
        const nextProviderDefaults = sanitizeAgentProviderMap(
          data?.agentProviderDefaults,
        );
        const nextModelDefaults = sanitizeAgentModelMap(data?.agentModelDefaults);

        setPrompts(nextPrompts);
        setRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setAgentModelDefaults(nextModelDefaults);
        draftRef.current = {
          prompts: nextPrompts,
          runtimeConfigs: nextRuntimeConfigs,
        };
        dirtyRef.current = false;
        const candidateTimes = [
          String(data?.updatedAt || ""),
        ]
          .map((iso) => new Date(iso))
          .filter((date) => !Number.isNaN(date.getTime()));
        const latest =
          candidateTimes.length > 0
            ? candidateTimes.sort((a, b) => b.getTime() - a.getTime())[0].toISOString()
            : "";
        setLastSavedAt(latest);
      } catch (error) {
        if (cancelled) return;
        if (handleAuthError(error)) return;
        setLoadError(readErrorMessage(error));
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, [activeSlot, adminToken, handleAuthError, navigate]);

  useEffect(() => {
    draftRef.current = {
      prompts,
      runtimeConfigs,
    };
  }, [prompts, runtimeConfigs]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!dirtyRef.current) return;
      void persistSettings();
    }, AUTO_SAVE_MS);

    return () => clearInterval(timer);
  }, [persistSettings]);

  useEffect(() => {
    if (!isCoreAgentSelected) return;
    let expectedProtocol = "chat";
    if (showVolcenginePanel) {
      expectedProtocol = "responses";
    } else if (showAliyunPanel) {
      expectedProtocol = aliyunExpectedProtocol;
    } else if (showOpenRouterPanel) {
      expectedProtocol = "chat";
    }
    if (selectedRuntime.protocol === expectedProtocol) return;

    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      if (current.protocol === expectedProtocol) return prev;
      return {
        ...prev,
        [selectedAgent]: sanitizeSingleRuntimeConfig({
          ...current,
          protocol: expectedProtocol,
        }, selectedAgent),
      };
    });
    markDirty();
  }, [
    isCoreAgentSelected,
    aliyunExpectedProtocol,
    markDirty,
    selectedAgent,
    selectedRuntime.protocol,
    showAliyunPanel,
    showOpenRouterPanel,
    showVolcenginePanel,
  ]);

  useEffect(() => {
    if (!isCoreAgentSelected) return;
    if (!showVolcenginePanel) return;
    if (webSearchSupported) return;
    if (!selectedRuntime.enableWebSearch) return;

    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      if (!current.enableWebSearch) return prev;
      return {
        ...prev,
        [selectedAgent]: sanitizeSingleRuntimeConfig({
          ...current,
          enableWebSearch: false,
        }, selectedAgent),
      };
    });
    markDirty();
  }, [
    isCoreAgentSelected,
    markDirty,
    selectedAgent,
    selectedRuntime.enableWebSearch,
    showVolcenginePanel,
    webSearchSupported,
  ]);

  useEffect(() => {
    if (!isCoreAgentSelected) return;
    if (!showAliyunPanel) return;
    if (aliyunWebSearchAllowed) return;
    if (!selectedRuntime.enableWebSearch) return;

    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      if (!current.enableWebSearch) return prev;
      return {
        ...prev,
        [selectedAgent]: sanitizeSingleRuntimeConfig({
          ...current,
          enableWebSearch: false,
        }, selectedAgent),
      };
    });
    markDirty();
  }, [
    aliyunWebSearchAllowed,
    isCoreAgentSelected,
    markDirty,
    selectedAgent,
    selectedRuntime.enableWebSearch,
    showAliyunPanel,
  ]);

  useEffect(() => {
    if (!isCoreAgentSelected) return;
    if (!showAliyunPanel) return;
    if (!aliyunSamplingFixed) return;
    const targetTemperature = Number(
      aliyunModelPolicy.fixedSampling?.temperature ?? ALIYUN_MINIMAX_FIXED_TEMPERATURE,
    );
    const targetTopP = Number(
      aliyunModelPolicy.fixedSampling?.topP ?? ALIYUN_MINIMAX_FIXED_TOP_P,
    );
    const temperatureChanged =
      Math.abs(Number(selectedRuntime.temperature) - targetTemperature) > 1e-6;
    const topPChanged = Math.abs(Number(selectedRuntime.topP) - targetTopP) > 1e-6;
    if (!temperatureChanged && !topPChanged) return;

    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      const next = sanitizeSingleRuntimeConfig({
        ...current,
        temperature: targetTemperature,
        topP: targetTopP,
      }, selectedAgent);
      return {
        ...prev,
        [selectedAgent]: next,
      };
    });
    markDirty();
  }, [
    aliyunModelPolicy.fixedSampling?.temperature,
    aliyunModelPolicy.fixedSampling?.topP,
    aliyunSamplingFixed,
    isCoreAgentSelected,
    markDirty,
    selectedAgent,
    selectedRuntime.temperature,
    selectedRuntime.topP,
    showAliyunPanel,
  ]);

  function updatePrompt(value) {
    if (!isCoreAgentSelected) return;
    setPrompts((prev) => ({
      ...prev,
      [selectedAgent]: value,
    }));
    markDirty();
  }

  function updateRuntimeField(field, value) {
    if (!isCoreAgentSelected) return;
    if (selectedAgent === "A" && AGENT_A_LOCKED_RUNTIME_FIELDS.has(field)) return;
    if (selectedAgent === "C" && AGENT_C_LOCKED_RUNTIME_FIELDS.has(field)) return;
    if (selectedAgent === "D" && AGENT_D_LOCKED_RUNTIME_FIELDS.has(field)) return;
    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      const modelForMatching = String(
        current.model || selectedModelDefault || "",
      ).trim();
      if (
        isVolcengineFixedSamplingModel(modelForMatching) &&
        (field === "temperature" || field === "topP")
      ) {
        return prev;
      }
      const shouldSwitchCustom = field === "temperature" || field === "topP";
      const draft = {
        ...current,
        ...(shouldSwitchCustom ? { creativityMode: "custom" } : {}),
        [field]: value,
      };

      if (field === "provider") {
        const nextProvider = String(value || "")
          .trim()
          .toLowerCase();
        if (nextProvider === "packycode") {
          draft.protocol = "chat";
          draft.enableWebSearch = false;
          if (
            !String(current.thinkingEffort || "").trim() ||
            String(current.thinkingEffort || "").trim().toLowerCase() ===
              DEFAULT_AGENT_RUNTIME_CONFIG.thinkingEffort
          ) {
            draft.thinkingEffort = PACKYCODE_DEFAULT_THINKING_EFFORT;
          }
        }
      }

      if (field === "model") {
        const explicitModel = String(value || "").trim();
        const fallbackModel = String(
          explicitModel || selectedModelDefault || "",
        ).trim();
        const profile = resolveRuntimeTokenProfileByModel(fallbackModel);
        if (profile) {
          draft.contextWindowTokens = profile.contextWindowTokens;
          draft.maxInputTokens = profile.maxInputTokens;
          draft.maxOutputTokens = profile.maxOutputTokens;
          draft.maxReasoningTokens = profile.maxReasoningTokens;
        }
      }

      const next = sanitizeSingleRuntimeConfig(draft, selectedAgent);

      return {
        ...prev,
        [selectedAgent]: next,
      };
    });
    markDirty();
  }

  function onSwitchAgent(agentId) {
    setSelectedAgent(agentId);
    setDebugError("");
  }

  async function onManualSave() {
    await persistSettings();
  }

  function onBackToOnlinePanel() {
    navigate(withAuthSlot("/admin/settings", activeSlot));
  }

  function resolveDebugRuntimeConfig(agentId) {
    return runtimeConfigs[agentId] || DEFAULT_AGENT_RUNTIME_CONFIG;
  }

  function resolveDebugProvider(agentId, runtimeConfig) {
    if (String(agentId || "").trim().toUpperCase() === "C") return "volcengine";
    const runtimeProvider = String(runtimeConfig?.provider || "")
      .trim()
      .toLowerCase();
    return runtimeProvider && runtimeProvider !== "inherit"
      ? runtimeProvider
      : String(agentProviderDefaults?.[agentId] || "openrouter")
          .trim()
          .toLowerCase();
  }

  function buildDebugSessionId(agentId) {
    const safeAgentId = String(agentId || "")
      .trim()
      .toUpperCase();
    if (!safeAgentId) return "admin-debug";
    return `admin-debug-${safeAgentId}`;
  }

  function shouldUseDebugVolcengineFilesApi(agentId, runtimeConfig) {
    const provider = resolveDebugProvider(agentId, runtimeConfig);
    const protocol = String(runtimeConfig?.protocol || "")
      .trim()
      .toLowerCase();
    return provider === "volcengine" && protocol === "responses";
  }

  function shouldUseDebugAliyunPdfPreprocess(agentId, runtimeConfig) {
    if (String(agentId || "").trim().toUpperCase() !== "D") return false;
    const provider = resolveDebugProvider(agentId, runtimeConfig);
    return provider === "aliyun";
  }

  function isDebugPdfFile(file) {
    const mime = String(file?.type || "")
      .trim()
      .toLowerCase();
    const name = String(file?.name || "")
      .trim()
      .toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";
    return mime.includes("pdf") || ext === "pdf";
  }

  function classifyDebugVolcengineFilesApiType(file) {
    const mime = String(file?.type || "")
      .trim()
      .toLowerCase();
    const name = String(file?.name || "")
      .trim()
      .toLowerCase();
    const ext = name.includes(".") ? name.split(".").pop() : "";

    if (mime.includes("pdf") || ext === "pdf") return "input_file";
    if (mime.startsWith("image/")) return "input_image";
    if (mime.startsWith("video/") || DEBUG_VIDEO_EXTENSIONS.has(ext)) return "input_video";
    return "";
  }

  function splitDebugFileItems(files = []) {
    const safeItems = Array.isArray(files) ? files.filter(Boolean) : [];
    const localFiles = [];
    const volcengineFileRefs = [];
    const preparedAttachmentRefs = [];
    const attachments = safeItems.map((item) => {
      if (item?.kind === "prepared_ref") {
        const preparedToken = String(item?.preparedToken || "").trim();
        if (preparedToken) {
          preparedAttachmentRefs.push({
            token: preparedToken,
            fileName: String(item?.name || ""),
            mimeType: String(item?.mimeType || item?.type || ""),
            size: Number(item?.size || 0),
          });
        }
        return {
          name: String(item?.name || "File"),
          size: Number(item?.size || 0),
          type: String(item?.mimeType || item?.type || ""),
        };
      }
      if (item?.kind === "volc_ref") {
        const fileId = String(item?.fileId || "").trim();
        const inputType = String(item?.inputType || "")
          .trim()
          .toLowerCase();
        if (
          fileId &&
          (inputType === "input_file" ||
            inputType === "input_image" ||
            inputType === "input_video")
        ) {
          volcengineFileRefs.push({
            fileId,
            inputType,
            name: String(item?.name || ""),
            mimeType: String(item?.mimeType || item?.type || ""),
            size: Number(item?.size || 0),
          });
        }
        return {
          name: String(item?.name || "File"),
          size: Number(item?.size || 0),
          type: String(item?.mimeType || item?.type || ""),
          fileId,
          inputType,
          url: String(item?.url || "").trim(),
          ossKey: String(item?.ossKey || "").trim(),
        };
      }

      const rawFile = item?.kind === "local" ? item.file : item;
      if (rawFile instanceof File) {
        localFiles.push(rawFile);
        return {
          name: rawFile.name,
          size: rawFile.size,
          type: rawFile.type,
        };
      }

      return {
        name: String(item?.name || "File"),
        size: Number(item?.size || 0),
        type: String(item?.type || ""),
      };
    });

    return {
      localFiles,
      volcengineFileRefs,
      preparedAttachmentRefs,
      attachments,
    };
  }

  async function onDebugPrepareFiles(pickedFiles) {
    if (!adminToken) return [];
    const safePicked = Array.isArray(pickedFiles) ? pickedFiles.filter(Boolean) : [];
    if (safePicked.length === 0) return [];

    if (showAliyunPanel && !aliyunModelPolicy.allowImageInput) {
      const hasImage = safePicked.some((file) => isLikelyImageFile(file));
      if (hasImage) {
        throw new Error(
          "The current Aliyun MiniMax model does not support image input. Please send text only.",
        );
      }
    }

    const agentId = selectedAgent;
    const runtimeConfig = resolveDebugRuntimeConfig(agentId);
    if (shouldUseDebugAliyunPdfPreprocess(agentId, runtimeConfig)) {
      const indexedPicked = safePicked.map((file, index) => ({
        index,
        file,
        isPdf: isDebugPdfFile(file),
      }));
      const pdfCandidates = indexedPicked.filter((item) => item.isPdf);
      const localItems = indexedPicked
        .filter((item) => !item.isPdf)
        .map((item) => ({
          index: item.index,
          kind: "local",
          file: item.file,
          name: String(item.file?.name || ""),
          size: Number(item.file?.size || 0),
          type: String(item.file?.type || ""),
        }));
      if (pdfCandidates.length > 0) {
        const prepareResult = await prepareAdminDebugAttachments(adminToken, {
          agentId,
          sessionId: buildDebugSessionId(agentId),
          files: pdfCandidates.map((item) => item.file),
        });
        const preparedRefs = Array.isArray(prepareResult?.files) ? prepareResult.files : [];
        if (preparedRefs.length !== pdfCandidates.length) {
          throw new Error("Unexpected PDF preprocessing result. Please try again.");
        }
        const preparedItems = preparedRefs.map((ref, idx) => {
          const file = pdfCandidates[idx].file;
          const preparedToken = String(ref?.token || "").trim();
          if (!preparedToken) {
            throw new Error("The PDF preprocessing response did not include a token. Please try again.");
          }
          return {
            index: pdfCandidates[idx].index,
            kind: "prepared_ref",
            name: String(file?.name || ref?.fileName || ""),
            size: Number(ref?.size || file?.size || 0),
            type: String(ref?.mimeType || file?.type || ""),
            mimeType: String(ref?.mimeType || file?.type || ""),
            preparedToken,
          };
        });
        return [...localItems, ...preparedItems]
          .sort((a, b) => a.index - b.index)
          .map((item) => {
            const nextItem = { ...item };
            delete nextItem.index;
            return nextItem;
          });
      }
      return localItems
        .sort((a, b) => a.index - b.index)
        .map((item) => {
          const nextItem = { ...item };
          delete nextItem.index;
          return nextItem;
        });
    }

    if (!shouldUseDebugVolcengineFilesApi(agentId, runtimeConfig)) {
      return safePicked.map((file) => ({
        kind: "local",
        file,
        name: String(file?.name || ""),
        size: Number(file?.size || 0),
        type: String(file?.type || ""),
      }));
    }

    const indexedPicked = safePicked.map((file, index) => ({
      index,
      file,
      inputType: classifyDebugVolcengineFilesApiType(file),
    }));
    const remoteCandidates = indexedPicked.filter((item) => !!item.inputType);
    const localCandidates = indexedPicked.filter((item) => !item.inputType);
    const localItems = localCandidates.map((item) => ({
      index: item.index,
      kind: "local",
      file: item.file,
      name: String(item.file?.name || ""),
      size: Number(item.file?.size || 0),
      type: String(item.file?.type || ""),
    }));
    if (remoteCandidates.length === 0) {
      return localItems.sort((a, b) => a.index - b.index);
    }

    const uploadResult = await uploadAdminVolcengineDebugFiles(adminToken, {
      agentId,
      files: remoteCandidates.map((item) => item.file),
    });
    const remoteRefs = Array.isArray(uploadResult?.files) ? uploadResult.files : [];
    if (remoteRefs.length !== remoteCandidates.length) {
      throw new Error("Unexpected file upload result. Please try again.");
    }

    const remoteItems = remoteRefs.map((ref, idx) => ({
      index: remoteCandidates[idx].index,
      kind: "volc_ref",
      name: String(remoteCandidates[idx].file?.name || ref?.name || ""),
      size: Number(ref?.size || remoteCandidates[idx].file?.size || 0),
      type: String(ref?.mimeType || remoteCandidates[idx].file?.type || ""),
      mimeType: String(ref?.mimeType || remoteCandidates[idx].file?.type || ""),
      inputType: String(ref?.inputType || remoteCandidates[idx].inputType || ""),
      fileId: String(ref?.fileId || ""),
      url: String(ref?.url || "").trim(),
      ossKey: String(ref?.ossKey || "").trim(),
    }));

    return [...localItems, ...remoteItems]
      .sort((a, b) => a.index - b.index)
      .map((item) => {
        const nextItem = { ...item };
        delete nextItem.index;
        return nextItem;
      });
  }

  async function onDebugSend(text, files = []) {
    if (!adminToken || debugLoading) return;
    const agentId = selectedAgent;
    const runtimeConfig = resolveDebugRuntimeConfig(agentId);
    if (showAliyunPanel && !aliyunModelPolicy.supported) {
      setDebugError(getAliyunPolicyMessage(aliyunModelPolicy) || "This Aliyun model is not supported.");
      return;
    }
    const content = String(text || "").trim();
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    const {
      localFiles,
      volcengineFileRefs,
      preparedAttachmentRefs,
      attachments,
    } = splitDebugFileItems(safeFiles);
    if (!content && safeFiles.length === 0) return;
    const userContent =
      content || (safeFiles.length > 0 ? "Please review the uploaded attachments." : "");
    setDebugError("");

    const userMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userContent,
      sourceFiles: safeFiles,
      attachments,
    };
    const assistantMessageId = `a-${Date.now()}`;
    const assistantMessage = {
      id: assistantMessageId,
      role: "assistant",
      content: "",
      reasoning: "",
      streaming: true,
    };

    const existing = debugByAgent[agentId] || [];
    const nextList = [...existing, userMessage, assistantMessage];
    setDebugByAgent((prev) => ({
      ...prev,
      [agentId]: nextList,
    }));
    setDebugLoading(true);

    try {
      await streamAdminAgentDebug(
        adminToken,
        {
          agentId,
          sessionId: buildDebugSessionId(agentId),
          messages: toPreviewMessages([...existing, userMessage]),
          runtimeConfig,
          files: localFiles,
          volcengineFileRefs,
          preparedAttachmentRefs,
        },
        {
          onMeta: (meta) => {
            const uploadedLinks = Array.isArray(meta?.uploadedAttachmentLinks)
              ? meta.uploadedAttachmentLinks
              : [];
            if (uploadedLinks.length === 0) return;
            setDebugByAgent((prev) => {
              const list = prev[agentId] || [];
              const nextList = list.map((item) => {
                if (item.id !== userMessage.id || item.role !== "user") return item;
                const nextAttachments = mergeAttachmentsWithUploadedLinks(
                  item.attachments,
                  uploadedLinks,
                );
                const changed = nextAttachments.some(
                  (attachment, idx) => attachment?.url !== item.attachments?.[idx]?.url,
                );
                if (!changed) return item;
                return {
                  ...item,
                  attachments: nextAttachments,
                };
              });
              return {
                ...prev,
                [agentId]: nextList,
              };
            });
          },
          onToken: (chunk) => {
            if (!chunk) return;
            setDebugByAgent((prev) => {
              const list = (prev[agentId] || []).map((item) =>
                item.id === assistantMessageId
                  ? { ...item, content: `${item.content || ""}${chunk}` }
                  : item,
              );
              return {
                ...prev,
                [agentId]: list,
              };
            });
          },
          onReasoningToken: (chunk) => {
            if (!chunk) return;
            setDebugByAgent((prev) => {
              const list = (prev[agentId] || []).map((item) =>
                item.id === assistantMessageId
                  ? { ...item, reasoning: `${item.reasoning || ""}${chunk}` }
                  : item,
              );
              return {
                ...prev,
                [agentId]: list,
              };
            });
          },
          onError: (message) => {
            throw new Error(message || "Debug run failed.");
          },
        },
      );
    } catch (error) {
      if (handleAuthError(error)) return;
      const msg = readErrorMessage(error);
      setDebugError(msg);
      setDebugByAgent((prev) => {
        const list = (prev[agentId] || []).map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: `${item.content || ""}\n\n> Debug failed: ${msg}`,
              }
            : item,
        );
        return {
          ...prev,
          [agentId]: list,
        };
      });
    } finally {
      setDebugLoading(false);
      setDebugByAgent((prev) => {
        const list = (prev[agentId] || []).map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                streaming: false,
              }
            : item,
        );
        return {
          ...prev,
          [agentId]: list,
        };
      });
    }
  }

  function onDebugClear() {
    setDebugByAgent((prev) => ({
      ...prev,
      [selectedAgent]: [],
    }));
    setDebugError("");
  }

  function onDebugAssistantFeedback(messageId, feedback) {
    const agentId = selectedAgent;
    setDebugByAgent((prev) => {
      const list = prev[agentId] || [];
      const current = list.find((item) => item.id === messageId && item.role === "assistant");
      if (!current) return prev;
      const nextFeedback = current.feedback === feedback ? null : feedback;
      return {
        ...prev,
        [agentId]: list.map((item) =>
          item.id === messageId && item.role === "assistant"
            ? { ...item, feedback: nextFeedback }
            : item,
        ),
      };
    });
  }

  async function onDebugAssistantRegenerate(assistantMessageId, promptMessageId) {
    if (!adminToken || debugLoading || !assistantMessageId || !promptMessageId) return;
    if (showAliyunPanel && !aliyunModelPolicy.supported) {
      setDebugError(getAliyunPolicyMessage(aliyunModelPolicy) || "This Aliyun model is not supported.");
      return;
    }

    const agentId = selectedAgent;
    const runtimeConfig = resolveDebugRuntimeConfig(agentId);
    const list = debugByAgent[agentId] || [];
    const promptIndex = list.findIndex(
      (item) => item.id === promptMessageId && item.role === "user",
    );
    const assistantIndex = list.findIndex(
      (item) => item.id === assistantMessageId && item.role === "assistant",
    );
    if (promptIndex === -1 || assistantIndex === -1) return;

    const promptMsg = list[promptIndex];
    const sourceFiles = Array.isArray(promptMsg.sourceFiles) ? promptMsg.sourceFiles : [];
    const {
      localFiles,
      volcengineFileRefs,
      preparedAttachmentRefs,
    } = splitDebugFileItems(sourceFiles);
    const historyForApi = toPreviewMessages(list.slice(0, promptIndex + 1));
    if (historyForApi.length === 0 && sourceFiles.length === 0) return;

    setDebugError("");
    setDebugByAgent((prev) => {
      const nextList = (prev[agentId] || []).map((item) => {
        if (item.id !== assistantMessageId || item.role !== "assistant") return item;
        return {
          ...item,
          content: "",
          reasoning: "",
          feedback: null,
          streaming: true,
        };
      });
      return {
        ...prev,
        [agentId]: nextList,
      };
    });
    setDebugLoading(true);

    try {
      await streamAdminAgentDebug(
        adminToken,
        {
          agentId,
          sessionId: buildDebugSessionId(agentId),
          messages: historyForApi,
          runtimeConfig,
          files: localFiles,
          volcengineFileRefs,
          preparedAttachmentRefs,
        },
        {
          onToken: (chunk) => {
            if (!chunk) return;
            setDebugByAgent((prev) => {
              const nextList = (prev[agentId] || []).map((item) =>
                item.id === assistantMessageId
                  ? { ...item, content: `${item.content || ""}${chunk}` }
                  : item,
              );
              return {
                ...prev,
                [agentId]: nextList,
              };
            });
          },
          onReasoningToken: (chunk) => {
            if (!chunk) return;
            setDebugByAgent((prev) => {
              const nextList = (prev[agentId] || []).map((item) =>
                item.id === assistantMessageId
                  ? { ...item, reasoning: `${item.reasoning || ""}${chunk}` }
                  : item,
              );
              return {
                ...prev,
                [agentId]: nextList,
              };
            });
          },
          onError: (message) => {
            throw new Error(message || "Debug run failed.");
          },
        },
      );
    } catch (error) {
      if (handleAuthError(error)) return;
      const msg = readErrorMessage(error);
      setDebugError(msg);
      setDebugByAgent((prev) => {
        const nextList = (prev[agentId] || []).map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                content: `${item.content || ""}\n\n> Debug failed: ${msg}`,
              }
            : item,
        );
        return {
          ...prev,
          [agentId]: nextList,
        };
      });
    } finally {
      setDebugLoading(false);
      setDebugByAgent((prev) => {
        const nextList = (prev[agentId] || []).map((item) =>
          item.id === assistantMessageId
            ? {
                ...item,
                streaming: false,
              }
            : item,
        );
        return {
          ...prev,
          [agentId]: nextList,
        };
      });
    }
  }

  return (
    <div className="admin-settings-page">
      <div className="admin-settings-shell">
        <header className="admin-settings-topbar">
          <div className="admin-settings-topbar-left">
            <div className="admin-settings-hero-copy">
              <p className="admin-settings-kicker">Admin studio</p>
              <div className="admin-settings-title-row">
                <h1 className="admin-settings-title">Agent configuration</h1>
                <div className="admin-agent-select-wrap">
                  <PortalSelect
                    value={selectedAgent}
                    options={agentOptions}
                    onChange={onSwitchAgent}
                    disabled={loading}
                    compact
                    className="admin-agent-dropdown"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="admin-settings-topbar-right">
            <div className="admin-save-block">
              <span className="admin-save-kicker">Save status</span>
              <div className="admin-save-state" role="status">
                {saveStatusText}
              </div>
              <p className="admin-save-help">Changes are stored per agent.</p>
            </div>
            <button
              type="button"
              className="admin-save-btn"
              onClick={onManualSave}
              disabled={saving || loading}
            >
              <Save size={16} />
              <span>{saving ? "Saving..." : "Save changes"}</span>
            </button>
            <button
              type="button"
              className="admin-sidebar-back-btn"
              onClick={onBackToOnlinePanel}
              title="Back to teacher home"
              aria-label="Back to teacher home"
            >
              <ArrowLeft size={16} />
              <span>Back</span>
            </button>
          </div>
        </header>

        <div className="admin-settings-main">
          {(loadError || saveError) && (
            <div className="admin-message-strip">
              {[loadError, saveError].filter(Boolean).map((line) => (
                <p key={line} className="admin-message-strip-item error">
                  <CircleAlert size={14} />
                  <span>{line}</span>
                </p>
              ))}
            </div>
          )}

          <div className="admin-grid">
            <section className="admin-panel admin-panel-prompt">
            <div className="admin-panel-head">
              <div className="admin-panel-head-copy">
                <p className="admin-panel-kicker">Prompt design</p>
                <h2>System direction</h2>
              </div>
              <span className="admin-panel-badge">{selectedAgentName}</span>
            </div>

            <label className="admin-field-label" htmlFor="admin-prompt-input">
              <span>Agent-specific system prompt</span>
              <InfoHint text="When left empty, the agent falls back to the shared default system prompt used in normal chat." />
            </label>
            <textarea
              id="admin-prompt-input"
              className="admin-textarea admin-prompt-textarea"
              rows={14}
              value={selectedPrompt}
              onChange={(e) => updatePrompt(e.target.value)}
              placeholder="Leave blank to inherit the default system prompt."
              disabled={loading}
            />
            </section>

            <section className="admin-panel admin-panel-api">
            <div className="admin-panel-head">
              <div className="admin-panel-head-copy">
                <p className="admin-panel-kicker">Runtime controls</p>
                <h2>Model and behavior</h2>
              </div>
              <span className="admin-panel-badge admin-panel-badge-muted">
                {selectedProviderLabel}
              </span>
            </div>

            <div className="admin-field-grid">
              <div className="admin-field-row split">
                <span>Provider</span>
                <PortalSelect
                  value={selectedProvider}
                  options={PROVIDER_OPTIONS}
                  onChange={(next) => updateRuntimeField("provider", next)}
                  disabled={loading || isAgentASelected || isAgentCSelected || isAgentDSelected}
                />
              </div>

              <label className="admin-field-row model-id" htmlFor="admin-runtime-model">
                <span>Model ID</span>
                <input
                  id="admin-runtime-model"
                  type="text"
                  value={selectedRuntime.model}
                  onChange={(e) => updateRuntimeField("model", e.target.value)}
                  placeholder={
                    selectedModelDefault
                      ? `Leave blank to use the default model: ${selectedModelDefault}`
                      : "Leave blank to use the matching `AGENT_MODEL_*` value from `.env`."
                  }
                  disabled={loading || isAgentASelected || isAgentCSelected || isAgentDSelected}
                />
              </label>
              {showOpenRouterPanel ? (
                <p className="admin-field-note">
                  The OpenRouter route only exposes max output tokens on this screen.
                </p>
              ) : showAliyunPanel ? (
                <p className="admin-field-note">
                  {aliyunModelUnsupported
                    ? getAliyunPolicyMessage(aliyunModelPolicy) ||
                      "This Aliyun model is not supported on the current route."
                    : aliyunProtocolLocked
                      ? `This model is locked to ${aliyunProtocolOptions[0]?.label || "a fixed protocol"}.`
                      : "Aliyun supports Chat API, Responses API, and the DashScope native API. Max output tokens follow the model default."}
                </p>
              ) : null}

              {showVolcenginePanel ? (
                <>
                  <label className="admin-field-row split" htmlFor="admin-runtime-temperature">
                    <span>Temperature</span>
                    <NumberRuntimeInput
                      id="admin-runtime-temperature"
                      value={selectedRuntime.temperature}
                      min={0}
                      max={2}
                      step={0.1}
                      onChange={(next) => updateRuntimeField("temperature", next)}
                      disabled={loading || samplingLockedByModel}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-top-p">
                    <span>Top-p</span>
                    <NumberRuntimeInput
                      id="admin-runtime-top-p"
                      value={selectedRuntime.topP}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={(next) => updateRuntimeField("topP", next)}
                      disabled={loading || samplingLockedByModel}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-context-rounds">
                    <span>Context rounds</span>
                    <NumberRuntimeInput
                      id="admin-runtime-context-rounds"
                      value={selectedRuntime.contextRounds}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(next) => updateRuntimeField("contextRounds", next)}
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-output-tokens">
                    <span className="admin-label-with-hint">
                      Max output tokens
                      <InfoHint text="This maps to the max output setting on the Responses API." />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-output-tokens"
                      value={selectedRuntime.maxOutputTokens}
                      min={64}
                      max={1048576}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxOutputTokens", next)}
                      disabled={loading || isAgentCSelected}
                    />
                  </label>

                  {!isAgentDSelected ? (
                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        Inject current date
                        <InfoHint text="When enabled, the current date is injected into the system prompt for each conversation." />
                      </span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!selectedRuntime.includeCurrentTime}
                          onChange={(e) =>
                            updateRuntimeField("includeCurrentTime", e.target.checked)
                          }
                          disabled={loading}
                        />
                        <span>{formatToggleState(selectedRuntime.includeCurrentTime)}</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      Prompt leak guard
                      <InfoHint text="Off by default. When enabled, the runtime injects anti-leak instructions and refuses prompt probing more defensively." />
                    </span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.preventPromptLeak}
                        onChange={(e) =>
                          updateRuntimeField("preventPromptLeak", e.target.checked)
                        }
                        disabled={loading}
                      />
                      <span>{formatToggleState(selectedRuntime.preventPromptLeak)}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>Reasoning</span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.enableThinking}
                        onChange={(e) => updateRuntimeField("enableThinking", e.target.checked)}
                        disabled={loading}
                      />
                      <span>{formatToggleState(selectedRuntime.enableThinking)}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>Web search</span>
                    <label
                      className={`admin-switch-row ${webSearchSwitchDisabled ? "disabled" : ""}`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.enableWebSearch && webSearchSupported}
                        onChange={(e) =>
                          updateRuntimeField("enableWebSearch", e.target.checked)
                        }
                        disabled={webSearchSwitchDisabled}
                      />
                      <span>
                        {formatToggleState(
                          !!selectedRuntime.enableWebSearch && webSearchSupported,
                        )}
                      </span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>Search sources</span>
                    <div className="admin-switch-group">
                      {VOLCENGINE_WEB_SEARCH_SOURCE_OPTIONS.map((source) => (
                        <label
                          key={source.key}
                          className={`admin-switch-row compact ${
                            loading || !webSearchSupported ? "disabled" : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime[source.key]}
                            onChange={(e) =>
                              updateRuntimeField(source.key, e.target.checked)
                            }
                            disabled={loading || !webSearchSupported}
                          />
                          <span>{source.label}</span>
                        </label>
                      ))}
                    </div>
                  </div>

                  <label
                    className="admin-field-row split"
                    htmlFor="admin-runtime-web-search-max-keyword"
                  >
                    <span className="admin-label-with-hint">
                      Keywords per round
                      <InfoHint text="Limits how many keywords are used in each search step. Range: 1 to 50." />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-web-search-max-keyword"
                      value={selectedRuntime.webSearchMaxKeyword}
                      min={1}
                      max={50}
                      step={1}
                      onChange={(next) => updateRuntimeField("webSearchMaxKeyword", next)}
                      disabled={loading || !webSearchSupported}
                    />
                  </label>

                  <label
                    className="admin-field-row split"
                    htmlFor="admin-runtime-web-search-limit"
                  >
                    <span className="admin-label-with-hint">
                      Results per request
                      <InfoHint text="Limits how many search results come back in a single request. Range: 1 to 50." />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-web-search-limit"
                      value={selectedRuntime.webSearchResultLimit}
                      min={1}
                      max={50}
                      step={1}
                      onChange={(next) => updateRuntimeField("webSearchResultLimit", next)}
                      disabled={loading || !webSearchSupported}
                    />
                  </label>

                  <label
                    className="admin-field-row split"
                    htmlFor="admin-runtime-web-search-max-tool-calls"
                  >
                    <span className="admin-label-with-hint">
                      Max tool-call rounds
                      <InfoHint text="Caps the number of web-search tool rounds inside one answer. Range: 1 to 10." />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-web-search-max-tool-calls"
                      value={selectedRuntime.webSearchMaxToolCalls}
                      min={1}
                      max={10}
                      step={1}
                      onChange={(next) => updateRuntimeField("webSearchMaxToolCalls", next)}
                      disabled={loading || !webSearchSupported}
                    />
                  </label>

                </>
              ) : (
                <>
                  {!showPackyCodePanel && !aliyunSamplingFixed ? (
                    <>
                      <label className="admin-field-row split" htmlFor="admin-runtime-temperature">
                        <span>Temperature</span>
                        <NumberRuntimeInput
                          id="admin-runtime-temperature"
                          value={selectedRuntime.temperature}
                          min={0}
                          max={2}
                          step={0.1}
                          onChange={(next) => updateRuntimeField("temperature", next)}
                          disabled={loading || samplingLockedByModel}
                        />
                      </label>

                      <label className="admin-field-row split" htmlFor="admin-runtime-top-p">
                        <span>Top-p</span>
                        <NumberRuntimeInput
                          id="admin-runtime-top-p"
                          value={selectedRuntime.topP}
                          min={0}
                          max={1}
                          step={0.05}
                          onChange={(next) => updateRuntimeField("topP", next)}
                          disabled={loading || samplingLockedByModel}
                        />
                      </label>
                    </>
                  ) : (
                    <p className="admin-field-note">
                      This model uses fixed sampling values: temperature = {ALIYUN_MINIMAX_FIXED_TEMPERATURE}
                      {", "}top_p = {ALIYUN_MINIMAX_FIXED_TOP_P}.
                    </p>
                  )}

                  {!showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-context-rounds">
                      <span>Context rounds</span>
                      <NumberRuntimeInput
                        id="admin-runtime-context-rounds"
                        value={selectedRuntime.contextRounds}
                        min={1}
                        max={20}
                        step={1}
                        onChange={(next) => updateRuntimeField("contextRounds", next)}
                        disabled={loading}
                      />
                    </label>
                  ) : null}
                  {showAliyunPanel ? (
                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        Aliyun protocol
                        <InfoHint
                          text={
                            aliyunProtocolLocked
                              ? "This model supports only one protocol and has been locked automatically."
                              : "Supports OpenAI Chat, OpenAI Responses, and the DashScope native API."
                          }
                        />
                      </span>
                      <PortalSelect
                        value={aliyunProtocol}
                        options={aliyunProtocolOptions}
                        onChange={(next) => updateRuntimeField("protocol", next)}
                        disabled={loading || aliyunProtocolLocked || aliyunModelUnsupported}
                        compact
                      />
                    </div>
                  ) : null}
                  {showAliyunPanel ? (
                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        File processing mode
                        <InfoHint text="Applies only to the DashScope native API. Compatibility mode parses files locally first; debug mode prefers OSS file URLs." />
                      </span>
                      <PortalSelect
                        value={selectedRuntime.aliyunFileProcessMode}
                        options={ALIYUN_FILE_PROCESS_MODE_OPTIONS}
                        onChange={(next) => updateRuntimeField("aliyunFileProcessMode", next)}
                        disabled={aliyunFileProcessModeDisabled}
                        compact
                      />
                    </div>
                  ) : null}

                  {!isAgentDSelected ? (
                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        Inject current date
                        <InfoHint text="When enabled, the current date is injected into the system prompt for each conversation." />
                      </span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!selectedRuntime.includeCurrentTime}
                          onChange={(e) =>
                            updateRuntimeField("includeCurrentTime", e.target.checked)
                          }
                          disabled={loading}
                        />
                        <span>{formatToggleState(selectedRuntime.includeCurrentTime)}</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      Prompt leak guard
                      <InfoHint text="Off by default. When enabled, the runtime injects anti-leak instructions and refuses prompt probing more defensively." />
                    </span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.preventPromptLeak}
                        onChange={(e) =>
                          updateRuntimeField("preventPromptLeak", e.target.checked)
                        }
                        disabled={loading}
                      />
                      <span>{formatToggleState(selectedRuntime.preventPromptLeak)}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>Reasoning</span>
                    <label
                      className={`admin-switch-row ${providerSupportsReasoning ? "" : "disabled"}`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.enableThinking}
                        onChange={(e) => updateRuntimeField("enableThinking", e.target.checked)}
                        disabled={loading || !providerSupportsReasoning}
                      />
                      <span>{formatToggleState(selectedRuntime.enableThinking)}</span>
                    </label>
                  </div>

                  {!showOpenRouterPanel && !showAliyunPanel && !showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-context-window-tokens-chat">
                      <span className="admin-label-with-hint">
                        Context window
                        <InfoHint text="A Chat-protocol setting that can be edited manually." />
                      </span>
                      <NumberRuntimeInput
                        id="admin-runtime-context-window-tokens-chat"
                        value={selectedRuntime.contextWindowTokens}
                        min={1024}
                        max={1000000}
                        step={1024}
                        onChange={(next) => updateRuntimeField("contextWindowTokens", next)}
                        disabled={loading}
                      />
                    </label>
                  ) : null}

                  {!showOpenRouterPanel && !showAliyunPanel && !showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-max-input-tokens-chat">
                      <span className="admin-label-with-hint">
                        Max input tokens
                        <InfoHint text="A Chat-protocol setting that can be edited manually." />
                      </span>
                      <NumberRuntimeInput
                        id="admin-runtime-max-input-tokens-chat"
                        value={selectedRuntime.maxInputTokens}
                        min={1024}
                        max={1000000}
                        step={1024}
                        onChange={(next) => updateRuntimeField("maxInputTokens", next)}
                        disabled={loading}
                      />
                    </label>
                  ) : null}

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-output-tokens-chat">
                    <span className="admin-label-with-hint">
                      {showOpenRouterPanel ? "Max output tokens" : "Max output length"}
                      <InfoHint
                        text={
                          showOpenRouterPanel
                            ? "This maps to the `max_tokens` field on OpenRouter Chat."
                          : showAliyunPanel
                              ? "Aliyun always uses the model default for maximum output and does not send an override."
                              : "This maps to the max output setting for the Chat API."
                        }
                      />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-output-tokens-chat"
                      value={selectedRuntime.maxOutputTokens}
                      min={64}
                      max={1048576}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxOutputTokens", next)}
                      disabled={
                        loading ||
                        showAliyunPanel ||
                        showPackyCodePanel ||
                        isAgentCSelected
                      }
                    />
                  </label>
                  {showAliyunPanel && aliyunWebSearchAllowed ? (
                    <>
                      <div className="admin-field-row split">
                        <span className="admin-label-with-hint">
                          Web search
                          <InfoHint text="Enables search capability. In Responses mode it mounts the web-search tool." />
                        </span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.enableWebSearch}
                            onChange={(e) =>
                              updateRuntimeField("enableWebSearch", e.target.checked)
                            }
                            disabled={loading}
                          />
                          <span>{formatToggleState(selectedRuntime.enableWebSearch)}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Force search</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchForced}
                            onChange={(e) =>
                              updateRuntimeField("aliyunSearchForced", e.target.checked)
                            }
                            disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          />
                          <span>{formatToggleState(selectedRuntime.aliyunSearchForced)}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Search strategy</span>
                        <PortalSelect
                          value={selectedRuntime.aliyunSearchStrategy}
                          options={ALIYUN_SEARCH_STRATEGY_OPTIONS}
                          onChange={(next) => updateRuntimeField("aliyunSearchStrategy", next)}
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          compact
                        />
                      </div>

                      <div className="admin-field-row split">
                        <span>Return sources</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchEnableSource}
                            onChange={(e) =>
                              updateRuntimeField("aliyunSearchEnableSource", e.target.checked)
                            }
                            disabled={aliyunSearchDisabled || aliyunDashscopeSearchOnlyDisabled}
                          />
                          <span>{formatToggleState(selectedRuntime.aliyunSearchEnableSource)}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Citations</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchEnableCitation}
                            onChange={(e) =>
                              updateRuntimeField("aliyunSearchEnableCitation", e.target.checked)
                            }
                            disabled={
                              aliyunSearchDisabled ||
                              aliyunDashscopeSearchOnlyDisabled ||
                              !selectedRuntime.aliyunSearchEnableSource
                            }
                          />
                          <span>{formatToggleState(selectedRuntime.aliyunSearchEnableCitation)}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Citation format</span>
                        <PortalSelect
                          value={selectedRuntime.aliyunSearchCitationFormat}
                          options={ALIYUN_SEARCH_CITATION_FORMAT_OPTIONS}
                          onChange={(next) =>
                            updateRuntimeField("aliyunSearchCitationFormat", next)
                          }
                          disabled={
                            aliyunSearchDisabled ||
                            aliyunDashscopeSearchOnlyDisabled ||
                            !selectedRuntime.aliyunSearchEnableCitation
                          }
                          compact
                        />
                      </div>

                      <div className="admin-field-row split">
                        <span>Domain search</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchEnableSearchExtension}
                            onChange={(e) =>
                              updateRuntimeField(
                                "aliyunSearchEnableSearchExtension",
                                e.target.checked,
                              )
                            }
                            disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          />
                          <span>
                            {formatToggleState(
                              selectedRuntime.aliyunSearchEnableSearchExtension,
                            )}
                          </span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Prepend sources in first chunk</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchPrependSearchResult}
                            onChange={(e) =>
                              updateRuntimeField(
                                "aliyunSearchPrependSearchResult",
                                e.target.checked,
                              )
                            }
                            disabled={aliyunSearchDisabled || aliyunDashscopeSearchOnlyDisabled}
                          />
                          <span>{formatToggleState(selectedRuntime.aliyunSearchPrependSearchResult)}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>Freshness</span>
                        <PortalSelect
                          value={selectedRuntime.aliyunSearchFreshness}
                          options={ALIYUN_SEARCH_FRESHNESS_OPTIONS}
                          onChange={(next) => updateRuntimeField("aliyunSearchFreshness", next)}
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          compact
                        />
                      </div>

                      <label className="admin-field-row" htmlFor="admin-runtime-aliyun-assigned-sites">
                        <span className="admin-label-with-hint">
                          Allowed sites
                          <InfoHint text="Enter one domain per line, or separate them with commas. Maximum: 25 domains." />
                        </span>
                        <textarea
                          className="admin-textarea admin-runtime-textarea admin-aliyun-search-textarea"
                          id="admin-runtime-aliyun-assigned-sites"
                          value={aliyunAssignedSiteListText}
                          onChange={(e) =>
                            updateRuntimeField(
                              "aliyunSearchAssignedSiteList",
                              String(e.target.value || "")
                                .split(/[\n,]/)
                                .map((item) => item.trim())
                                .filter(Boolean),
                            )
                          }
                          placeholder={"Example:\nbaidu.com\nsina.cn"}
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                        />
                      </label>

                      <label className="admin-field-row" htmlFor="admin-runtime-aliyun-prompt-intervene">
                        <span className="admin-label-with-hint">
                          Search scope hint
                          <InfoHint text="Use natural language to narrow the search scope, for example: `Only search for AI technology content`." />
                        </span>
                        <textarea
                          className="admin-textarea admin-runtime-textarea admin-aliyun-search-textarea"
                          id="admin-runtime-aliyun-prompt-intervene"
                          value={String(selectedRuntime.aliyunSearchPromptIntervene || "")}
                          onChange={(e) =>
                            updateRuntimeField(
                              "aliyunSearchPromptIntervene",
                              e.target.value,
                            )
                          }
                          placeholder="Example: Only search for AI technology content."
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                        />
                      </label>

                      {aliyunProtocol === "responses" ? (
                        <>
                          <label
                            className="admin-field-row split"
                            htmlFor="admin-runtime-aliyun-web-search-max-tool-calls"
                          >
                            <span className="admin-label-with-hint">
                              Max tool-call rounds
                              <InfoHint text="Applies only in Responses mode. Range: 1 to 10." />
                            </span>
                            <NumberRuntimeInput
                              id="admin-runtime-aliyun-web-search-max-tool-calls"
                              value={selectedRuntime.webSearchMaxToolCalls}
                              min={1}
                              max={10}
                              step={1}
                              onChange={(next) =>
                                updateRuntimeField("webSearchMaxToolCalls", next)
                              }
                              disabled={aliyunSearchDisabled}
                            />
                          </label>

                          <div className="admin-field-row split">
                            <span>Extra tool: web extractor</span>
                            <label className="admin-switch-row">
                              <input
                                type="checkbox"
                                checked={!!selectedRuntime.aliyunResponsesEnableWebExtractor}
                                onChange={(e) =>
                                  updateRuntimeField(
                                    "aliyunResponsesEnableWebExtractor",
                                    e.target.checked,
                                  )
                                }
                                disabled={aliyunSearchDisabled}
                              />
                              <span>{formatToggleState(selectedRuntime.aliyunResponsesEnableWebExtractor)}</span>
                            </label>
                          </div>

                          <div className="admin-field-row split">
                            <span>Extra tool: code interpreter</span>
                            <label className="admin-switch-row">
                              <input
                                type="checkbox"
                                checked={!!selectedRuntime.aliyunResponsesEnableCodeInterpreter}
                                onChange={(e) =>
                                  updateRuntimeField(
                                    "aliyunResponsesEnableCodeInterpreter",
                                    e.target.checked,
                                  )
                                }
                                disabled={aliyunSearchDisabled}
                              />
                              <span>{formatToggleState(selectedRuntime.aliyunResponsesEnableCodeInterpreter)}</span>
                            </label>
                          </div>
                        </>
                      ) : null}
                    </>
                  ) : null}

                  {showOpenRouterPanel ? (
                    <>
                      <div className="admin-field-row split">
                        <span className="admin-label-with-hint">
                          PDF engine
                          <InfoHint text="Maps to `pdf.engine` on the file-parser plugin. `auto` means the field is omitted and OpenRouter chooses automatically." />
                        </span>
                        <PortalSelect
                          value={selectedRuntime.openrouterPdfEngine}
                          options={OPENROUTER_PDF_ENGINE_OPTIONS}
                          onChange={(next) => updateRuntimeField("openrouterPdfEngine", next)}
                          disabled={loading}
                          compact
                        />
                      </div>
                    </>
                  ) : null}

                  {showAliyunPanel && !aliyunModelPolicy.supported ? (
                    <p className="admin-field-note warning">
                      {getAliyunPolicyMessage(aliyunModelPolicy)}
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunModelPolicy.key === "kimi_k2_5" ? (
                    <p className="admin-field-note">
                      Note: Kimi supports only `kimi-k2.5` here. It is locked to the
                      DashScope native multimodal endpoint and does not support web search.
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunModelPolicy.key === "minimax_m2" ? (
                    <p className="admin-field-note warning">
                      Note: MiniMax-M2.5 / MiniMax-M2.1 are locked to Chat API and disable
                      both web search and image input.
                    </p>
                  ) : null}
                  {showAliyunPanel && !aliyunWebSearchAllowed && aliyunModelPolicy.supported ? (
                    <p className="admin-field-note warning">
                      This model does not support web search. Related search controls are
                      hidden and disabled automatically.
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunWebSearchAllowed && aliyunProtocol !== "dashscope" ? (
                    <p className="admin-field-note warning">
                      Note: source returns, citation toggles, citation format, and
                      prepended search sources work only on the DashScope native API.
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunWebSearchAllowed && aliyunProtocol === "responses" ? (
                    <p className="admin-field-note warning">
                      Note: in Responses mode, web search is mounted as a tool instead of
                      receiving explicit search parameter options.
                    </p>
                  ) : null}
                  {showAliyunPanel &&
                  selectedRuntime.aliyunFileProcessMode === "native_oss_url" ? (
                    <p className="admin-field-note warning">
                      Debug note: native file URL mode is on. If the upstream service
                      rejects the file format, switch back to `Local parse (compatibility)`.
                    </p>
                  ) : null}
                </>
              )}
            </div>
            </section>

            <section className="admin-panel admin-panel-preview preview">
            <div className="admin-panel-head">
              <div className="admin-panel-head-copy">
                <p className="admin-panel-kicker">Live rehearsal</p>
                <h2>Preview and debug</h2>
              </div>
              <button
                type="button"
                className="admin-ghost-btn"
                onClick={onDebugClear}
                disabled={debugLoading || loading}
              >
                Clear thread
              </button>
            </div>

            <div className="admin-preview-chat">
              <MessageList
                activeSessionId={`admin-debug-${selectedAgent}`}
                messages={previewMessages}
                isStreaming={debugLoading}
                onAssistantFeedback={onDebugAssistantFeedback}
                onAssistantRegenerate={onDebugAssistantRegenerate}
              />
              <MessageInput
                onSend={onDebugSend}
                onPrepareFiles={onDebugPrepareFiles}
                disabled={
                  debugLoading ||
                  loading ||
                  (showAliyunPanel && !aliyunModelPolicy.supported)
                }
              />
            </div>
            {debugError ? (
              <div className="admin-preview-error" role="alert">
                <span>{debugError}</span>
                <button
                  type="button"
                  className="admin-preview-error-close"
                  onClick={() => setDebugError("")}
                  aria-label="Dismiss debug error"
                  title="Dismiss debug error"
                >
                  <CloseXIcon />
                </button>
              </div>
            ) : null}
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
