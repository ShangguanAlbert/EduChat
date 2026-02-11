import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ImagePlus, Loader2, Sparkles } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";
import { streamSeedreamGeneration } from "./image/imageApi.js";
import {
  loadImageReturnContext,
  normalizeImageReturnContext,
  saveImageReturnContext,
} from "./image/returnContext.js";
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

export default function ImageGenerationPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const [prompt, setPrompt] = useState("");
  const [size, setSize] = useState("2K");
  const [sequentialMode, setSequentialMode] = useState("disabled");
  const [maxImages, setMaxImages] = useState(4);
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

  const returnContextFromState = normalizeImageReturnContext(
    location.state?.returnContext || location.state?.restoreContext,
  );

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
      .slice(0, 14);
  }, [imageUrlsText]);

  useEffect(() => {
    if (!returnContextFromState) return;
    saveImageReturnContext(returnContextFromState);
  }, [returnContextFromState]);

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

  async function handleGenerate(e) {
    e.preventDefault();
    if (isGenerating) return;
    if (!prompt.trim()) {
      setErrorText("请输入用于图片生成的提示词。");
      return;
    }

    setIsGenerating(true);
    setErrorText("");
    setMeta(null);
    setUsage(null);
    setItems([]);

    let streamError = "";

    try {
      await streamSeedreamGeneration({
        prompt,
        size,
        sequentialMode,
        maxImages,
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
            const resolvedUrl =
              directUrl || (b64Json ? `data:image/png;base64,${b64Json}` : "");
            updateItem(imageIndex, {
              imageIndex,
              status: "succeeded",
              size: String(payload?.size || ""),
              url: resolvedUrl,
              errorMessage: "",
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
    }
  }

  return (
    <div className="image-page">
      <header className="image-page-header">
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
      </header>

      <main className="image-main">
        <section className="image-controls-panel">
          <form className="image-form" onSubmit={handleGenerate}>
            <div className="image-form-body">
              <label className="image-field">
                <span className="image-field-label">提示词</span>
                <textarea
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  className="image-textarea image-textarea-fixed"
                  placeholder="请输入你想生成的画面描述…"
                />
              </label>

              <label className="image-field">
                <span className="image-field-label">参考图上传（最多 14 张）</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/bmp,image/tiff,image/gif"
                  multiple
                  className="image-file-input"
                  onChange={(e) => {
                    const files = Array.from(e.target.files || []).slice(0, 14);
                    setInputFiles(files);
                  }}
                />
                {inputFiles.length > 0 && (
                  <p className="image-field-hint">已选择 {inputFiles.length} 张图片</p>
                )}
              </label>

              <label className="image-field">
                <span className="image-field-label">参考图 URL（每行一个，可选）</span>
                <textarea
                  value={imageUrlsText}
                  onChange={(e) => setImageUrlsText(e.target.value)}
                  className="image-textarea image-textarea-fixed image-textarea-url"
                  placeholder="https://example.com/a.png"
                />
              </label>

              <div className="image-settings-list">
                <label className="image-setting-row">
                  <span className="image-setting-label">输出尺寸</span>
                  <span className="image-setting-control">
                    <select
                      value={size}
                      onChange={(e) => setSize(e.target.value)}
                      className="image-select image-select-custom"
                    >
                      {SIZE_OPTIONS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </span>
                </label>

                <label className="image-setting-row">
                  <span className="image-setting-label">返回格式</span>
                  <span className="image-setting-control">
                    <select
                      value={responseFormat}
                      onChange={(e) => setResponseFormat(e.target.value)}
                      className="image-select image-select-custom"
                    >
                      <option value="url">URL</option>
                      <option value="b64_json">Base64</option>
                    </select>
                  </span>
                </label>

                <label className="image-setting-row">
                  <span className="image-setting-label">生成模式</span>
                  <span className="image-setting-control">
                    <select
                      value={sequentialMode}
                      onChange={(e) => setSequentialMode(e.target.value)}
                      className="image-select image-select-custom"
                    >
                      <option value="disabled">单图</option>
                      <option value="auto">组图（auto）</option>
                    </select>
                  </span>
                </label>

                <label className="image-setting-row">
                  <span className="image-setting-label">组图最大数量</span>
                  <span className="image-setting-control">
                    <input
                      type="number"
                      min={1}
                      max={15}
                      step={1}
                      value={maxImages}
                      disabled={sequentialMode !== "auto"}
                      onChange={(e) => {
                        const next = Number(e.target.value);
                        if (!Number.isFinite(next)) return;
                        setMaxImages(Math.max(1, Math.min(15, Math.round(next))));
                      }}
                      className="image-number"
                    />
                  </span>
                </label>

                <label className="image-setting-row image-setting-row-checkbox">
                  <span className="image-setting-label">添加“AI生成”水印</span>
                  <span className="image-setting-control">
                    <input
                      type="checkbox"
                      checked={watermark}
                      onChange={(e) => setWatermark(e.target.checked)}
                      className="image-checkbox-input"
                    />
                  </span>
                </label>

                <label className="image-setting-row image-setting-row-checkbox">
                  <span className="image-setting-label">流式返回</span>
                  <span className="image-setting-control">
                    <input
                      type="checkbox"
                      checked={streamEnabled}
                      onChange={(e) => setStreamEnabled(e.target.checked)}
                      className="image-checkbox-input"
                    />
                  </span>
                </label>
              </div>
            </div>

            <div className="image-form-footer">
              <button
                type="submit"
                className="image-generate-btn"
                disabled={isGenerating}
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={15} className="spin" />
                    生成中…
                  </>
                ) : (
                  <>
                    <Sparkles size={15} />
                    生成图片
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        <section className="image-result-panel">
          {errorText && <div className="image-error">{errorText}</div>}

          {meta && (
            <div className="image-meta">
              <span>输入参考图：{meta.inputImageCount ?? 0} 张</span>
              <span>模式：{meta.sequentialImageGeneration || "disabled"}</span>
            </div>
          )}

          {usage && (
            <div className="image-usage">
              <span>成功图片：{usage.generatedImages ?? 0}</span>
              <span>输出 Token：{usage.outputTokens ?? 0}</span>
              <span>总 Token：{usage.totalTokens ?? 0}</span>
            </div>
          )}

          {items.length === 0 ? (
            <div className="image-empty">
              <ImagePlus size={20} />
              <p>{isGenerating ? "正在等待模型返回图片…" : "暂未生成图片"}</p>
            </div>
          ) : (
            <div className="image-grid-result">
              {items.map((item) => (
                <article key={item.imageIndex} className="image-card">
                  <div className="image-card-head">
                    <span>第 {item.imageIndex + 1} 张</span>
                    {item.size ? <span>{item.size}</span> : null}
                  </div>

                  {item.status === "succeeded" && item.url ? (
                    <>
                      <img
                        src={item.url}
                        alt={`生成图片 ${item.imageIndex + 1}`}
                        className="image-preview"
                        loading="lazy"
                      />
                      <div className="image-card-actions">
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="image-link-btn"
                        >
                          新标签打开
                        </a>
                        <a href={item.url} download className="image-link-btn">
                          下载
                        </a>
                      </div>
                    </>
                  ) : (
                    <div className="image-failed">
                      <p>{item.errorMessage || "图片生成失败"}</p>
                      {item.errorCode ? (
                        <p className="image-failed-code">Error Code: {item.errorCode}</p>
                      ) : null}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
