import {
  Copy,
  Forward,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  Children,
  cloneElement,
  forwardRef,
  isValidElement,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { useSessionStreamDraft } from "../pages/chat/streamDraftStore.js";
import { normalizeRuntimeSnapshot } from "../pages/chat/chatHelpers.js";

const MARKDOWN_REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }]];
const REASONING_TOGGLE_ANIMATION_MS = 280;
const SESSION_SWITCH_SETTLE_MAX_MS = 1200;
const SESSION_SWITCH_SETTLE_QUIET_MS = 180;
const CJK_PUNCTUATION_PATTERN = /([，。！？；：、“”‘’（）《》〈〉「」『』【】〔〕…—·]+)/g;
const TYPOGRAPHY_SKIP_TAGS = new Set(["code", "pre", "kbd", "samp"]);

function wrapCjkPunctuation(text, keyPrefix) {
  const value = String(text || "");
  if (!value) return value;

  CJK_PUNCTUATION_PATTERN.lastIndex = 0;
  if (!CJK_PUNCTUATION_PATTERN.test(value)) return value;
  CJK_PUNCTUATION_PATTERN.lastIndex = 0;

  return value.split(CJK_PUNCTUATION_PATTERN).map((part, index) => {
    if (!part) return null;
    CJK_PUNCTUATION_PATTERN.lastIndex = 0;
    if (!CJK_PUNCTUATION_PATTERN.test(part)) return part;
    return (
      <span className="cjk-punctuation" key={`${keyPrefix}-${index}`}>
        {part}
      </span>
    );
  });
}

function renderTypographyNode(node, keyPrefix = "typography") {
  if (typeof node === "string") {
    return wrapCjkPunctuation(node, keyPrefix);
  }

  if (typeof node === "number" || typeof node === "bigint") {
    return node;
  }

  if (Array.isArray(node)) {
    return node.flatMap((child, index) => {
      const rendered = renderTypographyNode(child, `${keyPrefix}-${index}`);
      return Array.isArray(rendered) ? rendered : [rendered];
    });
  }

  if (!isValidElement(node)) {
    return node;
  }

  const tagName = typeof node.type === "string" ? node.type.toLowerCase() : "";
  if (TYPOGRAPHY_SKIP_TAGS.has(tagName)) {
    return node;
  }

  if (Children.count(node.props?.children) === 0) {
    return node;
  }

  const nextChildren = Children.map(node.props.children, (child, index) =>
    renderTypographyNode(child, `${keyPrefix}-${index}`),
  );

  return cloneElement(node, undefined, nextChildren);
}

function withTypography(TagName) {
  return function TypographyTag({ node, children, ...props }) {
    void node;
    return <TagName {...props}>{renderTypographyNode(children, TagName)}</TagName>;
  };
}

const MARKDOWN_COMPONENTS = {
  a: ({ node, ...props }) => {
    void node;
    return <a {...props} target="_blank" rel="noopener noreferrer" />;
  },
  p: withTypography("p"),
  h1: withTypography("h1"),
  h2: withTypography("h2"),
  h3: withTypography("h3"),
  h4: withTypography("h4"),
  li: withTypography("li"),
  blockquote: withTypography("blockquote"),
  td: withTypography("td"),
  th: withTypography("th"),
};

function normalizeRenderedMarkdown(value) {
  const text = String(value || "");
  if (!text) return "";

  const lines = text.split(/\r?\n/);
  for (let index = 0; index < lines.length - 1; index += 1) {
    const current = String(lines[index] || "").trim();
    const next = String(lines[index + 1] || "").trim();
    if (!current || !/^(?:=|-){3,}$/.test(next)) continue;
    if (
      current.startsWith("#") ||
      current.startsWith(">") ||
      current.startsWith("```") ||
      current.startsWith("~~~") ||
      current.startsWith("- ") ||
      current.startsWith("* ") ||
      current.startsWith("+ ") ||
      /^\d+\.\s/.test(current)
    ) {
      continue;
    }

    const looksLikeSentence =
      current.length >= 16 || /[,.!?;:，。！？；：）)]$/.test(current);
    if (!looksLikeSentence) continue;

    lines.splice(index + 1, 0, "");
    index += 1;
  }

  return lines.join("\n");
}

const MessageList = forwardRef(function MessageList({
  activeSessionId = "",
  messages,
  isStreaming = false,
  focusMessageId = "",
  bottomInset = 0,
  onAssistantFeedback,
  onAssistantRegenerate,
  onAssistantForward,
  onAskSelection,
  onLatestChange,
  showAssistantActions = true,
  disableAssistantCopy = false,
}, ref) {
  const streamDraft = useSessionStreamDraft(activeSessionId);
  const rootRef = useRef(null);
  const messagesInnerRef = useRef(null);
  const messageNodeMapRef = useRef(new Map());
  const prevStreamingRef = useRef(isStreaming);
  const isAtLatestRef = useRef(true);
  const suppressLatestStateUntilRef = useRef(0);
  const sessionSwitchSettlingUntilRef = useRef(0);
  const sessionSwitchReleaseTimerRef = useRef(0);
  const sessionSwitchMaxTimerRef = useRef(0);
  const reasoningToggleTimerRef = useRef(0);
  const settleScrollTimerRef = useRef(0);
  const resizeSettleFrameRef = useRef(0);
  const displayedMessages = useMemo(() => {
    const visibleMessages = (Array.isArray(messages) ? messages : []).filter(
      (message) => !message?.hidden,
    );
    if (!streamDraft || streamDraft?.hidden) return visibleMessages;
    return [...visibleMessages, streamDraft];
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
    (next, force = false) => {
      if (!force && Date.now() < suppressLatestStateUntilRef.current) return;
      const value = !!next;
      if (value === isAtLatestRef.current) return;
      isAtLatestRef.current = value;
      onLatestChange?.(value);
    },
    [onLatestChange],
  );

  const clearSessionSwitchSettling = useCallback(
    (forceLatestSync = true) => {
      if (sessionSwitchReleaseTimerRef.current) {
        window.clearTimeout(sessionSwitchReleaseTimerRef.current);
        sessionSwitchReleaseTimerRef.current = 0;
      }
      if (sessionSwitchMaxTimerRef.current) {
        window.clearTimeout(sessionSwitchMaxTimerRef.current);
        sessionSwitchMaxTimerRef.current = 0;
      }
      sessionSwitchSettlingUntilRef.current = 0;
      suppressLatestStateUntilRef.current = 0;

      if (!forceLatestSync) return;

      const root = rootRef.current;
      if (!root) {
        setLatestState(true, true);
        return;
      }

      const remain = root.scrollHeight - (root.scrollTop + root.clientHeight);
      setLatestState(remain <= 40, true);
    },
    [setLatestState],
  );

  const scheduleSessionSwitchRelease = useCallback(
    (delay = SESSION_SWITCH_SETTLE_QUIET_MS) => {
      if (Date.now() >= sessionSwitchSettlingUntilRef.current) return;
      if (sessionSwitchReleaseTimerRef.current) {
        window.clearTimeout(sessionSwitchReleaseTimerRef.current);
      }
      sessionSwitchReleaseTimerRef.current = window.setTimeout(() => {
        sessionSwitchReleaseTimerRef.current = 0;
        clearSessionSwitchSettling();
      }, delay);
    },
    [clearSessionSwitchSettling],
  );

  const checkIsAtLatest = useCallback(() => {
    const root = rootRef.current;
    if (!root) return true;

    const remain = root.scrollHeight - (root.scrollTop + root.clientHeight);
    if (Date.now() < sessionSwitchSettlingUntilRef.current) {
      if (remain <= 72) {
        return true;
      }
      clearSessionSwitchSettling(false);
    }
    const next = remain <= 40;
    setLatestState(next);
    return next;
  }, [clearSessionSwitchSettling, setLatestState]);

  const jumpToLatest = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!displayedMessages.length) {
      checkIsAtLatest();
      return;
    }
    root.scrollTo({
      top: root.scrollHeight,
      behavior: "auto",
    });
    requestAnimationFrame(() => {
      checkIsAtLatest();
    });
  }, [displayedMessages.length, checkIsAtLatest]);

  const scrollMessageToAnchor = useCallback(
    (messageId, duration = 620) => {
      const root = rootRef.current;
      const targetNode = messageNodeMapRef.current.get(messageId);
      if (!messageId) return;
      if (!root || !targetNode) return;
      setLatestState(false);
      const rootRect = root.getBoundingClientRect();
      const targetRect = targetNode.getBoundingClientRect();
      root.scrollTo({
        top: Math.max(0, root.scrollTop + (targetRect.top - rootRect.top) - 8),
        behavior: duration > 0 ? "smooth" : "auto",
      });
      requestAnimationFrame(() => {
        checkIsAtLatest();
      });
    },
    [setLatestState, checkIsAtLatest],
  );

  const scrollToLatest = useCallback(
    (duration = 420) => {
      const root = rootRef.current;
      if (!root || !displayedMessages.length) return;
      root.scrollTo({
        top: root.scrollHeight,
        behavior: duration > 0 ? "smooth" : "auto",
      });
    },
    [displayedMessages.length],
  );

  const settleToLatest = useCallback(() => {
    if (settleScrollTimerRef.current) {
      window.clearTimeout(settleScrollTimerRef.current);
      settleScrollTimerRef.current = 0;
    }

    requestAnimationFrame(() => {
      jumpToLatest();
      requestAnimationFrame(() => {
        jumpToLatest();
        settleScrollTimerRef.current = window.setTimeout(() => {
          settleScrollTimerRef.current = 0;
          jumpToLatest();
        }, 140);
      });
    });
  }, [jumpToLatest]);

  const prepareForReasoningToggle = useCallback(() => {
    const root = rootRef.current;
    if (!root) return;

    const capturedScrollTop = root.scrollTop;
    suppressLatestStateUntilRef.current = Date.now() + 420;
    if (reasoningToggleTimerRef.current) {
      window.clearTimeout(reasoningToggleTimerRef.current);
      reasoningToggleTimerRef.current = 0;
    }
    setLatestState(false, true);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const currentRoot = rootRef.current;
        if (!currentRoot) return;
        currentRoot.scrollTop = capturedScrollTop;
        reasoningToggleTimerRef.current = window.setTimeout(() => {
          suppressLatestStateUntilRef.current = 0;
          reasoningToggleTimerRef.current = 0;
          checkIsAtLatest();
        }, REASONING_TOGGLE_ANIMATION_MS);
      });
    });
  }, [checkIsAtLatest, setLatestState]);

  const renderMessageItem = useCallback(
    (index, m) => {
      void index;
      return (
        <MessageItem
          m={m}
          isStreaming={isStreaming}
          onAssistantFeedback={onAssistantFeedback}
          onAssistantRegenerate={onAssistantRegenerate}
          onAssistantForward={onAssistantForward}
          onReasoningToggle={prepareForReasoningToggle}
          promptMessageId={promptMap.get(m.id) || ""}
          showAssistantActions={showAssistantActions}
          disableAssistantCopy={disableAssistantCopy}
        />
      );
    },
    [
      isStreaming,
      onAssistantFeedback,
      onAssistantRegenerate,
      onAssistantForward,
      prepareForReasoningToggle,
      promptMap,
      showAssistantActions,
      disableAssistantCopy,
    ],
  );

  const registerMessageNode = useCallback((messageId, node) => {
    if (!messageId) return;
    if (node) {
      messageNodeMapRef.current.set(messageId, node);
      return;
    }
    messageNodeMapRef.current.delete(messageId);
  }, []);

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
    const nodeMap = messageNodeMapRef.current;
    const visibleIds = new Set(
      displayedMessages
        .map((message) => String(message?.id || "").trim())
        .filter(Boolean),
    );
    nodeMap.forEach((node, messageId) => {
      if (!visibleIds.has(messageId) || !node?.isConnected) {
        nodeMap.delete(messageId);
      }
    });
  }, [displayedMessages]);

  useEffect(() => {
    const nodeMap = messageNodeMapRef.current;
    return () => {
      if (reasoningToggleTimerRef.current) {
        window.clearTimeout(reasoningToggleTimerRef.current);
        reasoningToggleTimerRef.current = 0;
      }
      if (settleScrollTimerRef.current) {
        window.clearTimeout(settleScrollTimerRef.current);
        settleScrollTimerRef.current = 0;
      }
      if (sessionSwitchReleaseTimerRef.current) {
        window.clearTimeout(sessionSwitchReleaseTimerRef.current);
        sessionSwitchReleaseTimerRef.current = 0;
      }
      if (sessionSwitchMaxTimerRef.current) {
        window.clearTimeout(sessionSwitchMaxTimerRef.current);
        sessionSwitchMaxTimerRef.current = 0;
      }
      if (resizeSettleFrameRef.current) {
        window.cancelAnimationFrame(resizeSettleFrameRef.current);
        resizeSettleFrameRef.current = 0;
      }
      nodeMap.clear();
    };
  }, []);

  useLayoutEffect(() => {
    const settleUntil = Date.now() + SESSION_SWITCH_SETTLE_MAX_MS;
    sessionSwitchSettlingUntilRef.current = settleUntil;
    suppressLatestStateUntilRef.current = settleUntil;
    setLatestState(true, true);
    if (sessionSwitchReleaseTimerRef.current) {
      window.clearTimeout(sessionSwitchReleaseTimerRef.current);
      sessionSwitchReleaseTimerRef.current = 0;
    }
    if (sessionSwitchMaxTimerRef.current) {
      window.clearTimeout(sessionSwitchMaxTimerRef.current);
      sessionSwitchMaxTimerRef.current = 0;
    }
    sessionSwitchMaxTimerRef.current = window.setTimeout(() => {
      sessionSwitchMaxTimerRef.current = 0;
      clearSessionSwitchSettling();
    }, SESSION_SWITCH_SETTLE_MAX_MS);
    scheduleSessionSwitchRelease();
  }, [activeSessionId, clearSessionSwitchSettling, scheduleSessionSwitchRelease, setLatestState]);

  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const settling = Date.now() < sessionSwitchSettlingUntilRef.current;
    if (!settling && !isAtLatestRef.current) return;
    setLatestState(true, true);
    root.scrollTop = root.scrollHeight;
    if (settling) {
      scheduleSessionSwitchRelease();
    }
  }, [activeSessionId, displayedMessages, bottomInset, scheduleSessionSwitchRelease, setLatestState]);

  useEffect(() => {
    const root = rootRef.current;
    const messagesInner = messagesInnerRef.current;
    if (!root || !messagesInner || typeof ResizeObserver !== "function") {
      return undefined;
    }

    const handleResize = () => {
      if (resizeSettleFrameRef.current) {
        window.cancelAnimationFrame(resizeSettleFrameRef.current);
      }
      resizeSettleFrameRef.current = window.requestAnimationFrame(() => {
        resizeSettleFrameRef.current = 0;
        const currentRoot = rootRef.current;
        if (!currentRoot) return;

        const settling = Date.now() < sessionSwitchSettlingUntilRef.current;
        if (settling || isAtLatestRef.current) {
          setLatestState(true, true);
          currentRoot.scrollTop = currentRoot.scrollHeight;
          if (settling) {
            scheduleSessionSwitchRelease();
            return;
          }
        }

        checkIsAtLatest();
      });
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(root);
    resizeObserver.observe(messagesInner);

    return () => {
      resizeObserver.disconnect();
      if (resizeSettleFrameRef.current) {
        window.cancelAnimationFrame(resizeSettleFrameRef.current);
        resizeSettleFrameRef.current = 0;
      }
    };
  }, [checkIsAtLatest, scheduleSessionSwitchRelease, setLatestState]);

  useEffect(() => {
    if (!displayedMessages.length) {
      checkIsAtLatest();
      return;
    }
    if (Date.now() < sessionSwitchSettlingUntilRef.current) {
      jumpToLatest();
      return;
    }
    if (!isAtLatestRef.current) {
      checkIsAtLatest();
      return;
    }
    settleToLatest();
  }, [displayedMessages, settleToLatest, checkIsAtLatest]);

  useEffect(() => {
    if (!isAtLatestRef.current) return;
    if (Date.now() < sessionSwitchSettlingUntilRef.current) {
      jumpToLatest();
      return;
    }
    settleToLatest();
  }, [bottomInset, jumpToLatest, settleToLatest]);

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
      <div
        className="messages"
        ref={setScrollerRef}
        style={virtuosoStyle}
        onScroll={checkIsAtLatest}
        onMouseUp={onMessageAreaMouseUp}
        onKeyUp={onMessageAreaMouseUp}
      >
        <div className="messages-inner" ref={messagesInnerRef}>
          {displayedMessages.map((message, index) => {
            const messageKey = message?.id || index;
            return (
              <div
                key={messageKey}
                className="messages-list-item"
                data-message-id={message?.id || ""}
                ref={(node) => registerMessageNode(message?.id, node)}
              >
                {renderMessageItem(index, message)}
              </div>
            );
          })}
          <div className="messages-bottom-spacer" aria-hidden="true" />
        </div>
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
    </>
  );
});

export default MessageList;

const ReasoningDisclosure = memo(function ReasoningDisclosure({
  reasoningMarkdown,
  onReasoningToggle,
}) {
  const [open, setOpen] = useState(false);
  const [contentHeight, setContentHeight] = useState(0);
  const contentRef = useRef(null);

  useEffect(() => {
    const updateHeight = () => {
      const nextHeight = contentRef.current?.scrollHeight || 0;
      setContentHeight(nextHeight);
    };

    updateHeight();

    if (typeof ResizeObserver !== "function" || !contentRef.current) {
      return undefined;
    }

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(contentRef.current);
    return () => observer.disconnect();
  }, [reasoningMarkdown]);

  const handleToggle = useCallback(() => {
    onReasoningToggle?.();
    setOpen((current) => !current);
  }, [onReasoningToggle]);

  return (
    <div
      className={`reasoning-panel${open ? " is-open" : ""}`}
      style={{ "--reasoning-content-height": `${contentHeight}px` }}
    >
      <button
        type="button"
        className="reasoning-summary"
        aria-expanded={open}
        onClick={handleToggle}
      >
        <span className="reasoning-summary-icon" aria-hidden="true">
          <Sparkles size={18} />
        </span>
        <span className="reasoning-summary-chip">
          <span>{open ? "隐藏思路" : "显示思路"}</span>
        </span>
      </button>
      <div className="reasoning-collapse" aria-hidden={!open}>
        <div ref={contentRef} className="reasoning-content">
          <ReactMarkdown
            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={[rehypeRaw]}
            components={MARKDOWN_COMPONENTS}
          >
            {reasoningMarkdown}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
});

const MessageItem = memo(function MessageItem({
  m,
  isStreaming,
  onAssistantFeedback,
  onAssistantRegenerate,
  onAssistantForward,
  onReasoningToggle,
  promptMessageId,
  showAssistantActions,
  disableAssistantCopy,
}) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const reasoningMarkdown = normalizeRenderedMarkdown(m.reasoning);
  const contentMarkdown = normalizeRenderedMarkdown(m.content);
  const runtime = normalizeRuntimeSnapshot(m.runtime);
  const showAssistantActionRow =
    showAssistantActions && m.role === "assistant" && !m.streaming;
  const showRuntimeDebug =
    m.role === "assistant" &&
    runtime?.usage &&
    Number.isFinite(runtime.usage.total_tokens);
  const showMessageFooter = showAssistantActionRow || showRuntimeDebug;

  useEffect(() => {
    if (copyStatus === "idle") return undefined;
    const timer = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  async function copyContent() {
    const text = m.content?.trim() || "";
    if (!text) return;

    const fallbackCopy = () => {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      textarea.style.pointerEvents = "none";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        const copied = document.execCommand("copy");
        document.body.removeChild(textarea);
        return copied;
      } catch {
        document.body.removeChild(textarea);
        return false;
      }
    };

    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        setCopyStatus("copied");
        return;
      }
      setCopyStatus(fallbackCopy() ? "copied" : "failed");
    } catch {
      setCopyStatus(fallbackCopy() ? "copied" : "failed");
    }
  }

  async function downloadAttachment(url, filename) {
    if (!url) return;

    const triggerDownload = (href, suggestedName = "") => {
      const link = document.createElement("a");
      link.href = href;
      if (suggestedName) link.download = suggestedName;
      link.rel = "noopener noreferrer";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    };

    try {
      const response = await fetch(url, {
        credentials: "include",
      });
      if (!response.ok) {
        throw new Error(`download failed: ${response.status}`);
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      triggerDownload(objectUrl, String(filename || "").trim());
      window.setTimeout(() => {
        URL.revokeObjectURL(objectUrl);
      }, 1000);
    } catch {
      triggerDownload(url, String(filename || "").trim());
    }
  }

  return (
    <div className={`msg ${m.role}`}>
      <div className={`msg-bubble ${m.role}`}>
        {reasoningMarkdown.trim() && (
          <ReasoningDisclosure
            reasoningMarkdown={reasoningMarkdown}
            onReasoningToggle={onReasoningToggle}
          />
        )}

        {m.attachments?.length > 0 && (
          <div className="msg-attachments">
            {m.attachments.map((a, idx) => {
              const attachmentUrl = readAttachmentUrl(a);
              const imageAttachment = isImageAttachment(a);
              const attachmentKey = `${a?.name || "file"}-${idx}`;
              const attachmentThumbnailUrl = readAttachmentThumbnailUrl(a);
              const imageSrc = attachmentThumbnailUrl || attachmentUrl;
              if (imageAttachment && imageSrc) {
                return (
                  <div className="file-card file-card-image" key={attachmentKey}>
                    {attachmentUrl ? (
                      <a
                        href={attachmentUrl}
                        className="file-image-btn"
                        aria-label="下载图片附件"
                        title="点击下载图片"
                        download={a?.name || true}
                        onClick={(event) => {
                          event.preventDefault();
                          downloadAttachment(attachmentUrl, a?.name);
                        }}
                      >
                        <img
                          src={imageSrc}
                          alt={a?.name || "图片附件"}
                          className="file-image-thumb"
                          loading="eager"
                          decoding="async"
                        />
                      </a>
                    ) : (
                      <div className="file-image-btn" aria-hidden="true">
                        <img
                          src={imageSrc}
                          alt={a?.name || "图片附件"}
                          className="file-image-thumb"
                          loading="eager"
                          decoding="async"
                        />
                      </div>
                    )}
                  </div>
                );
              }

              return (
                <a
                  key={attachmentKey}
                  href={attachmentUrl || undefined}
                  className={`file-card ${attachmentUrl ? "file-card-link" : "file-card-static"}`}
                  aria-disabled={!attachmentUrl}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!attachmentUrl) return;
                    downloadAttachment(attachmentUrl, a?.name);
                  }}
                >
                  <div className="file-icon">📄</div>
                  <div className="file-meta">
                    <div className="file-name" title={a?.name}>
                      {a?.name}
                    </div>
                    <div className="file-sub">
                      {typeof a?.size === "number" ? formatBytes(a.size) : "文件"}
                    </div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {contentMarkdown.trim() ? (
          <div className="msg-text md-body">
            <ReactMarkdown
              remarkPlugins={MARKDOWN_REMARK_PLUGINS}
              rehypePlugins={[rehypeRaw]}
              components={MARKDOWN_COMPONENTS}
            >
              {contentMarkdown}
            </ReactMarkdown>
          </div>
        ) : m.streaming ? (
          <div className="streaming-placeholder">正在回答中...</div>
        ) : null}

        {showMessageFooter && (
          <div className="msg-footer">
            {showAssistantActionRow && (
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
                  className={`msg-action-btn ${copyStatus === "copied" ? "active" : ""} ${copyStatus === "failed" ? "is-error" : ""}`}
                  title={
                    disableAssistantCopy
                      ? "复制已禁用"
                      : copyStatus === "copied"
                        ? "已复制"
                        : copyStatus === "failed"
                          ? "复制失败"
                          : "复制"
                  }
                  aria-label="复制"
                  onClick={copyContent}
                  disabled={isStreaming || disableAssistantCopy}
                >
                  <Copy size={16} />
                </button>

                {typeof onAssistantForward === "function" ? (
                  <button
                    type="button"
                    className="msg-action-btn"
                    title="转发到左侧对话"
                    aria-label="转发到左侧对话"
                    onClick={() => onAssistantForward?.(m.id)}
                    disabled={isStreaming}
                  >
                    <Forward size={16} />
                  </button>
                ) : null}
              </div>
            )}

            {showRuntimeDebug && (
              <div className="msg-runtime-debug">
                <span className="msg-runtime-text">
                  {formatTokenCount(runtime.usage.total_tokens)} tokens
                </span>
              </div>
            )}
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

function formatTokenCount(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "-";
  return Math.max(0, Math.round(numeric)).toLocaleString("zh-CN");
}

function getElementFromNode(node) {
  if (!node) return null;
  if (node.nodeType === window.Node.ELEMENT_NODE) return node;
  return node.parentElement || null;
}

function readAttachmentUrl(attachment) {
  return String(attachment?.url || attachment?.fileUrl || "").trim();
}

function readAttachmentThumbnailUrl(attachment) {
  return String(
    attachment?.thumbnailUrl || attachment?.thumbUrl || attachment?.previewUrl || "",
  ).trim();
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
