import {
  Copy,
  Download,
  Forward,
  NotebookPen,
  RotateCcw,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  X,
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
import { createPortal } from "react-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import StreamingMarkdown from "./streaming/StreamingMarkdown.jsx";
import { useSessionStreamDraft } from "../pages/chat/streamDraftStore.js";
import { normalizeRuntimeSnapshot } from "../pages/chat/chatHelpers.js";

const MARKDOWN_REMARK_PLUGINS = [[remarkGfm, { singleTilde: false }]];
const REASONING_TOGGLE_ANIMATION_MS = 280;
const SESSION_SWITCH_SETTLE_MAX_MS = 1200;
const SESSION_SWITCH_SETTLE_QUIET_MS = 180;
const MANUAL_SCROLL_PAUSE_MS = 900;
const LATEST_STATE_ENTER_THRESHOLD_PX = 24;
const LATEST_STATE_EXIT_THRESHOLD_PX = 72;
const ASK_POPOVER_EDGE_MARGIN = 56;
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

function createMarkdownComponents(onImagePreview) {
  return {
    a: ({ node, ...props }) => {
      void node;
      return <a {...props} target="_blank" rel="noopener noreferrer" />;
    },
    img: ({
      node,
      src,
      alt,
      title,
      className,
      loading,
      decoding,
      ...props
    }) => {
      void node;
      const imageSrc = String(src || "").trim();
      const imageAlt = String(alt || title || "图片").trim();
      const imageName = imageAlt || getImageNameFromUrl(imageSrc) || "图片";
      const imageClassName = ["markdown-image-preview-img", className]
        .filter(Boolean)
        .join(" ");

      if (!imageSrc || typeof onImagePreview !== "function") {
        return (
          <img
            {...props}
            src={src}
            alt={alt || ""}
            title={title}
            className={className}
            loading={loading || "lazy"}
            decoding={decoding || "async"}
          />
        );
      }

      return (
        <button
          type="button"
          className="markdown-image-preview-btn"
          aria-label={`预览图片：${imageName}`}
          title="点击预览图片"
          onClick={(event) => {
            event.preventDefault();
            event.stopPropagation();
            onImagePreview({
              src: imageSrc,
              alt: imageAlt || "图片",
              name: imageName,
              attachment: null,
              attachmentIndex: -1,
              canResolveDownload: true,
            });
          }}
        >
          <img
            {...props}
            src={imageSrc}
            alt={imageAlt || "图片"}
            title={title}
            className={imageClassName}
            loading={loading || "lazy"}
            decoding={decoding || "async"}
          />
        </button>
      );
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
}

const MARKDOWN_COMPONENTS = createMarkdownComponents();

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

function resolveIsAtLatestWithHysteresis(remain, previousIsAtLatest = true) {
  const safeRemain = Number.isFinite(remain) ? remain : Number.POSITIVE_INFINITY;
  if (previousIsAtLatest) {
    return safeRemain <= LATEST_STATE_EXIT_THRESHOLD_PX;
  }
  return safeRemain <= LATEST_STATE_ENTER_THRESHOLD_PX;
}

const MessageList = forwardRef(function MessageList({
  activeSessionId = "",
  messages,
  isStreaming = false,
  streamingStatusText = "正在回答中...",
  focusMessageId = "",
  bottomInset = 0,
  onDownloadAttachment,
  onAssistantFeedback,
  onAssistantRegenerate,
  onAssistantForward,
  onSaveNote,
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
  const manualScrollPauseUntilRef = useRef(0);
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
      setLatestState(
        resolveIsAtLatestWithHysteresis(remain, isAtLatestRef.current),
        true,
      );
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
        if (remain <= LATEST_STATE_EXIT_THRESHOLD_PX) {
          return true;
        }
        clearSessionSwitchSettling(false);
      }
      const next = resolveIsAtLatestWithHysteresis(remain, isAtLatestRef.current);
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

  const pauseAutoStickToLatest = useCallback(
    (duration = MANUAL_SCROLL_PAUSE_MS) => {
      manualScrollPauseUntilRef.current = Date.now() + Math.max(0, duration);
      setLatestState(false, true);
    },
    [setLatestState],
  );

  const canAutoStickToLatest = useCallback(() => {
    return Date.now() >= manualScrollPauseUntilRef.current;
  }, []);

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
      settleScrollTimerRef.current = window.setTimeout(() => {
        settleScrollTimerRef.current = 0;
        jumpToLatest();
      }, 96);
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
          onDownloadAttachment={onDownloadAttachment}
          isStreaming={isStreaming}
          streamingStatusText={streamingStatusText}
          onAssistantFeedback={onAssistantFeedback}
          onAssistantRegenerate={onAssistantRegenerate}
          onAssistantForward={onAssistantForward}
          onSaveNote={onSaveNote}
          onReasoningToggle={prepareForReasoningToggle}
          promptMessageId={promptMap.get(m.id) || ""}
          showAssistantActions={showAssistantActions}
          disableAssistantCopy={disableAssistantCopy}
        />
      );
    },
    [
      isStreaming,
      streamingStatusText,
      onDownloadAttachment,
      onAssistantFeedback,
      onAssistantRegenerate,
      onAssistantForward,
      onSaveNote,
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
    if (!canAutoStickToLatest()) return;
    if (!settling && !isAtLatestRef.current) return;
    setLatestState(true, true);
    root.scrollTop = root.scrollHeight;
    if (settling) {
      scheduleSessionSwitchRelease();
    }
  }, [
    activeSessionId,
    bottomInset,
    canAutoStickToLatest,
    displayedMessages,
    scheduleSessionSwitchRelease,
    setLatestState,
  ]);

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
        if (canAutoStickToLatest() && (settling || isAtLatestRef.current)) {
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
  }, [canAutoStickToLatest, checkIsAtLatest, scheduleSessionSwitchRelease, setLatestState]);

  useEffect(() => {
    if (!displayedMessages.length) {
      checkIsAtLatest();
      return;
    }
    if (!canAutoStickToLatest()) {
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
  }, [canAutoStickToLatest, displayedMessages, settleToLatest, checkIsAtLatest, jumpToLatest]);

  useEffect(() => {
    if (!canAutoStickToLatest()) return;
    if (!isAtLatestRef.current) return;
    if (Date.now() < sessionSwitchSettlingUntilRef.current) {
      jumpToLatest();
      return;
    }
    settleToLatest();
  }, [bottomInset, canAutoStickToLatest, jumpToLatest, settleToLatest]);

  const closeAskPopover = useCallback(() => {
    setAskPopover((prev) => {
      if (!prev.open) return prev;
      return { open: false, text: "", x: 0, y: 0 };
    });
  }, []);

  const handleMessageAreaCopy = useCallback((event) => {
    const clipboard = event?.clipboardData;
    if (!clipboard || typeof window === "undefined") return;

    const root = rootRef.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0 || selection.isCollapsed) return;

    const anchorEl = getElementFromNode(selection.anchorNode);
    const focusEl = getElementFromNode(selection.focusNode);
    if (!anchorEl || !focusEl) return;
    if (!root.contains(anchorEl) || !root.contains(focusEl)) return;

    const anchorText = anchorEl.closest(".msg-text");
    const focusText = focusEl.closest(".msg-text");
    if (!anchorText || !focusText) return;

    const text = selection.toString();
    if (!text) return;

    event.preventDefault();
    clipboard.clearData();
    clipboard.setData("text/plain", text);
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
    const rect = getAskPopoverAnchorRect(range);
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
      x: clampToViewport(rect.left + rect.width / 2, ASK_POPOVER_EDGE_MARGIN),
      y: Math.max(46, rect.top - 8),
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
        onWheel={(event) => {
          if (event.deltaY < 0) {
            pauseAutoStickToLatest();
          }
        }}
        onCopy={handleMessageAreaCopy}
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
      {askPopover.open &&
        typeof onAskSelection === "function" &&
        typeof document !== "undefined" &&
        createPortal(
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
          </button>,
          document.body,
        )}
    </>
  );
});

export default MessageList;

const ReasoningDisclosure = memo(function ReasoningDisclosure({
  reasoningContent,
  isStreaming = false,
  normalizeContent,
  onReasoningToggle,
  markdownComponents = MARKDOWN_COMPONENTS,
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
  }, [reasoningContent, isStreaming]);

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
          <StreamingMarkdown
            content={reasoningContent}
            streaming={isStreaming}
            normalizeContent={normalizeContent}
            remarkPlugins={MARKDOWN_REMARK_PLUGINS}
            rehypePlugins={[rehypeRaw]}
            components={markdownComponents}
          />
        </div>
      </div>
    </div>
  );
});

const MessageItem = memo(function MessageItem({
  m,
  onDownloadAttachment,
  isStreaming,
  streamingStatusText = "正在回答中...",
  onAssistantFeedback,
  onAssistantRegenerate,
  onAssistantForward,
  onSaveNote,
  onReasoningToggle,
  promptMessageId,
  showAssistantActions,
  disableAssistantCopy,
}) {
  const [copyStatus, setCopyStatus] = useState("idle");
  const [previewImage, setPreviewImage] = useState(null);
  const [previewDownloadPending, setPreviewDownloadPending] = useState(false);
  const rawReasoning = String(m.reasoning || "");
  const rawContent = String(m.content || "");
  const reasoningMarkdown = m.streaming
    ? ""
    : normalizeRenderedMarkdown(rawReasoning);
  const contentMarkdown = m.streaming ? "" : normalizeRenderedMarkdown(rawContent);
  const hasReasoningContent = m.streaming
    ? rawReasoning.length > 0
    : !!reasoningMarkdown.trim();
  const hasContent = m.streaming ? rawContent.length > 0 : !!contentMarkdown.trim();
  const runtime = normalizeRuntimeSnapshot(m.runtime);
  const showAssistantActionRow =
    showAssistantActions && m.role === "assistant" && !m.streaming;
  const showSaveNoteAction =
    typeof onSaveNote === "function" &&
    m.role === "assistant" &&
    !m.streaming &&
    !!contentMarkdown.trim();
  const showRuntimeDebug =
    m.role === "assistant" &&
    runtime?.usage &&
    Number.isFinite(runtime.usage.total_tokens);
  const showMessageFooter = showAssistantActionRow || showSaveNoteAction || showRuntimeDebug;
  const openImagePreview = useCallback((image) => {
    const imageSrc = String(image?.src || "").trim();
    const isLoadingOriginal = Boolean(image?.isLoadingOriginal);
    if (!imageSrc && !isLoadingOriginal) return;
    setPreviewImage({
      src: imageSrc,
      alt: String(image?.alt || image?.name || "图片").trim() || "图片",
      name:
        String(image?.name || image?.alt || "").trim() ||
        getImageNameFromUrl(imageSrc) ||
        "图片",
      attachment: image?.attachment || null,
      attachmentIndex: Number.isInteger(image?.attachmentIndex)
        ? image.attachmentIndex
        : -1,
      canResolveDownload: Boolean(image?.canResolveDownload || imageSrc),
      isLoadingOriginal,
    });
  }, []);
  const markdownComponents = useMemo(
    () => createMarkdownComponents(openImagePreview),
    [openImagePreview],
  );

  useEffect(() => {
    if (copyStatus === "idle") return undefined;
    const timer = window.setTimeout(() => {
      setCopyStatus("idle");
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [copyStatus]);

  useEffect(() => {
    if (!previewImage) return undefined;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setPreviewImage(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [previewImage]);

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

  async function downloadResolvedUrl(resolvedUrl, resolvedFilename) {
    if (!resolvedUrl) return;

    const link = document.createElement("a");
    link.href = resolvedUrl;
    if (resolvedFilename) link.download = resolvedFilename;
    link.rel = "noopener noreferrer";
    link.target = "_blank";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  async function resolveAttachmentTarget(attachment, attachmentIndex, options = {}) {
    const fallbackUrl = readAttachmentUrl(attachment);
    const fallbackFilename = String(attachment?.name || "").trim();
    const shouldPreferFreshDownload = typeof onDownloadAttachment === "function";
    let resolvedUrl = shouldPreferFreshDownload ? "" : fallbackUrl;
    let resolvedFilename = fallbackFilename;

    if (shouldPreferFreshDownload) {
      try {
        const result = await onDownloadAttachment(
          m,
          attachment,
          attachmentIndex,
          options,
        );
        const nextUrl = String(result?.downloadUrl || result?.url || "").trim();
        const nextFilename = String(
          result?.fileName || result?.filename || fallbackFilename,
        ).trim();
        if (nextUrl) {
          resolvedUrl = nextUrl;
        }
        if (nextFilename) {
          resolvedFilename = nextFilename;
        }
      } catch {
        return null;
      }
    }

    if (!resolvedUrl) return null;
    return {
      url: resolvedUrl,
      filename: resolvedFilename,
    };
  }

  async function downloadAttachment(attachment, attachmentIndex) {
    const target = await resolveAttachmentTarget(attachment, attachmentIndex);
    if (!target?.url) return;
    await downloadResolvedUrl(target.url, target.filename);
  }

  async function handlePreviewDownload() {
    if (!previewImage || previewDownloadPending) return;
    setPreviewDownloadPending(true);
    try {
      if (previewImage.attachment) {
        await downloadAttachment(previewImage.attachment, previewImage.attachmentIndex);
      } else {
        await downloadResolvedUrl(previewImage.src, previewImage.name);
      }
    } finally {
      setPreviewDownloadPending(false);
    }
  }

  async function handleAttachmentImagePreview(
    event,
    attachment,
    attachmentIndex,
    fallbackSrc,
    canResolveDownload,
  ) {
    event.preventDefault();
    event.stopPropagation();

    const fallbackUrl = String(fallbackSrc || "").trim();
    const directUrl = readAttachmentUrl(attachment);
    const previewName = String(attachment?.name || "图片附件").trim() || "图片附件";
    const shouldResolveOriginal =
      typeof onDownloadAttachment === "function" && canResolveDownload;
    if (!shouldResolveOriginal) {
      openImagePreview({
        src: directUrl || fallbackUrl,
        alt: previewName,
        name: previewName,
        attachment,
        attachmentIndex,
        canResolveDownload,
        isLoadingOriginal: false,
      });
      return;
    }

    if (fallbackUrl) {
      openImagePreview({
        src: fallbackUrl,
        alt: previewName,
        name: previewName,
        attachment,
        attachmentIndex,
        canResolveDownload,
        isLoadingOriginal: true,
      });
    }

    const target = await resolveAttachmentTarget(attachment, attachmentIndex, {
      mode: "inline",
    });
    if (!fallbackUrl && target?.url) {
      openImagePreview({
        src: target.url,
        alt: previewName,
        name: target.filename || previewName,
        attachment,
        attachmentIndex,
        canResolveDownload: true,
        isLoadingOriginal: false,
      });
      return;
    }

    setPreviewImage((current) => {
      if (
        !current ||
        current.attachment !== attachment ||
        current.attachmentIndex !== attachmentIndex
      ) {
        return current;
      }
      if (!target?.url) {
        return { ...current, isLoadingOriginal: false };
      }
      return {
        ...current,
        src: target.url,
        name: target.filename || current.name,
        isLoadingOriginal: false,
        canResolveDownload: true,
      };
    });
  }

  function readSelectedTextWithinCurrentMessage(event) {
    if (typeof window === "undefined") return "";
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return "";
    const messageNode = event?.currentTarget?.closest?.(".msg");
    if (!messageNode) return "";
    const anchorEl = getElementFromNode(selection.anchorNode);
    const focusEl = getElementFromNode(selection.focusNode);
    if (!anchorEl || !focusEl) return "";
    if (!messageNode.contains(anchorEl) || !messageNode.contains(focusEl)) return "";
    const anchorText = anchorEl.closest(".msg-text");
    const focusText = focusEl.closest(".msg-text");
    if (!anchorText || !focusText || anchorText !== focusText) return "";
    return selection.toString().replace(/\s+/g, " ").trim();
  }

  return (
    <>
      <div className={`msg ${m.role}`}>
        <div className={`msg-bubble ${m.role}`}>
        {hasReasoningContent && (
          <ReasoningDisclosure
            reasoningContent={rawReasoning}
            isStreaming={!!m.streaming}
            normalizeContent={normalizeRenderedMarkdown}
            onReasoningToggle={onReasoningToggle}
            markdownComponents={markdownComponents}
          />
        )}

        {m.attachments?.length > 0 && (
          <div className="msg-attachments">
            {m.attachments.map((a, idx) => {
              const attachmentUrl = readAttachmentUrl(a);
              const canResolveDownload =
                !!attachmentUrl ||
                !!String(a?.ossKey || "").trim() ||
                typeof onDownloadAttachment === "function";
              const imageAttachment = isImageAttachment(a);
              const attachmentKey = `${a?.name || "file"}-${idx}`;
              const attachmentThumbnailUrl = readAttachmentThumbnailUrl(a);
              const imageSrc = attachmentThumbnailUrl || attachmentUrl;
              const attachmentKind = getAttachmentKind(a);
              const attachmentTypeLabel = getAttachmentTypeLabel(attachmentKind);
              const attachmentSizeLabel =
                typeof a?.size === "number" ? formatBytes(a.size) : "";
              const attachmentMetaLabel = [attachmentTypeLabel, attachmentSizeLabel]
                .filter(Boolean)
                .join(" · ");
              const cardClassName = [
                "file-card",
                `file-card-${attachmentKind}`,
                imageAttachment ? "file-card-image" : "",
              ]
                .filter(Boolean)
                .join(" ");
              if (imageAttachment && imageSrc) {
                return (
                  <button
                    type="button"
                    key={attachmentKey}
                    className={`${cardClassName} file-card-button file-image-btn file-image-preview-btn`}
                    aria-label="预览图片附件"
                    title="点击预览图片"
                    onClick={(event) => {
                      void handleAttachmentImagePreview(
                        event,
                        a,
                        idx,
                        attachmentThumbnailUrl,
                        canResolveDownload,
                      );
                    }}
                  >
                    <div className="file-thumb-shell">
                      <img
                        src={imageSrc}
                        alt={a?.name || "图片附件"}
                        className="file-image-thumb"
                        loading="eager"
                        decoding="async"
                      />
                    </div>
                    <div className="file-meta">
                      <div className="file-name" title={a?.name}>
                        {a?.name}
                      </div>
                      <div className="file-sub">{attachmentMetaLabel || "图片"}</div>
                    </div>
                  </button>
                );
              }

              return (
                <a
                  key={attachmentKey}
                  href={typeof onDownloadAttachment === "function" ? undefined : attachmentUrl || undefined}
                  className={`${cardClassName} ${canResolveDownload ? "file-card-link" : "file-card-static"}`}
                  aria-disabled={!canResolveDownload}
                  onClick={(event) => {
                    event.preventDefault();
                    if (!canResolveDownload) return;
                    void downloadAttachment(a, idx);
                  }}
                >
                  <div className="file-thumb-shell">
                    <div className="file-icon" aria-hidden="true">
                      <span className="file-icon-sheet" />
                      <span className="file-icon-label">
                        {getAttachmentBadgeLabel(a, attachmentKind)}
                      </span>
                    </div>
                  </div>
                  <div className="file-meta">
                    <div className="file-name" title={a?.name}>
                      {a?.name}
                    </div>
                    <div className="file-sub">{attachmentMetaLabel || "文件"}</div>
                  </div>
                </a>
              );
            })}
          </div>
        )}

        {hasContent ? (
          <div className="msg-text md-body">
            {m.streaming ? (
              <StreamingMarkdown
                content={rawContent}
                streaming={!!m.streaming}
                normalizeContent={normalizeRenderedMarkdown}
                remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
              />
            ) : (
              <ReactMarkdown
                remarkPlugins={MARKDOWN_REMARK_PLUGINS}
                rehypePlugins={[rehypeRaw]}
                components={markdownComponents}
              >
                {contentMarkdown}
              </ReactMarkdown>
            )}
          </div>
        ) : m.streaming ? (
          <div className="streaming-placeholder">
            {String(streamingStatusText || "正在回答中...").trim() || "正在回答中..."}
          </div>
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

                {showSaveNoteAction ? (
                  <button
                    type="button"
                    className="msg-action-btn"
                    title="保存为笔记"
                    aria-label="保存为笔记"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={(event) =>
                      onSaveNote?.(m, {
                        selectedText: readSelectedTextWithinCurrentMessage(event),
                        promptMessageId,
                      })
                    }
                    disabled={isStreaming}
                  >
                    <NotebookPen size={16} />
                  </button>
                ) : null}
              </div>
            )}

            {!showAssistantActionRow && showSaveNoteAction ? (
              <div className="msg-actions">
                <button
                  type="button"
                  className="msg-action-btn"
                  title="保存为笔记"
                  aria-label="保存为笔记"
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={(event) =>
                    onSaveNote?.(m, {
                      selectedText: readSelectedTextWithinCurrentMessage(event),
                      promptMessageId,
                    })
                  }
                  disabled={isStreaming}
                >
                  <NotebookPen size={16} />
                </button>
              </div>
            ) : null}

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
      {previewImage && typeof document !== "undefined" ? createPortal(
        <div
          className="chat-image-preview-overlay"
          role="presentation"
          onClick={() => setPreviewImage(null)}
        >
          <div
            className="chat-image-preview-dialog"
            role="dialog"
            aria-modal="true"
            aria-label={previewImage.name || "图片预览"}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="chat-image-preview-stage">
              <div className="chat-image-preview-media">
                {previewImage.src ? (
                  <img
                    src={previewImage.src}
                    alt={previewImage.alt}
                    className="chat-image-preview-image"
                    loading="eager"
                    decoding="async"
                  />
                ) : null}
                <div className="chat-image-preview-actions">
                  <button
                    type="button"
                    className="chat-image-preview-btn secondary icon-only"
                    aria-label="关闭"
                    title="关闭"
                    onClick={() => setPreviewImage(null)}
                  >
                    <X size={14} />
                  </button>
                  <button
                    type="button"
                    className="chat-image-preview-btn primary icon-only"
                    aria-label={previewDownloadPending ? "下载中" : "下载"}
                    title={previewDownloadPending ? "下载中" : "下载"}
                    onClick={() => {
                      void handlePreviewDownload();
                    }}
                    disabled={!previewImage.canResolveDownload || previewDownloadPending}
                  >
                    <Download size={14} />
                  </button>
                </div>
              </div>
              {previewImage.isLoadingOriginal ? (
                <div className="chat-image-preview-loading" role="status">
                  正在加载原图...
                </div>
              ) : null}
            </div>
          </div>
        </div>,
        document.body,
      ) : null}
    </>
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

function getAskPopoverAnchorRect(range) {
  const rects = getVisualSelectionRects(range);
  if (rects.length === 0) {
    return range.getBoundingClientRect();
  }

  const rows = groupRectsByVisualLine(rects);
  if (rows.length === 0) {
    return range.getBoundingClientRect();
  }

  rows.sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));
  return mergeSelectionRects(rows[0].rects);
}

function isVisibleRect(rect) {
  return !!rect && rect.width > 0 && rect.height > 0;
}

function clampToViewport(value, margin) {
  const viewportWidth =
    typeof window === "undefined" ? 0 : Number(window.innerWidth) || 0;
  if (viewportWidth <= margin * 2) return value;
  return Math.min(viewportWidth - margin, Math.max(margin, value));
}

function mergeSelectionRects(rects) {
  if (!Array.isArray(rects) || rects.length === 0) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }

  const left = Math.min(...rects.map((rect) => rect.left));
  const right = Math.max(...rects.map((rect) => rect.right));
  const top = Math.min(...rects.map((rect) => rect.top));
  const bottom = Math.max(...rects.map((rect) => rect.bottom));

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
    right,
    bottom,
  };
}

function getVisualSelectionRects(range) {
  if (!range) return [];

  const rawRects = Array.from(range.getClientRects())
    .filter(isVisibleRect)
    .sort((a, b) => (a.top === b.top ? a.left - b.left : a.top - b.top));

  if (rawRects.length <= 1) {
    return rawRects;
  }

  const medianHeight = median(rawRects.map((rect) => rect.height));
  const medianArea = median(rawRects.map((rect) => rect.width * rect.height));
  if (medianHeight <= 0 || medianArea <= 0) {
    return rawRects;
  }

  const filteredRects = rawRects.filter((rect) => {
    const area = rect.width * rect.height;
    if (rect.height > medianHeight * 1.8) return false;
    if (area > medianArea * 8 && rect.height > medianHeight * 1.25) return false;
    return true;
  });

  return filteredRects.length > 0 ? filteredRects : rawRects;
}

function groupRectsByVisualLine(rects) {
  if (!Array.isArray(rects) || rects.length === 0) return [];

  return rects.reduce((rows, rect) => {
    const row = rows.find((candidate) => rectsAreSameLine(candidate, rect));
    if (!row) {
      rows.push({
        ...mergeSelectionRects([rect]),
        rects: [rect],
        referenceHeight: rect.height,
      });
      return rows;
    }

    row.rects.push(rect);
    Object.assign(row, mergeSelectionRects(row.rects), {
      rects: row.rects,
      referenceHeight: row.referenceHeight,
    });
    return rows;
  }, []);
}

function rectsAreSameLine(row, rect) {
  if (!row || !rect) return false;
  const overlap = Math.min(row.bottom, rect.bottom) - Math.max(row.top, rect.top);
  const minHeight = Math.min(row.referenceHeight || row.height || 0, rect.height || 0);
  return overlap >= minHeight * 0.45;
}

function median(values) {
  if (!Array.isArray(values) || values.length === 0) return 0;
  const sorted = values
    .map((value) => Number(value) || 0)
    .sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[middle];
  }
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

function readAttachmentUrl(attachment) {
  return String(attachment?.url || attachment?.fileUrl || "").trim();
}

function readAttachmentThumbnailUrl(attachment) {
  return String(
    attachment?.thumbnailUrl || attachment?.thumbUrl || attachment?.previewUrl || "",
  ).trim();
}

function getImageNameFromUrl(src) {
  const value = String(src || "").trim();
  if (!value) return "";
  try {
    const baseUrl =
      typeof window !== "undefined" ? window.location.href : "http://localhost/";
    const url = new URL(value, baseUrl);
    const pathname = decodeURIComponent(url.pathname || "");
    return pathname.split("/").filter(Boolean).pop() || "";
  } catch {
    return value.split(/[/?#]/).filter(Boolean).pop() || "";
  }
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

function getAttachmentExtension(attachment) {
  const name = String(attachment?.name || "").trim().toLowerCase();
  const match = name.match(/\.([a-z0-9]+)$/i);
  return match?.[1] || "";
}

function getAttachmentKind(attachment) {
  if (isImageAttachment(attachment)) return "image";

  const type = String(attachment?.type || "")
    .trim()
    .toLowerCase();
  const ext = getAttachmentExtension(attachment);

  if (
    type.includes("word") ||
    ["doc", "docx", "rtf"].includes(ext)
  ) {
    return "word";
  }

  if (
    type.includes("excel") ||
    type.includes("spreadsheet") ||
    ["xls", "xlsx", "csv"].includes(ext)
  ) {
    return "excel";
  }

  if (
    type.includes("presentation") ||
    type.includes("powerpoint") ||
    ["ppt", "pptx", "key"].includes(ext)
  ) {
    return "ppt";
  }

  if (type === "application/pdf" || ext === "pdf") {
    return "pdf";
  }

  return "file";
}

function getAttachmentTypeLabel(kind) {
  switch (kind) {
    case "image":
      return "图片";
    case "word":
      return "Word";
    case "excel":
      return "Excel";
    case "ppt":
      return "PPT";
    case "pdf":
      return "PDF";
    case "html":
      return "HTML";
    case "markdown":
      return "Markdown";
    default:
      return "文件";
  }
}

function getAttachmentBadgeLabel(attachment, kind) {
  if (kind === "word") return "DOC";
  if (kind === "excel") return "XLS";
  if (kind === "ppt") return "PPT";
  if (kind === "pdf") return "PDF";
  if (kind === "html") return "HTML";
  if (kind === "markdown") return "MD";
  if (kind === "image") return "IMG";

  const ext = getAttachmentExtension(attachment).toUpperCase();
  if (!ext) return "FILE";
  return ext.slice(0, 4);
}
