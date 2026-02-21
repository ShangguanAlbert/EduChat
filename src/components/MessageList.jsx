import {
  ChevronDown,
  Copy,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import { Virtuoso } from "react-virtuoso";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useSessionStreamDraft } from "../pages/chat/streamDraftStore.js";

const MARKDOWN_COMPONENTS = {
  a: ({ node, ...props }) => {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

const VIRTUOSO_COMPONENTS = {
  List: forwardRef(function MessageVirtuosoList({ style, children, ...props }, ref) {
    return (
      <div {...props} ref={ref} className="messages-inner" style={style}>
        {children}
      </div>
    );
  }),
  Item: function MessageVirtuosoItem({ style, children, ...props }) {
    return (
      <div {...props} className="messages-virtuoso-item" style={style}>
        {children}
      </div>
    );
  },
  Footer: function MessageVirtuosoFooter() {
    return <div className="messages-bottom-spacer" aria-hidden="true" />;
  },
};

const MessageList = forwardRef(function MessageList({
  activeSessionId = "",
  messages,
  isStreaming = false,
  focusMessageId = "",
  bottomInset = 0,
  onAssistantFeedback,
  onAssistantRegenerate,
  onAskSelection,
  onLatestChange,
  showAssistantActions = true,
}, ref) {
  const streamDraft = useSessionStreamDraft(activeSessionId);
  const virtuosoRef = useRef(null);
  const rootRef = useRef(null);
  const prevStreamingRef = useRef(isStreaming);
  const isAtLatestRef = useRef(true);
  const displayedMessages = useMemo(() => {
    if (!streamDraft) return messages;
    return [...messages, streamDraft];
  }, [messages, streamDraft]);
  const messageIndexMap = useMemo(() => {
    const map = new Map();
    displayedMessages.forEach((message, index) => {
      if (message?.id) {
        map.set(message.id, index);
      }
    });
    return map;
  }, [displayedMessages]);
  const promptMap = useMemo(
    () => buildNearestPromptMap(displayedMessages),
    [displayedMessages],
  );
  const [askPopover, setAskPopover] = useState({
    open: false,
    text: "",
    x: 0,
    y: 0,
  });
  const virtuosoStyle = useMemo(() => {
    const safeInset = Number.isFinite(bottomInset) ? Math.max(0, Math.round(bottomInset)) : 0;
    return {
      "--messages-bottom-spacer": `${safeInset}px`,
    };
  }, [bottomInset]);

  const setScrollerRef = useCallback((node) => {
    if (
      typeof window !== "undefined" &&
      node instanceof window.HTMLElement
    ) {
      rootRef.current = node;
      return;
    }
    rootRef.current = null;
  }, []);

  const setLatestState = useCallback(
    (next) => {
      const value = !!next;
      if (value === isAtLatestRef.current) return;
      isAtLatestRef.current = value;
      onLatestChange?.(value);
    },
    [onLatestChange],
  );

  const checkIsAtLatest = useCallback(() => {
    const root = rootRef.current;
    if (!root) return true;

    const remain = root.scrollHeight - (root.scrollTop + root.clientHeight);
    const next = remain <= 40;
    setLatestState(next);
    return next;
  }, [setLatestState]);

  const jumpToLatest = useCallback(() => {
    if (!displayedMessages.length) {
      checkIsAtLatest();
      return;
    }
    virtuosoRef.current?.scrollToIndex?.({
      index: "LAST",
      align: "end",
      behavior: "auto",
    });
    requestAnimationFrame(() => {
      checkIsAtLatest();
    });
  }, [displayedMessages.length, checkIsAtLatest]);

  const scrollMessageToAnchor = useCallback(
    (messageId, duration = 620) => {
      if (!messageId) return;
      const targetIndex = messageIndexMap.get(messageId);
      if (typeof targetIndex !== "number") return;
      setLatestState(false);
      virtuosoRef.current?.scrollToIndex?.({
        index: targetIndex,
        align: "start",
        behavior: duration > 0 ? "smooth" : "auto",
      });
      requestAnimationFrame(() => {
        checkIsAtLatest();
      });
    },
    [messageIndexMap, setLatestState, checkIsAtLatest],
  );

  const scrollToLatest = useCallback(
    (duration = 420) => {
      if (!displayedMessages.length) return;
      virtuosoRef.current?.scrollToIndex?.({
        index: "LAST",
        align: "end",
        behavior: duration > 0 ? "smooth" : "auto",
      });
    },
    [displayedMessages.length],
  );

  const onAtBottomStateChange = useCallback(
    (atBottom) => {
      setLatestState(atBottom);
    },
    [setLatestState],
  );

  const renderMessageItem = useCallback(
    (index, m) => {
      void index;
      return (
        <MessageItem
          m={m}
          isStreaming={isStreaming}
          onAssistantFeedback={onAssistantFeedback}
          onAssistantRegenerate={onAssistantRegenerate}
          promptMessageId={promptMap.get(m.id) || ""}
          showAssistantActions={showAssistantActions}
        />
      );
    },
    [
      isStreaming,
      onAssistantFeedback,
      onAssistantRegenerate,
      promptMap,
      showAssistantActions,
    ],
  );

  useImperativeHandle(
    ref,
    () => ({
      scrollToLatest,
    }),
    [scrollToLatest],
  );

  useEffect(() => {
    if (!focusMessageId) return;
    requestAnimationFrame(() => {
      scrollMessageToAnchor(focusMessageId, 620);
    });
  }, [focusMessageId, scrollMessageToAnchor]);

  useEffect(() => {
    const wasStreaming = prevStreamingRef.current;
    if (wasStreaming && !isStreaming && focusMessageId) {
      scrollMessageToAnchor(focusMessageId, 680);
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, focusMessageId, scrollMessageToAnchor]);

  useEffect(() => {
    setLatestState(true);
    requestAnimationFrame(() => {
      jumpToLatest();
    });
  }, [activeSessionId, jumpToLatest, setLatestState]);

  useEffect(() => {
    if (!displayedMessages.length) {
      checkIsAtLatest();
      return;
    }
    if (!isAtLatestRef.current) {
      checkIsAtLatest();
      return;
    }
    requestAnimationFrame(() => {
      jumpToLatest();
    });
  }, [displayedMessages, jumpToLatest, checkIsAtLatest]);

  const closeAskPopover = useCallback(() => {
    setAskPopover((prev) => {
      if (!prev.open) return prev;
      return { open: false, text: "", x: 0, y: 0 };
    });
  }, []);

  const updateAskPopoverFromSelection = useCallback(() => {
    if (typeof onAskSelection !== "function") {
      closeAskPopover();
      return;
    }

    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) {
      closeAskPopover();
      return;
    }

    const text = selection.toString().replace(/\s+/g, " ").trim();
    if (!text) {
      closeAskPopover();
      return;
    }

    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (!rect || rect.width === 0 || rect.height === 0) {
      closeAskPopover();
      return;
    }

    const anchorEl = getElementFromNode(selection.anchorNode);
    const focusEl = getElementFromNode(selection.focusNode);
    if (!anchorEl || !focusEl) {
      closeAskPopover();
      return;
    }

    if (!root.contains(anchorEl) || !root.contains(focusEl)) {
      closeAskPopover();
      return;
    }

    const anchorMsg = anchorEl.closest(".msg.assistant");
    const focusMsg = focusEl.closest(".msg.assistant");
    if (!anchorMsg || !focusMsg || anchorMsg !== focusMsg) {
      closeAskPopover();
      return;
    }

    const inAssistantText =
      anchorEl.closest(".msg.assistant .msg-text") &&
      focusEl.closest(".msg.assistant .msg-text");
    if (!inAssistantText) {
      closeAskPopover();
      return;
    }

    setAskPopover({
      open: true,
      text,
      x: rect.left + rect.width / 2,
      y: Math.max(8, rect.top - 8),
    });
  }, [closeAskPopover, onAskSelection]);

  useEffect(() => {
    function onSelectionChange() {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        closeAskPopover();
      }
    }

    function onWindowScroll() {
      closeAskPopover();
    }

    document.addEventListener("selectionchange", onSelectionChange);
    window.addEventListener("scroll", onWindowScroll, true);
    window.addEventListener("resize", onWindowScroll);

    return () => {
      document.removeEventListener("selectionchange", onSelectionChange);
      window.removeEventListener("scroll", onWindowScroll, true);
      window.removeEventListener("resize", onWindowScroll);
    };
  }, [closeAskPopover]);

  function onMessageAreaMouseUp() {
    window.setTimeout(updateAskPopoverFromSelection, 0);
  }

  function onAskClick() {
    if (!askPopover.text) return;
    onAskSelection?.(askPopover.text);
    window.getSelection()?.removeAllRanges();
    closeAskPopover();
  }

  return (
    <>
      <Virtuoso
        ref={virtuosoRef}
        className="messages"
        style={virtuosoStyle}
        data={displayedMessages}
        computeItemKey={(index, item) => item?.id || index}
        components={VIRTUOSO_COMPONENTS}
        scrollerRef={setScrollerRef}
        atBottomThreshold={40}
        atBottomStateChange={onAtBottomStateChange}
        onMouseUp={onMessageAreaMouseUp}
        onKeyUp={onMessageAreaMouseUp}
        itemContent={renderMessageItem}
      />
      {askPopover.open && typeof onAskSelection === "function" && (
        <button
          type="button"
          className="selection-ask-btn"
          style={{
            left: `${askPopover.x}px`,
            top: `${askPopover.y}px`,
          }}
          onMouseDown={(e) => e.preventDefault()}
          onClick={onAskClick}
        >
          询问
        </button>
      )}
    </>
  );
});

export default MessageList;

const MessageItem = memo(function MessageItem({
  m,
  isStreaming,
  onAssistantFeedback,
  onAssistantRegenerate,
  promptMessageId,
  showAssistantActions,
}) {
  const [copied, setCopied] = useState(false);
  const [copiedAttachmentKey, setCopiedAttachmentKey] = useState("");
  const [previewImage, setPreviewImage] = useState(null);

  async function copyContent() {
    const text = m.content?.trim() || "";
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      setCopied(false);
    }
  }

  async function copyAttachmentUrl(url, key) {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedAttachmentKey(String(key || ""));
      setTimeout(() => setCopiedAttachmentKey(""), 1200);
    } catch {
      setCopiedAttachmentKey("");
    }
  }

  return (
    <div className={`msg ${m.role}`}>
      <div className={`msg-bubble ${m.role}`}>
        {m.reasoning?.trim() && (
          <details className="reasoning-panel">
            <summary className="reasoning-summary">
              <span className="reasoning-summary-icon" aria-hidden="true">
                <Sparkles size={18} />
              </span>
              <span className="reasoning-summary-chip">
                <span>显示思路</span>
                <ChevronDown size={18} className="reasoning-summary-caret" />
              </span>
            </summary>
            <div className="reasoning-content">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                rehypePlugins={[rehypeRaw]}
                components={MARKDOWN_COMPONENTS}
              >
                {m.reasoning}
              </ReactMarkdown>
            </div>
          </details>
        )}

        {m.attachments?.length > 0 && (
          <div className="msg-attachments">
            {m.attachments.map((a, idx) => {
              const attachmentUrl = readAttachmentUrl(a);
              const imageAttachment = isImageAttachment(a);
              const attachmentKey = `${a?.name || "file"}-${idx}`;
              const copiedLink = copiedAttachmentKey === attachmentKey;
              if (imageAttachment && attachmentUrl) {
                return (
                  <div className="file-card file-card-image" key={attachmentKey}>
                    <button
                      type="button"
                      className="file-image-btn"
                      onClick={() =>
                        setPreviewImage({
                          url: attachmentUrl,
                          name: a?.name || "图片附件",
                        })
                      }
                      aria-label="预览图片附件"
                      title="点击放大"
                    >
                      <img
                        src={attachmentUrl}
                        alt={a?.name || "图片附件"}
                        className="file-image-thumb"
                      />
                    </button>
                    <div className="file-meta">
                      <div className="file-name" title={a?.name}>
                        {a?.name || "图片附件"}
                      </div>
                      <div className="file-sub">
                        {a?.type ? a.type : "image"}
                        {typeof a?.size === "number" ? ` · ${formatBytes(a.size)}` : ""}
                      </div>
                    </div>
                    <div className="file-inline-actions">
                      <button
                        type="button"
                        className={`msg-action-btn ${copiedLink ? "active" : ""}`}
                        title={copiedLink ? "已复制链接" : "复制链接"}
                        aria-label="复制链接"
                        onClick={() => copyAttachmentUrl(attachmentUrl, attachmentKey)}
                      >
                        <Copy size={14} />
                      </button>
                      <a
                        href={attachmentUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="file-open-link"
                      >
                        打开
                      </a>
                    </div>
                  </div>
                );
              }

              return (
                <div className="file-card" key={attachmentKey}>
                  <div className="file-icon">📄</div>
                  <div className="file-meta">
                    <div className="file-name" title={a?.name}>
                      {a?.name}
                    </div>
                    <div className="file-sub">
                      {a?.type ? a.type : "file"}
                      {typeof a?.size === "number" ? ` · ${formatBytes(a.size)}` : ""}
                    </div>
                  </div>
                  {attachmentUrl ? (
                    <a
                      href={attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="file-open-link"
                    >
                      打开
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}

        {m.content?.trim() ? (
          <div className="msg-text md-body">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeRaw]}
              components={MARKDOWN_COMPONENTS}
            >
              {m.content}
            </ReactMarkdown>
          </div>
        ) : m.streaming ? (
          <div className="streaming-placeholder">正在回答中...</div>
        ) : null}

        {showAssistantActions && m.role === "assistant" && !m.streaming && (
          <div className="msg-actions">
            <button
              type="button"
              className={`msg-action-btn ${m.feedback === "up" ? "active" : ""}`}
              title="点赞"
              aria-label="点赞"
              onClick={() => onAssistantFeedback?.(m.id, "up")}
              disabled={isStreaming}
            >
              <ThumbsUp size={16} />
            </button>

            <button
              type="button"
              className={`msg-action-btn ${m.feedback === "down" ? "active" : ""}`}
              title="答得不好"
              aria-label="答得不好"
              onClick={() => onAssistantFeedback?.(m.id, "down")}
              disabled={isStreaming}
            >
              <ThumbsDown size={16} />
            </button>

            <button
              type="button"
              className="msg-action-btn"
              title="重新回答"
              aria-label="重新回答"
              onClick={() => onAssistantRegenerate?.(m.id, promptMessageId)}
              disabled={isStreaming || !promptMessageId}
            >
              <RotateCcw size={16} />
            </button>

            <button
              type="button"
              className={`msg-action-btn ${copied ? "active" : ""}`}
              title={copied ? "已复制" : "复制"}
              aria-label="复制"
              onClick={copyContent}
              disabled={isStreaming}
            >
              <Copy size={16} />
            </button>
          </div>
        )}
      </div>
      {previewImage?.url ? (
        <div
          className="msg-image-lightbox"
          onClick={() => setPreviewImage(null)}
          role="presentation"
        >
          <div
            className="msg-image-lightbox-content"
            onClick={(event) => event.stopPropagation()}
            role="presentation"
          >
            <img src={previewImage.url} alt={previewImage.name || "图片预览"} />
            <div className="msg-image-lightbox-actions">
              <button
                type="button"
                className="msg-action-btn"
                onClick={() => copyAttachmentUrl(previewImage.url, "lightbox")}
              >
                <Copy size={14} />
                <span>复制链接</span>
              </button>
              <a
                href={previewImage.url}
                target="_blank"
                rel="noopener noreferrer"
                className="file-open-link"
              >
                打开原图
              </a>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
});

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let b = bytes;
  let i = 0;
  while (b >= 1024 && i < units.length - 1) {
    b /= 1024;
    i += 1;
  }
  return `${b.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function buildNearestPromptMap(messages) {
  const map = new Map();
  let latestUserId = "";

  messages.forEach((m) => {
    if (m.role === "user") {
      latestUserId = m.id;
      map.set(m.id, "");
      return;
    }
    if (m.role === "assistant") {
      map.set(m.id, latestUserId);
      return;
    }
    map.set(m.id, "");
  });

  return map;
}

function getElementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === window.Node.ELEMENT_NODE) return node;
  return node.parentElement || null;
}

function readAttachmentUrl(attachment) {
  return String(attachment?.url || attachment?.fileUrl || "").trim();
}

function isImageAttachment(attachment) {
  const type = String(attachment?.type || "")
    .trim()
    .toLowerCase();
  if (type.startsWith("image/")) return true;
  const name = String(attachment?.name || "")
    .trim()
    .toLowerCase();
  return /\.(png|jpg|jpeg|gif|webp|bmp|svg|heic|avif)$/i.test(name);
}
