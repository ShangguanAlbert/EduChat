import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Check,
  ChevronDown,
  Download,
  ImagePlus,
  Loader2,
  RefreshCcw,
  SendHorizonal,
  Sparkles,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  clearImageGenerationHistory,
  deleteImageGenerationHistoryItem,
  fetchImageGenerationHistory,
  streamSeedreamGeneration,
} from "./image/imageApi.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "./image/returnContext.js";
import imageGenerationTermsMarkdown from "../content/image-generation-terms.md?raw";
import "../styles/image-generation.css";

const SIZE_OPTIONS = [
  { value: "2K", label: "2K（模型自适应构图）" },
  { value: "4K", label: "4K（模型自适应构图）" },
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
const GENERATION_MODE_OPTIONS = [
  { value: "disabled", label: "单图" },
  { value: "auto", label: "组图（auto）" },
];

const HISTORY_LIMIT = 120;
const MAX_REFERENCE_IMAGES = 14;
const GROUP_IMAGE_MAX = 4;
const HISTORY_GROUP_ORDER = ["today", "yesterday", "earlier"];
const HISTORY_GROUP_LABELS = Object.freeze({
  today: "今天",
  yesterday: "昨天",
  earlier: "更早",
});
const IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY = "educhat:image-generation:terms-hash";

function computeStringHash(input) {
  const text = String(input || "");
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return String(hash >>> 0);
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
  if (/^https?:\/\//i.test(text)) return text;
  if (/^data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+$/i.test(text)) {
    return text;
  }
  return "";
}

function makeDownloadName(preview) {
  const safeTime = String(preview?.createdAt || new Date().toISOString())
    .replace(/[:.]/g, "-")
    .replace(/\s+/g, "-");
  const source = preview?.source === "history" ? "history" : "result";
  return `seedream-${source}-${safeTime}.png`;
}

function resolveHistoryGroupKey(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "earlier";
  }

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart);
  yesterdayStart.setDate(yesterdayStart.getDate() - 1);

  if (date >= todayStart) return "today";
  if (date >= yesterdayStart) return "yesterday";
  return "earlier";
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
      <span className="image-custom-select-label">{label}</span>
      <button
        type="button"
        className="image-custom-select-trigger"
        onClick={() => setOpen((prev) => !prev)}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
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

export default function ImageGenerationPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2K");
  const [sequentialMode, setSequentialMode] = useState("disabled");
  const [maxImagesInput, setMaxImagesInput] = useState(String(GROUP_IMAGE_MAX));
  const [watermark, setWatermark] = useState(false);
  const [responseFormat, setResponseFormat] = useState("url");
  const [streamEnabled, setStreamEnabled] = useState(true);
  const [imageUrlsText, setImageUrlsText] = useState("");
  const [inputFiles, setInputFiles] = useState([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [meta, setMeta] = useState(null);
  const [usage, setUsage] = useState(null);
  const [items, setItems] = useState([]);

  const [historyItems, setHistoryItems] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyDeletingId, setHistoryDeletingId] = useState("");
  const [historyClearing, setHistoryClearing] = useState(false);
  const [selectedPreviewKey, setSelectedPreviewKey] = useState("");
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);

  const returnContextFromState = normalizeImageReturnContext(
    location.state?.returnContext || location.state?.restoreContext,
  );
  const termsContent = useMemo(
    () => String(imageGenerationTermsMarkdown || "").trim(),
    [],
  );
  const termsHash = useMemo(() => computeStringHash(termsContent), [termsContent]);
  const termsLocked = !termsAgreed;

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

  const generatedPreviewItems = useMemo(() => {
    return (Array.isArray(items) ? items : [])
      .filter((item) => item?.status === "succeeded")
      .map((item) => ({
        key: `generated-${item.imageIndex}`,
        source: "generated",
        imageIndex: Number(item.imageIndex),
        url: normalizePreviewUrl(item.url),
        size: String(item.size || ""),
        model: String(item.model || meta?.model || ""),
        prompt: String(prompt || "").trim(),
        responseFormat: String(responseFormat || "url"),
        createdAt: item?.createdAt || new Date().toISOString(),
      }))
      .filter((item) => !!item.url)
      .sort((a, b) => a.imageIndex - b.imageIndex);
  }, [items, meta, prompt, responseFormat]);

  const failedItems = useMemo(
    () =>
      (Array.isArray(items) ? items : []).filter(
        (item) => String(item?.status || "") === "failed",
      ),
    [items],
  );

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

  const groupedHistoryItems = useMemo(() => {
    const buckets = {
      today: [],
      yesterday: [],
      earlier: [],
    };

    historyPreviewItems.forEach((item) => {
      const key = resolveHistoryGroupKey(item.createdAt);
      buckets[key].push(item);
    });

    return HISTORY_GROUP_ORDER.map((key) => ({
      key,
      label: HISTORY_GROUP_LABELS[key] || key,
      items: buckets[key],
    })).filter((group) => group.items.length > 0);
  }, [historyPreviewItems]);

  const previewMap = useMemo(() => {
    const map = new Map();
    generatedPreviewItems.forEach((item) => {
      map.set(item.key, item);
    });
    historyPreviewItems.forEach((item) => {
      map.set(item.key, item);
    });
    return map;
  }, [generatedPreviewItems, historyPreviewItems]);

  const selectedPreview = useMemo(() => {
    if (selectedPreviewKey && previewMap.has(selectedPreviewKey)) {
      return previewMap.get(selectedPreviewKey) || null;
    }
    if (generatedPreviewItems.length > 0) {
      return generatedPreviewItems[0];
    }
    if (historyPreviewItems.length > 0) {
      return historyPreviewItems[0];
    }
    return null;
  }, [generatedPreviewItems, historyPreviewItems, previewMap, selectedPreviewKey]);

  const loadHistory = useCallback(async ({ silent = false } = {}) => {
    if (termsLocked) return;
    if (!silent) {
      setHistoryLoading(true);
    }
    setHistoryError("");
    try {
      const data = await fetchImageGenerationHistory({ limit: HISTORY_LIMIT });
      setHistoryItems(Array.isArray(data?.items) ? data.items : []);
    } catch (error) {
      setHistoryError(error?.message || "读取历史生成图片失败，请稍后再试。");
    } finally {
      if (!silent) {
        setHistoryLoading(false);
      }
    }
  }, [termsLocked]);

  useEffect(() => {
    if (!returnContextFromState) return;
    saveImageReturnContext(returnContextFromState);
  }, [returnContextFromState]);

  useEffect(() => {
    try {
      const storedHash = String(
        localStorage.getItem(IMAGE_TERMS_ACCEPTED_HASH_STORAGE_KEY) || "",
      ).trim();
      setTermsAgreed(storedHash === termsHash);
    } catch {
      setTermsAgreed(false);
    }
  }, [termsHash]);

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

  function handleBackToChat() {
    const storedContext = loadImageReturnContext();
    const context = returnContextFromState || storedContext || null;
    navigate("/chat", {
      state: {
        fromImageGeneration: true,
        restoreContext: context,
      },
    });
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
    if (!prompt.trim()) {
      setErrorText("请输入用于图片生成的提示词。");
      return;
    }

    const resolvedMaxImages =
      sequentialMode === "auto"
        ? normalizeGroupImageCount(maxImagesInput, GROUP_IMAGE_MAX)
        : 1;

    setIsGenerating(true);
    setErrorText("");
    setMeta(null);
    setUsage(null);
    setItems([]);
    setSelectedPreviewKey("");

    let streamError = "";
    let shouldRefreshHistory = false;

    try {
      await streamSeedreamGeneration({
        prompt,
        size,
        sequentialMode,
        maxImages: resolvedMaxImages,
        watermark,
        responseFormat,
        stream: streamEnabled,
        imageUrls,
        files: inputFiles,
        handlers: {
          onMeta: (payload) => {
            setMeta(payload || null);
          },
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
              size: "",
              url: "",
            });
          },
          onUsage: (payload) => {
            setUsage(payload?.usage || null);
          },
          onError: (message) => {
            streamError = String(message || "图片生成失败。");
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
      if (shouldRefreshHistory) {
        loadHistory({ silent: true });
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

  return (
    <div className="image-page">
      <header className="image-page-header">
        <div className="image-page-header-left">
          <button
            type="button"
            className="image-back-btn"
            onClick={handleBackToChat}
            title="回到文本对话"
            aria-label="回到文本对话"
          >
            <ArrowLeft size={16} />
            <span>回到文本对话</span>
          </button>
          <h1 className="image-page-title">图片生成（BETA）</h1>
        </div>
        <div className="image-page-header-right">
          <label className="image-terms-consent-label" htmlFor="image-terms-agree-checkbox">
            <input
              id="image-terms-agree-checkbox"
              className="image-terms-consent-checkbox"
              type="checkbox"
              checked={termsAgreed}
              onChange={(event) => handleTermsAgreedChange(event.target.checked)}
            />
            <span>我已阅读并同意</span>
          </label>
          <button
            type="button"
            className="image-terms-link-btn"
            onClick={() => setShowTermsModal(true)}
          >
            《图片生成功能服务条款》
          </button>
        </div>
      </header>

      {termsLocked && (
        <div className="image-terms-lock-tip">
          请先在右上角勾选并同意《图片生成功能服务条款》，再使用图片生成能力。
        </div>
      )}

      <form className={`image-workspace${termsLocked ? " is-locked" : ""}`} onSubmit={handleGenerate}>
        <section className="image-stage-panel">
          <div className="image-setting-toolbar">
            <CustomSelect
              label="输出尺寸"
              value={size}
              options={SIZE_OPTIONS}
              onChange={setSize}
              disabled={termsLocked}
            />
            <CustomSelect
              label="返回格式"
              value={responseFormat}
              options={RESPONSE_FORMAT_OPTIONS}
              onChange={setResponseFormat}
              disabled={termsLocked}
            />
            <CustomSelect
              label="生成模式"
              value={sequentialMode}
              options={GENERATION_MODE_OPTIONS}
              onChange={setSequentialMode}
              disabled={termsLocked}
            />

            <label
              className={`image-setting-chip image-setting-chip-number${
                sequentialMode !== "auto" ? " is-disabled" : ""
              }`}
            >
              <span>组图数量</span>
              <input
                type="text"
                inputMode="numeric"
                value={maxImagesInput}
                disabled={termsLocked || sequentialMode !== "auto"}
                onChange={(e) => {
                  const raw = String(e.target.value || "").replace(/[^\d]/g, "");
                  if (!raw) {
                    setMaxImagesInput("");
                    return;
                  }
                  setMaxImagesInput(String(normalizeGroupImageCount(raw, GROUP_IMAGE_MAX)));
                }}
                onBlur={() => {
                  setMaxImagesInput(
                    String(normalizeGroupImageCount(maxImagesInput, GROUP_IMAGE_MAX)),
                  );
                }}
                className="image-count-input"
                placeholder="1-4"
              />
            </label>

            <label className="image-setting-check">
              <input
                type="checkbox"
                checked={watermark}
                onChange={(e) => setWatermark(e.target.checked)}
                disabled={termsLocked}
              />
              <span>添加水印</span>
            </label>

            <label className="image-setting-check">
              <input
                type="checkbox"
                checked={streamEnabled}
                onChange={(e) => setStreamEnabled(e.target.checked)}
                disabled={termsLocked}
              />
              <span>流式返回</span>
            </label>
          </div>

          <div className="image-preview-stage">
            {errorText && (
              <div className="image-error" role="alert">
                <span>{errorText}</span>
                <button
                  type="button"
                  className="image-error-close"
                  onClick={() => setErrorText("")}
                  aria-label="关闭报错"
                  title="关闭报错"
                >
                  <X size={14} />
                </button>
              </div>
            )}

            <div className="image-meta-row">
              {meta ? (
                <>
                  <span>输入参考图：{meta.inputImageCount ?? 0} 张</span>
                  <span>模式：{meta.sequentialImageGeneration || "disabled"}</span>
                </>
              ) : null}
              {usage ? (
                <>
                  <span>成功图片：{usage.generatedImages ?? 0}</span>
                  <span>输出 Token：{usage.outputTokens ?? 0}</span>
                  <span>总 Token：{usage.totalTokens ?? 0}</span>
                </>
              ) : null}
            </div>

            <div className="image-preview-canvas">
              {selectedPreview ? (
                <>
                  <img
                    src={selectedPreview.url}
                    alt="生成图片预览"
                    className="image-preview-main"
                    loading="lazy"
                  />

                  <div className="image-preview-caption">
                    <div className="image-preview-caption-main">
                      {selectedPreview.prompt || "未提供提示词"}
                    </div>
                    <div className="image-preview-caption-sub">
                      {selectedPreview.size ? <span>{selectedPreview.size}</span> : null}
                      {selectedPreview.model ? <span>{selectedPreview.model}</span> : null}
                      <span>{selectedPreview.responseFormat === "b64_json" ? "Base64" : "URL"}</span>
                    </div>
                  </div>

                  <div className="image-preview-actions">
                    <a
                      href={selectedPreview.url}
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
                      href={selectedPreview.url}
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
                </>
              ) : (
                <div className="image-empty">
                  {isGenerating ? <Loader2 size={20} className="spin" /> : <ImagePlus size={20} />}
                  <p>{isGenerating ? "正在等待模型返回图片..." : "暂未生成图片"}</p>
                </div>
              )}
            </div>

            {generatedPreviewItems.length > 0 && (
              <div className="image-generated-strip" role="list" aria-label="本轮生成结果">
                {generatedPreviewItems.map((item) => {
                  const active = selectedPreview?.key === item.key;
                  return (
                    <button
                      type="button"
                      key={item.key}
                      className={`image-generated-thumb${active ? " is-active" : ""}`}
                      onClick={() => setSelectedPreviewKey(item.key)}
                      disabled={termsLocked}
                    >
                      <img src={item.url} alt={`生成结果 ${item.imageIndex + 1}`} loading="lazy" />
                      <span>第 {item.imageIndex + 1} 张</span>
                    </button>
                  );
                })}
              </div>
            )}

            {failedItems.length > 0 && (
              <div className="image-failed-list">
                {failedItems.map((item) => (
                  <div key={`failed-${item.imageIndex}`} className="image-failed-item">
                    <span>第 {item.imageIndex + 1} 张失败</span>
                    <span>{item.errorMessage || "图片生成失败"}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="image-capsule-wrap">
            {inputFiles.length > 0 && (
              <div className="image-reference-files" role="list" aria-label="参考图列表">
                {inputFiles.map((file, index) => (
                  <div key={`${file.name}-${index}`} className="image-reference-file">
                    <span>{file.name}</span>
                    <button
                      type="button"
                      aria-label="移除参考图"
                      title="移除参考图"
                      disabled={termsLocked}
                      onClick={() => {
                        setInputFiles((prev) => prev.filter((_, i) => i !== index));
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="image-capsule-composer">
              <label className="image-upload-trigger" title="上传参考图" aria-label="上传参考图">
                <Upload size={16} />
                <span>参考图</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif"
                  multiple
                  disabled={termsLocked}
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []).slice(0, MAX_REFERENCE_IMAGES);
                    setInputFiles(files);
                  }}
                />
              </label>

              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                className="image-capsule-input"
                rows={1}
                placeholder="描述你想生成的画面"
                disabled={termsLocked}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || event.shiftKey) return;
                  event.preventDefault();
                  handleGenerate(event);
                }}
              />

              <button
                type="submit"
                className="image-send-btn"
                disabled={termsLocked || isGenerating}
                aria-label="生成图片"
                title="生成图片"
              >
                {isGenerating ? <Loader2 size={16} className="spin" /> : <SendHorizonal size={16} />}
              </button>
            </div>

            <div className="image-capsule-hint">
              <span>
                <Sparkles size={14} />
                支持上传最多 {MAX_REFERENCE_IMAGES} 张参考图
              </span>
              <span>当前：{inputFiles.length} 张</span>
            </div>

            <label className="image-url-box">
              <span>参考图 URL（可选，每行一个）</span>
              <textarea
                value={imageUrlsText}
                onChange={(e) => setImageUrlsText(e.target.value)}
                placeholder="https://example.com/reference.png"
                disabled={termsLocked}
              />
            </label>
          </div>
        </section>

        <aside className="image-history-panel">
          <div className="image-history-header">
            <h2>历史生成图</h2>
            <div className="image-history-actions">
              <button
                type="button"
                onClick={handleClearHistory}
                className="image-history-clear"
                disabled={
                  termsLocked ||
                  historyLoading ||
                  historyClearing ||
                  historyDeletingId.length > 0 ||
                  historyPreviewItems.length === 0
                }
              >
                {historyClearing ? <Loader2 size={13} className="spin" /> : <Trash2 size={13} />}
                清空
              </button>
              <button
                type="button"
                onClick={() => loadHistory()}
                className="image-history-refresh"
                disabled={termsLocked || historyLoading || historyClearing}
              >
                <RefreshCcw size={13} className={historyLoading ? "spin" : ""} />
                刷新
              </button>
            </div>
          </div>

          {historyError && <div className="image-history-error">{historyError}</div>}

          <div className="image-history-list">
            {historyLoading ? (
              <div className="image-history-empty">
                <Loader2 size={16} className="spin" />
                <span>历史加载中...</span>
              </div>
            ) : groupedHistoryItems.length === 0 ? (
              <div className="image-history-empty">
                <ImagePlus size={16} />
                <span>暂无历史图片</span>
              </div>
            ) : (
              groupedHistoryItems.map((group) => (
                <section key={group.key} className="image-history-group">
                  <header className="image-history-group-title">
                    <span>{group.label}</span>
                    <span>{group.items.length}</span>
                  </header>
                  <div className="image-history-group-list">
                    {group.items.map((item) => {
                      const active = selectedPreview?.key === item.key;
                      const deleting = historyDeletingId === item.id;
                      return (
                        <article
                          key={item.id}
                          className={`image-history-item${active ? " is-active" : ""}`}
                          onClick={() => {
                            if (termsLocked) return;
                            setSelectedPreviewKey(item.key);
                          }}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(event) => {
                            if (termsLocked) return;
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setSelectedPreviewKey(item.key);
                            }
                          }}
                        >
                          <img src={item.url} alt="历史生成图" loading="lazy" />
                          <div className="image-history-meta">
                            <p>{item.prompt || "未提供提示词"}</p>
                            <div>
                              <span>{formatHistoryTime(item.createdAt)}</span>
                              {item.responseFormat === "b64_json" ? (
                                <span>Base64</span>
                              ) : (
                                <span>URL</span>
                              )}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="image-history-delete"
                            onClick={(event) => handleDeleteHistory(item.id, event)}
                            disabled={termsLocked || deleting || historyClearing}
                            title="删除此图片"
                            aria-label="删除此图片"
                          >
                            {deleting ? (
                              <Loader2 size={13} className="spin" />
                            ) : (
                              <Trash2 size={13} />
                            )}
                          </button>
                        </article>
                      );
                    })}
                  </div>
                </section>
              ))
            )}
          </div>
        </aside>
      </form>

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
                <X size={16} />
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
