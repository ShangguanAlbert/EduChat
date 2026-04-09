import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ChevronDown,
  Download,
  LoaderCircle,
  Minus,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";
import hljs from "highlight.js/lib/common";
import { Document, Page, pdfjs } from "react-pdf";
import ReactMarkdown from "react-markdown";
import rehypeRaw from "rehype-raw";
import remarkGfm from "remark-gfm";
import {
  fetchChatAttachmentDocumentPreviewBlob,
  fetchChatDocumentPreviewBlob,
} from "../../pages/chat/stateApi.js";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

const MIN_SCALE = 0.8;
const MAX_SCALE = 2.4;
const SCALE_STEP = 0.2;
const PREVIEW_RESIZE_SETTLE_MS = 180;
const PDFJS_ASSET_BASE = buildPdfjsAssetBaseUrl();
const PDF_DOCUMENT_OPTIONS = {
  cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
  cMapPacked: true,
  standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
  wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
};

export default function ChatDocumentPreview({
  document: activeDocument,
  documents = [],
  selectedContextDocumentKeys = [],
  onSelectDocument,
  onToggleContextDocument,
  onDownloadDocument,
  onClose,
}) {
  const viewportRef = useRef(null);
  const objectUrlRef = useRef("");
  const titleMenuRef = useRef(null);
  const pdfPageRefs = useRef(new Map());
  const [documentUrl, setDocumentUrl] = useState("");
  const [documentText, setDocumentText] = useState("");
  const [documentMode, setDocumentMode] = useState("");
  const [loadError, setLoadError] = useState("");
  const [loading, setLoading] = useState(false);
  const [pageCount, setPageCount] = useState(0);
  const [currentPdfPage, setCurrentPdfPage] = useState(1);
  const [scale, setScale] = useState(1);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [downloadPending, setDownloadPending] = useState(false);
  const [downloadError, setDownloadError] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [useNativePdfFallback, setUseNativePdfFallback] = useState(false);
  const [nativePdfFallbackMessage, setNativePdfFallbackMessage] = useState("");

  const selectedKeySet = useMemo(
    () => new Set(Array.isArray(selectedContextDocumentKeys) ? selectedContextDocumentKeys : []),
    [selectedContextDocumentKeys],
  );
  const canSwitchDocuments = documents.length > 1;
  const isSessionDocument = activeDocument?.source === "session";
  const isSelectedForContext = activeDocument ? selectedKeySet.has(activeDocument.key) : false;
  const activeDocumentLoadKey = useMemo(() => {
    if (!activeDocument) return "";

    if (activeDocument.source === "composer") {
      const file = activeDocument.file;
      return [
        "composer",
        activeDocument.key,
        activeDocument.kind,
        file instanceof File ? file.name : "",
        file instanceof File ? Number(file.size || 0) : 0,
        file instanceof File ? Number(file.lastModified || 0) : 0,
        file instanceof File ? String(file.type || "") : "",
        String(activeDocument.previewOssKey || ""),
        String(activeDocument.previewUrl || ""),
      ].join("::");
    }

    const attachment = activeDocument.attachment || {};
    return [
      "session",
      activeDocument.key,
      activeDocument.kind,
      activeDocument.sessionId,
      activeDocument.messageId,
      Number(activeDocument.attachmentIndex ?? -1),
      String(attachment?.ossKey || ""),
      String(attachment?.url || attachment?.fileUrl || ""),
      String(attachment?.name || attachment?.fileName || activeDocument.name || ""),
      String(attachment?.type || attachment?.mimeType || activeDocument.mimeType || ""),
      Number(attachment?.size || activeDocument.size || 0),
    ].join("::");
  }, [
    activeDocument,
  ]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;
    let resizeTimer = 0;

    const updateWidth = () => {
      setViewportWidth(viewport.clientWidth || 0);
    };
    const scheduleWidthUpdate = () => {
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
      resizeTimer = window.setTimeout(() => {
        resizeTimer = 0;
        updateWidth();
      }, PREVIEW_RESIZE_SETTLE_MS);
    };

    updateWidth();
    if (typeof ResizeObserver === "function") {
      const observer = new ResizeObserver(() => {
        scheduleWidthUpdate();
      });
      observer.observe(viewport);
      return () => {
        observer.disconnect();
        if (resizeTimer) {
          window.clearTimeout(resizeTimer);
        }
      };
    }

    window.addEventListener("resize", scheduleWidthUpdate);
    return () => {
      window.removeEventListener("resize", scheduleWidthUpdate);
      if (resizeTimer) {
        window.clearTimeout(resizeTimer);
      }
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [activeDocument?.key]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (!titleMenuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    setPageCount(0);
    setCurrentPdfPage(1);
    setScale(1);
    setLoadError("");
    setDownloadError("");
    setDocumentText("");
    setDocumentMode("");
    setUseNativePdfFallback(false);
    setNativePdfFallbackMessage("");

    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = "";
    }

    if (!activeDocument) {
      setDocumentUrl("");
      setLoading(false);
      return undefined;
    }

    const abortController = new AbortController();

    async function loadDocument() {
      try {
        setLoading(true);
        setDocumentUrl("");
        setDocumentText("");

        if (activeDocument.source === "composer") {
          const previewOssKey = String(activeDocument.previewOssKey || "").trim();
          const previewUrl = String(activeDocument.previewUrl || "").trim();
          if (previewOssKey || previewUrl) {
            const remoteBlob = await fetchChatAttachmentDocumentPreviewBlob({
              attachment: {
                ossKey: previewOssKey,
                url: previewUrl,
                name: activeDocument.name,
                mimeType: activeDocument.mimeType,
                type: activeDocument.mimeType,
              },
              signal: abortController.signal,
            });
            if (abortController.signal.aborted) return;

            if (activeDocument.kind === "markdown") {
              const nextText = await remoteBlob.text();
              if (abortController.signal.aborted) return;
              setDocumentText(nextText);
              setDocumentMode("markdown");
              setLoading(false);
              return;
            }

            if (activeDocument.kind === "html") {
              const nextText = await remoteBlob.text();
              if (abortController.signal.aborted) return;
              setDocumentText(nextText);
              setDocumentMode("html");
              setLoading(false);
              return;
            }

            if (activeDocument.kind === "text") {
              const nextText = await remoteBlob.text();
              if (abortController.signal.aborted) return;
              setDocumentText(nextText);
              setDocumentMode("text");
              setLoading(false);
              return;
            }

            const nextUrl = URL.createObjectURL(remoteBlob);
            objectUrlRef.current = nextUrl;
            setDocumentUrl(nextUrl);
            setDocumentMode("pdf");
            setLoading(false);
            return;
          }

          if (activeDocument.kind === "pdf") {
            const nextUrl = URL.createObjectURL(activeDocument.file);
            objectUrlRef.current = nextUrl;
            setDocumentUrl(nextUrl);
            setDocumentMode("pdf");
            setLoading(false);
            return;
          }

          if (activeDocument.kind === "html") {
            const nextText = await activeDocument.file.text();
            if (abortController.signal.aborted) return;
            setDocumentText(nextText);
            setDocumentMode("html");
            setLoading(false);
            return;
          }

          if (activeDocument.kind === "markdown") {
            const nextText = await activeDocument.file.text();
            if (abortController.signal.aborted) return;
            setDocumentText(nextText);
            setDocumentMode("markdown");
            setLoading(false);
            return;
          }

          if (activeDocument.kind === "text") {
            const nextText = await activeDocument.file.text();
            if (abortController.signal.aborted) return;
            setDocumentText(nextText);
            setDocumentMode("text");
            setLoading(false);
            return;
          }
        }

        const blob =
          activeDocument.source === "session"
            ? await fetchChatAttachmentDocumentPreviewBlob({
                sessionId: activeDocument.sessionId,
                messageId: activeDocument.messageId,
                attachmentIndex: activeDocument.attachmentIndex,
                attachment: activeDocument.attachment,
                signal: abortController.signal,
              })
            : await fetchChatDocumentPreviewBlob({
                file: activeDocument.file,
                signal: abortController.signal,
              });
        if (abortController.signal.aborted) return;

        if (activeDocument.kind === "markdown") {
          const nextText = await blob.text();
          if (abortController.signal.aborted) return;
          setDocumentText(nextText);
          setDocumentMode("markdown");
          setLoading(false);
          return;
        }

        if (activeDocument.kind === "html") {
          const nextText = await blob.text();
          if (abortController.signal.aborted) return;
          setDocumentText(nextText);
          setDocumentMode("html");
          setLoading(false);
          return;
        }

        if (activeDocument.kind === "text") {
          const nextText = await blob.text();
          if (abortController.signal.aborted) return;
          setDocumentText(nextText);
          setDocumentMode("text");
          setLoading(false);
          return;
        }

        const nextUrl = URL.createObjectURL(blob);
        objectUrlRef.current = nextUrl;
        setDocumentUrl(nextUrl);
        setDocumentMode(activeDocument.kind === "html" ? "html" : "pdf");
        setLoading(false);
      } catch (error) {
        if (abortController.signal.aborted) return;
        setLoading(false);
        setLoadError(error?.message || "文档预览生成失败，请稍后重试。");
      }
    }

    void loadDocument();

    return () => {
      abortController.abort();
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = "";
      }
    };
  }, [activeDocumentLoadKey]);

  const renderedPageWidth = Math.max(320, Math.floor(Math.max(320, viewportWidth - 40)));
  const isPdfReady = documentMode === "pdf" && !!documentUrl && !loading && !loadError;
  const isHtmlReady = documentMode === "html" && !loading && !loadError;
  const isMarkdownReady = documentMode === "markdown" && !loading && !loadError;
  const isTextReady = documentMode === "text" && !loading && !loadError;
  const canRenderDocument = Boolean(activeDocument);
  const showPdfToolbar = isPdfReady && !useNativePdfFallback;
  const pdfPageNumbers = useMemo(
    () => Array.from({ length: pageCount }, (_, index) => index + 1),
    [pageCount],
  );
  const htmlPreviewSrcDoc = useMemo(
    () => buildHtmlPreviewSrcDoc(documentText, activeDocument?.name || "HTML 预览"),
    [activeDocument?.name, documentText],
  );
  const codeLanguage = useMemo(
    () => resolveCodeHighlightLanguage(activeDocument?.name, activeDocument?.mimeType),
    [activeDocument?.mimeType, activeDocument?.name],
  );
  const highlightedCodeMarkup = useMemo(() => {
    const source = String(documentText || "");
    if (!source) return "";
    try {
      if (codeLanguage && hljs.getLanguage(codeLanguage)) {
        return hljs.highlight(source, {
          language: codeLanguage,
          ignoreIllegals: true,
        }).value;
      }
      return hljs.highlightAuto(source).value;
    } catch {
      return escapeHtml(source);
    }
  }, [codeLanguage, documentText]);
  const codeLineNumbers = useMemo(() => {
    const source = String(documentText || "");
    return Math.max(1, source.split("\n").length);
  }, [documentText]);

  useEffect(() => {
    if (!isPdfReady) return undefined;
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    let frameId = 0;
    const updateCurrentPdfPage = () => {
      frameId = 0;
      const viewportRect = viewport.getBoundingClientRect();
      const probeY = viewportRect.top + viewport.clientHeight * 0.35;
      let bestPage = 1;
      let bestDistance = Number.POSITIVE_INFINITY;

      pdfPageNumbers.forEach((page) => {
        const node = pdfPageRefs.current.get(page);
        if (!node) return;
        const rect = node.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - probeY);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestPage = page;
        }
      });

      setCurrentPdfPage((current) => (current === bestPage ? current : bestPage));
    };

    const scheduleUpdate = () => {
      if (frameId) return;
      frameId = window.requestAnimationFrame(updateCurrentPdfPage);
    };

    scheduleUpdate();
    viewport.addEventListener("scroll", scheduleUpdate, { passive: true });
    window.addEventListener("resize", scheduleUpdate);
    return () => {
      viewport.removeEventListener("scroll", scheduleUpdate);
      window.removeEventListener("resize", scheduleUpdate);
      if (frameId) window.cancelAnimationFrame(frameId);
    };
  }, [isPdfReady, pdfPageNumbers, scale, renderedPageWidth]);

  async function handleDownloadClick() {
    if (!activeDocument || typeof onDownloadDocument !== "function" || downloadPending) return;
    setDownloadPending(true);
    setDownloadError("");
    try {
      await onDownloadDocument(activeDocument);
    } catch (error) {
      setDownloadError(error?.message || "下载失败，请稍后重试。");
    } finally {
      setDownloadPending(false);
    }
  }

  function activateNativePdfFallback(message = "") {
    if (!documentUrl) return;
    setUseNativePdfFallback(true);
    setNativePdfFallbackMessage(
      String(message || "").trim() || "当前文档已自动切换为原生 PDF 预览。",
    );
    setLoadError("");
  }

  return (
    <aside className="chat-document-preview" aria-label={activeDocument?.name || "文档预览"}>
      <div className="chat-document-preview-header">
        <div className="chat-document-preview-copy">
          <div className="chat-document-preview-title-shell" ref={titleMenuRef}>
            {canSwitchDocuments ? (
              <button
                type="button"
                className={`chat-document-preview-title-trigger${menuOpen ? " is-open" : ""}`}
                onClick={() => setMenuOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={menuOpen}
                title={activeDocument?.name || "文档预览"}
              >
                <span className="chat-document-preview-title-content">
                  <span className="chat-document-preview-title">
                    {truncateDocumentName(activeDocument?.name || "文档预览")}
                  </span>
                  <span className="chat-document-preview-kind">
                    {readDocumentKindLabel(activeDocument?.kind)}
                  </span>
                </span>
                <span className="chat-document-preview-title-caret" aria-hidden="true">
                  <ChevronDown size={15} />
                </span>
              </button>
            ) : (
              <div className="chat-document-preview-title-trigger static">
                <span className="chat-document-preview-title-content">
                  <span className="chat-document-preview-title">
                    {truncateDocumentName(activeDocument?.name || "文档预览")}
                  </span>
                  <span className="chat-document-preview-kind">
                    {readDocumentKindLabel(activeDocument?.kind)}
                  </span>
                </span>
              </div>
            )}

            {canSwitchDocuments && menuOpen ? (
              <div className="chat-document-preview-dropdown" role="menu" aria-label="文件列表">
                {documents.map((item) => {
                  const isActive = item.key === activeDocument?.key;
                  const itemSelectedForContext = selectedKeySet.has(item.key);
                  return (
                    <button
                      key={item.key}
                      type="button"
                      role="menuitemradio"
                      aria-checked={isActive}
                      className={`chat-document-preview-dropdown-item${
                        isActive ? " is-active" : ""
                      }`}
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectDocument?.(item);
                      }}
                      title={item.name}
                    >
                      <span className="chat-document-preview-dropdown-copy">
                        <span className="chat-document-preview-dropdown-name">{item.name}</span>
                        <span className="chat-document-preview-dropdown-meta">
                          {readDocumentKindLabel(item.kind)}
                          {item.source === "session"
                            ? itemSelectedForContext
                              ? " · 已加入上下文"
                              : ""
                            : " · 本轮上传"}
                        </span>
                      </span>
                      {isActive ? <Check size={14} /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>
        <div className="chat-document-preview-header-actions">
          {isSessionDocument ? (
            <button
              type="button"
              className={`chat-document-preview-context-button${
                isSelectedForContext ? " is-selected" : ""
              }`}
              onClick={() => onToggleContextDocument?.(activeDocument)}
              title={isSelectedForContext ? "移出上下文" : "加入上下文"}
            >
              {isSelectedForContext ? <Check size={14} /> : null}
              <span>{isSelectedForContext ? "已加入" : "加入上下文"}</span>
            </button>
          ) : null}
          <button
            type="button"
            className="chat-document-preview-action"
            onClick={() => {
              void handleDownloadClick();
            }}
            disabled={!activeDocument || typeof onDownloadDocument !== "function" || downloadPending}
            aria-label={downloadPending ? "下载中" : "下载文档"}
            title={downloadPending ? "下载中" : "下载"}
          >
            <Download size={15} />
          </button>
          <button
            type="button"
            className="chat-document-preview-action ghost close"
            onClick={() => onClose?.()}
            aria-label="关闭文档预览"
            title="关闭"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {downloadError ? (
        <div className="chat-document-preview-inline-error" role="alert">
          {downloadError}
        </div>
      ) : null}
      {nativePdfFallbackMessage ? (
        <div className="chat-document-preview-inline-note" role="status">
          {nativePdfFallbackMessage}
        </div>
      ) : null}

      <div className="chat-document-preview-viewport" ref={viewportRef}>
        {!canRenderDocument ? (
          <div className="chat-document-preview-placeholder" role="status">
            <span>当前对话还没有可预览的文档。</span>
          </div>
        ) : null}

        {canRenderDocument && loading ? (
          <div className="chat-document-preview-placeholder" role="status">
            <LoaderCircle size={18} className="chat-document-preview-spinner" />
            <span>正在生成文档预览…</span>
          </div>
        ) : null}

        {canRenderDocument && !loading && loadError ? (
          <div className="chat-document-preview-placeholder error" role="alert">
            <span>{loadError}</span>
          </div>
        ) : null}

        {isPdfReady && useNativePdfFallback ? (
          <div className="chat-document-preview-rich-shell pdf-native">
            <iframe
              src={documentUrl}
              title={activeDocument?.name || "PDF 预览"}
              className="chat-document-preview-pdf-native-frame"
            />
          </div>
        ) : null}

        {isPdfReady && !useNativePdfFallback ? (
          <div className="chat-document-preview-canvas">
            <Document
              file={documentUrl}
              options={PDF_DOCUMENT_OPTIONS}
              loading={
                <div className="chat-document-preview-placeholder" role="status">
                  <LoaderCircle size={18} className="chat-document-preview-spinner" />
                  <span>正在加载 PDF 页面…</span>
                </div>
              }
              error="PDF 渲染失败，请重新上传后重试。"
              onLoadSuccess={({ numPages }) => {
                setPageCount(numPages);
              }}
              onLoadError={(error) => {
                const message = error?.message || "PDF 渲染失败，请重新上传后重试。";
                if (documentUrl) {
                  activateNativePdfFallback(message);
                  return;
                }
                setLoadError(message);
              }}
            >
              <div className="chat-document-preview-pdf-stack">
                {pdfPageNumbers.map((page) => (
                  <div
                    key={`${activeDocumentLoadKey || "doc"}-${page}-${scale}`}
                    ref={(node) => {
                      if (node) pdfPageRefs.current.set(page, node);
                      else pdfPageRefs.current.delete(page);
                    }}
                    className="chat-document-preview-page-shell"
                  >
                    <Page
                      pageNumber={page}
                      width={renderedPageWidth}
                      scale={scale}
                      className="chat-document-preview-page"
                      loading=""
                      renderAnnotationLayer
                      renderTextLayer
                      onRenderError={(error) => {
                        activateNativePdfFallback(
                          error?.message || "PDF 页面渲染失败，已切换为原生预览。",
                        );
                      }}
                    />
                  </div>
                ))}
              </div>
            </Document>
          </div>
        ) : null}

        {isHtmlReady ? (
          <div className="chat-document-preview-rich-shell html">
            <iframe
              key={activeDocumentLoadKey || "html-preview"}
              srcDoc={htmlPreviewSrcDoc}
              title={activeDocument?.name || "HTML 预览"}
              className="chat-document-preview-html-frame"
              sandbox=""
            />
          </div>
        ) : null}

        {isMarkdownReady ? (
          <div className="chat-document-preview-rich-shell markdown">
            <div className="chat-document-preview-markdown md-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw]}>
                {documentText || ""}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}

        {isTextReady ? (
          <div className="chat-document-preview-rich-shell text">
            <div className="chat-document-preview-code-shell">
              <div className="chat-document-preview-code-gutter" aria-hidden="true">
                {Array.from({ length: codeLineNumbers }, (_, index) => (
                  <span key={`line-${index + 1}`}>{index + 1}</span>
                ))}
              </div>
              <pre className="chat-document-preview-text-block">
                <code
                  className={`hljs${codeLanguage ? ` language-${codeLanguage}` : ""}`}
                  dangerouslySetInnerHTML={{ __html: highlightedCodeMarkup || "&nbsp;" }}
                />
              </pre>
            </div>
          </div>
        ) : null}
      </div>

      {showPdfToolbar ? (
        <div className="chat-document-preview-toolbar">
          <div className="chat-document-preview-toolbar-group">
            <span className="chat-document-preview-status">
              {pageCount > 0 ? `共 ${pageCount} 页` : "等待加载"}
            </span>
            {pageCount > 0 ? (
              <span className="chat-document-preview-status">
                {`第 ${Math.min(currentPdfPage, pageCount)} 页`}
              </span>
            ) : null}
          </div>

          <div className="chat-document-preview-toolbar-group">
            <button
              type="button"
              className="chat-document-preview-action"
              onClick={() => setScale((current) => clampScale(current - SCALE_STEP))}
              disabled={!isPdfReady || scale <= MIN_SCALE}
              aria-label="缩小"
              title="缩小"
            >
              <Minus size={16} />
            </button>
            <span className="chat-document-preview-status">{Math.round(scale * 100)}%</span>
            <button
              type="button"
              className="chat-document-preview-action"
              onClick={() => setScale((current) => clampScale(current + SCALE_STEP))}
              disabled={!isPdfReady || scale >= MAX_SCALE}
              aria-label="放大"
              title="放大"
            >
              <Plus size={16} />
            </button>
            <button
              type="button"
              className="chat-document-preview-action"
              onClick={() => setScale(1)}
              disabled={!isPdfReady || scale === 1}
              aria-label="恢复默认缩放"
              title="恢复默认缩放"
            >
              <RefreshCw size={15} />
            </button>
          </div>
        </div>
      ) : null}
    </aside>
  );
}

function clampScale(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Number(numeric.toFixed(2))));
}

function buildPdfjsAssetBaseUrl() {
  const basePath = String(import.meta.env.BASE_URL || "/");
  const normalizedBase = basePath.endsWith("/") ? basePath : `${basePath}/`;
  return `${normalizedBase}pdfjs/`;
}

function resolveDocumentExtension(name = "") {
  const match = String(name || "")
    .trim()
    .toLowerCase()
    .match(/\.([a-z0-9]+)$/i);
  return match?.[1] || "";
}

function resolveCodeHighlightLanguage(name = "", mimeType = "") {
  const ext = resolveDocumentExtension(name);
  const mime = String(mimeType || "").trim().toLowerCase();
  if (ext === "js" || ext === "jsx" || mime.includes("javascript")) return "javascript";
  if (ext === "ts" || ext === "tsx" || mime.includes("typescript")) return "typescript";
  if (ext === "py" || ext === "python" || mime.includes("python")) return "python";
  if (ext === "java" || mime.includes("java")) return "java";
  if (ext === "go" || mime.includes("x-go")) return "go";
  if (ext === "rs" || mime.includes("rust")) return "rust";
  if (ext === "rb" || mime.includes("ruby")) return "ruby";
  if (ext === "php" || mime.includes("php")) return "php";
  if (ext === "swift" || mime.includes("swift")) return "swift";
  if (ext === "kt" || ext === "kts" || mime.includes("kotlin")) return "kotlin";
  if (ext === "sql" || mime.includes("sql")) return "sql";
  if (ext === "json" || mime.includes("json")) return "json";
  if (ext === "yaml" || ext === "yml" || mime.includes("yaml")) return "yaml";
  if (ext === "xml" || ext === "html" || ext === "htm" || ext === "vue" || ext === "svelte" || mime.includes("xml") || mime.includes("html")) return "xml";
  if (ext === "css" || ext === "scss" || ext === "less" || mime.includes("css")) return "css";
  if (ext === "sh" || ext === "bash" || ext === "zsh" || mime.includes("shell")) return "bash";
  if (ext === "c" || ext === "h") return "c";
  if (["cc", "hh", "cpp", "hpp", "cxx", "hxx", "m", "mm"].includes(ext)) return "cpp";
  if (ext === "md" || ext === "markdown") return "markdown";
  return "";
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function buildHtmlPreviewSrcDoc(content = "", title = "HTML 预览") {
  const safeTitle = escapeHtml(title || "HTML 预览");
  const source = String(content || "");
  const injectStyle = `
    <style>
      html, body {
        margin: 0;
        padding: 0;
        min-height: 100%;
        background: #ffffff;
        scrollbar-width: none;
        -ms-overflow-style: none;
      }
      body::-webkit-scrollbar {
        display: none;
        width: 0;
        height: 0;
      }
    </style>
  `;

  if (/<html[\s>]/i.test(source)) {
    if (/<head[\s>]/i.test(source)) {
      return source.replace(/<head(\s[^>]*)?>/i, (match) => `${match}${injectStyle}`);
    }
    return source.replace(/<html(\s[^>]*)?>/i, (match) => `${match}<head>${injectStyle}</head>`);
  }

  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${safeTitle}</title>
    ${injectStyle}
  </head>
  <body>${source}</body>
</html>`;
}

function readDocumentKindLabel(kind) {
  if (kind === "word") return "Word";
  if (kind === "html") return "HTML";
  if (kind === "markdown") return "Markdown";
  if (kind === "text") return "Code";
  return "PDF";
}

function truncateDocumentName(name, maxLength = 25) {
  const text = String(name || "").trim();
  if (!text) return "文档预览";
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}
