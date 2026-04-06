import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CircleAlert,
  Download,
  Info,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import MessageInput from "../components/MessageInput.jsx";
import MessageList from "../components/MessageList.jsx";
import PortalSelect from "../components/PortalSelect.jsx";
import {
  deleteAllUserChats,
  exportAdminChatsTxt,
  exportAdminChatsZip,
  exportAdminUsersTxt,
  fetchAdminAgentSettings,
  prepareAdminDebugAttachments,
  uploadAdminVolcengineDebugFiles,
  saveAdminAgentSettings,
  streamAdminAgentDebug,
} from "./admin/adminApi.js";
import {
  fetchAdminAgentESettings,
  saveAdminAgentESettings,
} from "./admin/agentEApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import { resolveActiveAuthSlot, withAuthSlot } from "../app/authStorage.js";
import {
  DEFAULT_TEACHER_SCOPE_KEY,
  TEACHER_SCOPE_OPTIONS,
  getTeacherScopeLabel,
} from "../../shared/teacherScopes.js";
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
import { AGENT_META, DEFAULT_SYSTEM_PROMPT } from "./chat/constants.js";
import "../styles/chat.css";
import "../styles/admin-settings.css";

const AUTO_SAVE_MS = 5 * 60 * 1000;
const PROVIDER_OPTIONS = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "packycode", label: "PackyCode" },
  { value: "volcengine", label: "火山引擎 Ark" },
  { value: "aliyun", label: "阿里云 DashScope" },
];
const KNOWN_PROVIDERS = new Set([
  "openrouter",
  "packycode",
  "volcengine",
  "aliyun",
]);
const AGENT_E_FIXED_MAX_OUTPUT_TOKENS = 131072;
const AGENT_C_FIXED_MODEL = "doubao-seed-2-0-pro-260215";
const AGENT_E_LOCKED_RUNTIME_FIELDS = new Set([
  "provider",
  "model",
  "protocol",
  "temperature",
  "topP",
  "maxOutputTokens",
]);
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
  { value: "auto", label: "自动（默认）" },
  { value: "pdf-text", label: "pdf-text（免费）" },
  { value: "mistral-ocr", label: "mistral-ocr（OCR）" },
  { value: "native", label: "native（模型原生）" },
];
const ALIYUN_PROTOCOL_OPTIONS = [
  { value: "chat", label: "聊天接口" },
  { value: "responses", label: "回应接口" },
  { value: "dashscope", label: "DashScope 原生接口" },
];
const ALIYUN_FILE_PROCESS_MODE_OPTIONS = [
  { value: "local_parse", label: "本地解析（兼容模式）" },
  { value: "native_oss_url", label: "原生文件 URL（调试模式）" },
];
const ALIYUN_SEARCH_STRATEGY_OPTIONS = [
  { value: "turbo", label: "极速（默认）" },
  { value: "max", label: "高召回" },
  { value: "agent", label: "多轮检索" },
  { value: "agent_max", label: "多轮检索（含网页抓取）" },
];
const ALIYUN_SEARCH_CITATION_FORMAT_OPTIONS = [
  { value: "[<number>]", label: "[1]" },
  { value: "[ref_<number>]", label: "[参考1]" },
];
const ALIYUN_SEARCH_FRESHNESS_OPTIONS = [
  { value: 0, label: "不限时效（默认）" },
  { value: 7, label: "最近 7 天" },
  { value: 30, label: "最近 30 天" },
  { value: 180, label: "最近 180 天" },
  { value: 365, label: "最近 365 天" },
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
  { key: "webSearchSourceDouyin", value: "douyin", label: "抖音百科（douyin）" },
  { key: "webSearchSourceMoji", value: "moji", label: "墨迹天气（moji）" },
  { key: "webSearchSourceToutiao", value: "toutiao", label: "头条图文（toutiao）" },
];
const ADMIN_AGENT_IDS = [...AGENT_IDS, "E"];

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
  return date.toLocaleTimeString("zh-CN", { hour12: false });
}

function downloadTxt(filename, content) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function readErrorMessage(error) {
  return error?.message || "请求失败，请稍后再试。";
}

function shouldRelogin(error) {
  const msg = String(error?.message || "");
  return msg.includes("管理员身份无效") || msg.includes("仅管理员可访问");
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
        aria-label="减少数值"
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
        aria-label="增加数值"
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
  const menuRef = useRef(null);
  const draftRef = useRef({
    prompts: { A: "", B: "", C: "", D: "" },
    runtimeConfigs: createDefaultAgentRuntimeConfigMap(),
    agentEConfig: null,
  });
  const dirtyRef = useRef(false);

  const [adminToken, setAdminToken] = useState(() => getAdminToken());
  const [defaultSystemPrompt, setDefaultSystemPrompt] = useState(DEFAULT_SYSTEM_PROMPT);
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
  const [agentEConfig, setAgentEConfig] = useState(null);
  const [agentEAvailableSkills, setAgentEAvailableSkills] = useState([]);

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [lastSavedAt, setLastSavedAt] = useState("");

  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exportLoading, setExportLoading] = useState("");
  const [exportError, setExportError] = useState("");

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteNotice, setDeleteNotice] = useState("");
  const [selectedTeacherScopeKey, setSelectedTeacherScopeKey] = useState(
    DEFAULT_TEACHER_SCOPE_KEY,
  );

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
  const selectedProviderName =
    selectedProvider === "volcengine"
      ? "火山引擎 Ark"
      : selectedProvider === "packycode"
        ? "PackyCode"
      : selectedProvider === "aliyun"
        ? "阿里云 DashScope"
        : "OpenRouter";
  const showVolcenginePanel = selectedProvider === "volcengine";
  const showOpenRouterPanel = selectedProvider === "openrouter";
  const showAliyunPanel = selectedProvider === "aliyun";
  const showPackyCodePanel = selectedProvider === "packycode";
  const providerSupportsReasoning = true;
  const providerReasoningHint = showPackyCodePanel
    ? `当前服务商默认推理强度为 ${PACKYCODE_DEFAULT_THINKING_EFFORT}；关闭后会按 none 下发。`
    : "当前服务商支持深度思考开关：关闭=none，开启=high。";
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

  const isAgentESelected = selectedAgent === "E";
  const isAgentCSelected = selectedAgent === "C";
  const isAgentDSelected = selectedAgent === "D";
  const isCoreAgentSelected = AGENT_IDS.includes(selectedAgent);
  const selectedPrompt = isAgentESelected ? "" : prompts[selectedAgent] || "";
  const selectedAgentName = AGENT_META[selectedAgent]?.name || `智能体 ${selectedAgent}`;
  const selectedTeacherScopeLabel = useMemo(
    () => getTeacherScopeLabel(selectedTeacherScopeKey),
    [selectedTeacherScopeKey],
  );
  const previewMessages = debugByAgent[selectedAgent] || [];
  const agentOptions = useMemo(
    () =>
      ADMIN_AGENT_IDS.map((agentId) => ({
        value: agentId,
        label: AGENT_META[agentId]?.name || `智能体 ${agentId}`,
      })),
    [],
  );
  const agentESelectedSkills = useMemo(() => {
    const list = Array.isArray(agentEConfig?.skills) ? agentEConfig.skills : [];
    const rowMap = new Map(list.map((item) => [item.id, item]));
    return agentEAvailableSkills.map((meta) => {
      const row = rowMap.get(meta.id) || {};
      return {
        id: meta.id,
        name: meta.name,
        version: meta.version,
        enabled: !!row.enabled,
        priority: Number(row.priority || meta.defaultPriority || 50),
      };
    });
  }, [agentEAvailableSkills, agentEConfig?.skills]);
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
        const [data, agentEData] = await Promise.all([
          saveAdminAgentSettings(adminToken, payload),
          draftRef.current.agentEConfig
            ? saveAdminAgentESettings(adminToken, draftRef.current.agentEConfig)
            : Promise.resolve(null),
        ]);

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
          agentEConfig: agentEData?.config || draftRef.current.agentEConfig,
        };
        setDefaultSystemPrompt(
          String(data?.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT),
        );
        if (agentEData?.config) {
          setAgentEConfig(agentEData.config);
          setAgentEAvailableSkills(
            Array.isArray(agentEData?.availableSkills) ? agentEData.availableSkills : [],
          );
        }

        dirtyRef.current = false;
        const candidateTimes = [
          String(data?.updatedAt || ""),
          String(agentEData?.config?.updatedAt || ""),
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
        const [data, agentEData] = await Promise.all([
          fetchAdminAgentSettings(adminToken),
          fetchAdminAgentESettings(adminToken),
        ]);
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

        setDefaultSystemPrompt(
          String(data?.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT),
        );
        setPrompts(nextPrompts);
        setRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setAgentModelDefaults(nextModelDefaults);
        setAgentEConfig(agentEData?.config || null);
        setAgentEAvailableSkills(
          Array.isArray(agentEData?.availableSkills) ? agentEData.availableSkills : [],
        );
        draftRef.current = {
          prompts: nextPrompts,
          runtimeConfigs: nextRuntimeConfigs,
          agentEConfig: agentEData?.config || null,
        };
        dirtyRef.current = false;
        const candidateTimes = [
          String(data?.updatedAt || ""),
          String(agentEData?.config?.updatedAt || ""),
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
      agentEConfig,
    };
  }, [agentEConfig, prompts, runtimeConfigs]);

  useEffect(() => {
    const timer = setInterval(() => {
      if (!dirtyRef.current) return;
      void persistSettings();
    }, AUTO_SAVE_MS);

    return () => clearInterval(timer);
  }, [persistSettings]);

  useEffect(() => {
    function onDocMouseDown(event) {
      if (!showExportMenu) return;
      const target = event.target;
      if (target instanceof Element && target.closest("[data-portal-select-menu='true']")) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setShowExportMenu(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [showExportMenu]);

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

  function updateAgentEConfigRoot(field, value) {
    setAgentEConfig((prev) => ({
      ...(prev || {}),
      [field]: value,
    }));
    markDirty();
  }

  function updateAgentERuntime(field, value) {
    setAgentEConfig((prev) => {
      const current = prev || {};
      if (AGENT_E_LOCKED_RUNTIME_FIELDS.has(field)) {
        return current;
      }
      const runtime =
        current.runtime && typeof current.runtime === "object"
          ? current.runtime
          : {};
      return {
        ...current,
        runtime: {
          ...runtime,
          [field]: value,
        },
      };
    });
    markDirty();
  }

  function updateAgentEReviewPolicy(field, value) {
    setAgentEConfig((prev) => {
      const current = prev || {};
      const policy =
        current.reviewPolicy && typeof current.reviewPolicy === "object"
          ? current.reviewPolicy
          : {};
      return {
        ...current,
        reviewPolicy: {
          ...policy,
          [field]: value,
        },
      };
    });
    markDirty();
  }

  function updateAgentESkillPolicy(field, value) {
    setAgentEConfig((prev) => {
      const current = prev || {};
      const policy =
        current.skillPolicy && typeof current.skillPolicy === "object"
          ? current.skillPolicy
          : {};
      return {
        ...current,
        skillPolicy: {
          ...policy,
          [field]: value,
        },
      };
    });
    markDirty();
  }

  function updateAgentESkill(id, patch) {
    setAgentEConfig((prev) => {
      const current = prev || {};
      const list = Array.isArray(current.skills) ? current.skills : [];
      let touched = false;
      const next = list.map((item) => {
        if (item.id !== id) return item;
        touched = true;
        return { ...item, ...patch };
      });
      if (!touched) {
        next.push({
          id,
          enabled: true,
          priority: 50,
          versionPin: "1.x",
          ...patch,
        });
      }
      return {
        ...current,
        skills: next,
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

  async function onExportUsers() {
    if (!adminToken) return;
    setExportError("");
    setDeleteNotice("");
    setExportLoading("users");
    try {
      const data = await exportAdminUsersTxt(adminToken);
      downloadTxt(data.filename || "educhat-users.txt", String(data.content || ""));
      setShowExportMenu(false);
    } catch (error) {
      if (handleAuthError(error)) return;
      setExportError(readErrorMessage(error));
    } finally {
      setExportLoading("");
    }
  }

  async function onExportChatsTxt() {
    if (!adminToken) return;
    setExportError("");
    setDeleteNotice("");
    setExportLoading("chats");
    try {
      const data = await exportAdminChatsTxt(adminToken, selectedTeacherScopeKey);
      downloadTxt(data.filename || "educhat-chats.txt", String(data.content || ""));
      setShowExportMenu(false);
    } catch (error) {
      if (handleAuthError(error)) return;
      setExportError(readErrorMessage(error));
    } finally {
      setExportLoading("");
    }
  }

  async function onExportChatsZip() {
    if (!adminToken) return;
    setExportError("");
    setDeleteNotice("");
    setExportLoading("zip");
    try {
      const data = await exportAdminChatsZip(adminToken, selectedTeacherScopeKey);
      downloadBlob(data.filename || "educhat-chats-by-user.zip", data.blob);
      setShowExportMenu(false);
    } catch (error) {
      if (handleAuthError(error)) return;
      setExportError(readErrorMessage(error));
    } finally {
      setExportLoading("");
    }
  }

  async function onDeleteAllChats() {
    if (!adminToken || deleteLoading) return;
    setDeleteLoading(true);
    setExportError("");
    setDeleteNotice("");

    try {
      const data = await deleteAllUserChats(adminToken, selectedTeacherScopeKey);
      setDeleteNotice(
        `已清空“${selectedTeacherScopeLabel}”授课教师下 ${Number(data?.deletedCount || 0)} 条用户对话状态数据。`,
      );
      setShowDeleteConfirm(false);
    } catch (error) {
      if (handleAuthError(error)) return;
      setExportError(readErrorMessage(error));
    } finally {
      setDeleteLoading(false);
      setShowExportMenu(false);
    }
  }

  function resolveDebugRuntimeConfig(agentId) {
    if (agentId === "E") {
      const runtime = agentEConfig?.runtime;
      return runtime && typeof runtime === "object" ? runtime : {};
    }
    return runtimeConfigs[agentId] || DEFAULT_AGENT_RUNTIME_CONFIG;
  }

  function resolveDebugProvider(agentId, runtimeConfig) {
    if (agentId === "E") return "volcengine";
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
          name: String(item?.name || "文件"),
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
          name: String(item?.name || "文件"),
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
        name: String(item?.name || "文件"),
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
        throw new Error("当前阿里云 MiniMax 模型不支持图片输入，请仅发送文本内容。");
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
          throw new Error("PDF 预处理结果异常，请重试。");
        }
        const preparedItems = preparedRefs.map((ref, idx) => {
          const file = pdfCandidates[idx].file;
          const preparedToken = String(ref?.token || "").trim();
          if (!preparedToken) {
            throw new Error("PDF 预处理缺少 token，请重试。");
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
      throw new Error("文件上传结果异常，请重试。");
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
      setDebugError(aliyunModelPolicy.errorMessage || "当前阿里云模型不受支持。");
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
      content || (safeFiles.length > 0 ? "请分析我上传的附件内容。" : "");
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
            throw new Error(message || "调试失败");
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
                content: `${item.content || ""}\n\n> 调试失败：${msg}`,
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
      setDebugError(aliyunModelPolicy.errorMessage || "当前阿里云模型不受支持。");
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
            throw new Error(message || "调试失败");
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
                content: `${item.content || ""}\n\n> 调试失败：${msg}`,
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
            <button
              type="button"
              className="admin-icon-btn"
              onClick={onBackToOnlinePanel}
              title="返回教师主页"
              aria-label="返回教师主页"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="admin-settings-title-row">
              <h1 className="admin-settings-title">管理员智能体设置</h1>
              <div className="admin-agent-select-wrap">
                <span className="admin-agent-select-icon" aria-hidden="true">
                  <ShieldAlert size={14} />
                </span>
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

          <div className="admin-settings-topbar-right">
            <div className="admin-save-state" role="status">
              {saving
                ? "保存中..."
                : lastSavedAt
                  ? `保存时间 ${formatClock(lastSavedAt)}`
                  : "保存时间 --:--:--"}
            </div>
            <button
              type="button"
              className="admin-save-btn"
              onClick={onManualSave}
              disabled={saving || loading || (isAgentESelected && !agentEConfig)}
            >
              <Save size={16} />
              <span>{saving ? "保存中..." : "保存"}</span>
            </button>

          </div>
        </header>

        {(loadError || saveError || exportError || deleteNotice) && (
          <div className="admin-message-strip">
            {[loadError, saveError, exportError].filter(Boolean).map((line) => (
              <p key={line} className="admin-message-strip-item error">
                <CircleAlert size={14} />
                <span>{line}</span>
              </p>
            ))}
            {deleteNotice ? (
              <p className="admin-message-strip-item success">{deleteNotice}</p>
            ) : null}
          </div>
        )}

        <div className={`admin-grid${isAgentESelected ? " admin-grid-agent-e" : ""}`}>
          {isAgentESelected ? (
            <>
              <section className="admin-panel admin-panel-api admin-agent-e-api-panel">
                <div className="admin-panel-head">
                  <h2>API 参数</h2>
                  <span>SSCI审稿人独立策略</span>
                </div>

                <div className="admin-field-grid">
                  <div className="admin-field-row split">
                    <span>启用 SSCI审稿人</span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!agentEConfig?.enabled}
                        onChange={(e) => updateAgentEConfigRoot("enabled", e.target.checked)}
                        disabled={loading || !agentEConfig}
                      />
                      <span>{agentEConfig?.enabled ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  <label className="admin-field-row model-id" htmlFor="admin-agent-e-model">
                    <span>模型 ID</span>
                    <input
                      id="admin-agent-e-model"
                      type="text"
                      value={VOLCENGINE_FIXED_SAMPLING_MODEL_ID}
                      readOnly
                      disabled
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-agent-e-temperature">
                    <span>生成随机性</span>
                    <NumberRuntimeInput
                      id="admin-agent-e-temperature"
                      value={VOLCENGINE_FIXED_TEMPERATURE}
                      min={0}
                      max={2}
                      step={0.1}
                      onChange={() => {}}
                      disabled
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-agent-e-top-p">
                    <span>累计概率</span>
                    <NumberRuntimeInput
                      id="admin-agent-e-top-p"
                      value={VOLCENGINE_FIXED_TOP_P}
                      min={0}
                      max={1}
                      step={0.05}
                      onChange={() => {}}
                      disabled
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-agent-e-context-rounds">
                    <span>上下文轮数</span>
                    <NumberRuntimeInput
                      id="admin-agent-e-context-rounds"
                      value={Number(agentEConfig?.runtime?.contextRounds ?? 12)}
                      min={1}
                      max={20}
                      step={1}
                      onChange={(next) => updateAgentERuntime("contextRounds", next)}
                      disabled={loading || !agentEConfig}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-agent-e-max-output">
                    <span>最大输出长度</span>
                    <NumberRuntimeInput
                      id="admin-agent-e-max-output"
                      value={AGENT_E_FIXED_MAX_OUTPUT_TOKENS}
                      min={64}
                      max={131072}
                      step={64}
                      onChange={() => {}}
                      disabled
                    />
                  </label>

                  <p className="admin-field-note">
                    temperature/top_p 已按模型策略固定，且调用时会忽略外部传入值。
                  </p>

                  <div className="admin-field-row split">
                    <span>深度思考</span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!agentEConfig?.runtime?.enableThinking}
                        onChange={(e) => updateAgentERuntime("enableThinking", e.target.checked)}
                        disabled={loading || !agentEConfig}
                      />
                      <span>{agentEConfig?.runtime?.enableThinking ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>注入安全提示</span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!agentEConfig?.runtime?.injectSafetyPrompt}
                        onChange={(e) =>
                          updateAgentERuntime("injectSafetyPrompt", e.target.checked)
                        }
                        disabled={loading || !agentEConfig}
                      />
                      <span>{agentEConfig?.runtime?.injectSafetyPrompt ? "开启" : "关闭"}</span>
                    </label>
                  </div>
                </div>
              </section>

              <div className="admin-agent-e-middle-column">
                <section className="admin-panel admin-panel-api admin-agent-e-skills-panel">
                  <div className="admin-panel-head">
                    <h2>Skills</h2>
                    <span>启用与优先级</span>
                  </div>

                  <div className="admin-field-grid">
                    {agentESelectedSkills.map((skill) => (
                      <div className="admin-tip-card admin-skill-card" key={skill.id}>
                        <div className="admin-skill-meta">
                          <p className="admin-skill-name">{skill.name}</p>
                          <span className="admin-skill-version">{skill.version}</span>
                        </div>

                        <div className="admin-field-row split">
                          <span>启用</span>
                          <label className="admin-switch-row">
                            <input
                              type="checkbox"
                              checked={!!skill.enabled}
                              onChange={(e) =>
                                updateAgentESkill(skill.id, { enabled: e.target.checked })
                              }
                              disabled={loading || !agentEConfig}
                            />
                            <span>{skill.enabled ? "开启" : "关闭"}</span>
                          </label>
                        </div>

                        <label
                          className="admin-field-row split"
                          htmlFor={`admin-agent-e-skill-${skill.id}`}
                        >
                          <span>优先级</span>
                          <NumberRuntimeInput
                            id={`admin-agent-e-skill-${skill.id}`}
                            value={Number(skill.priority || 50)}
                            min={1}
                            max={999}
                            step={1}
                            onChange={(next) => updateAgentESkill(skill.id, { priority: next })}
                            disabled={loading || !agentEConfig}
                          />
                        </label>
                      </div>
                    ))}
                  </div>
                </section>

                <section className="admin-panel admin-panel-api admin-agent-e-review-panel">
                  <div className="admin-panel-head">
                    <h2>审稿策略</h2>
                    <span>reviewPolicy + skillPolicy</span>
                  </div>

                  <div className="admin-field-grid">
                    <div className="admin-field-row split">
                      <span>强制结构化输出</span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!agentEConfig?.reviewPolicy?.forceStructuredOutput}
                          onChange={(e) =>
                            updateAgentEReviewPolicy("forceStructuredOutput", e.target.checked)
                          }
                          disabled={loading || !agentEConfig}
                        />
                        <span>
                          {agentEConfig?.reviewPolicy?.forceStructuredOutput ? "开启" : "关闭"}
                        </span>
                      </label>
                    </div>

                    <div className="admin-field-row split">
                      <span>强制证据锚点</span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!agentEConfig?.reviewPolicy?.requireEvidenceAnchors}
                          onChange={(e) =>
                            updateAgentEReviewPolicy("requireEvidenceAnchors", e.target.checked)
                          }
                          disabled={loading || !agentEConfig}
                        />
                        <span>
                          {agentEConfig?.reviewPolicy?.requireEvidenceAnchors ? "开启" : "关闭"}
                        </span>
                      </label>
                    </div>
                    <div className="admin-field-row split">
                      <span>自动选择技能</span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!agentEConfig?.skillPolicy?.autoSelect}
                          onChange={(e) => updateAgentESkillPolicy("autoSelect", e.target.checked)}
                          disabled={loading || !agentEConfig}
                        />
                        <span>{agentEConfig?.skillPolicy?.autoSelect ? "开启" : "关闭"}</span>
                      </label>
                    </div>

                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        <span>严格模式</span>
                        <InfoHint text="常规期刊审稿建议关闭严格模式，先按事实列问题，再给可补救建议。" />
                      </span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!agentEConfig?.skillPolicy?.strictMode}
                          onChange={(e) => updateAgentESkillPolicy("strictMode", e.target.checked)}
                          disabled={loading || !agentEConfig}
                        />
                        <span>{agentEConfig?.skillPolicy?.strictMode ? "开启" : "关闭"}</span>
                      </label>
                    </div>

                    <div className="admin-field-row split">
                      <span>允许通用兜底</span>
                      <label className="admin-switch-row">
                        <input
                          type="checkbox"
                          checked={!!agentEConfig?.skillPolicy?.allowFallbackGeneralAnswer}
                          onChange={(e) =>
                            updateAgentESkillPolicy("allowFallbackGeneralAnswer", e.target.checked)
                          }
                          disabled={loading || !agentEConfig}
                        />
                        <span>
                          {agentEConfig?.skillPolicy?.allowFallbackGeneralAnswer
                            ? "开启"
                            : "关闭"}
                        </span>
                      </label>
                    </div>

                    <label className="admin-field-row split" htmlFor="admin-agent-e-max-skills">
                      <span>每轮最多技能数</span>
                      <NumberRuntimeInput
                        id="admin-agent-e-max-skills"
                        value={Number(agentEConfig?.skillPolicy?.maxSkillsPerTurn ?? 3)}
                        min={1}
                        max={6}
                        step={1}
                        onChange={(next) => updateAgentESkillPolicy("maxSkillsPerTurn", next)}
                        disabled={loading || !agentEConfig}
                      />
                    </label>
                  </div>
                </section>
              </div>

              <section className="admin-panel preview admin-agent-e-debug-panel">
                <div className="admin-panel-head">
                  <div className="admin-panel-head-title">
                    <h2>预览与调试</h2>
                    <InfoHint text="仅用于当前 API 参数调试，调试记录不写入数据库。" />
                  </div>
                  <button
                    type="button"
                    className="admin-ghost-btn"
                    onClick={onDebugClear}
                    disabled={debugLoading || loading}
                  >
                    清空
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
                      aria-label="关闭错误提示"
                      title="关闭错误提示"
                    >
                      <CloseXIcon />
                    </button>
                  </div>
                ) : null}
              </section>
            </>
          ) : (
            <>
              <section className="admin-panel admin-panel-prompt">
            <div className="admin-panel-head">
              <h2>提示词设置</h2>
              <span>{selectedAgentName}</span>
            </div>

            <label className="admin-field-label" htmlFor="admin-prompt-input">
              <span>系统提示词</span>
              <InfoHint text="留空时会使用默认系统提示词。该提示词会影响该智能体在主对话中的行为。" />
            </label>
            <textarea
              id="admin-prompt-input"
              className="admin-textarea admin-prompt-textarea"
              rows={14}
              value={selectedPrompt}
              onChange={(e) => updatePrompt(e.target.value)}
              placeholder="默认为系统提示词：你是用户的助手"
              disabled={loading}
            />

            <div className="admin-tip-card admin-default-prompt-card">
              <p className="admin-tip-title">
                <span>默认系统提示词</span>
                <InfoHint text="默认值来自 .env 的 DEFAULT_SYSTEM_PROMPT。" />
              </p>
              <pre>{defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT}</pre>
            </div>
          </section>

          <section className="admin-panel admin-panel-api">
            <div className="admin-panel-head">
              <h2>API 参数</h2>
              <span className="admin-panel-head-note">
                <InfoHint text="参数按当前选中的智能体独立保存并生效。" />
              </span>
            </div>

            <div className="admin-field-grid">
              <div className="admin-field-row split">
                <span>服务商</span>
                <PortalSelect
                  value={selectedProvider}
                  options={PROVIDER_OPTIONS}
                  onChange={(next) => updateRuntimeField("provider", next)}
                  disabled={loading || isAgentCSelected || isAgentDSelected}
                />
              </div>

              <label className="admin-field-row model-id" htmlFor="admin-runtime-model">
                <span>模型 ID</span>
                <input
                  id="admin-runtime-model"
                  type="text"
                  value={selectedRuntime.model}
                  onChange={(e) => updateRuntimeField("model", e.target.value)}
                  placeholder={
                    selectedModelDefault
                      ? `留空则使用默认模型：${selectedModelDefault}`
                      : "留空则走 .env 里对应 AGENT_MODEL_*"
                  }
                  disabled={loading || isAgentCSelected || isAgentDSelected}
                />
              </label>
                  {showOpenRouterPanel ? (
                    <p className="admin-field-note">
                      Openrouter api仅支持最大输出（max_tokens）配置。
                    </p>
                  ) : showAliyunPanel ? (
                <p className="admin-field-note">
                  {aliyunModelUnsupported
                    ? "当前阿里云模型不受支持，请更换模型后再调用。"
                    : aliyunProtocolLocked
                      ? `当前模型调用方式固定为 ${
                          aliyunProtocolOptions[0]?.label || "指定协议"
                        }。`
                      : "阿里云支持聊天接口、回应接口、DashScope 原生接口三种调用方式，最大输出固定使用模型默认值。"}
                </p>
              ) : null}

              {showVolcenginePanel ? (
                <>
                  <label className="admin-field-row split" htmlFor="admin-runtime-temperature">
                    <span>生成随机性</span>
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
                    <span>累计概率</span>
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
                    <span>上下文轮数</span>
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
                      最大输出长度
                      <InfoHint text="会映射到 Responses 的最大输出参数。" />
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
                        注入系统时间
                        <InfoHint text="开启后，每次会话都会在系统提示词中注入当前日期（年月日）。" />
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
                        <span>{selectedRuntime.includeCurrentTime ? "开启" : "关闭"}</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      SP防泄漏指令
                      <InfoHint text="默认关闭。开启后会注入 SP 防泄漏指令；识别到探查系统设定时，将执行身份回应或礼貌拒绝且不解释判定依据。" />
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
                      <span>{selectedRuntime.preventPromptLeak ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>深度思考</span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.enableThinking}
                        onChange={(e) => updateRuntimeField("enableThinking", e.target.checked)}
                        disabled={loading}
                      />
                      <span>{selectedRuntime.enableThinking ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>联网搜索</span>
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
                        {!!selectedRuntime.enableWebSearch && webSearchSupported
                          ? "开启"
                          : "关闭"}
                      </span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>搜索来源</span>
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
                      单轮关键词数
                      <InfoHint text="限制每轮搜索可用关键词数量，范围 1 到 50。" />
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
                      单次结果条数
                      <InfoHint text="限制单次搜索返回结果数量，范围 1 到 50。" />
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
                      工具调用轮次上限
                      <InfoHint text="限制一次回答内最多可执行的联网搜索轮次，范围 1 到 10。" />
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
                        <span>生成随机性</span>
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
                        <span>累计概率</span>
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
                  ) : showPackyCodePanel ? (
                    <p className="admin-field-note">
                      当前 PackyCode / `gpt-5.4` 接入已隐藏未验证或已确认不兼容的采样参数，
                      默认按 256k token 预算运行；上下文轮数对 Packy 不生效。
                    </p>
                  ) : (
                    <p className="admin-field-note">
                      当前模型采样参数固定：temperature = {ALIYUN_MINIMAX_FIXED_TEMPERATURE}、
                      top_p = {ALIYUN_MINIMAX_FIXED_TOP_P}。
                    </p>
                  )}

                  {!showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-context-rounds">
                      <span>上下文轮数</span>
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
                  {showPackyCodePanel ? (
                    <p className="admin-field-note">
                      PackyCode 会尽量带全量历史，并在接近 256k 上下文预算时自动做本地摘要压缩。
                    </p>
                  ) : null}

                  {showAliyunPanel ? (
                    <div className="admin-field-row split">
                      <span className="admin-label-with-hint">
                        阿里云调用方式
                        <InfoHint
                          text={
                            aliyunProtocolLocked
                              ? "当前模型仅支持一种调用协议，已自动锁定。"
                              : "支持 OpenAI Chat、OpenAI Responses 和 DashScope 原生接口。"
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
                        文件处理模式
                        <InfoHint text="仅 DashScope 原生接口生效。兼容模式会先本地解析再注入文本；调试模式会优先下发 OSS 文件 URL。" />
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
                        注入系统时间
                        <InfoHint text="开启后，每次会话都会在系统提示词中注入当前日期（年月日）。" />
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
                        <span>{selectedRuntime.includeCurrentTime ? "开启" : "关闭"}</span>
                      </label>
                    </div>
                  ) : null}

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      SP防泄漏指令
                      <InfoHint text="默认关闭。开启后会注入 SP 防泄漏指令；识别到探查系统设定时，将执行身份回应或礼貌拒绝且不解释判定依据。" />
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
                      <span>{selectedRuntime.preventPromptLeak ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  <div className="admin-field-row split">
                    <span>深度思考</span>
                    <label
                      className={`admin-switch-row ${providerSupportsReasoning ? "" : "disabled"}`}
                    >
                      <input
                        type="checkbox"
                        checked={!!selectedRuntime.enableThinking}
                        onChange={(e) => updateRuntimeField("enableThinking", e.target.checked)}
                        disabled={loading || !providerSupportsReasoning}
                      />
                      <span>{selectedRuntime.enableThinking ? "开启" : "关闭"}</span>
                    </label>
                  </div>

                  {!showOpenRouterPanel && !showAliyunPanel && !showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-context-window-tokens-chat">
                      <span className="admin-label-with-hint">
                        上下文窗口
                        <InfoHint text="Chat 协议配置项，可手动编辑。" />
                      </span>
                      <NumberRuntimeInput
                        id="admin-runtime-context-window-tokens-chat"
                        value={selectedRuntime.contextWindowTokens}
                        min={1024}
                        max={512000}
                        step={1024}
                        onChange={(next) => updateRuntimeField("contextWindowTokens", next)}
                        disabled={loading}
                      />
                    </label>
                  ) : null}

                  {!showOpenRouterPanel && !showAliyunPanel && !showPackyCodePanel ? (
                    <label className="admin-field-row split" htmlFor="admin-runtime-max-input-tokens-chat">
                      <span className="admin-label-with-hint">
                        最大输入长度
                        <InfoHint text="Chat 协议配置项，可手动编辑。" />
                      </span>
                      <NumberRuntimeInput
                        id="admin-runtime-max-input-tokens-chat"
                        value={selectedRuntime.maxInputTokens}
                        min={1024}
                        max={512000}
                        step={1024}
                        onChange={(next) => updateRuntimeField("maxInputTokens", next)}
                        disabled={loading}
                      />
                    </label>
                  ) : null}

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-output-tokens-chat">
                    <span className="admin-label-with-hint">
                      {showOpenRouterPanel ? "最大输出长度（Max Tokens）" : "最大输出长度"}
                      <InfoHint
                        text={
                          showOpenRouterPanel
                            ? "会映射到 OpenRouter Chat 的 max_tokens 参数。"
                          : showAliyunPanel
                              ? "阿里云接入固定使用模型默认最大输出，不手动下发最大输出参数。"
                              : "会映射到 Chat 的最大输出参数。"
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
                  {showPackyCodePanel ? (
                    <p className="admin-field-note">
                      PackyCode / `gpt-5.4` 的最大输出已固定为 256000。
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunWebSearchAllowed ? (
                    <>
                      <div className="admin-field-row split">
                        <span className="admin-label-with-hint">
                          联网搜索
                          <InfoHint text="启用后会下发联网搜索能力；回应模式会挂载网页搜索工具。" />
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
                          <span>{selectedRuntime.enableWebSearch ? "开启" : "关闭"}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>强制搜索</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchForced}
                            onChange={(e) =>
                              updateRuntimeField("aliyunSearchForced", e.target.checked)
                            }
                            disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          />
                          <span>{selectedRuntime.aliyunSearchForced ? "开启" : "关闭"}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>搜索策略</span>
                        <PortalSelect
                          value={selectedRuntime.aliyunSearchStrategy}
                          options={ALIYUN_SEARCH_STRATEGY_OPTIONS}
                          onChange={(next) => updateRuntimeField("aliyunSearchStrategy", next)}
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                          compact
                        />
                      </div>

                      <div className="admin-field-row split">
                        <span>返回搜索来源</span>
                        <label className="admin-switch-row">
                          <input
                            type="checkbox"
                            checked={!!selectedRuntime.aliyunSearchEnableSource}
                            onChange={(e) =>
                              updateRuntimeField("aliyunSearchEnableSource", e.target.checked)
                            }
                            disabled={aliyunSearchDisabled || aliyunDashscopeSearchOnlyDisabled}
                          />
                          <span>{selectedRuntime.aliyunSearchEnableSource ? "开启" : "关闭"}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>角标标注</span>
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
                          <span>{selectedRuntime.aliyunSearchEnableCitation ? "开启" : "关闭"}</span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>角标格式</span>
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
                        <span>垂域搜索</span>
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
                            {selectedRuntime.aliyunSearchEnableSearchExtension
                              ? "开启"
                              : "关闭"}
                          </span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>首包先返回来源</span>
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
                          <span>
                            {selectedRuntime.aliyunSearchPrependSearchResult ? "开启" : "关闭"}
                          </span>
                        </label>
                      </div>

                      <div className="admin-field-row split">
                        <span>搜索时效</span>
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
                          限定站点
                          <InfoHint text="每行或逗号分隔一个域名，最多 25 个。" />
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
                          placeholder={"例如：baidu.com\nsina.cn"}
                          disabled={aliyunSearchDisabled || aliyunProtocol === "responses"}
                        />
                      </label>

                      <label className="admin-field-row" htmlFor="admin-runtime-aliyun-prompt-intervene">
                        <span className="admin-label-with-hint">
                          检索范围干预
                          <InfoHint text="自然语言限制检索范围，例如“仅检索人工智能技术相关内容”。" />
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
                          placeholder="例如：仅检索人工智能技术相关内容"
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
                              工具调用轮次上限
                              <InfoHint text="仅回应模式生效，范围 1 到 10。" />
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
                            <span>附加工具：网页提取</span>
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
                              <span>
                                {selectedRuntime.aliyunResponsesEnableWebExtractor
                                  ? "开启"
                                  : "关闭"}
                              </span>
                            </label>
                          </div>

                          <div className="admin-field-row split">
                            <span>附加工具：代码解释器</span>
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
                              <span>
                                {selectedRuntime.aliyunResponsesEnableCodeInterpreter
                                  ? "开启"
                                  : "关闭"}
                              </span>
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
                          PDF 引擎
                          <InfoHint text="对应 file-parser 插件的 pdf.engine。auto 为不显式下发，交由 OpenRouter 自动选择。" />
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

                  {showPackyCodePanel ? (
                    <p className="admin-field-note warning">
                      当前 PackyCode 接入仅启用标准 Chat Completions；联网搜索、OpenRouter 插件和
                      Responses 协议暂不支持。
                    </p>
                  ) : null}
                  {showPackyCodePanel ? (
                    <p className="admin-field-note">
                      当前项目对 Packy 实际下发的上游字段为 `model`、`messages`、`stream`、
                      `max_tokens` 与 `reasoning.effort`；`temperature`、`top_p` 等字段不会发送。
                    </p>
                  ) : null}
                  {!showOpenRouterPanel && !showAliyunPanel ? (
                    <p
                      className={`admin-field-note ${providerSupportsReasoning ? "" : "warning"}`}
                    >
                      {providerReasoningHint}
                    </p>
                  ) : null}
                  {showAliyunPanel && !aliyunModelPolicy.supported ? (
                    <p className="admin-field-note warning">
                      {aliyunModelPolicy.errorMessage}
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunModelPolicy.key === "kimi_k2_5" ? (
                    <p className="admin-field-note">
                      提示：Kimi 仅支持 `kimi-k2.5`，固定使用 DashScope 原生多模态端点，且不支持联网搜索。
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunModelPolicy.key === "minimax_m2" ? (
                    <p className="admin-field-note warning">
                      提示：MiniMax-M2.5 / MiniMax-M2.1 固定使用 Chat API，禁用联网搜索与图片输入。
                    </p>
                  ) : null}
                  {showAliyunPanel && !aliyunWebSearchAllowed && aliyunModelPolicy.supported ? (
                    <p className="admin-field-note warning">
                      当前模型不支持联网搜索，相关搜索参数已自动隐藏并禁用。
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunWebSearchAllowed && aliyunProtocol !== "dashscope" ? (
                    <p className="admin-field-note warning">
                      提示：返回搜索来源、角标标注、角标格式、首包先返回来源仅在 DashScope 原生
                      接口下生效。
                    </p>
                  ) : null}
                  {showAliyunPanel && aliyunWebSearchAllowed && aliyunProtocol === "responses" ? (
                    <p className="admin-field-note warning">
                      提示：回应模式的联网搜索通过网页搜索工具挂载，不下发搜索参数选项。
                    </p>
                  ) : null}
                  {showAliyunPanel &&
                  selectedRuntime.aliyunFileProcessMode === "native_oss_url" ? (
                    <p className="admin-field-note warning">
                      调试提示：原生文件 URL 模式已开启。若上游返回文件格式不支持，请切回“本地解析（兼容模式）”。
                    </p>
                  ) : null}
                </>
              )}
            </div>
          </section>

              <section
                className={`admin-panel preview${
                  isAgentESelected ? " admin-agent-e-debug-panel" : ""
                }`}
              >
            <div className="admin-panel-head">
              <div className="admin-panel-head-title">
                <h2>预览与调试</h2>
                <InfoHint text="仅用于当前 API 参数调试，调试记录不写入数据库。" />
              </div>
              <button
                type="button"
                className="admin-ghost-btn"
                onClick={onDebugClear}
                disabled={debugLoading || loading}
              >
                清空
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
                  aria-label="关闭错误提示"
                  title="关闭错误提示"
                >
                  <CloseXIcon />
                </button>
              </div>
            ) : null}
              </section>
            </>
          )}
        </div>
      </div>

    </div>
  );
}
