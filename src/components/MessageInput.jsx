import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, ArrowUp, Square, X, Image as ImageIcon } from "lucide-react";

const ACCEPT_UPLOAD_TYPES = [
  ".doc",
  ".docx",
  ".xls",
  ".xlsx",
  ".pdf",
  ".txt",
  ".md",
  ".markdown",
  ".c",
  ".h",
  ".cc",
  ".hh",
  ".cpp",
  ".hpp",
  ".cxx",
  ".hxx",
  ".py",
  ".python",
  ".xml",
  ".json",
  ".yaml",
  ".yml",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".java",
  ".go",
  ".rs",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".html",
  ".css",
  ".scss",
  ".less",
  ".csv",
  ".tsv",
  ".toml",
  ".ini",
  ".log",
  ".tex",
  ".r",
  ".rb",
  ".php",
  ".swift",
  ".kt",
  ".m",
  ".mm",
  ".vue",
  ".svelte",
  "image/*",
  ".mp3",
  ".wav",
  ".aac",
  ".ogg",
  ".flac",
  ".m4a",
  ".aiff",
  ".pcm16",
  ".pcm24",
  "audio/*",
  ".mp4",
  ".avi",
  ".mpeg",
  ".mov",
  ".webm",
  "video/*",
].join(",");

export default function MessageInput({
  onSend,
  onStop,
  disabled = false,
  isStreaming = false,
  layoutMode = "thread",
  quoteText = "",
  quotePreviewMaxChars = 0,
  onClearQuote,
  onConsumeQuote,
  onPrepareFiles,
  onFilesChange,
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [imagePreviewUrlsByIndex, setImagePreviewUrlsByIndex] = useState({});
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const [hasWrappedText, setHasWrappedText] = useState(false);
  const fileRef = useRef(null);
  const textRef = useRef(null);

  const normalizedQuoteText = useMemo(() => normalizeQuoteText(quoteText), [quoteText]);
  const hasQuote = normalizedQuoteText.length > 0;
  const inputDisabled = disabled || isStreaming;
  const hasText = text.length > 0;
  const quotePreviewText = useMemo(
    () => buildQuotePreviewText(normalizedQuoteText, quotePreviewMaxChars),
    [normalizedQuoteText, quotePreviewMaxChars],
  );
  const canSend = useMemo(() => {
    return text.trim().length > 0 || files.length > 0 || hasQuote;
  }, [text, files, hasQuote]);
  const isHomeLayout = layoutMode === "home";
  const hasComposerExtras = hasQuote || files.length > 0 || preparingFiles || !!prepareError;
  const isComposerExpanded = hasComposerExtras || hasWrappedText;
  const isComposerCompact = !isComposerExpanded;

  function submit() {
    if (!canSend || inputDisabled || preparingFiles) return;

    const t = buildFinalPrompt(text.trim(), normalizedQuoteText);
    onSend(t, files);

    setText("");
    setFiles([]);
    setPrepareError("");
    setHasWrappedText(false);
    onConsumeQuote?.();
    if (fileRef.current) fileRef.current.value = "";
  }

  const resizeTextarea = useCallback(() => {
    const textarea = textRef.current;
    if (!textarea) return;

    const compactMinHeight = 38;
    const expandedMinHeight = isHomeLayout ? 38 : 30;
    const maxHeight = 132;

    textarea.style.height = "auto";
    const scrollHeight = textarea.scrollHeight || compactMinHeight;
    const nextHasWrappedText = scrollHeight > compactMinHeight + 2;
    const minHeight =
      isHomeLayout || hasComposerExtras || nextHasWrappedText
        ? expandedMinHeight
        : compactMinHeight;
    const nextHeight = Math.min(maxHeight, Math.max(minHeight, scrollHeight));

    textarea.style.height = `${nextHeight}px`;
    setHasWrappedText((current) =>
      current === nextHasWrappedText ? current : nextHasWrappedText,
    );
  }, [hasComposerExtras, isHomeLayout]);

  async function appendPickedFiles(pickedFiles) {
    const picked = Array.isArray(pickedFiles) ? pickedFiles.filter(Boolean) : [];
    if (!picked.length) return;
    setPrepareError("");

    if (typeof onPrepareFiles !== "function") {
      setFiles((prev) => [...prev, ...picked]);
      return;
    }

    setPreparingFiles(true);
    try {
      const prepared = await onPrepareFiles(picked);
      const next = Array.isArray(prepared) ? prepared.filter(Boolean) : [];
      if (next.length > 0) {
        setFiles((prev) => [...prev, ...next]);
      }
    } catch (error) {
      setPrepareError(error?.message || "文件处理失败，请重试。");
    } finally {
      setPreparingFiles(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
    await appendPickedFiles(picked);
  }

  async function onComposerPaste(e) {
    if (inputDisabled || preparingFiles) return;
    const items = Array.from(e.clipboardData?.items || []);
    const imageFiles = items
      .filter((item) => item && item.kind === "file")
      .map((item) => item.getAsFile())
      .filter((file) => file instanceof File && String(file.type || "").startsWith("image/"));
    if (imageFiles.length === 0) return;
    e.preventDefault();
    await appendPickedFiles(imageFiles);
  }

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    const textarea = textRef.current;
    if (!textarea || typeof ResizeObserver !== "function") return undefined;

    const host =
      textarea.closest(".composer") ||
      textarea.parentElement ||
      textarea;
    let frameId = 0;
    const scheduleResize = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        resizeTextarea();
      });
    };

    const observer = new ResizeObserver(() => {
      scheduleResize();
    });
    observer.observe(host);
    window.addEventListener("resize", scheduleResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", scheduleResize);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [resizeTextarea]);

  useLayoutEffect(() => {
    resizeTextarea();
  }, [resizeTextarea, text, files.length, quotePreviewText, preparingFiles, prepareError]);

  useEffect(() => {
    if (files.length === 0) {
      setImagePreviewUrlsByIndex({});
      return undefined;
    }

    const previews = [];
    files.forEach((item, index) => {
      const file = readAttachmentFile(item);
      if (!(file instanceof File)) return;
      const type = String(file.type || "").trim().toLowerCase();
      if (!type.startsWith("image/")) return;
      const url = URL.createObjectURL(file);
      previews.push({ index, url });
    });

    setImagePreviewUrlsByIndex(
      previews.reduce((map, item) => {
        map[item.index] = item.url;
        return map;
      }, {}),
    );

    return () => {
      previews.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);

  useEffect(() => {
    onFilesChange?.(files);
  }, [files, onFilesChange]);

  return (
    <div
      className={`composer${inputDisabled ? " is-disabled" : ""}${
        isHomeLayout ? " is-home-layout" : ""
      }${isComposerExpanded ? " is-expanded" : " is-compact"}`}
    >
      {hasQuote && (
        <div className="composer-quote">
          <span className="composer-quote-text" title={normalizedQuoteText}>
            {quotePreviewText}
          </span>
          <button
            type="button"
            className="composer-quote-remove"
            onClick={() => onClearQuote?.()}
            aria-label="移除引用"
            title="移除引用"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="attach-bar">
          {files.map((f, idx) => {
            const isImage = isImageAttachment(f);
            const previewUrl = imagePreviewUrlsByIndex[idx] || "";

            if (isImage) {
              return (
                <div className="attach-image-chip" key={`${readFileName(f)}-${idx}`}>
                  {previewUrl ? (
                    <img src={previewUrl} alt={readFileName(f)} className="attach-image-thumb" />
                  ) : (
                    <span className="attach-image-fallback" aria-hidden="true">
                      <ImageIcon size={14} />
                    </span>
                  )}
                  <button
                    type="button"
                    className="attach-image-remove"
                    onClick={() => removeFile(idx)}
                    aria-label="移除附件"
                    title="移除"
                    disabled={inputDisabled || preparingFiles}
                  >
                    <X size={12} />
                  </button>
                </div>
              );
            }

            return (
              <div className="attach-chip" key={`${readFileName(f)}-${idx}`}>
                <span className="attach-name" title={readFileName(f)}>
                  {readFileName(f)}
                </span>
                <button
                  type="button"
                  className="attach-x"
                  onClick={() => removeFile(idx)}
                  aria-label="移除附件"
                  title="移除"
                  disabled={inputDisabled || preparingFiles}
                >
                  <X size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {preparingFiles && <p className="composer-file-status">文件上传中，请稍后</p>}
      {prepareError && <p className="composer-file-status error">{prepareError}</p>}

      <div className="composer-row">
        <input
          ref={fileRef}
          type="file"
          multiple
          accept={ACCEPT_UPLOAD_TYPES}
          onChange={onPickFiles}
          disabled={inputDisabled}
          style={{ display: "none" }}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={inputDisabled || preparingFiles}
          title="添加附件"
          aria-label="添加附件"
        >
          <Plus size={18} />
        </button>

        <textarea
          ref={textRef}
          className="composer-text"
          placeholder="有问题，尽管问"
          value={text}
          disabled={inputDisabled}
          onChange={(e) => setText(e.target.value)}
          onPaste={onComposerPaste}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            const composing =
              Boolean(e.nativeEvent?.isComposing) ||
              Number(e.nativeEvent?.keyCode) === 229;
            if (composing) return;
            e.preventDefault();
            submit();
          }}
          rows={1}
        />

        {isStreaming ? (
          <button
            type="button"
            className="send-icon stop-icon"
            onClick={() => onStop?.()}
            disabled={disabled}
            title="停止生成"
            aria-label="停止生成"
          >
            <Square size={16} fill="currentColor" />
          </button>
        ) : (
          <button
            type="button"
            className="send-icon"
            onClick={submit}
            disabled={!canSend || inputDisabled || preparingFiles}
            title="发送"
            aria-label="发送"
          >
            <ArrowUp size={18} />
          </button>
        )}
      </div>
    </div>
  );
}

function readFileName(fileLike) {
  return String(fileLike?.name || fileLike?.filename || "未命名文件");
}

function readAttachmentFile(item) {
  if (item instanceof File) return item;
  if (item?.file instanceof File) return item.file;
  return null;
}

function readAttachmentMimeType(item) {
  const localFile = readAttachmentFile(item);
  if (localFile) return String(localFile.type || "").trim().toLowerCase();
  return String(item?.mimeType || item?.type || "").trim().toLowerCase();
}

function isImageAttachment(item) {
  const inputType = String(item?.inputType || "").trim().toLowerCase();
  if (inputType === "input_image") return true;
  return readAttachmentMimeType(item).startsWith("image/");
}

function buildFinalPrompt(text, quoteText) {
  if (!quoteText) return text;
  if (!text) {
    return `请围绕这段内容继续解释或回答：\n「${quoteText}」`;
  }
  return `参考这段内容：\n「${quoteText}」\n\n我的问题：${text}`;
}

function normalizeQuoteText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function buildQuotePreviewText(value, maxChars) {
  const normalized = normalizeQuoteText(value);
  if (!normalized) return "";
  const safeMax = Number(maxChars);
  if (!Number.isFinite(safeMax) || safeMax <= 0) return normalized;
  const max = Math.floor(safeMax);
  const chars = Array.from(normalized);
  if (chars.length <= max) return normalized;
  return `${chars.slice(0, max).join("")}...`;
}
