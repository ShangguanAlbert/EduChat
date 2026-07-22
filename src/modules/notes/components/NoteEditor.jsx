import { createElement, useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { unified } from "unified";
import remarkParse from "remark-parse";
import { visit } from "unist-util-visit";
import RichTextEditor from "../editor/RichTextEditor.jsx";
import SourceTextEditor from "../editor/SourceTextEditor.jsx";

const EDITOR_SETTINGS_KEY = "educhat.notes.editor-settings.v2";

const DEFAULT_EDITOR_SETTINGS = {
  viewMode: "edit",
  fontFamily: "default",
  fontSize: "medium",
  showTableOfContents: true,
  isNarrowWidth: true,
  tableAutoWidth: true,
  spellCheckEnabled: false,
};

const VIEW_MODE_OPTIONS = [
  { value: "edit", label: "编辑模式" },
  { value: "source", label: "源码模式" },
  { value: "read", label: "阅读模式" },
];

function loadEditorSettings() {
  if (typeof window === "undefined") return DEFAULT_EDITOR_SETTINGS;
  try {
    const raw = window.localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!raw) return DEFAULT_EDITOR_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_EDITOR_SETTINGS,
      ...(parsed && typeof parsed === "object" ? parsed : {}),
      viewMode:
        parsed?.viewMode === "live"
          ? "edit"
          : parsed?.viewMode || DEFAULT_EDITOR_SETTINGS.viewMode,
    };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
}

function persistEditorSettings(settings) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

function formatDateTime(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function stripMarkdownForCount(value = "") {
  return String(value || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)]\(([^)]+)\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/[#>*_~\-[\]()|]/g, " ")
    .replace(/\s+/g, "");
}

function countVisibleCharacters(value = "") {
  return stripMarkdownForCount(value).length;
}

function extractNodeText(node) {
  if (!node) return "";
  if (node.type === "text" || node.type === "inlineCode") return String(node.value || "");
  if (node.type === "html") return String(node.value || "").replace(/<[^>]+>/g, "");
  if (Array.isArray(node.children)) return node.children.map((child) => extractNodeText(child)).join("");
  return "";
}

function slugifyHeading(value = "", index = 0) {
  const slug = String(value || "")
    .toLowerCase()
    .trim()
    .replace(/<[^>]+>/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return slug || `section-${index + 1}`;
}

function extractHeadings(markdown = "") {
  const tree = unified().use(remarkParse).use(remarkGfm).parse(String(markdown || ""));
  const slugCounts = new Map();
  const headings = [];

  visit(tree, "heading", (node) => {
    const text = extractNodeText(node).trim();
    const depth = Number(node?.depth || 1);
    const baseSlug = slugifyHeading(text, headings.length);
    const count = (slugCounts.get(baseSlug) || 0) + 1;
    slugCounts.set(baseSlug, count);
    headings.push({
      id: count > 1 ? `${baseSlug}-${count}` : baseSlug,
      text: text || `标题 ${headings.length + 1}`,
      depth,
      offset: Number(node?.position?.start?.offset || 0),
    });
  });

  return headings;
}

function dedupeHeadings(items = []) {
  const seen = new Set();
  return items.filter((item, index) => {
    const key = [
      String(item?.id || "").trim(),
      String(item?.text || "").trim(),
      Number(item?.depth || 0),
      Number(item?.pos ?? item?.offset ?? index),
    ].join("::");
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function createIconPath(path) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      {path}
    </svg>
  );
}

function extractTextFromReactChildren(children) {
  return Array.isArray(children)
    ? children.map((child) => extractTextFromReactChildren(child)).join("")
    : typeof children === "string" || typeof children === "number"
      ? String(children)
      : children?.props?.children
        ? extractTextFromReactChildren(children.props.children)
        : "";
}

function buildMarkdownComponents(headings = [], onCopyCode) {
  const cursor = { current: 0 };

  function renderHeading(tagName, props) {
    const heading = headings[cursor.current] || null;
    cursor.current += 1;
    const fallbackText = extractTextFromReactChildren(props.children).trim();
    const headingId = heading?.id || slugifyHeading(fallbackText, cursor.current);
    return createElement(tagName, { "data-notes-heading-id": headingId, id: headingId }, props.children);
  }

  return {
    h1: (props) => renderHeading("h1", props),
    h2: (props) => renderHeading("h2", props),
    h3: (props) => renderHeading("h3", props),
    h4: (props) => renderHeading("h4", props),
    h5: (props) => renderHeading("h5", props),
    h6: (props) => renderHeading("h6", props),
    pre: (props) => {
      const { children } = props;
      const preProps = { ...props };
      delete preProps.node;
      const codeText = String(extractTextFromReactChildren(children) || "").replace(/\n$/, "");
      return (
        <div className="notes-code-block-frame">
          <button
            type="button"
            className="notes-code-block-copy-btn"
            onClick={() => onCopyCode?.(codeText)}
          >
            <EditorIconCopy />
            <span>复制</span>
          </button>
          {createElement("pre", preProps, children)}
        </div>
      );
    },
  };
}

function EditorIconStar({ filled = false }) {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path
        d="M10 3.25L12.084 7.473L16.745 8.15L13.372 11.437L14.168 16.08L10 13.889L5.832 16.08L6.628 11.437L3.255 8.15L7.916 7.473L10 3.25Z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function EditorIconDots() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="5" cy="10" r="1.4" fill="currentColor" />
      <circle cx="10" cy="10" r="1.4" fill="currentColor" />
      <circle cx="15" cy="10" r="1.4" fill="currentColor" />
    </svg>
  );
}

function EditorIconCopy() {
  return createIconPath(
    <>
      <rect x="7" y="5.5" width="8" height="10" rx="1.8" stroke="currentColor" strokeWidth="1.6" />
      <path
        d="M5.5 12.5H5.1C4.216 12.5 3.5 11.784 3.5 10.9V5.1C3.5 4.216 4.216 3.5 5.1 3.5H10.9C11.784 3.5 12.5 4.216 12.5 5.1V5.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </>,
  );
}

function EditorIconExport() {
  return createIconPath(
    <>
      <path
        d="M10 3.75V11.25M10 11.25L7.25 8.5M10 11.25L12.75 8.5M4.5 14.75V15.15C4.5 15.992 5.183 16.675 6.025 16.675H13.975C14.817 16.675 15.5 15.992 15.5 15.15V14.75"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  );
}

function EditorIconWidth() {
  return createIconPath(
    <path
      d="M5.2 5.4H14.8M5.2 14.6H14.8M7.2 8V12M12.8 8V12"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

function EditorIconToc() {
  return createIconPath(
    <>
      <path d="M4.5 5.5H7.2M4.5 10H7.2M4.5 14.5H7.2M9.4 5.5H15.5M9.4 10H15.5M9.4 14.5H15.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </>,
  );
}

function EditorIconLink() {
  return createIconPath(
    <path
      d="M8.1 11.9L6.7 13.3C5.595 14.405 3.805 14.405 2.7 13.3C1.595 12.195 1.595 10.405 2.7 9.3L5.5 6.5C6.605 5.395 8.395 5.395 9.5 6.5M11.9 8.1L13.3 6.7C14.405 5.595 16.195 5.595 17.3 6.7C18.405 7.805 18.405 9.595 17.3 10.7L14.5 13.5C13.395 14.605 11.605 14.605 10.5 13.5M7 13L13 7"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

function EditorIconSpark() {
  return createIconPath(
    <path
      d="M9.5 3.5L10.964 7.036L14.5 8.5L10.964 9.964L9.5 13.5L8.036 9.964L4.5 8.5L8.036 7.036L9.5 3.5ZM14.75 13.25L15.477 15.023L17.25 15.75L15.477 16.477L14.75 18.25L14.023 16.477L12.25 15.75L14.023 15.023L14.75 13.25Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

function EditorIconTrash() {
  return createIconPath(
    <>
      <path d="M4.75 6.25H15.25" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path
        d="M7 6.25V5.45C7 4.735 7.585 4.15 8.3 4.15H11.7C12.415 4.15 13 4.735 13 5.45V6.25M6.2 6.25L6.7 14.6C6.758 15.57 7.562 16.325 8.534 16.325H11.466C12.438 16.325 13.242 15.57 13.3 14.6L13.8 6.25"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>,
  );
}

function EditorIconCheck() {
  return createIconPath(
    <path
      d="M4.75 10.5L8.1 13.75L15.25 6.5"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

function EditorIconCircleDot({ active = false }) {
  return (
    <svg viewBox="0 0 12 12" fill="none" aria-hidden="true">
      <circle cx="6" cy="6" r="4.5" fill={active ? "currentColor" : "transparent"} stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function EditorIconTag() {
  return createIconPath(
    <path
      d="M10.2 4.2H15.3V9.3L10.2 14.4L5.1 9.3L10.2 4.2ZM12.8 6.7C12.8 7.142 13.158 7.5 13.6 7.5C14.042 7.5 14.4 7.142 14.4 6.7C14.4 6.258 14.042 5.9 13.6 5.9C13.158 5.9 12.8 6.258 12.8 6.7Z"
      stroke="currentColor"
      strokeWidth="1.55"
      strokeLinecap="round"
      strokeLinejoin="round"
    />,
  );
}

function EditorIconSave() {
  return createIconPath(
    <>
      <path
        d="M5 4.5H13.8L15.5 6.2V15.5H4.5V5C4.5 4.724 4.724 4.5 5 4.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7 4.5V8H12.2V4.5M7.4 15.5V11.6H12.6V15.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </>,
  );
}

export default function NoteEditor({
  note = null,
  title = "",
  contentMarkdown = "",
  tagsText = "",
  status = "draft",
  saving = false,
  deleting = false,
  starPending = false,
  exportPending = false,
  dirty = false,
  error = "",
  onSave,
  onTitleChange,
  onContentChange,
  onTagsChange,
  onStatusChange,
  onDelete,
  onOpenSourceChat,
  onToggleStar,
  onExportWord,
}) {
  const [settings, setSettings] = useState(() => loadEditorSettings());
  const [menuOpen, setMenuOpen] = useState(false);
  const [tagsExpanded, setTagsExpanded] = useState(false);
  const [localMessage, setLocalMessage] = useState("");
  const [aiNotice, setAiNotice] = useState({ text: "", exiting: false, key: 0 });
  const menuRef = useRef(null);
  const editorSurfaceRef = useRef(null);
  const tagsInputRef = useRef(null);
  const aiNoticeTimerRef = useRef(0);
  const aiNoticeExitTimerRef = useRef(0);
  const richEditorInstanceRef = useRef(null);
  const [richHeadings, setRichHeadings] = useState([]);

  function flashLocatedHeading(element) {
    if (!(element instanceof HTMLElement)) return;
    element.classList.remove("notes-locate-highlight");
    void element.offsetWidth;
    element.classList.add("notes-locate-highlight");
    window.setTimeout(() => {
      element.classList.remove("notes-locate-highlight");
    }, 1400);
  }

  const headings = useMemo(() => extractHeadings(contentMarkdown), [contentMarkdown]);
  const visibleHeadings = useMemo(() => {
    if (settings.viewMode === "edit" && richHeadings.length > 0) {
      return dedupeHeadings(
        richHeadings.filter((item) => Number(item?.depth || 0) >= 1 && Number(item?.depth || 0) <= 3),
      );
    }
    return dedupeHeadings(headings.filter((item) => item.depth >= 1 && item.depth <= 3));
  }, [headings, richHeadings, settings.viewMode]);
  const handleCopyCodeBlock = useCallback(async (value = "") => {
    const text = String(value || "");
    if (!text.trim()) return;
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      // ignore copy failures
    }
  }, []);

  const markdownComponents = useMemo(
    () => buildMarkdownComponents(headings, handleCopyCodeBlock),
    [headings, handleCopyCodeBlock],
  );
  const wordCount = useMemo(() => countVisibleCharacters(contentMarkdown), [contentMarkdown]);
  const tagsPreview = useMemo(
    () =>
      String(tagsText || "")
        .split(/[,\n，、]/)
        .map((item) => item.trim().replace(/^#/, ""))
        .filter(Boolean)
        .slice(0, 6),
    [tagsText],
  );

  useEffect(() => {
    persistEditorSettings(settings);
  }, [settings]);

  useEffect(() => {
    if (!menuOpen) return undefined;

    function handlePointerDown(event) {
      if (!menuRef.current?.contains(event.target)) {
        setMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [menuOpen]);

  useEffect(() => {
    if (!localMessage) return undefined;
    const timer = window.setTimeout(() => setLocalMessage(""), 2200);
    return () => window.clearTimeout(timer);
  }, [localMessage]);

  useEffect(
    () => () => {
      if (aiNoticeTimerRef.current) {
        window.clearTimeout(aiNoticeTimerRef.current);
      }
      if (aiNoticeExitTimerRef.current) {
        window.clearTimeout(aiNoticeExitTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!tagsExpanded) return undefined;
    const timer = window.setTimeout(() => {
      tagsInputRef.current?.focus();
      tagsInputRef.current?.select?.();
    }, 20);
    return () => window.clearTimeout(timer);
  }, [tagsExpanded]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setRichHeadings([]);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [note?.id]);

  function updateSettings(patch) {
    setSettings((current) => ({ ...current, ...patch }));
  }

  function handleAiDraftClick() {
    const key = Date.now();
    if (aiNoticeTimerRef.current) {
      window.clearTimeout(aiNoticeTimerRef.current);
    }
    if (aiNoticeExitTimerRef.current) {
      window.clearTimeout(aiNoticeExitTimerRef.current);
    }
    setAiNotice({
      text: "该功能正在开发中",
      exiting: false,
      key,
    });
    aiNoticeTimerRef.current = window.setTimeout(() => {
      setAiNotice((current) =>
        current.key === key ? { ...current, exiting: true } : current,
      );
    }, 2000);
    aiNoticeExitTimerRef.current = window.setTimeout(() => {
      setAiNotice((current) =>
        current.key === key ? { text: "", exiting: false, key: 0 } : current,
      );
    }, 2360);
  }

  async function handleCopyContent() {
    const payload = `${title ? `# ${title}\n\n` : ""}${contentMarkdown}`.trim();
    if (!payload) {
      setLocalMessage("当前笔记还没有可复制的内容。");
      return;
    }

    try {
      await navigator.clipboard.writeText(payload);
      setLocalMessage("已复制当前笔记内容。");
      setMenuOpen(false);
    } catch {
      setLocalMessage("复制失败，请检查浏览器权限。");
    }
  }

  async function handleManualSaveClick() {
    try {
      const result = await onSave?.();
      setLocalMessage(result === false ? "保存失败，请稍后重试。" : "");
      if (result !== false) {
        setMenuOpen(false);
      }
    } catch {
      setLocalMessage("保存失败，请稍后重试。");
    }
  }

  function scrollToHeading(heading) {
    if (!heading) return;
    if (settings.viewMode === "edit" && richEditorInstanceRef.current && Number.isFinite(heading.pos)) {
      const editorInstance = richEditorInstanceRef.current;
      const scrollContainer = editorSurfaceRef.current?.querySelector(".notes-rich-editor-content");
      const tocId = CSS.escape(String(heading.id || ""));
      const target =
        editorSurfaceRef.current?.querySelector(`[data-toc-id="${tocId}"]`) ||
        editorSurfaceRef.current?.querySelector(`[data-notes-heading-id="${tocId}"]`);

      if (target instanceof HTMLElement && scrollContainer instanceof HTMLElement) {
        try {
          const pos = editorInstance.view.posAtDOM(target, 0);
          editorInstance.chain().focus().setTextSelection(Number(pos) || Number(heading.pos) || 0).run();
        } catch {
          editorInstance.chain().focus().setTextSelection(Number(heading.pos) || 0).run();
        }

        const containerRect = scrollContainer.getBoundingClientRect();
        const targetRect = target.getBoundingClientRect();
        const targetScrollTop = scrollContainer.scrollTop + (targetRect.top - containerRect.top) - 18;

        scrollContainer.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });

        window.setTimeout(() => {
          flashLocatedHeading(target);
          scrollContainer.dispatchEvent(new Event("scroll", { bubbles: true }));
          editorInstance.commands.updateTableOfContents?.();
        }, 260);
        return;
      }

      editorInstance
        .chain()
        .focus()
        .setTextSelection(Number(heading.pos) || 0)
        .scrollIntoView()
        .run();
      window.setTimeout(() => {
        const fallbackTarget =
          editorSurfaceRef.current?.querySelector(`[data-toc-id="${tocId}"]`) ||
          editorSurfaceRef.current?.querySelector(`[data-notes-heading-id="${tocId}"]`);
        if (fallbackTarget) {
          flashLocatedHeading(fallbackTarget);
        }
      }, 120);
      return;
    }

    if (settings.viewMode === "source") {
      const textarea = editorSurfaceRef.current?.querySelector(".notes-source-editor");
      if (!textarea) return;
      textarea.focus();
      const offset = Number.isFinite(heading.offset) ? heading.offset : 0;
      textarea.setSelectionRange(offset, offset);
      const lineHeight = Number.parseFloat(window.getComputedStyle(textarea).lineHeight) || 24;
      const textBefore = textarea.value.slice(0, offset);
      const lineCount = textBefore.split("\n").length;
      textarea.scrollTop = Math.max(0, (lineCount - 3) * lineHeight);
      return;
    }

    let target = editorSurfaceRef.current?.querySelector(
      `[data-notes-heading-id="${CSS.escape(heading.id)}"]`,
    );
    if (!target && settings.viewMode === "edit") {
      const richHeadings = Array.from(
        editorSurfaceRef.current?.querySelectorAll(
          ".notes-rich-editor-content h1, .notes-rich-editor-content h2, .notes-rich-editor-content h3",
        ) || [],
      );
      const matchingHeadings = richHeadings.filter(
        (element) => String(element.textContent || "").trim() === String(heading.text || "").trim(),
      );
      target = matchingHeadings[0] || null;
    }
    target?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (target) {
      window.setTimeout(() => flashLocatedHeading(target), 180);
    }
  }

  if (!note) {
    return (
      <section className="notes-editor-empty">
        <h2>选择一条笔记开始编辑</h2>
        <p>你可以手动新建，也可以从聊天中把一段内容保存成笔记。</p>
      </section>
    );
  }

  const saveLabel = deleting ? "删除中..." : saving ? "自动保存中..." : dirty ? "等待保存" : "已保存";
  const saveTone = deleting ? "danger" : saving ? "syncing" : dirty ? "pending" : "saved";
  const isArchived = status === "archived";
  return (
    <section
      className={`notes-editor-shell notes-editor-v2 font-${settings.fontFamily} size-${settings.fontSize}${settings.isNarrowWidth ? " is-narrow-width" : ""}${settings.tableAutoWidth ? " is-table-auto-width" : ""}${settings.showTableOfContents ? " has-toc" : ""}`}
    >
      {aiNotice.text ? (
        <div
          className={`notes-editor-ai-toast${aiNotice.exiting ? " is-exiting" : ""}`}
          role="status"
          aria-live="polite"
        >
          {aiNotice.text}
        </div>
      ) : null}

      <header className="notes-editor-navbar">
        <div className="notes-editor-navbar-main">
          <input
            type="text"
            className="notes-editor-titlebar-input"
            value={title}
            onChange={(event) => onTitleChange?.(event.target.value)}
            placeholder="输入笔记标题"
          />
          <div className="notes-editor-navbar-meta">
            <span>更新于 {formatDateTime(note.updatedAt) || "-"}</span>
            <span className={`notes-editor-save-state tone-${saveTone}`}>
              <EditorIconCircleDot active={saveTone !== "pending"} />
              <em>{saveLabel}</em>
            </span>
            {note.starred ? <span className="notes-editor-meta-pill">已星标</span> : null}
            {isArchived ? <span className="notes-editor-meta-pill muted">已归档</span> : null}
          </div>
        </div>

        <div className="notes-editor-navbar-actions">
          <div className="notes-editor-tags-inline in-navbar">
            <button
              type="button"
              className={`notes-editor-tags-trigger icon-only${tagsExpanded ? " active" : ""}`}
              onClick={() => setTagsExpanded((current) => !current)}
              title={tagsPreview.length > 0 ? `标签（${tagsPreview.length}）` : "标签"}
              aria-label="标签"
            >
              <EditorIconTag />
              {tagsPreview.length > 0 ? <em>{tagsPreview.length}</em> : null}
            </button>

            {tagsExpanded ? (
              <input
                ref={tagsInputRef}
                type="text"
                className="notes-editor-tags-inline-input"
                value={tagsText}
                onChange={(event) => onTagsChange?.(event.target.value)}
                onBlur={() => {
                  if (!String(tagsText || "").trim()) {
                    setTagsExpanded(false);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.key === "Escape") {
                    event.preventDefault();
                    setTagsExpanded(false);
                  }
                }}
                placeholder="添加标签，用逗号分隔"
              />
            ) : null}
          </div>

          <button
            type="button"
            className="notes-editor-ai-btn icon-only"
            onClick={handleAiDraftClick}
            disabled={deleting}
            title="AI 摘录（开发中）"
            aria-label="AI 摘录（开发中）"
          >
            <EditorIconSpark />
          </button>

          <button
            type="button"
            className={`notes-editor-star-btn${note.starred ? " active" : ""}`}
            onClick={onToggleStar}
            disabled={starPending || deleting}
            title={note.starred ? "取消星标" : "星标置顶"}
            aria-label={note.starred ? "取消星标" : "星标置顶"}
          >
            <EditorIconStar filled={note.starred} />
          </button>

          <div className="notes-editor-menu-wrap" ref={menuRef}>
            <button
              type="button"
              className={`notes-editor-menu-btn${menuOpen ? " active" : ""}`}
              onClick={() => {
                setMenuOpen((current) => !current);
              }}
              aria-label="更多操作"
              title="更多操作"
            >
              <EditorIconDots />
            </button>

            {menuOpen ? (
              <div className="notes-editor-menu-popover">
                <button type="button" className="notes-editor-menu-item" onClick={handleCopyContent}>
                  <EditorIconCopy />
                  <span>复制内容</span>
                </button>
                <button
                  type="button"
                  className="notes-editor-menu-item"
                  onClick={() => {
                    void handleManualSaveClick();
                  }}
                  disabled={saving || deleting}
                >
                  <EditorIconSave />
                  <span>{saving ? "保存中..." : dirty ? "保存当前笔记" : "已保存"}</span>
                </button>
                <button
                  type="button"
                  className="notes-editor-menu-item"
                  onClick={() => {
                    onExportWord?.();
                    setMenuOpen(false);
                  }}
                  disabled={exportPending}
                >
                  <EditorIconExport />
                  <span>{exportPending ? "导出中..." : "导出为 Word"}</span>
                </button>
                <button
                  type="button"
                  className={`notes-editor-menu-item${settings.isNarrowWidth ? " active" : ""}`}
                  onClick={() => updateSettings({ isNarrowWidth: !settings.isNarrowWidth })}
                >
                  <EditorIconWidth />
                  <span>缩减栏宽</span>
                  {settings.isNarrowWidth ? <EditorIconCheck /> : null}
                </button>
                <button
                  type="button"
                  className={`notes-editor-menu-item${settings.tableAutoWidth ? " active" : ""}`}
                  onClick={() => updateSettings({ tableAutoWidth: !settings.tableAutoWidth })}
                >
                  <EditorIconWidth />
                  <span>表格自适应宽度</span>
                  {settings.tableAutoWidth ? <EditorIconCheck /> : null}
                </button>
                <button
                  type="button"
                  className={`notes-editor-menu-item${settings.showTableOfContents ? " active" : ""}`}
                  onClick={() =>
                    updateSettings({ showTableOfContents: !settings.showTableOfContents })
                  }
                >
                  <EditorIconToc />
                  <span>显示目录大纲</span>
                  {settings.showTableOfContents ? <EditorIconCheck /> : null}
                </button>
                <button
                  type="button"
                  className="notes-editor-menu-item"
                  onClick={() => {
                    onStatusChange?.(isArchived ? "active" : "archived");
                    setMenuOpen(false);
                  }}
                >
                  <EditorIconToc />
                  <span>{isArchived ? "取消归档" : "归档当前笔记"}</span>
                </button>
                {note.sourceSessionId ? (
                  <button
                    type="button"
                    className="notes-editor-menu-item"
                    onClick={() => {
                      onOpenSourceChat?.();
                      setMenuOpen(false);
                    }}
                  >
                    <EditorIconLink />
                    <span>查看来源聊天</span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className="notes-editor-menu-item danger"
                  onClick={() => {
                    onDelete?.();
                    setMenuOpen(false);
                  }}
                >
                  <EditorIconTrash />
                  <span>删除笔记</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <div className="notes-editor-support-row">
        {!tagsExpanded && tagsPreview.length > 0 ? (
          <div className="notes-editor-tags-preview">
            {tagsPreview.map((tag) => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        ) : null}
        {note.summary ? (
          <div className="notes-editor-summary-pill" title={note.summary}>
            <strong>AI 摘要</strong>
            <span>{note.summary}</span>
          </div>
        ) : null}
      </div>

      {error || localMessage ? (
        <div className={`notes-editor-banner${error ? " is-error" : ""}`}>
          {error || localMessage}
        </div>
      ) : null}

      <div className="notes-editor-workbench">
        <div className="notes-editor-stage-shell">
          <div
            ref={editorSurfaceRef}
            className={`notes-editor-stage mode-${settings.viewMode}`}
            data-color-mode="light"
          >
            <div className="notes-editor-stage-layout">
              <div className="notes-editor-stage-content">
                {settings.viewMode === "read" ? (
                  <div className="notes-reading-surface md-body">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      rehypePlugins={[rehypeRaw]}
                      components={markdownComponents}
                    >
                      {contentMarkdown || "*暂无内容*"}
                    </ReactMarkdown>
                  </div>
                ) : settings.viewMode === "source" ? (
                  <SourceTextEditor
                    value={contentMarkdown}
                    onChange={onContentChange}
                    spellCheckEnabled={settings.spellCheckEnabled}
                  />
                ) : (
                  <RichTextEditor
                    noteId={note.id}
                    markdown={contentMarkdown}
                    onMarkdownChange={onContentChange}
                    onTocChange={setRichHeadings}
                    onEditorReady={(instance) => {
                      richEditorInstanceRef.current = instance;
                    }}
                    editable
                    spellCheckEnabled={settings.spellCheckEnabled}
                    placeholder="像文档一样写下你的笔记…"
                  />
                )}
              </div>

              {settings.showTableOfContents ? (
                <aside className="notes-editor-toc-panel">
                  <div className="notes-editor-toc-title">目录大纲</div>
                  <div className="notes-editor-toc-list">
                    {visibleHeadings.length === 0 ? (
                      <div className="notes-editor-toc-empty">暂无标题大纲</div>
                    ) : (
                      visibleHeadings.map((heading) => (
                        <button
                          key={heading.id}
                          type="button"
                          className={`notes-editor-toc-item depth-${heading.depth}${heading.isActive ? " active" : ""}`}
                          onClick={() => scrollToHeading(heading)}
                          title={heading.text}
                        >
                          {heading.text}
                        </button>
                      ))
                    )}
                  </div>
                </aside>
              ) : null}
            </div>
          </div>
        </div>
      </div>

      <footer className="notes-editor-statusbar">
        <div className="notes-editor-status-left">字数：{wordCount}</div>

        <div className="notes-editor-status-right">
          <button
            type="button"
            className={`notes-editor-spell-btn${settings.spellCheckEnabled ? " active" : ""}`}
            onClick={() =>
              updateSettings({ spellCheckEnabled: !settings.spellCheckEnabled })
            }
          >
            拼写检查
          </button>

          <div className="notes-editor-mode-switch">
            {VIEW_MODE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`notes-editor-mode-chip${settings.viewMode === option.value ? " active" : ""}`}
                onClick={() => updateSettings({ viewMode: option.value })}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      </footer>
    </section>
  );
}
