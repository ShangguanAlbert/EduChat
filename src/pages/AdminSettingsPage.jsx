import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  CircleAlert,
  Download,
  Info,
  Save,
  ShieldAlert,
  Trash2,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import MessageInput from "../components/MessageInput.jsx";
import MessageList from "../components/MessageList.jsx";
import {
  deleteAllUserChats,
  exportAdminChatsTxt,
  exportAdminChatsZip,
  exportAdminUsersTxt,
  fetchAdminAgentSettings,
  saveAdminAgentSettings,
  streamAdminAgentDebug,
} from "./admin/adminApi.js";
import { clearAdminToken, getAdminToken } from "./login/adminSession.js";
import {
  AGENT_IDS,
  DEFAULT_AGENT_RUNTIME_CONFIG,
  createDefaultAgentRuntimeConfigMap,
  sanitizeRuntimeConfigMap,
  sanitizeSingleRuntimeConfig,
} from "./chat/agentRuntimeConfig.js";
import { AGENT_META, DEFAULT_SYSTEM_PROMPT } from "./chat/constants.js";
import "../styles/chat.css";
import "../styles/admin-settings.css";

const AUTO_SAVE_MS = 5 * 60 * 1000;
const REASONING_MODE_OPTIONS = [
  { value: "none", label: "关闭" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];
const PROVIDER_OPTIONS = [
  { value: "inherit", label: "跟随 .env 默认" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "volcengine", label: "火山引擎 Ark" },
  { value: "aliyun", label: "阿里云 DashScope" },
];
const KNOWN_PROVIDERS = new Set(["openrouter", "volcengine", "aliyun"]);
const VOLCENGINE_WEB_SEARCH_MODEL_CAPABILITIES = [
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

function createDefaultAgentProviderMap() {
  return {
    A: "volcengine",
    B: "volcengine",
    C: "volcengine",
    D: "openrouter",
  };
}

function createDefaultAgentModelMap() {
  return {
    A: "doubao-seed-1-6-251015",
    B: "glm-4-7-251222",
    C: "deepseek-v3-2-251201",
    D: "z-ai/glm-4.7-flash",
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

function toPreviewMessages(list) {
  return (list || [])
    .filter((item) => item && (item.role === "user" || item.role === "assistant"))
    .map((item) => ({ role: item.role, content: String(item.content || "") }))
    .filter((item) => item.content.trim().length > 0);
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

  useEffect(() => {
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
              transform: `translateX(${tipPos.xMode})`,
            }}
          >
            {text}
          </span>,
          document.body,
        )}
    </span>
  );
}

function AdminPortalSelect({
  value,
  options,
  onChange,
  disabled = false,
  compact = false,
  className = "",
}) {
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });

  const normalizedOptions = Array.isArray(options) ? options : [];
  const selected = normalizedOptions.find((item) => item.value === value) || normalizedOptions[0];

  const updateMenuPosition = useCallback(() => {
    const node = triggerRef.current;
    if (!node) return;
    const rect = node.getBoundingClientRect();
    const menuHeight = Math.min(300, Math.max(48, normalizedOptions.length * 42 + 12));
    const gap = 6;
    const openUpward =
      window.innerHeight - rect.bottom < menuHeight + gap &&
      rect.top > menuHeight + gap;

    setMenuPos({
      top: openUpward ? rect.top - menuHeight - gap : rect.bottom + gap,
      left: rect.left,
      width: rect.width,
    });
  }, [normalizedOptions.length]);

  useEffect(() => {
    if (!open) return;
    updateMenuPosition();

    function onDocMouseDown(event) {
      const target = event.target;
      if (triggerRef.current && triggerRef.current.contains(target)) return;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setOpen(false);
    }

    function onDocKeyDown(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    function onViewChanged() {
      updateMenuPosition();
    }

    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onDocKeyDown);
    window.addEventListener("resize", onViewChanged);
    window.addEventListener("scroll", onViewChanged, true);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onDocKeyDown);
      window.removeEventListener("resize", onViewChanged);
      window.removeEventListener("scroll", onViewChanged, true);
    };
  }, [open, updateMenuPosition]);

  const rootClassName = `admin-reasoning-select ${className}`.trim();
  const triggerClassName = `admin-reasoning-trigger ${compact ? "compact" : ""} ${open ? "open" : ""}`.trim();

  return (
    <div className={rootClassName}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => {
          if (disabled) return;
          setOpen((prev) => !prev);
        }}
        disabled={disabled}
      >
        <span>{selected?.label || ""}</span>
        <ChevronDown size={15} className="admin-reasoning-caret" />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="admin-reasoning-menu"
            style={{
              top: `${menuPos.top}px`,
              left: `${menuPos.left}px`,
              width: `${menuPos.width}px`,
            }}
            role="listbox"
          >
            {normalizedOptions.map((item) => {
              const active = item.value === selected?.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  className={`admin-reasoning-item ${active ? "active" : ""}`}
                  role="option"
                  aria-selected={active}
                  onClick={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                >
                  <span>{item.label}</span>
                  {active ? <Check size={15} /> : <span className="admin-reasoning-empty" />}
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
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
  const menuRef = useRef(null);
  const draftRef = useRef({
    prompts: { A: "", B: "", C: "", D: "" },
    runtimeConfigs: createDefaultAgentRuntimeConfigMap(),
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
      : selectedProvider === "aliyun"
        ? "阿里云 DashScope"
        : "OpenRouter";
  const showVolcenginePanel = selectedProvider === "volcengine";
  const providerSupportsReasoning = selectedProvider !== "aliyun";
  const providerReasoningHint = providerSupportsReasoning
    ? "当前服务商支持深度思考与推理强度（四档）配置。"
    : "阿里云当前仅使用 Chat 协议，不支持 reasoning.effort。";
  const selectedModelDefault = agentModelDefaults[selectedAgent] || "";
  const selectedModelForMatching = String(
    selectedRuntime.model || selectedModelDefault || "",
  ).trim();
  const volcWebSearchCapability = useMemo(
    () => resolveVolcengineWebSearchCapability(selectedModelForMatching),
    [selectedModelForMatching],
  );
  const webSearchSupported = showVolcenginePanel && volcWebSearchCapability.supported;
  const webSearchSwitchDisabled = loading || !webSearchSupported;
  const webSearchCapabilityHint = useMemo(() => {
    if (!showVolcenginePanel) return "";
    if (!selectedModelForMatching) {
      return "请输入火山模型 ID 以匹配联网搜索支持列表。";
    }
    if (!webSearchSupported) {
      return "该模型未命中联网搜索支持列表，联网搜索已自动关闭。";
    }
    return `已匹配支持联网搜索的模型：${volcWebSearchCapability.matchedModelId}`;
  }, [
    selectedModelForMatching,
    showVolcenginePanel,
    volcWebSearchCapability.matchedModelId,
    webSearchSupported,
  ]);
  const webSearchThinkingHint =
    !webSearchSupported
      ? "当前模型未启用联网搜索能力，系统不会注入“边想边搜”策略提示词。"
      : volcWebSearchCapability.supportsThinking
        ? "该模型支持深度思考，开启联网搜索后会自动注入“边想边搜”规范提示词。"
        : "该模型不支持深度思考联动，联网搜索将按默认模式直接调用。";

  const selectedPrompt = prompts[selectedAgent] || "";
  const selectedAgentName = AGENT_META[selectedAgent]?.name || `智能体 ${selectedAgent}`;
  const previewMessages = debugByAgent[selectedAgent] || [];
  const agentOptions = useMemo(
    () =>
      AGENT_IDS.map((agentId) => ({
        value: agentId,
        label: AGENT_META[agentId]?.name || `智能体 ${agentId}`,
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
      navigate("/login", { replace: true });
      return true;
    },
    [navigate],
  );

  const persistSettings = useCallback(
    async () => {
      if (!adminToken) {
        clearAdminToken();
        navigate("/login", { replace: true });
        return false;
      }

      setSaving(true);
      setSaveError("");
      try {
        const payload = {
          prompts: draftRef.current.prompts,
          runtimeConfigs: draftRef.current.runtimeConfigs,
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
        setDefaultSystemPrompt(
          String(data?.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT),
        );

        dirtyRef.current = false;
        const now = new Date().toISOString();
        setLastSavedAt(now);
        return true;
      } catch (error) {
        if (handleAuthError(error)) return false;
        setSaveError(readErrorMessage(error));
        return false;
      } finally {
        setSaving(false);
      }
    },
    [adminToken, handleAuthError, navigate],
  );

  useEffect(() => {
    if (!adminToken) {
      navigate("/login", { replace: true });
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

        setDefaultSystemPrompt(
          String(data?.defaultSystemPrompt || DEFAULT_SYSTEM_PROMPT),
        );
        setPrompts(nextPrompts);
        setRuntimeConfigs(nextRuntimeConfigs);
        setAgentProviderDefaults(nextProviderDefaults);
        setAgentModelDefaults(nextModelDefaults);
        draftRef.current = {
          prompts: nextPrompts,
          runtimeConfigs: nextRuntimeConfigs,
        };
        dirtyRef.current = false;
        setLastSavedAt(String(data?.updatedAt || ""));
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
  }, [adminToken, handleAuthError, navigate]);

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
    function onDocMouseDown(event) {
      if (!showExportMenu) return;
      const target = event.target;
      if (menuRef.current && menuRef.current.contains(target)) return;
      setShowExportMenu(false);
    }

    document.addEventListener("mousedown", onDocMouseDown);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
    };
  }, [showExportMenu]);

  useEffect(() => {
    const expectedProtocol = showVolcenginePanel ? "responses" : "chat";
    if (selectedRuntime.protocol === expectedProtocol) return;

    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      if (current.protocol === expectedProtocol) return prev;
      return {
        ...prev,
        [selectedAgent]: sanitizeSingleRuntimeConfig({
          ...current,
          protocol: expectedProtocol,
        }),
      };
    });
    markDirty();
  }, [
    markDirty,
    selectedAgent,
    selectedRuntime.protocol,
    showVolcenginePanel,
  ]);

  useEffect(() => {
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
        }),
      };
    });
    markDirty();
  }, [
    markDirty,
    selectedAgent,
    selectedRuntime.enableWebSearch,
    showVolcenginePanel,
    webSearchSupported,
  ]);

  function updatePrompt(value) {
    setPrompts((prev) => ({
      ...prev,
      [selectedAgent]: value,
    }));
    markDirty();
  }

  function updateRuntimeField(field, value) {
    setRuntimeConfigs((prev) => {
      const current = prev[selectedAgent] || DEFAULT_AGENT_RUNTIME_CONFIG;
      const shouldSwitchCustom = field === "temperature" || field === "topP";
      const draft = {
        ...current,
        ...(shouldSwitchCustom ? { creativityMode: "custom" } : {}),
        [field]: value,
      };

      if (field === "enableThinking" && value === false) {
        draft.reasoningEffort = "none";
      }

      const next = sanitizeSingleRuntimeConfig(draft);

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

  function onLogoutAdmin() {
    clearAdminToken();
    setAdminToken("");
    navigate("/login", { replace: true });
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
      const data = await exportAdminChatsTxt(adminToken);
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
      const data = await exportAdminChatsZip(adminToken);
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
      const data = await deleteAllUserChats(adminToken);
      setDeleteNotice(
        `已删除 ${Number(data?.deletedCount || 0)} 条用户对话状态数据。`,
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

  async function onDebugSend(text, files = []) {
    if (!adminToken || debugLoading) return;
    const agentId = selectedAgent;
    const runtimeConfig =
      runtimeConfigs[agentId] || DEFAULT_AGENT_RUNTIME_CONFIG;
    const content = String(text || "").trim();
    const safeFiles = Array.isArray(files) ? files.filter(Boolean) : [];
    if (!content && safeFiles.length === 0) return;
    const userContent =
      content || (safeFiles.length > 0 ? "请分析我上传的附件内容。" : "");
    setDebugError("");

    const userMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: userContent,
      attachments: safeFiles.map((file) => ({
        name: String(file?.name || ""),
        size: Number(file?.size || 0),
        type: String(file?.type || ""),
      })),
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
          messages: toPreviewMessages([...existing, userMessage]),
          runtimeConfig,
          files: safeFiles,
        },
        {
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

  return (
    <div className="admin-settings-page">
      <div className="admin-settings-shell">
        <header className="admin-settings-topbar">
          <div className="admin-settings-topbar-left">
            <button
              type="button"
              className="admin-icon-btn"
              onClick={onLogoutAdmin}
              title="返回登录页"
              aria-label="返回登录页"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="admin-settings-title-row">
              <h1 className="admin-settings-title">管理员智能体设置</h1>
              <div className="admin-agent-select-wrap">
                <span className="admin-agent-select-icon" aria-hidden="true">
                  <ShieldAlert size={14} />
                </span>
                <AdminPortalSelect
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
              disabled={saving || loading}
            >
              <Save size={16} />
              <span>{saving ? "保存中..." : "保存"}</span>
            </button>

            <div className="admin-export-wrap" ref={menuRef}>
              <button
                type="button"
                className="admin-icon-btn"
                onClick={() => setShowExportMenu((v) => !v)}
                title="导出与数据操作"
                aria-label="导出与数据操作"
              >
                <Download size={18} />
              </button>

              {showExportMenu && (
                <div className="admin-export-menu">
                  <button
                    type="button"
                    className="admin-export-item"
                    onClick={onExportUsers}
                    disabled={!!exportLoading || deleteLoading}
                  >
                    {exportLoading === "users" ? "导出中..." : "导出账号密码数据（TXT）"}
                  </button>
                  <button
                    type="button"
                    className="admin-export-item"
                    onClick={onExportChatsTxt}
                    disabled={!!exportLoading || deleteLoading}
                  >
                    {exportLoading === "chats" ? "导出中..." : "导出聊天数据（TXT）"}
                  </button>
                  <button
                    type="button"
                    className="admin-export-item"
                    onClick={onExportChatsZip}
                    disabled={!!exportLoading || deleteLoading}
                  >
                    {exportLoading === "zip" ? "打包中..." : "导出聊天数据（ZIP 按用户）"}
                  </button>
                  <div className="admin-export-divider" />
                  <button
                    type="button"
                    className="admin-export-item danger"
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={!!exportLoading || deleteLoading}
                  >
                    <Trash2 size={15} />
                    <span>删除所有用户的对话数据</span>
                  </button>
                </div>
              )}
            </div>
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

        <div className="admin-grid">
          <section className="admin-panel">
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
              className="admin-textarea"
              rows={14}
              value={selectedPrompt}
              onChange={(e) => updatePrompt(e.target.value)}
              placeholder="默认为系统提示词：你是用户的助手"
              disabled={loading}
            />

            <div className="admin-tip-card">
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
                <AdminPortalSelect
                  value={selectedRuntime.provider}
                  options={PROVIDER_OPTIONS}
                  onChange={(next) => updateRuntimeField("provider", next)}
                  disabled={loading}
                />
              </div>

              <label className="admin-field-row" htmlFor="admin-runtime-model">
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
                  disabled={loading}
                />
              </label>

              {showVolcenginePanel ? (
                <>
                  <label className="admin-field-row split" htmlFor="admin-runtime-temperature">
                    <span>温度</span>
                    <NumberRuntimeInput
                      id="admin-runtime-temperature"
                      value={selectedRuntime.temperature}
                      min={0}
                      max={2}
                      step={0.1}
                      onChange={(next) => updateRuntimeField("temperature", next)}
                      disabled={loading}
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
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-context-rounds">
                    <span>携带上下文轮数</span>
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

                  <label className="admin-field-row split" htmlFor="admin-runtime-context-window-tokens">
                    <span className="admin-label-with-hint">
                      上下文窗口（Token）
                      <InfoHint text="模型上下文窗口上限，用于记录与校验。推荐按模型官方参数填写。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-context-window-tokens"
                      value={selectedRuntime.contextWindowTokens}
                      min={1024}
                      max={512000}
                      step={1024}
                      onChange={(next) => updateRuntimeField("contextWindowTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-input-tokens">
                    <span className="admin-label-with-hint">
                      最大输入 Token 长度
                      <InfoHint text="单次请求允许输入的 Token 上限，用于记录与校验。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-input-tokens"
                      value={selectedRuntime.maxInputTokens}
                      min={1024}
                      max={512000}
                      step={1024}
                      onChange={(next) => updateRuntimeField("maxInputTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-output-tokens">
                    <span className="admin-label-with-hint">
                      最大输出 Token 长度
                      <InfoHint text="会映射到上游接口的 max_tokens / max_output_tokens。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-output-tokens"
                      value={selectedRuntime.maxOutputTokens}
                      min={64}
                      max={128000}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxOutputTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-reasoning-tokens">
                    <span className="admin-label-with-hint">
                      最大思考内容 Token 长度
                      <InfoHint text="深度思考阶段可使用的 Token 上限。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-reasoning-tokens"
                      value={selectedRuntime.maxReasoningTokens}
                      min={0}
                      max={128000}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxReasoningTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      系统提示词注入系统时间（年月日）
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

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      防止提示词/API 设置泄露
                      <InfoHint text="默认开启。开启后会注入高优先级防泄漏提示词；若用户试图套取内部配置，助手仅回复“我只是你的助手”。" />
                    </span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={selectedRuntime.preventPromptLeak !== false}
                        onChange={(e) =>
                          updateRuntimeField("preventPromptLeak", e.target.checked)
                        }
                        disabled={loading}
                      />
                      <span>{selectedRuntime.preventPromptLeak !== false ? "开启" : "关闭"}</span>
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
                    <span>推理模式</span>
                    <AdminPortalSelect
                      value={selectedRuntime.reasoningEffort}
                      options={REASONING_MODE_OPTIONS}
                      onChange={(next) => updateRuntimeField("reasoningEffort", next)}
                      disabled={loading}
                    />
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

                  <p className="admin-field-note">
                    当前服务商：{selectedProviderName}
                    {selectedRuntime.provider === "inherit" ? "（来自 .env 默认）" : ""}。
                    火山引擎 Ark 仅使用 Responses API，已移除 Chat Completions 选项。
                  </p>
                  <p className={`admin-field-note ${webSearchSupported ? "" : "warning"}`}>
                    {webSearchCapabilityHint}
                  </p>
                  <p className="admin-field-note">{webSearchThinkingHint}</p>
                </>
              ) : (
                <>
                  <label className="admin-field-row split" htmlFor="admin-runtime-temperature">
                    <span>温度</span>
                    <NumberRuntimeInput
                      id="admin-runtime-temperature"
                      value={selectedRuntime.temperature}
                      min={0}
                      max={2}
                      step={0.1}
                      onChange={(next) => updateRuntimeField("temperature", next)}
                      disabled={loading}
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
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-context-rounds">
                    <span>携带上下文轮数</span>
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

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      系统提示词注入系统时间（年月日）
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

                  <div className="admin-field-row split">
                    <span className="admin-label-with-hint">
                      防止提示词/API 设置泄露
                      <InfoHint text="默认开启。开启后会注入高优先级防泄漏提示词；若用户试图套取内部配置，助手仅回复“我只是你的助手”。" />
                    </span>
                    <label className="admin-switch-row">
                      <input
                        type="checkbox"
                        checked={selectedRuntime.preventPromptLeak !== false}
                        onChange={(e) =>
                          updateRuntimeField("preventPromptLeak", e.target.checked)
                        }
                        disabled={loading}
                      />
                      <span>{selectedRuntime.preventPromptLeak !== false ? "开启" : "关闭"}</span>
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

                  <div className="admin-field-row split">
                    <span>推理模式</span>
                    <AdminPortalSelect
                      value={selectedRuntime.reasoningEffort}
                      options={REASONING_MODE_OPTIONS}
                      onChange={(next) => updateRuntimeField("reasoningEffort", next)}
                      disabled={loading || !providerSupportsReasoning}
                    />
                  </div>

                  <label className="admin-field-row split" htmlFor="admin-runtime-context-window-tokens-chat">
                    <span className="admin-label-with-hint">
                      上下文窗口（Token）
                      <InfoHint text="模型上下文窗口上限，用于记录与校验。推荐按模型官方参数填写。" />
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

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-input-tokens-chat">
                    <span className="admin-label-with-hint">
                      最大输入 Token 长度
                      <InfoHint text="单次请求允许输入的 Token 上限，用于记录与校验。" />
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

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-output-tokens-chat">
                    <span className="admin-label-with-hint">
                      最大输出 Token 长度
                      <InfoHint text="会映射到上游接口的 max_tokens / max_output_tokens。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-output-tokens-chat"
                      value={selectedRuntime.maxOutputTokens}
                      min={64}
                      max={128000}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxOutputTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <label className="admin-field-row split" htmlFor="admin-runtime-max-reasoning-tokens-chat">
                    <span className="admin-label-with-hint">
                      最大思考内容 Token 长度
                      <InfoHint text="深度思考阶段可使用的 Token 上限。" />
                    </span>
                    <NumberRuntimeInput
                      id="admin-runtime-max-reasoning-tokens-chat"
                      value={selectedRuntime.maxReasoningTokens}
                      min={0}
                      max={128000}
                      step={64}
                      onChange={(next) => updateRuntimeField("maxReasoningTokens", next)}
                      disabled={loading}
                    />
                  </label>

                  <p className="admin-field-note">
                    当前服务商：{selectedProviderName}
                    {selectedRuntime.provider === "inherit" ? "（来自 .env 默认）" : ""}。
                    该服务商当前仅使用 Chat 协议，Responses 参数已自动隐藏。
                  </p>
                  <p
                    className={`admin-field-note ${providerSupportsReasoning ? "" : "warning"}`}
                  >
                    {providerReasoningHint}
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="admin-panel preview">
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
                showAssistantActions={false}
              />
              <MessageInput
                onSend={onDebugSend}
                disabled={debugLoading || loading}
              />
            </div>
            {debugError ? <p className="admin-preview-error">{debugError}</p> : null}
          </section>
        </div>
      </div>

      {showDeleteConfirm && (
        <div
          className="admin-confirm-overlay"
          role="presentation"
          onClick={() => setShowDeleteConfirm(false)}
        >
          <div
            className="admin-confirm-card"
            role="dialog"
            aria-modal="true"
            aria-label="删除所有用户对话数据"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>删除所有用户的对话数据</h3>
            <p>
              此操作会清空所有用户在数据库中的会话和消息记录，账号信息会保留。
            </p>
            <div className="admin-confirm-actions">
              <button
                type="button"
                className="admin-ghost-btn"
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deleteLoading}
              >
                取消
              </button>
              <button
                type="button"
                className="admin-danger-btn"
                onClick={onDeleteAllChats}
                disabled={deleteLoading}
              >
                {deleteLoading ? "删除中..." : "确认删除"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
