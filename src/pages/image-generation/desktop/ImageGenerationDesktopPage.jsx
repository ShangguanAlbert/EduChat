import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Compass,
  Download,
  GripVertical,
  FolderOpen,
  Grid3x3,
  Heart,
  ImagePlus,
  Images,
  Loader2,
  Pencil,
  Plus,
  Search,
  SendHorizonal,
  Sparkles,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { getUserToken, withAuthSlot } from "../../../app/authStorage.js";
import { stripAppBasePath } from "../../../app/basePath.js";
import {
  clearImageGenerationHistory,
  deleteImageGenerationHistoryItem,
  fetchImageGenerationHistory,
  streamSeedreamGeneration,
} from "../../image/imageApi.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "../../image/returnContext.js";
import imageGenerationTermsMarkdown from "../../../content/image-generation-terms.md?raw";
import "../../../styles/image-generation.css";

const SIZE_OPTIONS = [
  { value: "2K", label: "2K（自适应）" },
  { value: "4K", label: "4K（自适应）" },
  { value: "2048x2048", label: "2048 x 2048" },
  { value: "2560x1440", label: "2560 x 1440（16:9）" },
  { value: "1440x2560", label: "1440 x 2560（9:16）" },
  { value: "2304x1728", label: "2304 x 1728（4:3）" },
  { value: "1728x2304", label: "1728 x 2304（3:4）" },
];
const RESPONSE_FORMAT_OPTIONS = [
  { value: "url", label: "URL" },
  { value: "b64_json", label: "Base64" },
];
const SEEDREAM_MODEL_OPTIONS = [
  { value: "doubao-seedream-4-5-251128", label: "Seedream 4.5" },
  { value: "doubao-seedream-5-0-260128", label: "Seedream 5.0" },
];
const GENERATION_MODE_OPTIONS = [
  { value: "disabled", label: "单图" },
  { value: "auto", label: "组图（auto）" },
];

const HISTORY_LIMIT = 120;
const MAX_REFERENCE_IMAGES = 14;
const GROUP_IMAGE_MAX = 4;
const IMAGE_LQIP_CACHE_LIMIT = 240;
const IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY = "educhat:image-generation:terms-hash";
const IMAGE_LIKED_KEYS_STORAGE_KEY = "educhat:image-generation:liked-keys";
const IMAGE_COLLECTIONS_STORAGE_KEY = "educhat:image-generation:collections";
const IMAGE_TERMS_CONTENT = String(imageGenerationTermsMarkdown || "").trim();
const IMAGE_TERMS_HASH = computeStringHash(IMAGE_TERMS_CONTENT);
const EXPLORE_FILTERS = [
  { key: "explore", label: "探索" },
  { key: "top", label: "热门" },
  { key: "people", label: "人像" },
  { key: "product", label: "产品" },
  { key: "nature", label: "自然" },
  { key: "poster", label: "海报" },
  { key: "logo", label: "标志" },
];

const LIBRARY_VIEWS = [
  { key: "explore", label: "探索", icon: Compass },
  { key: "my-images", label: "我的图片", icon: Images },
  { key: "collections", label: "收藏夹", icon: FolderOpen },
  { key: "likes", label: "我的喜欢", icon: Heart },
];
const LIBRARY_VIEW_KEY_SET = new Set(LIBRARY_VIEWS.map((item) => item.key));
const IMAGE_LQIP_CACHE = new Map();

function computeStringHash(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
}

function readStoredTermsAcceptedHash() {
  try {
    return String(localStorage.getItem(IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY) || "").trim();
  } catch {
    return "";
  }
}

function readStoredLikedKeys() {
  try {
    const raw = String(localStorage.getItem(IMAGE_LIKED_KEYS_STORAGE_KEY) || "");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item || "").trim()).filter(Boolean);
  } catch {
    return [];
  }
}

function readStoredCollections() {
  try {
    const raw = String(localStorage.getItem(IMAGE_COLLECTIONS_STORAGE_KEY) || "");
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((item) => ({
        id: String(item?.id || ""),
        name: String(item?.name || "").trim(),
        coverKey: String(item?.coverKey || "").trim(),
        itemKeys: Array.isArray(item?.itemKeys)
          ? item.itemKeys.map((key) => String(key || "").trim()).filter(Boolean)
          : [],
      }))
      .filter((item) => item.id && item.name);
  } catch {
    return [];
  }
}

function formatHistoryTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePreviewUrl(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (/^\/api\/images\/history\/[a-z0-9]{6,64}\/content(?:\?.*)?$/i.test(stripAppBasePath(text))) {
    return text;
  }
  if (/^https?:\/\//i.test(text)) return text;
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) {
    return text;
  }
  return "";
}

function readImageAuthToken() {
  return getUserToken().trim();
}

function appendAuthTokenToHistoryImageUrl(value, token) {
  const text = String(value || "").trim();
  const safeToken = String(token || "").trim();
  if (!text || !safeToken) return text;
  if (
    !/^\/api\/images\/history\/[a-z0-9]{6,64}\/content(?:\?.*)?$/i.test(
      stripAppBasePath(text),
    )
  ) {
    return text;
  }
  if (typeof window === "undefined") return text;
  try {
    const parsed = new URL(text, window.location.origin);
    if (!parsed.searchParams.get("token")) {
      parsed.searchParams.set("token", safeToken);
    }
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return text;
  }
}

function makeDownloadName(preview) {
  const safeTime = String(preview?.createdAt || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/\s+/g, "-");
  const source = preview?.source === "history" ? "history" : "result";
  return `seedream-${source}-${safeTime}.png`;
}

function normalizeGroupImageCount(value, fallback = GROUP_IMAGE_MAX) {
  const text = String(value ?? "")
    .trim()
    .replace(/[^\d]/g, "");
  if (!text) return fallback;
  const parsed = Number.parseInt(text, 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(GROUP_IMAGE_MAX, parsed));
}

function InlineGlyph({ name, size = 14 }) {
  const iconSize = Number(size) > 0 ? Number(size) : 14;
  const iconMap = {
    check:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='20 6 9 17 4 12'/%3E%3C/svg%3E",
    heart:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20.84 5.61a5.5 5.5 0 0 0-7.78 0L12 6.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78L12 22l8.84-8.61a5.5 5.5 0 0 0 0-7.78z'/%3E%3C/svg%3E",
    folder:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v8A2.5 2.5 0 0 1 18.5 20h-13A2.5 2.5 0 0 1 3 17.5z'/%3E%3C/svg%3E",
    star:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.1' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z'/%3E%3C/svg%3E",
    close:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.6' stroke-linecap='round'%3E%3Cpath d='M6 6l12 12M18 6l-12 12'/%3E%3C/svg%3E",
    trash:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M3 6h18M8 6V4.8A1.8 1.8 0 0 1 9.8 3h4.4A1.8 1.8 0 0 1 16 4.8V6M18.2 6 17.2 19a2 2 0 0 1-2 1.8H8.8a2 2 0 0 1-2-1.8L5.8 6M10 11v6M14 11v6'/%3E%3C/svg%3E",
    refresh:
      "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M23 4v6h-6M1 20v-6h6M3.5 9a9 9 0 0 1 14.4-3.4L23 10M20.5 15a9 9 0 0 1-14.4 3.4L1 14'/%3E%3C/svg%3E",
  };
  const icon = iconMap[name];
  if (!icon) return null;
  return (
    <img
      className="image-inline-glyph"
      src={icon}
      alt=""
      draggable={false}
      style={{
        width: `${iconSize}px`,
        height: `${iconSize}px`,
      }}
      aria-hidden="true"
    />
  );
}

function buildPreviewDedupeKey(item) {
  const fallbackKey = String(item?.key || "").trim();
  const rawUrl = String(item?.url || "").trim();
  if (!rawUrl) {
    return fallbackKey ? `key:${fallbackKey}` : "";
  }
  const historyMatch = stripAppBasePath(rawUrl).match(
    /\/api\/images\/history\/([a-z0-9]{6,64})\/content/i,
  );
  if (historyMatch?.[1]) {
    return `history:${String(historyMatch[1]).toLowerCase()}`;
  }
  if (/^data:image\//i.test(rawUrl)) {
    return `data:${computeStringHash(rawUrl)}`;
  }
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      parsed.searchParams.delete("token");
      return `url:${parsed.origin}${parsed.pathname}${parsed.search}`;
    } catch {
      // ignore parsing error and fallback to raw text
    }
  }
  return `url:${rawUrl}`;
}

function buildImageCacheKey(value) {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) return "";
  if (/^data:image\//i.test(rawUrl)) {
    return `data:${computeStringHash(rawUrl)}`;
  }
  if (/^blob:/i.test(rawUrl)) {
    return `blob:${rawUrl}`;
  }
  if (typeof window !== "undefined") {
    try {
      const parsed = new URL(rawUrl, window.location.origin);
      parsed.searchParams.delete("token");
      return `url:${parsed.origin}${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
      // ignore malformed url and fallback to original text
    }
  }
  return `url:${rawUrl}`;
}

function readCachedLqip(value) {
  const cacheKey = buildImageCacheKey(value);
  if (!cacheKey || !IMAGE_LQIP_CACHE.has(cacheKey)) return "";
  const cached = IMAGE_LQIP_CACHE.get(cacheKey);
  IMAGE_LQIP_CACHE.delete(cacheKey);
  IMAGE_LQIP_CACHE.set(cacheKey, cached);
  return String(cached || "");
}

function writeCachedLqip(value, lqipDataUrl) {
  const cacheKey = buildImageCacheKey(value);
  const safeLqip = String(lqipDataUrl || "").trim();
  if (!cacheKey || !safeLqip) return;
  if (IMAGE_LQIP_CACHE.has(cacheKey)) {
    IMAGE_LQIP_CACHE.delete(cacheKey);
  }
  IMAGE_LQIP_CACHE.set(cacheKey, safeLqip);
  while (IMAGE_LQIP_CACHE.size > IMAGE_LQIP_CACHE_LIMIT) {
    const oldestKey = IMAGE_LQIP_CACHE.keys().next().value;
    if (!oldestKey) break;
    IMAGE_LQIP_CACHE.delete(oldestKey);
  }
}

function buildLqipFromImageElement(imageElement, maxSide = 88) {
  if (typeof document === "undefined") return "";
  const naturalWidth = Number(imageElement?.naturalWidth || 0);
  const naturalHeight = Number(imageElement?.naturalHeight || 0);
  if (!naturalWidth || !naturalHeight) return "";
  const scale = Math.min(1, maxSide / Math.max(naturalWidth, naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) return "";
  try {
    context.drawImage(imageElement, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.56);
  } catch {
    return "";
  }
}

function ProgressiveCachedImage({
  src,
  alt,
  loading = "lazy",
  containerClassName = "",
  imageClassName = "",
}) {
  const safeSrc = String(src || "").trim();
  const [loaded, setLoaded] = useState(false);
  const [thumbSrc, setThumbSrc] = useState(() => readCachedLqip(safeSrc));

  if (!safeSrc) return null;

  const classes = [
    "image-progressive-media",
    thumbSrc ? "has-thumb" : "",
    loaded ? "is-loaded" : "",
    containerClassName,
  ]
    .filter(Boolean)
    .join(" ");
  const style = thumbSrc ? { "--image-lqip": `url("${thumbSrc}")` } : undefined;

  return (
    <span className={classes} style={style}>
      <img
        src={safeSrc}
        alt={alt}
        loading={loading}
        className={imageClassName}
        onLoad={(event) => {
          const cached = readCachedLqip(safeSrc);
          if (!cached) {
            const lqip = buildLqipFromImageElement(event.currentTarget);
            if (lqip) {
              writeCachedLqip(safeSrc, lqip);
              setThumbSrc(lqip);
            }
          }
          setLoaded(true);
        }}
        onError={() => {
          setLoaded(true);
        }}
      />
    </span>
  );
}

function CustomSelect({ label, value, options, onChange, disabled = false }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  const selectedOption = useMemo(() => {
    const list = Array.isArray(options) ? options : [];
    return list.find((item) => item.value === value) || list[0] || null;
  }, [options, value]);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={`image-custom-select${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="image-custom-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={label}
      >
        <span className="image-custom-select-value">{selectedOption?.label || ""}</span>
        <ChevronDown
          size={14}
          className={`image-custom-select-arrow${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div className="image-custom-select-menu" role="listbox" aria-label={label}>
          {(Array.isArray(options) ? options : []).map((item) => {
            const active = item.value === value;
            return (
              <button
                key={item.value}
                type="button"
                className={`image-custom-select-option${active ? " is-active" : ""}`}
                onClick={() => {
                  onChange?.(item.value);
                  setOpen(false);
                }}
                role="option"
                aria-selected={active}
              >
                <span>{item.label}</span>
                {active ? <Check size={14} /> : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MoreSettingsMenu({
  disabled = false,
  responseFormat = "url",
  onResponseFormatChange = null,
  sequentialMode = "disabled",
  maxImagesInput = String(GROUP_IMAGE_MAX),
  onMaxImagesInputChange = null,
  onMaxImagesInputBlur = null,
  watermark = false,
  onWatermarkChange = null,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) {
        setOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [open]);

  return (
    <div className={`image-more-settings${disabled ? " is-disabled" : ""}`} ref={rootRef}>
      <button
        type="button"
        className="image-more-settings-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span>更多</span>
        <ChevronDown
          size={14}
          className={`image-custom-select-arrow${open ? " is-open" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open ? (
        <div className="image-more-settings-menu" role="menu" aria-label="更多设置">
          <label className="image-more-settings-row">
            <span>返回格式</span>
            <select
              value={responseFormat}
              onChange={(event) => onResponseFormatChange?.(event.target.value)}
              disabled={disabled}
            >
              {RESPONSE_FORMAT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label
            className={`image-more-settings-row${
              sequentialMode !== "auto" ? " is-disabled" : ""
            }`}
          >
            <span>组图数量</span>
            <input
              type="text"
              inputMode="numeric"
              value={maxImagesInput}
              disabled={disabled || sequentialMode !== "auto"}
              onChange={(event) => onMaxImagesInputChange?.(event.target.value)}
              onBlur={() => onMaxImagesInputBlur?.()}
              placeholder="1-4"
            />
          </label>

          <label className="image-more-settings-row image-more-settings-switch">
            <span>添加水印</span>
            <input
              type="checkbox"
              checked={watermark}
              onChange={(event) => onWatermarkChange?.(event.target.checked)}
              disabled={disabled}
            />
          </label>
        </div>
      ) : null}
    </div>
  );
}

export default function ImageGenerationDesktopPage({
  isMobileSettingsDrawer = false,
  isSettingsDrawerOpen = false,
} = {}) {
  const navigate = useNavigate();
  const location = useLocation();

  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("doubao-seedream-4-5-251128");
  const [size, setSize] = useState("2K");
  const [sequentialMode, setSequentialMode] = useState("disabled");
  const [maxImagesInput, setMaxImagesInput] = useState(String(GROUP_IMAGE_MAX));
  const [watermark, setWatermark] = useState(false);
  const [responseFormat, setResponseFormat] = useState("url");
  const [imageUrlsText, setImageUrlsText] = useState("");
  const [inputFiles, setInputFiles] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [items, setItems] = useState([]);

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyDeletingId, setHistoryDeletingId] = useState("");
  const [historyClearing, setHistoryClearing] = useState(false);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState("");
  const imageAuthToken = useMemo(() => readImageAuthToken(), []);
  const [termsAgreed, setTermsAgreed] = useState(
    () => readStoredTermsAcceptedHash() === IMAGE_TERMS_HASH,
  );
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [exploreFilter, setExploreFilter] = useState("explore");
  const [likedKeys, setLikedKeys] = useState(() => readStoredLikedKeys());
  const [collections, setCollections] = useState(() => readStoredCollections());
  const [activeCollectionId, setActiveCollectionId] = useState("");
  const [collectionDialogMode, setCollectionDialogMode] = useState("");
  const [collectionDialogDraft, setCollectionDialogDraft] = useState("");
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);
  const [collectionBatchMode, setCollectionBatchMode] = useState(false);
  const [collectionSelectedKeys, setCollectionSelectedKeys] = useState([]);
  const [dragCollectionId, setDragCollectionId] = useState("");
  const [previewDialogKey, setPreviewDialogKey] = useState("");
  const [referenceMenuOpen, setReferenceMenuOpen] = useState(false);
  const [referenceMenuMode, setReferenceMenuMode] = useState("local");
  const [referenceUrlDraft, setReferenceUrlDraft] = useState("");
  const collectionMenuRef = useRef(null);
  const referenceMenuRef = useRef(null);
  const referenceFileInputRef = useRef(null);

  const returnContextFromState = normalizeImageReturnContext(
    location.state?.returnContext || location.state?.restoreContext,
  );
  const returnTarget = useMemo(() => {
    try {
      const params = new URLSearchParams(String(location.search || ""));
      const target = String(params.get("returnTo") || "")
        .trim()
        .toLowerCase();
      if (target === "mode-selection" || target === "student-home") {
        return "mode-selection";
      }
      if (target === "teacher-home" || target === "admin-home") {
        return "teacher-home";
      }
    } catch {
      // Ignore malformed query and fall back to chat.
    }
    return "chat";
  }, [location.search]);
  const teacherHomePanelParam = useMemo(() => {
    try {
      const params = new URLSearchParams(String(location.search || ""));
      return String(params.get("teacherPanel") || "").trim().toLowerCase();
    } catch {
      return "";
    }
  }, [location.search]);
  const teacherHomeExportContext = useMemo(() => {
    try {
      const params = new URLSearchParams(String(location.search || ""));
      return {
        exportTeacherScopeKey: String(params.get("exportTeacherScopeKey") || "").trim(),
        exportDate: String(params.get("exportDate") || "").trim(),
      };
    } catch {
      return {
        exportTeacherScopeKey: "",
        exportDate: "",
      };
    }
  }, [location.search]);
  const backButtonLabel = returnTarget === "teacher-home" ? "返回教师主页" : "返回";
  const backButtonStatusLabel = useMemo(() => {
    if (returnTarget === "teacher-home") return "教师端";
    if (returnTarget === "mode-selection") return "课时页";
    return "对话";
  }, [returnTarget]);
  const termsContent = IMAGE_TERMS_CONTENT;
  const termsHash = IMAGE_TERMS_HASH;
  const termsLocked = !termsAgreed;
  const termsLockTipText = isMobileSettingsDrawer
    ? "请先同意《图片生成功能服务条款》，再使用图片生成能力。"
    : "请先在右下角弹窗中同意《图片生成功能服务条款》，再使用图片生成能力。";
  const pathParts = String(location.pathname || "")
    .split("/")
    .filter(Boolean);
  const pathLibraryView = pathParts[1] || "";
  const libraryView = LIBRARY_VIEW_KEY_SET.has(pathLibraryView) ? pathLibraryView : "explore";

  const imageUrls = useMemo(() => {
    const deduped = new Set();
    return String(imageUrlsText || "")
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter((item) => item.length > 0)
      .filter((item) => {
        if (deduped.has(item)) return false;
        deduped.add(item);
        return true;
      })
      .slice(0, MAX_REFERENCE_IMAGES);
  }, [imageUrlsText]);

  const inputFilePreviewItems = useMemo(() => {
    return inputFiles.map((file, index) => ({
      key: `${file.name}-${file.lastModified}-${index}`,
      file,
      previewUrl: URL.createObjectURL(file),
    }));
  }, [inputFiles]);

  useEffect(() => {
    return () => {
      inputFilePreviewItems.forEach((item) => {
        try {
          URL.revokeObjectURL(item.previewUrl);
        } catch {
          // ignore revoke failure
        }
      });
    };
  }, [inputFilePreviewItems]);

  const generatedPreviewItems = useMemo(() => {
    return (Array.isArray(items) ? items : [])
      .map((item) => {
        const status = item?.status === "failed" || item?.status === "succeeded" ? item.status : "pending";
        const normalizedUrl = normalizePreviewUrl(item?.url);
        const resolvedStatus = status === "succeeded" && !normalizedUrl ? "pending" : status;
        return {
          key: `generated-${item.imageIndex}`,
          source: "generated",
          status: resolvedStatus,
          imageIndex: Number(item.imageIndex),
          url: normalizedUrl,
          size: String(item.size || ""),
          model: String(item.model || ""),
          prompt: String(item.prompt || "").trim(),
          responseFormat: String(item.responseFormat || "url"),
          createdAt: item?.createdAt || new Date().toISOString(),
          errorMessage: String(item.errorMessage || ""),
        };
      })
      .filter((item) => Number.isFinite(item.imageIndex) && item.imageIndex >= 0)
      .sort((a, b) => a.imageIndex - b.imageIndex);
  }, [items]);

  const historyPreviewItems = useMemo(() => {
    return (Array.isArray(historyItems) ? historyItems : [])
      .map((item) => ({
        key: `history-${item.id}`,
        source: "history",
        id: String(item.id || ""),
        imageIndex: -1,
        url: normalizePreviewUrl(item.url),
        size: String(item.size || ""),
        model: String(item.model || ""),
        prompt: String(item.prompt || ""),
        responseFormat: String(item.responseFormat || "url"),
        createdAt: item.createdAt || new Date().toISOString(),
      }))
      .filter((item) => !!item.id && !!item.url);
  }, [historyItems]);

  const previewMap = useMemo(() => {
    const map = new Map();
    generatedPreviewItems.forEach((item) => {
      if (!item.url) return;
      map.set(item.key, item);
    });
    historyPreviewItems.forEach((item) => {
      map.set(item.key, item);
    });
    return map;
  }, [generatedPreviewItems, historyPreviewItems]);

  const selectedPreview = useMemo(() => {
    if (!previewDialogKey) return null;
    if (!previewMap.has(previewDialogKey)) return null;
    return previewMap.get(previewDialogKey) || null;
  }, [previewDialogKey, previewMap]);
  const selectedPreviewUrl = useMemo(
    () => appendAuthTokenToHistoryImageUrl(selectedPreview?.url, imageAuthToken),
    [selectedPreview?.url, imageAuthToken],
  );
  const galleryItems = useMemo(() => {
    const merged = [...generatedPreviewItems, ...historyPreviewItems];
    const seen = new Set();
    return merged.filter((item) => {
      const dedupeKey = buildPreviewDedupeKey(item);
      if (!dedupeKey) return false;
      if (seen.has(dedupeKey)) return false;
      seen.add(dedupeKey);
      return true;
    });
  }, [generatedPreviewItems, historyPreviewItems]);
  const likedKeySet = useMemo(() => new Set(likedKeys), [likedKeys]);
  const likedItems = useMemo(
    () => galleryItems.filter((item) => likedKeySet.has(item.key)),
    [galleryItems, likedKeySet],
  );
  const activeCollection = useMemo(
    () => collections.find((item) => item.id === activeCollectionId) || null,
    [collections, activeCollectionId],
  );
  const collectionItems = useMemo(() => {
    if (!activeCollection) return [];
    return activeCollection.itemKeys
      .map((key) => previewMap.get(key))
      .filter(Boolean);
  }, [activeCollection, previewMap]);
  const exploreItems = useMemo(() => {
    const pendingItems = galleryItems.filter((item) => item.source === "generated" && item.status === "pending");
    const settledItems = galleryItems.filter((item) => !(item.source === "generated" && item.status === "pending"));
    if (exploreFilter === "explore" || exploreFilter === "top") {
      return [...pendingItems, ...settledItems];
    }
    const filterSeed = EXPLORE_FILTERS.findIndex((item) => item.key === exploreFilter);
    if (filterSeed <= 0) return [...pendingItems, ...settledItems];
    return [
      ...pendingItems,
      ...settledItems.filter((item, index) => (index + filterSeed) % 3 !== 0),
    ];
  }, [exploreFilter, galleryItems]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (termsLocked) return;
    if (!silent) {
      setHistoryLoading(true);
    }
    setHistoryError("");
    try {
      const data = await fetchImageGenerationHistory({ limit: HISTORY_LIMIT });
      const nextItems = Array.isArray(data?.items) ? data.items : [];
      setHistoryItems(nextItems);
      return nextItems;
    } catch (error) {
      setHistoryError(error?.message || "读取历史生成图片失败，请稍后再试。");
      return null;
    } finally {
      if (!silent) {
        setHistoryLoading(false);
      }
    }
  }, [termsLocked]);

  const refreshHistoryAfterGeneration = useCallback(async () => {
    if (termsLocked) return;
    setItems([]);
    await loadHistory({ silent: true });
    window.setTimeout(async () => {
      await loadHistory({ silent: true });
    }, 520);
  }, [loadHistory, termsLocked]);

  useEffect(() => {
    if (!returnContextFromState) return;
    saveImageReturnContext(returnContextFromState);
  }, [returnContextFromState]);

  useEffect(() => {
    if (termsLocked) {
      setHistoryItems([]);
      setHistoryLoading(false);
      return;
    }
    loadHistory();
  }, [loadHistory, termsLocked]);

  useEffect(() => {
    if (!selectedPreviewKey) return;
    if (previewMap.has(selectedPreviewKey)) return;
    setSelectedPreviewKey("");
  }, [previewMap, selectedPreviewKey]);

  useEffect(() => {
    if (!previewDialogKey) return;
    if (previewMap.has(previewDialogKey)) return;
    setPreviewDialogKey("");
  }, [previewDialogKey, previewMap]);

  useEffect(() => {
    try {
      localStorage.setItem(IMAGE_LIKED_KEYS_STORAGE_KEY, JSON.stringify(likedKeys));
    } catch {
      // ignore storage write failures
    }
  }, [likedKeys]);

  useEffect(() => {
    try {
      localStorage.setItem(IMAGE_COLLECTIONS_STORAGE_KEY, JSON.stringify(collections));
    } catch {
      // ignore storage write failures
    }
  }, [collections]);

  useEffect(() => {
    if (collections.length === 0) {
      setActiveCollectionId("");
      return;
    }
    if (collections.some((item) => item.id === activeCollectionId)) return;
    setActiveCollectionId(collections[0].id);
  }, [activeCollectionId, collections]);

  useEffect(() => {
    if (pathLibraryView && LIBRARY_VIEW_KEY_SET.has(pathLibraryView)) return;
    const pathname = "/image-generation/explore";
    navigate(
      {
        pathname,
        search: location.search || "",
      },
      { replace: true },
    );
  }, [location.search, navigate, pathLibraryView]);

  useEffect(() => {
    if (libraryView !== "collections") {
      setCollectionMenuOpen(false);
      setCollectionBatchMode(false);
      setCollectionSelectedKeys([]);
    }
  }, [libraryView]);

  useEffect(() => {
    if (!collectionMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!collectionMenuRef.current?.contains(event.target)) {
        setCollectionMenuOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setCollectionMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [collectionMenuOpen]);

  useEffect(() => {
    if (!referenceMenuOpen) return undefined;
    function handlePointerDown(event) {
      if (!referenceMenuRef.current?.contains(event.target)) {
        setReferenceMenuOpen(false);
      }
    }
    function handleEscape(event) {
      if (event.key === "Escape") {
        setReferenceMenuOpen(false);
      }
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleEscape);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleEscape);
    };
  }, [referenceMenuOpen]);

  function handleBackToChat() {
    if (returnTarget === "mode-selection") {
      navigate(withAuthSlot("/mode-selection"));
      return;
    }
    if (returnTarget === "teacher-home") {
      const params = new URLSearchParams();
      if (teacherHomePanelParam) {
        params.set("teacherPanel", teacherHomePanelParam);
      }
      if (teacherHomeExportContext.exportTeacherScopeKey) {
        params.set("exportTeacherScopeKey", teacherHomeExportContext.exportTeacherScopeKey);
      }
      if (teacherHomeExportContext.exportDate) {
        params.set("exportDate", teacherHomeExportContext.exportDate);
      }
      const query = params.toString() ? `/admin/settings?${params.toString()}` : "/admin/settings";
      navigate(withAuthSlot(query));
      return;
    }
    const storedContext = loadImageReturnContext();
    const context = returnContextFromState || storedContext || null;
    const safeSessionId = String(context?.sessionId || "").trim();
    const chatPath = safeSessionId
      ? `/c/${encodeURIComponent(safeSessionId)}`
      : "/c";
    navigate(withAuthSlot(chatPath), {
      state: {
        fromImageGeneration: true,
        restoreContext: context,
      },
    });
  }

  function navigateLibraryView(nextView) {
    const safeView = LIBRARY_VIEW_KEY_SET.has(nextView) ? nextView : "explore";
    navigate(
      {
        pathname: `/image-generation/${safeView}`,
        search: location.search || "",
      },
      { replace: false },
    );
  }

  function handleTermsAgreedChange(nextValue) {
    const agreed = !!nextValue;
    setTermsAgreed(agreed);
    setHistoryError("");
    if (agreed) {
      try {
        localStorage.setItem(IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY, termsHash);
      } catch {
        // ignore storage write failures
      }
      return;
    }
    try {
      localStorage.removeItem(IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY);
    } catch {
      // ignore storage write failures
    }
  }

  function updateItem(imageIndex, patch) {
    setItems((prev) => {
      const idx = prev.findIndex((item) => item.imageIndex === imageIndex);
      if (idx === -1) {
        return [...prev, { imageIndex, ...patch }].sort(
          (a, b) => a.imageIndex - b.imageIndex,
        );
      }
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  }

  async function handleGenerate(event) {
    event?.preventDefault?.();
    if (termsLocked) {
      setErrorText("请先勾选并同意《图片生成功能服务条款》。");
      return;
    }
    if (isGenerating) return;
    const promptSnapshot = prompt.trim();
    if (!promptSnapshot) {
      setErrorText("请输入用于图片生成的提示词。");
      return;
    }

    const resolvedMaxImages =
      sequentialMode === "auto"
        ? normalizeGroupImageCount(maxImagesInput, GROUP_IMAGE_MAX)
        : 1;

    setIsGenerating(true);
    setErrorText("");
    const initTime = new Date().toISOString();
    setItems(
      Array.from({ length: resolvedMaxImages }, (_, index) => ({
        imageIndex: index,
        status: "pending",
        size,
        model,
        prompt: promptSnapshot,
        responseFormat,
        url: "",
        errorMessage: "",
        createdAt: initTime,
      })),
    );
    setPrompt("");
    setSelectedPreviewKey("");

    let streamError = "";
    let shouldRefreshHistory = false;
    let sawDoneEvent = false;

    try {
      await streamSeedreamGeneration({
        prompt: promptSnapshot,
        model,
        size,
        sequentialMode,
        maxImages: resolvedMaxImages,
        watermark,
        responseFormat,
        stream: true,
        imageUrls,
        files: inputFilePreviewItems.map((item) => item.file),
        handlers: {
          onImagePartial: (payload) => {
            const imageIndex = Number(payload?.imageIndex);
            if (!Number.isFinite(imageIndex)) return;
            const directUrl = String(payload?.url || "").trim();
            const b64Json = String(payload?.b64Json || "").trim();
            const resolvedUrl = normalizePreviewUrl(
              directUrl || (b64Json ? `data:image/png;base64,${b64Json}` : ""),
            );
            if (!resolvedUrl) return;
            shouldRefreshHistory = true;
            updateItem(imageIndex, {
              imageIndex,
              status: "succeeded",
              size: String(payload?.size || ""),
              model: String(payload?.model || ""),
              prompt: promptSnapshot,
              responseFormat,
              url: resolvedUrl,
              errorMessage: "",
              createdAt: new Date().toISOString(),
            });
            setSelectedPreviewKey((prev) => {
              if (prev.startsWith("generated-")) return prev;
              return `generated-${imageIndex}`;
            });
          },
          onImageFailed: (payload) => {
            const imageIndex = Number(payload?.imageIndex);
            if (!Number.isFinite(imageIndex)) return;
            updateItem(imageIndex, {
              imageIndex,
              status: "failed",
              errorCode: String(payload?.errorCode || ""),
              errorMessage: String(payload?.errorMessage || "图片生成失败。"),
              prompt: promptSnapshot,
              responseFormat,
              size: "",
              url: "",
            });
          },
          onError: (message) => {
            streamError = String(message || "图片生成失败。");
          },
          onDone: () => {
            sawDoneEvent = true;
            shouldRefreshHistory = true;
          },
        },
      });

      if (streamError) {
        throw new Error(streamError);
      }
    } catch (error) {
      setErrorText(error?.message || "图片生成失败，请稍后再试。");
    } finally {
      setIsGenerating(false);
      if (shouldRefreshHistory || sawDoneEvent) {
        void refreshHistoryAfterGeneration();
      }
    }
  }

  async function handleDeleteHistory(itemId, event) {
    event?.stopPropagation?.();
    if (termsLocked) return;
    const safeId = String(itemId || "").trim();
    if (!safeId || historyDeletingId) return;

    setHistoryDeletingId(safeId);
    setHistoryError("");
    try {
      await deleteImageGenerationHistoryItem(safeId);
      setHistoryItems((prev) => prev.filter((item) => String(item.id || "") !== safeId));
      setSelectedPreviewKey((prev) =>
        prev === `history-${safeId}` ? "" : prev,
      );
    } catch (error) {
      setHistoryError(error?.message || "删除历史图片失败，请稍后再试。");
    } finally {
      setHistoryDeletingId("");
    }
  }

  async function handleClearHistory() {
    if (termsLocked) return;
    if (historyClearing || historyPreviewItems.length === 0) return;
    if (!window.confirm("确认要清空全部历史生成图片吗？")) {
      return;
    }

    setHistoryClearing(true);
    setHistoryError("");
    try {
      await clearImageGenerationHistory();
      setHistoryItems([]);
      setSelectedPreviewKey((prev) => (prev.startsWith("history-") ? "" : prev));
    } catch (error) {
      setHistoryError(error?.message || "批量清空历史失败，请稍后再试。");
    } finally {
      setHistoryClearing(false);
    }
  }

  function resolvePreviewUrl(item) {
    return appendAuthTokenToHistoryImageUrl(item?.url, imageAuthToken);
  }

  function toggleLikeItem(itemKey) {
    const safeKey = String(itemKey || "").trim();
    if (!safeKey) return;
    setLikedKeys((prev) => {
      if (prev.includes(safeKey)) {
        return prev.filter((key) => key !== safeKey);
      }
      return [safeKey, ...prev];
    });
  }

  function addItemToCollection(itemKey, targetCollectionId = "") {
    const safeKey = String(itemKey || "").trim();
    if (!safeKey) return;
    const preferredId = String(targetCollectionId || activeCollectionId || "").trim();
    let resolvedCollectionId = preferredId;
    setCollections((prev) => {
      let next = [...prev];
      let collectionId = preferredId;
      if (!collectionId || !next.some((item) => item.id === collectionId)) {
        const createdId = `collection-${Date.now().toString(36)}`;
        next = [
          {
            id: createdId,
            name: "默认收藏夹",
            coverKey: safeKey,
            itemKeys: [],
          },
          ...next,
        ];
        collectionId = createdId;
      }
      resolvedCollectionId = collectionId;
      next = next.map((item) => {
        if (item.id !== collectionId) return item;
        if (item.itemKeys.includes(safeKey)) return item;
        return {
          ...item,
          coverKey: item.coverKey || safeKey,
          itemKeys: [safeKey, ...item.itemKeys],
        };
      });
      return next;
    });
    setActiveCollectionId(resolvedCollectionId || preferredId || activeCollectionId);
  }

  function openCreateCollectionDialog() {
    setCollectionDialogMode("create");
    setCollectionDialogDraft("新收藏夹");
    setCollectionMenuOpen(false);
  }

  function handleRemoveFromCollection(itemKey) {
    if (!activeCollectionId) return;
    const safeKey = String(itemKey || "").trim();
    setCollections((prev) =>
      prev.map((item) =>
        item.id === activeCollectionId
          ? {
              ...item,
              coverKey: item.coverKey === safeKey ? "" : item.coverKey,
              itemKeys: item.itemKeys.filter((key) => key !== safeKey),
            }
          : item,
      ),
    );
  }

  function openRenameCollectionDialog() {
    if (!activeCollectionId) return;
    setCollectionDialogMode("rename");
    setCollectionDialogDraft(activeCollection?.name || "");
    setCollectionMenuOpen(false);
  }

  function submitCollectionDialog() {
    const safeName = String(collectionDialogDraft || "").trim();
    if (!safeName) return;
    if (collectionDialogMode === "create") {
      const nextId = `collection-${Date.now().toString(36)}`;
      setCollections((prev) => [{ id: nextId, name: safeName, coverKey: "", itemKeys: [] }, ...prev]);
      setActiveCollectionId(nextId);
      setCollectionDialogMode("");
      setCollectionDialogDraft("");
      return;
    }
    if (collectionDialogMode === "rename" && activeCollectionId) {
      setCollections((prev) =>
        prev.map((item) => (item.id === activeCollectionId ? { ...item, name: safeName } : item)),
      );
      setCollectionDialogMode("");
      setCollectionDialogDraft("");
    }
  }

  function handleDeleteCollection(collectionId = activeCollectionId) {
    const safeId = String(collectionId || "").trim();
    if (!safeId) return;
    setCollections((prev) => prev.filter((item) => item.id !== safeId));
    if (activeCollectionId === safeId) {
      setActiveCollectionId("");
    }
    setCollectionSelectedKeys([]);
    setCollectionBatchMode(false);
  }

  function reorderCollections(fromId, toId) {
    if (!fromId || !toId || fromId === toId) return;
    setCollections((prev) => {
      const next = [...prev];
      const fromIndex = next.findIndex((item) => item.id === fromId);
      const toIndex = next.findIndex((item) => item.id === toId);
      if (fromIndex < 0 || toIndex < 0) return prev;
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }

  function setCollectionCover(itemKey) {
    const safeKey = String(itemKey || "").trim();
    if (!activeCollectionId || !safeKey) return;
    setCollections((prev) =>
      prev.map((item) =>
        item.id === activeCollectionId
          ? {
              ...item,
              coverKey: safeKey,
              itemKeys: item.itemKeys.includes(safeKey)
                ? item.itemKeys
                : [safeKey, ...item.itemKeys],
            }
          : item,
      ),
    );
  }

  function toggleCollectionSelect(itemKey) {
    const safeKey = String(itemKey || "").trim();
    if (!safeKey) return;
    setCollectionSelectedKeys((prev) =>
      prev.includes(safeKey) ? prev.filter((key) => key !== safeKey) : [...prev, safeKey],
    );
  }

  function handleCollectionBatchRemove() {
    if (!activeCollectionId || collectionSelectedKeys.length === 0) return;
    const selectedSet = new Set(collectionSelectedKeys);
    setCollections((prev) =>
      prev.map((item) => {
        if (item.id !== activeCollectionId) return item;
        const nextKeys = item.itemKeys.filter((key) => !selectedSet.has(key));
        return {
          ...item,
          coverKey: selectedSet.has(item.coverKey) ? "" : item.coverKey,
          itemKeys: nextKeys,
        };
      }),
    );
    setCollectionSelectedKeys([]);
  }

  function handleAddReferenceUrl() {
    const safeUrl = String(referenceUrlDraft || "").trim();
    if (!safeUrl) return;
    setImageUrlsText((prev) => {
      const combined = String(prev || "")
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter(Boolean);
      combined.unshift(safeUrl);
      const deduped = [];
      combined.forEach((item) => {
        if (!deduped.includes(item)) deduped.push(item);
      });
      return deduped.slice(0, MAX_REFERENCE_IMAGES).join("\n");
    });
    setReferenceUrlDraft("");
  }

  function handleRemoveReferenceUrl(value) {
    const safeValue = String(value || "").trim();
    if (!safeValue) return;
    setImageUrlsText((prev) =>
      String(prev || "")
        .split(/\n|,/)
        .map((item) => item.trim())
        .filter((item) => item && item !== safeValue)
        .join("\n"),
    );
  }

  function renderGallery(itemsList, options = {}) {
    const emptyText = options.emptyText || "暂无图片";
    const allowHistoryDelete = !!options.allowHistoryDelete;
    const allowRemoveFromCollection = !!options.allowRemoveFromCollection;
    const enableSelectMode = !!options.enableSelectMode;
    const selectedKeySet = options.selectedKeySet || new Set();
    const onToggleSelect = options.onToggleSelect || null;
    const coverKey = String(options.coverKey || "").trim();
    const onSetCover = options.onSetCover || null;
    if (historyLoading && itemsList === historyPreviewItems) {
      return (
        <div className="image-gallery-empty">
          <Loader2 size={18} className="spin" />
          <span>历史加载中...</span>
        </div>
      );
    }
    if (!Array.isArray(itemsList) || itemsList.length === 0) {
      return (
        <div className="image-gallery-empty">
          <ImagePlus size={18} />
          <span>{emptyText}</span>
        </div>
      );
    }

    return (
      <div className="image-gallery-grid">
        {itemsList.map((item) => {
          const safeUrl = resolvePreviewUrl(item);
          const pending = item.source === "generated" && item.status === "pending";
          const failed = item.source === "generated" && item.status === "failed";
          const canOpenPreview = !!safeUrl && !pending && !failed;
          const liked = likedKeySet.has(item.key);
          const deleting =
            allowHistoryDelete &&
            item.source === "history" &&
            historyDeletingId &&
            historyDeletingId === item.id;
          return (
            <article
              key={item.key}
              className={`image-gallery-card${pending ? " is-pending" : ""}${failed ? " is-failed" : ""}`}
            >
              {canOpenPreview ? (
                <button
                  type="button"
                  className="image-gallery-media"
                  onClick={() => setPreviewDialogKey(item.key)}
                  title={item.prompt || "查看大图"}
                >
                  <ProgressiveCachedImage
                    key={safeUrl}
                    src={safeUrl}
                    alt={item.prompt || "生成图片"}
                    loading="lazy"
                    containerClassName="image-gallery-media-progressive"
                    imageClassName="image-gallery-media-image"
                  />
                </button>
              ) : (
                <div className="image-gallery-media image-gallery-media-placeholder" aria-hidden="true">
                  <div className="image-gallery-loading">
                    {failed ? (
                      <span className="image-gallery-loading-text is-error">
                        {item.errorMessage || "图片生成失败"}
                      </span>
                    ) : (
                      <>
                        <Loader2 size={18} className="spin" />
                        <span className="image-gallery-loading-text">正在生成图片...</span>
                      </>
                    )}
                  </div>
                </div>
              )}
              <div className="image-gallery-foot">
                <p>{item.prompt || (pending ? "正在生成..." : "未提供提示词")}</p>
                <div className="image-gallery-foot-row">
                  <span>
                    {pending ? "处理中..." : failed ? "生成失败" : formatHistoryTime(item.createdAt)}
                  </span>
                  <span>{item.responseFormat === "b64_json" ? "Base64" : "URL"}</span>
                </div>
              </div>
              {!pending && !failed ? (
                <div className="image-gallery-actions">
                {enableSelectMode ? (
                  <button
                    type="button"
                    className={`image-gallery-action${
                      selectedKeySet.has(item.key) ? " is-active" : ""
                    }`}
                    onClick={() => onToggleSelect?.(item.key)}
                    title="选择图片"
                    aria-label="选择图片"
                    data-tip={selectedKeySet.has(item.key) ? "取消选择" : "选择图片"}
                  >
                    <InlineGlyph name="check" size={13} />
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`image-gallery-action${liked ? " is-active" : ""}`}
                  onClick={() => toggleLikeItem(item.key)}
                  title={liked ? "取消喜欢" : "加入喜欢"}
                  aria-label={liked ? "取消喜欢" : "加入喜欢"}
                  data-tip={liked ? "取消喜欢" : "加入喜欢"}
                >
                  <InlineGlyph name="heart" size={13} />
                </button>
                <button
                  type="button"
                  className="image-gallery-action"
                  onClick={() => addItemToCollection(item.key)}
                  title="加入收藏夹"
                  aria-label="加入收藏夹"
                  data-tip="加入收藏夹"
                >
                  <InlineGlyph name="folder" size={13} />
                </button>
                {typeof onSetCover === "function" ? (
                  <button
                    type="button"
                    className={`image-gallery-action${coverKey === item.key ? " is-active" : ""}`}
                    onClick={() => onSetCover(item.key)}
                    title="设为封面"
                    aria-label="设为封面"
                    data-tip={coverKey === item.key ? "已设为封面" : "设为封面"}
                  >
                    <InlineGlyph name="star" size={13} />
                  </button>
                ) : null}
                {allowRemoveFromCollection ? (
                  <button
                    type="button"
                    className="image-gallery-action"
                    onClick={() => handleRemoveFromCollection(item.key)}
                    title="从收藏夹移除"
                    aria-label="从收藏夹移除"
                    data-tip="移出收藏夹"
                  >
                    <InlineGlyph name="close" size={13} />
                  </button>
                ) : null}
                {allowHistoryDelete && item.source === "history" ? (
                  <button
                    type="button"
                    className="image-gallery-action is-danger"
                    onClick={(event) => handleDeleteHistory(item.id, event)}
                    disabled={termsLocked || deleting || historyClearing}
                    title="删除此图片"
                    aria-label="删除此图片"
                    data-tip="删除图片"
                  >
                    {deleting ? <Loader2 size={13} className="spin" /> : <InlineGlyph name="trash" size={13} />}
                  </button>
                ) : null}
              </div>
              ) : null}
              {coverKey === item.key ? <span className="image-gallery-cover-badge">封面</span> : null}
            </article>
          );
        })}
      </div>
    );
  }

  return (
    <div className="image-page">
      <div className={`image-terms-lock-tip${termsLocked ? "" : " is-hidden"}`} aria-hidden={!termsLocked}>
        {termsLockTipText}
      </div>

      <form className={`image-workspace image-ideogram-layout${termsLocked ? " is-locked" : ""}`} onSubmit={handleGenerate}>
        <aside className="image-ideogram-sidebar">
          <div className="image-ideogram-sidebar-top">
            <div className="image-ideogram-brand-row">
              <div className="image-ideogram-brand-mark" aria-hidden="true">
                <Sparkles size={18} />
              </div>
              <div className="image-ideogram-brand-copy">
                <strong className="image-ideogram-brand-title">图片工坊</strong>
                <span className="image-ideogram-brand-subtitle">图像生成与灵感工作台</span>
              </div>
            </div>
          </div>

          <div className="image-ideogram-sidebar-list">
            <div className="image-ideogram-workbench">
              <div className="image-ideogram-section-label">工作台</div>
              <nav className="image-ideogram-nav" aria-label="图片生成功能导航">
                {LIBRARY_VIEWS.map((view) => {
                  const Icon = view.icon;
                  const active = libraryView === view.key;
                  return (
                    <button
                      key={view.key}
                      type="button"
                      className={`image-ideogram-nav-btn${active ? " is-active" : ""}`}
                      onClick={() => navigateLibraryView(view.key)}
                    >
                      <Icon size={18} />
                      <span>{view.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>

          <div className="image-ideogram-sidebar-bottom">
            <button
              type="button"
              className="image-side-back-btn"
              onClick={handleBackToChat}
              title={backButtonLabel}
              aria-label={backButtonLabel}
            >
              <ArrowLeft size={18} />
              <span>{backButtonLabel}</span>
              <span className="image-side-back-status">{backButtonStatusLabel}</span>
            </button>
          </div>
        </aside>

        <section className="image-ideogram-main">
          {errorText ? (
            <div className="image-error image-ideogram-error" role="alert">
              <span>{errorText}</span>
              <button
                type="button"
                className="image-error-close"
                onClick={() => setErrorText("")}
                aria-label="关闭报错"
                title="关闭报错"
              >
                <span className="image-close-mini" aria-hidden="true">
                  ×
                </span>
              </button>
            </div>
          ) : null}

          <section className="image-ideogram-hero">
            <h2>你想要生成什么？</h2>
            <div
              id="image-settings-panel"
              className={`image-floating-composer${
                isMobileSettingsDrawer ? " image-setting-toolbar-mobile-drawer" : ""
              }${isSettingsDrawerOpen ? " is-drawer-open" : ""}`}
              aria-hidden={isMobileSettingsDrawer ? !isSettingsDrawerOpen : undefined}
            >
              {inputFilePreviewItems.length > 0 ? (
                <div className="image-reference-files" role="list" aria-label="参考图列表">
                  {inputFilePreviewItems.map((item, index) => (
                    <div key={item.key} className="image-reference-file">
                      <img src={item.previewUrl} alt="参考图缩略图" />
                      <button
                        type="button"
                        aria-label="移除参考图"
                        title="移除参考图"
                        disabled={termsLocked}
                        onClick={() => {
                          setInputFiles((prev) => prev.filter((_, i) => i !== index));
                        }}
                      >
                        <span className="image-close-mini" aria-hidden="true">
                          ×
                        </span>
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <textarea
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                className="image-floating-input"
                rows={1}
                placeholder="描述你想生成的画面..."
                disabled={termsLocked}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  handleGenerate(event);
                }}
              />

              <div className="image-floating-toolbar">
                <div className="image-reference-menu" ref={referenceMenuRef}>
                  <button
                    type="button"
                    className="image-upload-trigger"
                    title="上传参考图"
                    aria-label="上传参考图"
                    onClick={() => setReferenceMenuOpen((prev) => !prev)}
                  >
                    <Upload size={16} />
                    <span>参考图</span>
                    <ChevronDown
                      size={14}
                      className={`image-custom-select-arrow${referenceMenuOpen ? " is-open" : ""}`}
                    />
                  </button>
                  <input
                    ref={referenceFileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif"
                    multiple
                    className="image-reference-file-input"
                    disabled={termsLocked}
                    onChange={(event) => {
                      const files = Array.from(event.target.files || []).slice(0, MAX_REFERENCE_IMAGES);
                      setInputFiles(files);
                      setReferenceMenuOpen(false);
                      event.target.value = "";
                    }}
                  />
                  {referenceMenuOpen ? (
                    <div className="image-reference-menu-panel">
                      <button
                        type="button"
                        className={`image-reference-menu-item${
                          referenceMenuMode === "local" ? " is-active" : ""
                        }`}
                        onClick={() => {
                          setReferenceMenuMode("local");
                          referenceFileInputRef.current?.click();
                        }}
                      >
                        本地图片
                      </button>
                      <button
                        type="button"
                        className={`image-reference-menu-item${
                          referenceMenuMode === "url" ? " is-active" : ""
                        }`}
                        onClick={() => setReferenceMenuMode("url")}
                      >
                        URL 链接
                      </button>
                      {referenceMenuMode === "url" ? (
                        <div className="image-reference-url-editor">
                          <input
                            value={referenceUrlDraft}
                            onChange={(event) => setReferenceUrlDraft(event.target.value)}
                            placeholder="https://example.com/image.png"
                            onKeyDown={(event) => {
                              if (event.key !== "Enter") return;
                              event.preventDefault();
                              handleAddReferenceUrl();
                            }}
                          />
                          <button
                            type="button"
                            className="image-ideogram-mini-btn"
                            onClick={handleAddReferenceUrl}
                            disabled={!referenceUrlDraft.trim()}
                          >
                            添加
                          </button>
                        </div>
                      ) : null}
                      {imageUrls.length > 0 ? (
                        <div className="image-reference-url-list">
                          {imageUrls.map((url) => (
                            <div key={url} className="image-reference-url-chip">
                              <span>{url}</span>
                              <button
                                type="button"
                                onClick={() => handleRemoveReferenceUrl(url)}
                                aria-label="移除参考链接"
                              >
                                <span className="image-close-mini" aria-hidden="true">
                                  ×
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
                      <div className="image-reference-menu-meta">
                        <p>{`支持上传最多 ${MAX_REFERENCE_IMAGES} 张参考图`}</p>
                        <p>{`当前参考图 ${inputFiles.length} 张，URL ${imageUrls.length} 条`}</p>
                      </div>
                    </div>
                  ) : null}
                </div>
                <CustomSelect
                  label="模型"
                  value={model}
                  options={SEEDREAM_MODEL_OPTIONS}
                  onChange={setModel}
                  disabled={termsLocked || isGenerating}
                />
                <CustomSelect
                  label="尺寸"
                  value={size}
                  options={SIZE_OPTIONS}
                  onChange={setSize}
                  disabled={termsLocked}
                />
                <CustomSelect
                  label="模式"
                  value={sequentialMode}
                  options={GENERATION_MODE_OPTIONS}
                  onChange={setSequentialMode}
                  disabled={termsLocked}
                />
                <MoreSettingsMenu
                  disabled={termsLocked}
                  responseFormat={responseFormat}
                  onResponseFormatChange={setResponseFormat}
                  sequentialMode={sequentialMode}
                  maxImagesInput={maxImagesInput}
                  onMaxImagesInputChange={(value) => {
                    const raw = String(value || "").replace(/[^\d]/g, "");
                    if (!raw) {
                      setMaxImagesInput("");
                      return;
                    }
                    setMaxImagesInput(String(normalizeGroupImageCount(raw, GROUP_IMAGE_MAX)));
                  }}
                  onMaxImagesInputBlur={() => {
                    setMaxImagesInput(String(normalizeGroupImageCount(maxImagesInput, GROUP_IMAGE_MAX)));
                  }}
                  watermark={watermark}
                  onWatermarkChange={setWatermark}
                />
                <button
                  type="submit"
                  className="image-send-btn image-floating-send"
                  disabled={termsLocked || isGenerating}
                  aria-label="生成图片"
                  title="生成图片"
                >
                  {isGenerating ? <Loader2 size={16} className="spin" /> : <SendHorizonal size={16} />}
                </button>
              </div>
            </div>
          </section>

          <div className="image-ideogram-feed-head">
            {libraryView === "explore" ? (
              <>
                <div className="image-explore-tabs" role="tablist" aria-label="探索分类">
                  <Search size={15} />
                  {EXPLORE_FILTERS.map((item) => (
                    <button
                      key={item.key}
                      type="button"
                      className={`image-explore-tab${exploreFilter === item.key ? " is-active" : ""}`}
                      onClick={() => setExploreFilter(item.key)}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <div className="image-library-head-inline">
                <div className="image-library-title">
                  {LIBRARY_VIEWS.find((item) => item.key === libraryView)?.label || "Library"}
                </div>
                {libraryView === "my-images" ? (
                  <div className="image-library-icon-actions">
                    <button
                      type="button"
                      className="image-library-icon-btn"
                      onClick={() => loadHistory()}
                      disabled={termsLocked || historyLoading || historyClearing}
                      title={historyLoading ? "刷新中..." : "刷新"}
                      aria-label={historyLoading ? "刷新中..." : "刷新"}
                    >
                      <span className={historyLoading ? "spin" : ""}>
                        <InlineGlyph name="refresh" size={15} />
                      </span>
                    </button>
                    <button
                      type="button"
                      className="image-library-icon-btn is-danger"
                      onClick={handleClearHistory}
                      disabled={
                        termsLocked ||
                        historyLoading ||
                        historyClearing ||
                        historyDeletingId.length > 0 ||
                        historyPreviewItems.length === 0
                      }
                      title={historyClearing ? "清空中..." : "清空"}
                      aria-label={historyClearing ? "清空中..." : "清空"}
                    >
                      {historyClearing ? <Loader2 size={15} className="spin" /> : <InlineGlyph name="trash" size={15} />}
                    </button>
                  </div>
                ) : null}
                {libraryView === "collections" ? (
                  <div className="image-library-icon-actions">
                    <button
                      type="button"
                      className="image-ideogram-mini-btn"
                      onClick={openCreateCollectionDialog}
                    >
                      <Plus size={14} />
                      新建收藏夹
                    </button>
                    <div className="image-collection-more" ref={collectionMenuRef}>
                      <button
                        type="button"
                        className="image-library-icon-btn"
                        onClick={() => setCollectionMenuOpen((prev) => !prev)}
                        aria-haspopup="menu"
                        aria-expanded={collectionMenuOpen}
                        title="更多管理"
                        aria-label="更多管理"
                      >
                        <span className="image-more-dots" aria-hidden="true">⋯</span>
                      </button>
                      {collectionMenuOpen ? (
                        <div className="image-collection-more-menu" role="menu" aria-label="收藏夹管理">
                          <button
                            type="button"
                            className="image-collection-more-item"
                            onClick={openRenameCollectionDialog}
                            disabled={!activeCollection}
                          >
                            <Pencil size={14} />
                            重命名
                          </button>
                          <button
                            type="button"
                            className="image-collection-more-item is-danger"
                            onClick={() => {
                              handleDeleteCollection();
                              setCollectionMenuOpen(false);
                            }}
                            disabled={!activeCollection}
                          >
                            <Trash2 size={14} />
                            删除收藏夹
                          </button>
                          <button
                            type="button"
                            className={`image-collection-more-item${collectionBatchMode ? " is-active" : ""}`}
                            onClick={() => {
                              setCollectionBatchMode((prev) => !prev);
                              setCollectionSelectedKeys([]);
                            }}
                            disabled={!activeCollection}
                          >
                            <Grid3x3 size={14} />
                            {collectionBatchMode ? "关闭批量管理" : "批量管理"}
                          </button>
                          {collectionBatchMode ? (
                            <button
                              type="button"
                              className="image-collection-more-item is-danger"
                              onClick={() => {
                                handleCollectionBatchRemove();
                                setCollectionMenuOpen(false);
                              }}
                              disabled={collectionSelectedKeys.length === 0}
                            >
                              <Trash2 size={14} />
                              批量移除所选
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>

          <section className="image-ideogram-board">
            <div key={libraryView} className="image-library-view-motion">
              {libraryView === "explore"
                ? renderGallery(exploreItems, { emptyText: "还没有可展示的图片" })
                : null}
              {libraryView === "my-images" ? (
                <div className="image-library-panel">
                  {historyError ? <div className="image-history-error">{historyError}</div> : null}
                  {renderGallery(galleryItems, {
                    emptyText: "你还没有历史生成图片",
                    allowHistoryDelete: true,
                  })}
                </div>
              ) : null}
              {libraryView === "likes" ? renderGallery(likedItems, { emptyText: "还没有点赞图片" }) : null}
              {libraryView === "collections" ? (
                <div className="image-collection-panel">
                  <div className="image-collection-list">
                    {collections.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        draggable
                        className={`image-collection-chip${
                          activeCollectionId === item.id ? " is-active" : ""
                        }`}
                        onClick={() => setActiveCollectionId(item.id)}
                        onDragStart={() => setDragCollectionId(item.id)}
                        onDragOver={(event) => event.preventDefault()}
                        onDrop={() => {
                          reorderCollections(dragCollectionId, item.id);
                          setDragCollectionId("");
                        }}
                        onDragEnd={() => setDragCollectionId("")}
                      >
                        <GripVertical size={13} />
                        <span>{item.name}</span>
                        <span>{item.itemKeys.length}</span>
                      </button>
                    ))}
                  </div>
                  {renderGallery(collectionItems, {
                    emptyText: activeCollection
                      ? "当前收藏夹暂无图片，请在图片卡片点击收藏按钮。"
                      : "请先创建收藏夹。",
                    allowRemoveFromCollection: true,
                    enableSelectMode: collectionBatchMode,
                    selectedKeySet: new Set(collectionSelectedKeys),
                    onToggleSelect: toggleCollectionSelect,
                    coverKey: activeCollection?.coverKey || "",
                    onSetCover: setCollectionCover,
                  })}
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </form>

      {!isMobileSettingsDrawer && !termsAgreed ? (
        <div className="image-privacy-popup" role="dialog" aria-live="polite">
          <p>
            我们会基于隐私政策处理图片生成相关数据。继续使用前，请先阅读并同意
            《图片生成功能服务条款》。
          </p>
          <div className="image-privacy-popup-actions">
            <button
              type="button"
              className="image-privacy-link"
              onClick={() => setShowTermsModal(true)}
            >
              查看条款
            </button>
            <button
              type="button"
              className="image-privacy-accept"
              onClick={() => handleTermsAgreedChange(true)}
            >
              Accept
            </button>
          </div>
        </div>
      ) : null}

      {isMobileSettingsDrawer ? (
        <div className="image-corner-actions">
          <button
            type="button"
            className="image-back-btn"
            onClick={handleBackToChat}
            title={backButtonLabel}
            aria-label={backButtonLabel}
          >
            <ArrowLeft size={14} />
            <span>{backButtonLabel}</span>
          </button>
        </div>
      ) : null}

      {selectedPreview ? (
        <div className="image-preview-overlay" role="presentation" onClick={() => setPreviewDialogKey("")}>
          <div className="image-preview-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button
              type="button"
              className="image-preview-close"
              onClick={() => setPreviewDialogKey("")}
              aria-label="关闭预览"
            >
              <span className="image-close-mark" aria-hidden="true">×</span>
            </button>
            <ProgressiveCachedImage
              key={selectedPreviewUrl}
              src={selectedPreviewUrl}
              alt="预览图片"
              loading="eager"
              containerClassName="image-preview-dialog-image-wrap"
              imageClassName="image-preview-dialog-image"
            />
            <div className="image-preview-dialog-actions">
              <button
                type="button"
                className={`image-gallery-action${likedKeySet.has(selectedPreview.key) ? " is-active" : ""}`}
                onClick={() => toggleLikeItem(selectedPreview.key)}
              >
                <InlineGlyph name="heart" size={14} />
                {likedKeySet.has(selectedPreview.key) ? "已喜欢" : "喜欢"}
              </button>
              <button
                type="button"
                className="image-gallery-action"
                onClick={() => addItemToCollection(selectedPreview.key)}
              >
                <InlineGlyph name="folder" size={14} />
                收藏
              </button>
              <a
                href={selectedPreviewUrl}
                download={makeDownloadName(selectedPreview)}
                className={`image-action-btn${termsLocked ? " is-disabled" : ""}`}
                onClick={(event) => {
                  if (!termsLocked) return;
                  event.preventDefault();
                }}
              >
                <Download size={14} />
                下载
              </a>
              <a
                href={selectedPreviewUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`image-action-btn${termsLocked ? " is-disabled" : ""}`}
                onClick={(event) => {
                  if (!termsLocked) return;
                  event.preventDefault();
                }}
              >
                <ImagePlus size={14} />
                新标签打开
              </a>
            </div>
          </div>
        </div>
      ) : null}

      {collectionDialogMode ? (
        <div
          className="image-terms-modal-overlay"
          role="presentation"
          onClick={() => {
            setCollectionDialogMode("");
            setCollectionDialogDraft("");
          }}
        >
          <div
            className="image-collection-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={collectionDialogMode === "create" ? "新建收藏夹" : "重命名收藏夹"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-collection-dialog-head">
              <h3>{collectionDialogMode === "create" ? "新建收藏夹" : "重命名收藏夹"}</h3>
              <button
                type="button"
                className="image-terms-modal-close"
                onClick={() => {
                  setCollectionDialogMode("");
                  setCollectionDialogDraft("");
                }}
                aria-label="关闭"
                title="关闭"
              >
                <span className="image-close-mark" aria-hidden="true">×</span>
              </button>
            </div>
            <div className="image-collection-dialog-body">
              <input
                value={collectionDialogDraft}
                onChange={(event) => setCollectionDialogDraft(event.target.value)}
                placeholder="请输入收藏夹名称"
                autoFocus
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return;
                  event.preventDefault();
                  submitCollectionDialog();
                }}
              />
            </div>
            <div className="image-collection-dialog-foot">
              <button
                type="button"
                className="image-terms-secondary-btn"
                onClick={() => {
                  setCollectionDialogMode("");
                  setCollectionDialogDraft("");
                }}
              >
                取消
              </button>
              <button
                type="button"
                className="image-terms-accept-btn"
                onClick={submitCollectionDialog}
                disabled={!collectionDialogDraft.trim()}
              >
                确定
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showTermsModal && (
        <div
          className="image-terms-modal-overlay"
          role="presentation"
          onClick={() => setShowTermsModal(false)}
        >
          <div
            className="image-terms-modal-card"
            role="dialog"
            aria-modal="true"
            aria-label="图片生成功能服务条款"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="image-terms-modal-header">
              <h3>图片生成功能服务条款</h3>
              <button
                type="button"
                className="image-terms-modal-close"
                onClick={() => setShowTermsModal(false)}
                aria-label="关闭条款"
                title="关闭条款"
              >
                <span className="image-close-mark" aria-hidden="true">×</span>
              </button>
            </div>
            <pre className="image-terms-modal-content">{termsContent}</pre>
            <div className="image-terms-modal-footer">
              {!termsAgreed && (
                <button
                  type="button"
                  className="image-terms-accept-btn"
                  onClick={() => {
                    handleTermsAgreedChange(true);
                    setShowTermsModal(false);
                  }}
                >
                  我已阅读并同意
                </button>
              )}
              <button
                type="button"
                className="image-terms-secondary-btn"
                onClick={() => setShowTermsModal(false)}
              >
                关闭
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
