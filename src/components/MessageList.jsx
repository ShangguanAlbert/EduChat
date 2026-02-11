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
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useSessionStreamDraft } from "../pages/chat/streamDraftStore.js";

const MARKDOWN_COMPONENTS = {
  a: ({ node, ...props }) => {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
};

const MessageList = forwardRef(function MessageList({
  activeSessionId = "",
  messages,
  isStreaming = false,
  focusMessageId = "",
  onAssistantFeedback,
  onAssistantRegenerate,
  onAskSelection,
  onLatestChange,
  showAssistantActions = true,
}, ref) {
  const streamDraft = useSessionStreamDraft(activeSessionId);
  const rootRef = useRef(null);
  const messageRefMap = useRef(new Map());
  const scrollAnimFrameRef = useRef(0);
  const prevStreamingRef = useRef(isStreaming);
  const isAtLatestRef = useRef(true);
  const displayedMessages = useMemo(() => {
    if (!streamDraft) return messages;
    return [...messages, streamDraft];
  }, [messages, streamDraft]);
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

  const setMessageRef = useCallback((id, node) => {
    if (!id) return;
    if (node) {
      messageRefMap.current.set(id, node);
    } else {
      messageRefMap.current.delete(id);
    }
  }, []);

  const cancelScrollAnimation = useCallback(() => {
    if (!scrollAnimFrameRef.current) return;
    cancelAnimationFrame(scrollAnimFrameRef.current);
    scrollAnimFrameRef.current = 0;
  }, []);

  const checkIsAtLatest = useCallback(() => {
    const root = rootRef.current;
    if (!root) return true;

    const remain = root.scrollHeight - (root.scrollTop + root.clientHeight);
    const next = remain <= 40;
    if (next !== isAtLatestRef.current) {
      isAtLatestRef.current = next;
      onLatestChange?.(next);
    }
    return next;
  }, [onLatestChange]);

  const animateMessagesScroll = useCallback(
    (targetScrollTop, duration = 620) => {
      const root = rootRef.current;
      if (!root) return;

      const start = root.scrollTop;
      const delta = targetScrollTop - start;
      if (Math.abs(delta) < 1) {
        root.scrollTop = targetScrollTop;
        return;
      }

      cancelScrollAnimation();
      const startAt = performance.now();
      const easeInOutCubic = (t) =>
        t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

      const step = (now) => {
        const progress = Math.min(1, (now - startAt) / duration);
        root.scrollTop = start + delta * easeInOutCubic(progress);
        if (progress < 1) {
          scrollAnimFrameRef.current = requestAnimationFrame(step);
        } else {
          scrollAnimFrameRef.current = 0;
        }
      };

      scrollAnimFrameRef.current = requestAnimationFrame(step);
    },
    [cancelScrollAnimation],
  );

  const scrollMessageToAnchor = useCallback(
    (messageId, duration = 620) => {
      if (!messageId) return;
      const root = rootRef.current;
      if (!root) return;

      const targetNode = messageRefMap.current.get(messageId);
      if (!targetNode) return;

      const anchorOffset = 16;
      const maxScrollTop = Math.max(0, root.scrollHeight - root.clientHeight);
      const targetTop = Math.max(
        0,
        Math.min(targetNode.offsetTop - anchorOffset, maxScrollTop),
      );
      animateMessagesScroll(targetTop, duration);
    },
    [animateMessagesScroll],
  );

  const scrollToLatest = useCallback(
    (duration = 420) => {
      const root = rootRef.current;
      if (!root) return;
      const target = Math.max(0, root.scrollHeight - root.clientHeight);
      animateMessagesScroll(target, duration);
    },
    [animateMessagesScroll],
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

  useEffect(() => () => cancelScrollAnimation(), [cancelScrollAnimation]);

  useEffect(() => {
    checkIsAtLatest();
  }, [activeSessionId, displayedMessages, checkIsAtLatest]);

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

  function onMessagesScroll() {
    checkIsAtLatest();
  }

  return (
    <div
      className="messages"
      ref={rootRef}
      onScroll={onMessagesScroll}
      onMouseUp={onMessageAreaMouseUp}
      onKeyUp={onMessageAreaMouseUp}
      onWheelCapture={cancelScrollAnimation}
      onTouchStart={cancelScrollAnimation}
    >
      <div className="messages-inner">
        {displayedMessages.map((m) => (
          <MessageItem
            key={m.id}
            messageId={m.id}
            setMessageRef={setMessageRef}
            m={m}
            isStreaming={isStreaming}
            onAssistantFeedback={onAssistantFeedback}
            onAssistantRegenerate={onAssistantRegenerate}
            promptMessageId={promptMap.get(m.id) || ""}
            showAssistantActions={showAssistantActions}
          />
        ))}
      </div>

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
    </div>
  );
});

export default MessageList;

const MessageItem = memo(function MessageItem({
  messageId,
  setMessageRef,
  m,
  isStreaming,
  onAssistantFeedback,
  onAssistantRegenerate,
  promptMessageId,
  showAssistantActions,
}) {
  const [copied, setCopied] = useState(false);
  const rowRef = useCallback(
    (node) => {
      setMessageRef(messageId, node);
    },
    [setMessageRef, messageId],
  );

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

  return (
    <div className={`msg ${m.role}`} ref={rowRef}>
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
            {m.attachments.map((a, idx) => (
              <div className="file-card" key={`${a.name}-${idx}`}>
                <div className="file-icon">📄</div>
                <div className="file-meta">
                  <div className="file-name" title={a.name}>
                    {a.name}
                  </div>
                  <div className="file-sub">
                    {a.type ? a.type : "file"}
                    {typeof a.size === "number" ? ` · ${formatBytes(a.size)}` : ""}
                  </div>
                </div>
              </div>
            ))}
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
