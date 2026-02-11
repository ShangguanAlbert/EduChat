import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Plus, ArrowUp, X } from "lucide-react";

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
  ".mp4",
  ".avi",
  ".mov",
  "video/*",
].join(",");

export default function MessageInput({
  onSend,
  disabled = false,
  quoteText = "",
  onClearQuote,
  onConsumeQuote,
  onPrepareFiles,
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState([]);
  const [preparingFiles, setPreparingFiles] = useState(false);
  const [prepareError, setPrepareError] = useState("");
  const fileRef = useRef(null);
  const textRef = useRef(null);

  const hasQuote = quoteText.trim().length > 0;
  const canSend = useMemo(() => {
    return text.trim().length > 0 || files.length > 0 || hasQuote;
  }, [text, files, hasQuote]);

  function submit() {
    if (!canSend || disabled || preparingFiles) return;

    const t = buildFinalPrompt(text.trim(), quoteText.trim());
    onSend(t, files);

    setText("");
    setFiles([]);
    setPrepareError("");
    onConsumeQuote?.();
    if (fileRef.current) fileRef.current.value = "";
  }

  async function onPickFiles(e) {
    const picked = Array.from(e.target.files || []);
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

  function removeFile(idx) {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  }

  useLayoutEffect(() => {
    if (!textRef.current) return;

    const minHeight = 30;
    const maxHeight = 132;

    textRef.current.style.height = "auto";
    const next = Math.min(
      maxHeight,
      Math.max(minHeight, textRef.current.scrollHeight),
    );
    textRef.current.style.height = `${next}px`;
  }, [text]);

  return (
    <div className="composer">
      {hasQuote && (
        <div className="composer-quote">
          <span className="composer-quote-text" title={quoteText}>
            {quoteText}
          </span>
          <button
            type="button"
            className="composer-quote-remove"
            onClick={() => onClearQuote?.()}
            aria-label="移除引用"
            title="移除引用"
            disabled={disabled}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {files.length > 0 && (
        <div className="attach-bar">
          {files.map((f, idx) => (
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
                disabled={disabled || preparingFiles}
              >
                <X size={14} />
              </button>
            </div>
          ))}
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
          disabled={disabled}
          style={{ display: "none" }}
        />

        <button
          type="button"
          className="icon-btn"
          onClick={() => fileRef.current?.click()}
          disabled={disabled || preparingFiles}
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
          disabled={disabled}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
        />

        <button
          type="button"
          className="send-icon"
          onClick={submit}
          disabled={!canSend || disabled || preparingFiles}
          title="发送"
          aria-label="发送"
        >
          <ArrowUp size={18} />
        </button>
      </div>
    </div>
  );
}

function readFileName(fileLike) {
  return String(fileLike?.name || fileLike?.filename || "未命名文件");
}

function buildFinalPrompt(text, quoteText) {
  if (!quoteText) return text;
  if (!text) {
    return `请围绕这段内容继续解释或回答：\n「${quoteText}」`;
  }
  return `参考这段内容：\n「${quoteText}」\n\n我的问题：${text}`;
}
