import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeSelection } from "@tiptap/pm/state";
import { CellSelection, TableMap } from "@tiptap/pm/tables";
import { useEditor, useEditorState } from "@tiptap/react";
import Heading from "@tiptap/extension-heading";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Underline from "@tiptap/extension-underline";
import TaskItem from "@tiptap/extension-task-item";
import TaskList from "@tiptap/extension-task-list";
import TableOfContents, {
  getHierarchicalIndexes,
} from "@tiptap/extension-table-of-contents";
import { Table } from "@tiptap/extension-table";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TableRow from "@tiptap/extension-table-row";
import { HeadingAnchor } from "./extensions/headingAnchor.js";
import { ActiveBlockHighlight } from "./extensions/activeBlockHighlight.js";
import { CodeBlockTools } from "./extensions/codeBlockTools.js";
import { EnhancedLink } from "./extensions/enhancedLink.js";
import { ImagePlaceholder, NoteImage } from "./extensions/enhancedImage.js";
import { htmlToMarkdown, markdownToHtml, normalizeMarkdown } from "./markdown.js";
import { uploadNoteImageFile } from "./services/mediaUploadService.js";
import { findMarkRangeAtPos, getEditorRectForRange } from "./utils/editorPosition.js";
import { createEditorStableId } from "./utils/editorIds.js";

function rectToPlainObject(rect) {
  if (!rect) return null;
  return {
    left: rect.left,
    top: rect.top,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function findTableElementNearSelection(editor) {
  if (!editor?.view || !editor?.state?.selection) return null;

  const { view, state } = editor;
  const { selection } = state;
  const resolvedPositions = [
    selection.$from,
    selection.$anchorCell,
    selection.$headCell,
  ].filter(Boolean);

  for (const resolvedPos of resolvedPositions) {
    for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
      if (resolvedPos.node(depth)?.type?.name !== "table") continue;
      const tablePos = resolvedPos.before(depth);
      const tableDom = view.nodeDOM(tablePos);
      if (tableDom instanceof HTMLElement) {
        if (tableDom.tagName === "TABLE") return tableDom;
        const nestedTable = tableDom.querySelector?.("table");
        if (nestedTable instanceof HTMLElement) return nestedTable;
      }
    }
  }

  try {
    const nearbyDom = view.domAtPos(selection.from)?.node;
    const nearbyElement =
      nearbyDom instanceof HTMLElement ? nearbyDom : nearbyDom?.parentElement;
    return nearbyElement?.closest?.("table") || null;
  } catch {
    return null;
  }
}

function getActiveTableRect(editor) {
  const tableElement = findTableElementNearSelection(editor);
  if (!tableElement) return null;
  const rect = tableElement.getBoundingClientRect();
  if (!rect?.width && !rect?.height) return null;
  return rectToPlainObject(rect);
}

function findActiveTableContext(editor) {
  if (!editor?.view || !editor?.state?.selection) return null;

  const { state, view } = editor;
  const { selection } = state;
  const resolvedPositions = [
    selection.$anchorCell,
    selection.$headCell,
    selection.$from,
  ].filter(Boolean);

  for (const resolvedPos of resolvedPositions) {
    for (let depth = resolvedPos.depth; depth > 0; depth -= 1) {
      const tableNode = resolvedPos.node(depth);
      if (tableNode?.type?.name !== "table") continue;
      return {
        state,
        view,
        tableNode,
        tablePos: resolvedPos.before(depth),
        map: TableMap.get(tableNode),
      };
    }
  }

  return null;
}

function findCellInTable(context, docPos) {
  if (!context || !Number.isFinite(docPos)) return null;
  const { state, tablePos, map } = context;

  for (let rowIndex = 0; rowIndex < map.height; rowIndex += 1) {
    for (let columnIndex = 0; columnIndex < map.width; columnIndex += 1) {
      const mapIndex = rowIndex * map.width + columnIndex;
      const cellPos = tablePos + 1 + map.map[mapIndex];
      const cellNode = state.doc.nodeAt(cellPos);
      if (!cellNode) continue;
      const cellEnd = cellPos + cellNode.nodeSize;
      if (docPos >= cellPos && docPos <= cellEnd) {
        return { rowIndex, columnIndex, cellPos };
      }
    }
  }

  return null;
}

function getCellRect(context, rowIndex, columnIndex) {
  if (!context) return null;
  const { view, tablePos, map } = context;
  if (
    rowIndex < 0 ||
    columnIndex < 0 ||
    rowIndex >= map.height ||
    columnIndex >= map.width
  ) {
    return null;
  }

  const mapIndex = rowIndex * map.width + columnIndex;
  const cellPos = tablePos + 1 + map.map[mapIndex];
  const cellDom = view.nodeDOM(cellPos);
  if (!(cellDom instanceof HTMLElement)) return null;
  return rectToPlainObject(cellDom.getBoundingClientRect());
}

function setTableRowSelection(editor, rowIndex) {
  const context = findActiveTableContext(editor);
  if (!context || rowIndex < 0 || rowIndex >= context.map.height) return false;

  const { state, view, tablePos, map } = context;
  const anchorCell = tablePos + 1 + map.map[rowIndex * map.width];
  const headCell = tablePos + 1 + map.map[rowIndex * map.width + map.width - 1];
  view.focus();
  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, anchorCell, headCell))
      .scrollIntoView(),
  );
  return true;
}

function setTableColumnSelection(editor, columnIndex) {
  const context = findActiveTableContext(editor);
  if (!context || columnIndex < 0 || columnIndex >= context.map.width) return false;

  const { state, view, tablePos, map } = context;
  const anchorCell = tablePos + 1 + map.map[columnIndex];
  const headCell = tablePos + 1 + map.map[(map.height - 1) * map.width + columnIndex];
  view.focus();
  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, anchorCell, headCell))
      .scrollIntoView(),
  );
  return true;
}

function setWholeTableSelection(editor) {
  const context = findActiveTableContext(editor);
  if (!context) return false;

  const { state, view, tablePos, map } = context;
  const anchorCell = tablePos + 1 + map.map[0];
  const headCell = tablePos + 1 + map.map[map.width * map.height - 1];
  view.focus();
  view.dispatch(
    state.tr
      .setSelection(CellSelection.create(state.doc, anchorCell, headCell))
      .scrollIntoView(),
  );
  return true;
}

function focusTableCell(editor, rowIndex, columnIndex) {
  const context = findActiveTableContext(editor);
  if (!context) return false;
  const { tablePos, map } = context;

  const safeRowIndex = Math.max(0, Math.min(rowIndex, map.height - 1));
  const safeColumnIndex = Math.max(0, Math.min(columnIndex, map.width - 1));
  const cellPos = tablePos + 1 + map.map[safeRowIndex * map.width + safeColumnIndex];

  editor.chain().focus().setTextSelection(cellPos + 1).run();
  return true;
}

function getActiveTableOverlayState(editor) {
  const tableRect = getActiveTableRect(editor);
  const context = findActiveTableContext(editor);
  if (!tableRect || !context) return { tableRect, rowHandle: null, columnHandle: null };

  const { state } = context;
  const { selection } = state;
  const headCellPos = selection.$headCell?.pos ?? selection.$anchorCell?.pos ?? selection.from;
  const anchorCellPos = selection.$anchorCell?.pos ?? selection.$headCell?.pos ?? selection.from;
  const headCell = findCellInTable(context, headCellPos);
  const anchorCell = findCellInTable(context, anchorCellPos);
  const activeCell = headCell || anchorCell;

  if (!activeCell) {
    return { tableRect, rowHandle: null, columnHandle: null };
  }

  const rowIndex = Math.max(anchorCell?.rowIndex ?? activeCell.rowIndex, activeCell.rowIndex);
  const columnIndex = Math.max(anchorCell?.columnIndex ?? activeCell.columnIndex, activeCell.columnIndex);
  const rowCellRect = getCellRect(context, rowIndex, 0);
  const columnCellRect = getCellRect(context, 0, columnIndex);
  const isCellSelection = selection instanceof CellSelection;
  const isRowSelection = Boolean(isCellSelection && selection.isRowSelection?.());
  const isColumnSelection = Boolean(isCellSelection && selection.isColSelection?.());

  return {
    tableRect,
    rowHandle: rowCellRect
      ? {
          rowIndex,
          selected: isRowSelection,
          position: {
            left: tableRect.left - 16,
            top: rowCellRect.top + rowCellRect.height / 2 - 13,
          },
        }
      : null,
    columnHandle: columnCellRect
      ? {
          columnIndex,
          selected: isColumnSelection,
          position: {
            left: columnCellRect.left + columnCellRect.width / 2 - 13,
            top: tableRect.top - 16,
          },
        }
    : null,
  };
}

function getTableSelectionState(editor) {
  const context = findActiveTableContext(editor);
  const selection = context?.state?.selection;
  if (!context || !(selection instanceof CellSelection)) {
    return {
      isRowSelected: false,
      isColumnSelected: false,
      isTableSelected: false,
    };
  }

  const anchorCell = findCellInTable(context, selection.$anchorCell?.pos);
  const headCell = findCellInTable(context, selection.$headCell?.pos);
  const fromRow = Math.min(anchorCell?.rowIndex ?? 0, headCell?.rowIndex ?? 0);
  const toRow = Math.max(anchorCell?.rowIndex ?? 0, headCell?.rowIndex ?? 0);
  const fromColumn = Math.min(anchorCell?.columnIndex ?? 0, headCell?.columnIndex ?? 0);
  const toColumn = Math.max(anchorCell?.columnIndex ?? 0, headCell?.columnIndex ?? 0);

  return {
    isRowSelected: Boolean(selection.isRowSelection?.()),
    isColumnSelected: Boolean(selection.isColSelection?.()),
    isTableSelected:
      fromRow === 0 &&
      fromColumn === 0 &&
      toRow === context.map.height - 1 &&
      toColumn === context.map.width - 1,
  };
}

function buildTableUIPosition(editor) {
  const overlayState = getActiveTableOverlayState(editor);
  const tableRect = overlayState.tableRect;
  const selectionRect = rectToPlainObject(getEditorRectForRange(editor));
  const anchorRect = tableRect || selectionRect;
  if (!anchorRect) return null;

  const triggerPosition = {
    left: tableRect ? tableRect.left - 12 : anchorRect.right + 8,
    top: tableRect ? tableRect.top - 12 : anchorRect.top - 10,
  };

  return {
    ...overlayState,
    triggerPosition,
    menuPosition: {
      left: tableRect ? tableRect.left + 28 : triggerPosition.left,
      top: tableRect ? tableRect.top - 42 : triggerPosition.top + 40,
    },
  };
}

function resolveHoverInsertIndicator(editor, event) {
  const context = findActiveTableContext(editor);
  const tableRect = getActiveTableRect(editor);
  if (!context || !tableRect || !event?.target?.closest) return null;

  const cellElement = event.target.closest("td, th");
  const tableElement = event.target.closest("table");
  if (!(cellElement instanceof HTMLElement) || !(tableElement instanceof HTMLElement)) {
    return null;
  }

  const activeTableElement = findTableElementNearSelection(editor);
  if (!activeTableElement || activeTableElement !== tableElement) return null;

  let cellPos = null;
  try {
    cellPos = context.view.posAtDOM(cellElement, 0);
  } catch {
    cellPos = null;
  }
  if (!Number.isFinite(cellPos)) return null;

  const cellInfo = findCellInTable(context, cellPos);
  if (!cellInfo) return null;

  const cellRect = cellElement.getBoundingClientRect();
  const threshold = 10;
  const distances = [
    { axis: "column", mode: "before", distance: Math.abs(event.clientX - cellRect.left) },
    { axis: "column", mode: "after", distance: Math.abs(cellRect.right - event.clientX) },
    { axis: "row", mode: "before", distance: Math.abs(event.clientY - cellRect.top) },
    { axis: "row", mode: "after", distance: Math.abs(cellRect.bottom - event.clientY) },
  ]
    .filter((item) => item.distance <= threshold)
    .sort((left, right) => left.distance - right.distance);

  const closest = distances[0];
  if (!closest) return null;

  if (closest.axis === "column") {
    const lineX = closest.mode === "before" ? cellRect.left : cellRect.right;
    const targetIndex =
      closest.mode === "before" ? cellInfo.columnIndex : cellInfo.columnIndex + 1;
    return {
      axis: "column",
      index: targetIndex,
      mode: closest.mode,
      lineStyle: {
        left: lineX - 1,
        top: tableRect.top + 1,
        width: 2,
        height: Math.max(0, tableRect.height - 2),
      },
      buttonStyle: {
        left: lineX - 13,
        top: tableRect.top + tableRect.height / 2 - 13,
      },
    };
  }

  const lineY = closest.mode === "before" ? cellRect.top : cellRect.bottom;
  const targetIndex = closest.mode === "before" ? cellInfo.rowIndex : cellInfo.rowIndex + 1;
  return {
    axis: "row",
    index: targetIndex,
    mode: closest.mode,
    lineStyle: {
      left: tableRect.left + 1,
      top: lineY - 1,
      width: Math.max(0, tableRect.width - 2),
      height: 2,
    },
    buttonStyle: {
      left: tableRect.left + tableRect.width / 2 - 13,
      top: lineY - 13,
    },
  };
}

export function useRichNoteEditor({
  noteId = "",
  markdown = "",
  editable = true,
  placeholder = "",
  spellCheckEnabled = false,
  onMarkdownChange,
}) {
  const [tocItems, setTocItems] = useState([]);
  const [linkEditor, setLinkEditor] = useState({
    visible: false,
    position: null,
    link: { href: "", text: "" },
    range: null,
    canRemove: false,
    mode: "full",
  });
  const [linkBubble, setLinkBubble] = useState({
    visible: false,
    position: null,
    link: { href: "", text: "" },
    range: null,
  });
  const [tableUI, setTableUI] = useState({
    visible: false,
    triggerPosition: null,
    menuPosition: null,
    tableRect: null,
    rowHandle: null,
    columnHandle: null,
    hoverInsert: null,
    actions: [],
  });
  const [imageUI, setImageUI] = useState({
    visible: false,
    position: null,
    align: "left",
    size: "medium",
  });
  const normalizedMarkdown = useMemo(
    () => normalizeMarkdown(markdown),
    [markdown],
  );
  const lastSyncedMarkdownRef = useRef(normalizedMarkdown);
  const pendingUploadsRef = useRef(new Map());
  const editorRef = useRef(null);
  const linkEditorVisibleRef = useRef(false);
  const buildTableActionsRef = useRef(null);

  useEffect(() => {
    linkEditorVisibleRef.current = linkEditor.visible;
  }, [linkEditor.visible]);

  const handleTocUpdate = useCallback((items = []) => {
    setTocItems(
      items
        .filter((item) => Number(item?.level || 0) >= 1 && Number(item?.level || 0) <= 3)
        .map((item) => ({
          id: String(item?.id || "").trim(),
          text: String(item?.textContent || "").trim(),
          depth: Number(item?.level || 1),
          pos: Number(item?.pos || 0),
          isActive: Boolean(item?.isActive),
        })),
    );
  }, []);

  const closeLinkEditor = useCallback(() => {
    setLinkEditor((current) => ({ ...current, visible: false, mode: "full" }));
  }, []);

  const closeLinkBubble = useCallback(() => {
    setLinkBubble((current) => ({ ...current, visible: false }));
  }, []);

  const closeTableMenu = useCallback(() => {
    setTableUI((current) => ({ ...current, visible: false }));
  }, []);

  const showLinkEditor = useCallback(
    ({ href = "", text = "", range = null, rect = null, mode = "full" } = {}) => {
      closeLinkBubble();
      setLinkEditor({
        visible: true,
        position: rect
          ? { left: rect.left, top: rect.top, bottom: rect.bottom }
          : { left: 24, top: 80, bottom: 80 },
        link: {
          href: String(href || "").trim(),
          text: String(text || "").trim(),
        },
        range,
        canRemove: !!range && !!String(href || "").trim(),
        mode,
      });
    },
    [closeLinkBubble],
  );

  const getLinkRangeNearSelection = useCallback((currentEditor) => {
    if (!currentEditor) return null;
    const selectionPos = Number(currentEditor.state.selection.from || 0);
    return (
      findMarkRangeAtPos(currentEditor.state.doc, selectionPos, "link") ||
      findMarkRangeAtPos(
        currentEditor.state.doc,
        Math.max(0, selectionPos - 1),
        "link",
      )
    );
  }, []);

  const openLinkEditor = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;

    const baseRange = currentEditor.isActive("link")
      ? getLinkRangeNearSelection(currentEditor)
      : {
          from: currentEditor.state.selection.from,
          to: currentEditor.state.selection.to,
        };

    showLinkEditor({
      href: String(currentEditor.getAttributes("link")?.href || "").trim(),
      text: baseRange
        ? currentEditor.state.doc.textBetween(baseRange.from, baseRange.to, "\n")
        : "",
      range: baseRange,
      rect: getEditorRectForRange(currentEditor, baseRange),
      mode: "full",
    });
  }, [getLinkRangeNearSelection, showLinkEditor]);

  const normalizeHref = useCallback((value = "") => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";
    if (/^(https?:|mailto:|tel:)/i.test(trimmed)) return trimmed;
    if (trimmed.includes(".") && !trimmed.startsWith("/")) return `https://${trimmed}`;
    return trimmed;
  }, []);

  const saveLinkEditor = useCallback(
    ({ href = "", text = "" } = {}) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      const resolvedHref =
        linkEditor.mode === "title"
          ? String(linkEditor.link?.href || "").trim()
          : href;
      const normalizedHref = normalizeHref(resolvedHref);
      if (!normalizedHref) return;

      const currentRange = linkEditor.range || {
        from: currentEditor.state.selection.from,
        to: currentEditor.state.selection.to,
      };
      const nextText = String(text || "").trim() || normalizedHref;

      currentEditor
        .chain()
        .focus()
        .insertContentAt(currentRange, nextText)
        .setTextSelection({
          from: currentRange.from,
          to: currentRange.from + nextText.length,
        })
        .setLink({ href: normalizedHref })
        .run();

      closeLinkEditor();
      requestAnimationFrame(() => {
        const nextEditor = editorRef.current;
        if (!nextEditor) return;
        const refreshedRange = findMarkRangeAtPos(
          nextEditor.state.doc,
          currentRange.from,
          "link",
        );
        const rect = getEditorRectForRange(nextEditor, refreshedRange || currentRange);
        if (!refreshedRange || !rect) return;
        setLinkBubble({
          visible: true,
          position: {
            anchorX: rect.left + rect.width / 2,
            top: rect.top - 46,
          },
          link: {
            href: normalizedHref,
            text: nextText,
          },
          range: refreshedRange,
        });
      });
    },
    [closeLinkEditor, linkEditor.link?.href, linkEditor.mode, linkEditor.range, normalizeHref],
  );

  const removeLink = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const currentRange =
      linkEditor.range ||
      getLinkRangeNearSelection(currentEditor);
    if (!currentRange) {
      closeLinkEditor();
      return;
    }
    currentEditor.chain().focus().setTextSelection(currentRange).unsetLink().run();
    closeLinkEditor();
    closeLinkBubble();
  }, [closeLinkBubble, closeLinkEditor, getLinkRangeNearSelection, linkEditor.range]);

  const openLinkInNewTab = useCallback((href = "") => {
    const safeHref = normalizeHref(href);
    if (!safeHref) return;
    window.open(safeHref, "_blank", "noopener,noreferrer");
  }, [normalizeHref]);

  const startLinkTitleEdit = useCallback(() => {
    const currentEditor = editorRef.current;
    const currentRange = linkBubble.range || getLinkRangeNearSelection(currentEditor);
    if (!currentEditor || !currentRange) return;
    showLinkEditor({
      href: linkBubble.link?.href || currentEditor.getAttributes("link")?.href || "",
      text:
        linkBubble.link?.text ||
        currentEditor.state.doc.textBetween(currentRange.from, currentRange.to, "\n"),
      range: currentRange,
      rect: getEditorRectForRange(currentEditor, currentRange),
      mode: "title",
    });
  }, [getLinkRangeNearSelection, linkBubble.link?.href, linkBubble.link?.text, linkBubble.range, showLinkEditor]);

  const uploadImageForPlaceholder = useCallback(
    async (placeholderId, file) => {
      const currentEditor = editorRef.current;
      if (!currentEditor || !placeholderId || !(file instanceof File)) return;

      pendingUploadsRef.current.set(placeholderId, file);
      currentEditor.commands.updateImagePlaceholder(placeholderId, {
        status: "uploading",
        message: "正在上传图片…",
      });

      try {
        const uploaded = await uploadNoteImageFile({ noteId, file });
        currentEditor.commands.replaceImagePlaceholder(placeholderId, {
          src: uploaded.url,
          alt: uploaded.fileName || file.name || "图片",
          title: uploaded.fileName || "",
          align: "left",
          size: "medium",
        });
        pendingUploadsRef.current.delete(placeholderId);
      } catch (error) {
        currentEditor.commands.updateImagePlaceholder(placeholderId, {
          status: "error",
          message: error?.message || "图片上传失败，请重试。",
        });
      }
    },
    [noteId],
  );

  const insertImageFromFile = useCallback(
    async (file) => {
      const currentEditor = editorRef.current;
      if (!currentEditor || !editable) return;
      const placeholderId = createEditorStableId("image");
      currentEditor
        .chain()
        .focus()
        .insertImagePlaceholder({
          placeholderId,
          fileName: String(file?.name || "图片").trim() || "图片",
          status: "uploading",
          message: "正在上传图片…",
        })
        .run();

      await uploadImageForPlaceholder(placeholderId, file);
    },
    [editable, uploadImageForPlaceholder],
  );

  const retryImageUpload = useCallback(
    (placeholderId) => {
      const file = pendingUploadsRef.current.get(placeholderId);
      if (file) {
        void uploadImageForPlaceholder(placeholderId, file);
      }
    },
    [uploadImageForPlaceholder],
  );

  const removeImagePlaceholder = useCallback((placeholderId) => {
    pendingUploadsRef.current.delete(placeholderId);
    editorRef.current?.commands.removeImagePlaceholder(placeholderId);
  }, []);

  const buildTableActions = useCallback((currentEditor) => {
    if (!currentEditor) return [];
    const selectionState = getTableSelectionState(currentEditor);

    const safeRun = (runner) => () => {
      runner?.();
      requestAnimationFrame(() => {
        const nextEditor = editorRef.current;
        if (!nextEditor) return;
        if (!nextEditor.isActive("table")) {
          setTableUI((current) => ({
          ...current,
          visible: false,
          triggerPosition: null,
          menuPosition: null,
          tableRect: null,
          rowHandle: null,
          columnHandle: null,
          hoverInsert: null,
          actions: [],
        }));
          return;
        }
        const nextPosition = buildTableUIPosition(nextEditor);
        if (!nextPosition) {
          setTableUI((current) => ({
          ...current,
          visible: false,
          triggerPosition: null,
          menuPosition: null,
          tableRect: null,
          rowHandle: null,
          columnHandle: null,
          hoverInsert: null,
          actions: [],
        }));
          return;
        }
        setTableUI((current) => ({
          ...current,
          ...nextPosition,
          actions: buildTableActionsRef.current?.(nextEditor) || [],
        }));
      });
    };

    return [
      {
        id: "select-row",
        label: "当前行",
        active: selectionState.isRowSelected && !selectionState.isTableSelected,
        onClick: safeRun(() => setTableRowSelection(currentEditor, getActiveTableOverlayState(currentEditor).rowHandle?.rowIndex ?? 0)),
      },
      {
        id: "select-column",
        label: "当前列",
        active: selectionState.isColumnSelected && !selectionState.isTableSelected,
        onClick: safeRun(() => setTableColumnSelection(currentEditor, getActiveTableOverlayState(currentEditor).columnHandle?.columnIndex ?? 0)),
      },
      {
        id: "select-table",
        label: "整表",
        active: selectionState.isTableSelected,
        onClick: safeRun(() => setWholeTableSelection(currentEditor)),
      },
      {
        id: "row-before",
        label: "上插行",
        onClick: safeRun(() => currentEditor.chain().focus().addRowBefore().run()),
      },
      {
        id: "row-after",
        label: "下插行",
        onClick: safeRun(() => currentEditor.chain().focus().addRowAfter().run()),
      },
      {
        id: "column-before",
        label: "左插列",
        onClick: safeRun(() => currentEditor.chain().focus().addColumnBefore().run()),
      },
      {
        id: "column-after",
        label: "右插列",
        onClick: safeRun(() => currentEditor.chain().focus().addColumnAfter().run()),
      },
      {
        id: "toggle-header-row",
        label: "表头行",
        onClick: safeRun(() => currentEditor.chain().focus().toggleHeaderRow().run()),
      },
      {
        id: "toggle-header-column",
        label: "表头列",
        onClick: safeRun(() => currentEditor.chain().focus().toggleHeaderColumn().run()),
      },
      {
        id: "merge-cells",
        label: "合并",
        onClick: safeRun(() => currentEditor.chain().focus().mergeCells().run()),
      },
      {
        id: "split-cell",
        label: "拆分",
        onClick: safeRun(() => currentEditor.chain().focus().splitCell().run()),
      },
      {
        id: "delete-row",
        label: "删行",
        onClick: safeRun(() => currentEditor.chain().focus().deleteRow().run()),
      },
      {
        id: "delete-column",
        label: "删列",
        onClick: safeRun(() => currentEditor.chain().focus().deleteColumn().run()),
      },
      {
        id: "delete-table",
        label: "删表",
        danger: true,
        onClick: safeRun(() => currentEditor.chain().focus().deleteTable().run()),
      },
    ];
  }, []);

  useEffect(() => {
    buildTableActionsRef.current = buildTableActions;
    return () => {
      buildTableActionsRef.current = null;
    };
  }, [buildTableActions]);

  const refreshTableUI = useCallback(
    (currentEditor) => {
      if (!currentEditor || !currentEditor.isActive("table")) {
        setTableUI((current) => ({
          ...current,
          triggerPosition: null,
          tableRect: null,
          rowHandle: null,
          columnHandle: null,
          hoverInsert: null,
          visible: false,
          actions: [],
        }));
        return;
      }

      const nextPosition = buildTableUIPosition(currentEditor);
      if (!nextPosition) return;

      setTableUI((current) => ({
        ...current,
        ...nextPosition,
        visible: true,
        hoverInsert: current.hoverInsert,
        actions: buildTableActions(currentEditor),
      }));
    },
    [buildTableActions],
  );

  const openTableMenuAt = useCallback(
    (position = null) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      const nextPosition = buildTableUIPosition(currentEditor);
      if (!nextPosition) return;
      setTableUI((current) => ({
        ...current,
        ...nextPosition,
        visible: true,
        menuPosition: position || nextPosition.menuPosition,
        actions: buildTableActions(currentEditor),
      }));
    },
    [buildTableActions],
  );

  const selectTableRowFromHandle = useCallback(
    (rowIndex, position = null) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      if (!setTableRowSelection(currentEditor, rowIndex)) return;
      requestAnimationFrame(() => {
        openTableMenuAt(
          position
            ? {
                left: position.left + 28,
                top: position.top - 8,
              }
            : null,
        );
      });
    },
    [openTableMenuAt],
  );

  const selectTableColumnFromHandle = useCallback(
    (columnIndex, position = null) => {
      const currentEditor = editorRef.current;
      if (!currentEditor) return;
      if (!setTableColumnSelection(currentEditor, columnIndex)) return;
      requestAnimationFrame(() => {
        openTableMenuAt(
          position
            ? {
                left: position.left - 8,
                top: position.top + 32,
              }
            : null,
        );
      });
    },
    [openTableMenuAt],
  );

  const insertTableRowAtHover = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const hoverInsert = tableUI.hoverInsert;
    if (!hoverInsert || hoverInsert.axis !== "row") return;

    const targetIndex =
      hoverInsert.mode === "before" ? hoverInsert.index : Math.max(0, hoverInsert.index - 1);
    if (!focusTableCell(currentEditor, targetIndex, 0)) return;

    if (hoverInsert.mode === "before") {
      currentEditor.chain().focus().addRowBefore().run();
    } else {
      currentEditor.chain().focus().addRowAfter().run();
    }
    requestAnimationFrame(() => refreshTableUI(currentEditor));
  }, [refreshTableUI, tableUI.hoverInsert]);

  const insertTableColumnAtHover = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    const hoverInsert = tableUI.hoverInsert;
    if (!hoverInsert || hoverInsert.axis !== "column") return;

    const targetIndex =
      hoverInsert.mode === "before" ? hoverInsert.index : Math.max(0, hoverInsert.index - 1);
    if (!focusTableCell(currentEditor, 0, targetIndex)) return;

    if (hoverInsert.mode === "before") {
      currentEditor.chain().focus().addColumnBefore().run();
    } else {
      currentEditor.chain().focus().addColumnAfter().run();
    }
    requestAnimationFrame(() => refreshTableUI(currentEditor));
  }, [refreshTableUI, tableUI.hoverInsert]);

  const refreshLinkBubble = useCallback(
    (currentEditor) => {
      if (
        !editable ||
        !currentEditor ||
        !currentEditor.isFocused ||
        linkEditorVisibleRef.current
      ) {
        setLinkBubble((current) => ({ ...current, visible: false, position: null }));
        return;
      }

      const currentRange = getLinkRangeNearSelection(currentEditor);
      if (!currentRange) {
        setLinkBubble((current) => ({ ...current, visible: false, position: null }));
        return;
      }

      const rect = getEditorRectForRange(currentEditor, currentRange);
      if (!rect) {
        setLinkBubble((current) => ({ ...current, visible: false, position: null }));
        return;
      }

      const href = String(currentRange.mark?.attrs?.href || "").trim();
      if (!href) {
        setLinkBubble((current) => ({ ...current, visible: false, position: null }));
        return;
      }

      setLinkBubble({
        visible: true,
        position: {
          anchorX: rect.left + rect.width / 2,
          top: rect.top - 46,
        },
        link: {
          href,
          text:
            String(currentRange.text || "").trim() ||
            currentEditor.state.doc.textBetween(currentRange.from, currentRange.to, "\n"),
        },
        range: currentRange,
      });
    },
    [editable, getLinkRangeNearSelection],
  );

  useEffect(() => {
    if (linkEditor.visible) return;
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    requestAnimationFrame(() => refreshLinkBubble(currentEditor));
  }, [linkEditor.visible, refreshLinkBubble]);

  const closeImageToolbar = useCallback(() => {
    setImageUI((current) => ({ ...current, visible: false }));
  }, []);

  const refreshImageUI = useCallback(
    (currentEditor) => {
      if (!editable || !currentEditor) {
        setImageUI((current) => ({
          ...current,
          visible: false,
          position: null,
        }));
        return;
      }

      const { selection } = currentEditor.state;
      if (
        !(selection instanceof NodeSelection) ||
        selection.node?.type?.name !== "image"
      ) {
        setImageUI((current) => ({
          ...current,
          visible: false,
          position: null,
        }));
        return;
      }

      const imageNode = selection.node;
      const imageElement = currentEditor.view.nodeDOM(selection.from);
      if (!(imageElement instanceof HTMLElement)) {
        setImageUI((current) => ({
          ...current,
          visible: false,
          position: null,
        }));
        return;
      }

      const rect = imageElement.getBoundingClientRect();
      const anchorX = rect.left + rect.width / 2;
      const top = rect.top - 42;

      setImageUI({
        visible: true,
        position: { anchorX, top },
        align: String(imageNode.attrs?.align || "left").trim() || "left",
        size: String(imageNode.attrs?.size || "medium").trim() || "medium",
      });
    },
    [editable],
  );

  const setImageAlign = useCallback((align) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    currentEditor.chain().focus().updateAttributes("image", { align }).run();
    requestAnimationFrame(() => refreshImageUI(currentEditor));
  }, [refreshImageUI]);

  const setImageSize = useCallback((size) => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    currentEditor.chain().focus().updateAttributes("image", { size }).run();
    requestAnimationFrame(() => refreshImageUI(currentEditor));
  }, [refreshImageUI]);

  const deleteSelectedImage = useCallback(() => {
    const currentEditor = editorRef.current;
    if (!currentEditor) return;
    currentEditor.chain().focus().deleteSelection().run();
    setImageUI((current) => ({ ...current, visible: false, position: null }));
  }, []);

  const imagePlaceholderExtension = useMemo(
    () => ImagePlaceholder.configure({}),
    [],
  );

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: false,
        codeBlock: {
          HTMLAttributes: {
            class: "notes-rich-editor-code-block",
          },
        },
      }),
      Heading.configure({
        levels: [1, 2, 3, 4, 5, 6],
      }),
      HeadingAnchor,
      TableOfContents.configure({
        getIndex: getHierarchicalIndexes,
        onUpdate: (items) => {
          handleTocUpdate(items);
        },
        scrollParent: () =>
          document.querySelector(".notes-rich-editor-content") || window,
      }),
      EnhancedLink.configure({
        openOnClick: false,
        autolink: true,
        linkOnPaste: true,
        editable,
        onLinkClick: showLinkEditor,
      }),
      Placeholder.configure({
        placeholder,
      }),
      ActiveBlockHighlight.configure({
        enabled: editable,
      }),
      CodeBlockTools.configure({
        enabled: editable,
      }),
      Underline,
      NoteImage,
      imagePlaceholderExtension,
      TaskList,
      TaskItem.configure({
        nested: true,
      }),
      Table.configure({
        resizable: false,
        lastColumnResizable: false,
      }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content: markdownToHtml(normalizedMarkdown),
    editable,
    editorProps: {
      attributes: {
        class: "notes-rich-editor-prosemirror",
        spellcheck: spellCheckEnabled ? "true" : "false",
      },
      handlePaste: (_view, event) => {
        if (!editable) return false;
        const file = Array.from(event.clipboardData?.files || []).find((item) =>
          String(item?.type || "").startsWith("image/"),
        );
        if (!file) return false;
        event.preventDefault();
        void insertImageFromFile(file);
        return true;
      },
      handleDrop: (view, event) => {
        if (!editable) return false;
        const file = Array.from(event.dataTransfer?.files || []).find((item) =>
          String(item?.type || "").startsWith("image/"),
        );
        if (!file) return false;

        const coords = view.posAtCoords({
          left: event.clientX,
          top: event.clientY,
        });
        if (coords?.pos) {
          editorRef.current?.chain().focus().setTextSelection(coords.pos).run();
        }

        event.preventDefault();
        void insertImageFromFile(file);
        return true;
      },
    },
    onCreate({ editor: currentEditor }) {
      currentEditor.commands.updateTableOfContents?.();
      refreshLinkBubble(currentEditor);
      refreshTableUI(currentEditor);
      refreshImageUI(currentEditor);
    },
    onFocus({ editor: currentEditor }) {
      refreshLinkBubble(currentEditor);
      refreshTableUI(currentEditor);
      refreshImageUI(currentEditor);
    },
    onBlur() {
      setLinkBubble((current) => ({ ...current, visible: false, position: null }));
    },
    onUpdate({ editor: nextEditor }) {
      const nextMarkdown = htmlToMarkdown(nextEditor.getHTML());
      lastSyncedMarkdownRef.current = nextMarkdown;
      onMarkdownChange?.(nextMarkdown);
      refreshLinkBubble(nextEditor);
      refreshTableUI(nextEditor);
      refreshImageUI(nextEditor);
    },
    onSelectionUpdate({ editor: currentEditor }) {
      refreshLinkBubble(currentEditor);
      refreshTableUI(currentEditor);
      refreshImageUI(currentEditor);
    },
  });

  useEffect(() => {
    editorRef.current = editor || null;
  }, [editor]);

  useEffect(() => {
    if (!editor) return undefined;
    const extension = editor.extensionManager.extensions.find(
      (item) => item.name === "imagePlaceholder",
    );
    if (!extension) return undefined;

    extension.options.onRetryUpload = retryImageUpload;
    extension.options.onRemoveUpload = removeImagePlaceholder;
    editor.view.updateState(editor.state);

    return () => {
      extension.options.onRetryUpload = null;
      extension.options.onRemoveUpload = null;
    };
  }, [editor, removeImagePlaceholder, retryImageUpload]);

  useEffect(() => {
    if (!editor) return;
    editor.setEditable(editable);
  }, [editor, editable]);

  useEffect(() => {
    if (!editor) return;
    editor.view.dom.setAttribute(
      "spellcheck",
      spellCheckEnabled ? "true" : "false",
    );
  }, [editor, spellCheckEnabled]);

  useEffect(() => {
    if (!editor) return undefined;
    let frameId = 0;
    const handleViewportChange = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        refreshLinkBubble(editor);
        refreshTableUI(editor);
        refreshImageUI(editor);
      });
    };
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [editor, refreshImageUI, refreshLinkBubble, refreshTableUI]);

  useEffect(() => {
    if (!editor) return undefined;

    const getHoverKey = (value) =>
      value
        ? `${value.axis}:${value.mode}:${value.index}:${Math.round(value.lineStyle.left)}:${Math.round(value.lineStyle.top)}`
        : "";

    const handlePointerMove = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      const isOverFloatingTableUi = Boolean(
        target?.closest?.(".notes-table-insert-button")
        || target?.closest?.(".notes-table-popover")
        || target?.closest?.(".notes-table-insert-line"),
      );

      if (isOverFloatingTableUi) {
        return;
      }

      if (!editor.isActive("table")) {
        setTableUI((current) =>
          current.hoverInsert ? { ...current, hoverInsert: null } : current,
        );
        return;
      }

      const isInsideEditor = target ? editor.view.dom.contains(target) : false;
      if (!isInsideEditor) {
        setTableUI((current) =>
          current.hoverInsert ? { ...current, hoverInsert: null } : current,
        );
        return;
      }

      const nextHoverInsert = resolveHoverInsertIndicator(editor, event);
      setTableUI((current) => {
        if (getHoverKey(nextHoverInsert) === getHoverKey(current.hoverInsert)) {
          return current;
        }
        return { ...current, hoverInsert: nextHoverInsert };
      });
    };

    window.addEventListener("pointermove", handlePointerMove, true);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove, true);
    };
  }, [editor]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setLinkBubble({
        visible: false,
        position: null,
        link: { href: "", text: "" },
        range: null,
      });
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [noteId]);

  useEffect(() => {
    if (!editor) return;
    if (normalizedMarkdown === lastSyncedMarkdownRef.current) return;
    editor.commands.setContent(markdownToHtml(normalizedMarkdown), false);
    editor.commands.updateTableOfContents?.();
    lastSyncedMarkdownRef.current = normalizedMarkdown;
    const frameId = window.requestAnimationFrame(() => {
      setLinkBubble((current) => ({ ...current, visible: false, position: null }));
      refreshTableUI(editor);
      refreshImageUI(editor);
    });
    return () => window.cancelAnimationFrame(frameId);
  }, [editor, normalizedMarkdown, refreshImageUI, refreshTableUI]);

  const formatting = useEditorState({
    editor,
    selector: ({ editor: currentEditor }) => {
      if (!currentEditor) {
        return {
          canUndo: false,
          canRedo: false,
          isBold: false,
          isItalic: false,
          isUnderline: false,
          isStrike: false,
          isCode: false,
          isLink: false,
          isBulletList: false,
          isOrderedList: false,
          isTaskList: false,
          isBlockquote: false,
          isCodeBlock: false,
          isHeading1: false,
          isHeading2: false,
          isHeading3: false,
          isTable: false,
        };
      }

      return {
        canUndo: currentEditor.can().chain().focus().undo().run(),
        canRedo: currentEditor.can().chain().focus().redo().run(),
        isBold: currentEditor.isActive("bold"),
        isItalic: currentEditor.isActive("italic"),
        isUnderline: currentEditor.isActive("underline"),
        isStrike: currentEditor.isActive("strike"),
        isCode: currentEditor.isActive("code"),
        isLink: currentEditor.isActive("link"),
        isBulletList: currentEditor.isActive("bulletList"),
        isOrderedList: currentEditor.isActive("orderedList"),
        isTaskList: currentEditor.isActive("taskList"),
        isBlockquote: currentEditor.isActive("blockquote"),
        isCodeBlock: currentEditor.isActive("codeBlock"),
        isHeading1: currentEditor.isActive("heading", { level: 1 }),
        isHeading2: currentEditor.isActive("heading", { level: 2 }),
        isHeading3: currentEditor.isActive("heading", { level: 3 }),
        isTable: currentEditor.isActive("table"),
      };
    },
  });

  return {
    editor,
    formatting,
    tocItems,
    linkEditor,
    linkBubble,
    tableUI,
    imageUI,
    openLinkEditor,
    closeLinkEditor,
    closeLinkBubble,
    saveLinkEditor,
    removeLink,
    openLinkInNewTab,
    startLinkTitleEdit,
    insertImageFromFile,
    closeTableMenu,
    selectTableRowFromHandle,
    selectTableColumnFromHandle,
    insertTableRowAtHover,
    insertTableColumnAtHover,
    closeImageToolbar,
    setImageAlign,
    setImageSize,
    deleteSelectedImage,
    toggleTableMenu: () =>
      setTableUI((current) => ({ ...current, visible: !current.visible })),
  };
}
