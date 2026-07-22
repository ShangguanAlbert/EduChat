import { useEffect, useRef } from "react";
import { EditorContent } from "@tiptap/react";
import LinkBubble from "./overlays/LinkBubble.jsx";
import LinkPopover from "./overlays/LinkPopover.jsx";
import ImagePopover from "./overlays/ImagePopover.jsx";
import TablePopover from "./overlays/TablePopover.jsx";
import RichTextToolbar from "./RichTextToolbar.jsx";
import { NOTE_IMAGE_ACCEPT } from "./services/mediaUploadService.js";
import { useRichNoteEditor } from "./useRichNoteEditor.js";

export default function RichTextEditor({
  noteId = "",
  markdown = "",
  onMarkdownChange,
  onTocChange,
  onEditorReady,
  editable = true,
  placeholder = "在这里记录你的笔记",
  spellCheckEnabled = false,
}) {
  const fileInputRef = useRef(null);
  const {
    editor,
    formatting,
    tocItems,
    linkEditor,
    linkBubble,
    tableUI,
    imageUI,
    openLinkEditor,
    closeLinkEditor,
    saveLinkEditor,
    removeLink,
    openLinkInNewTab,
    startLinkTitleEdit,
    insertImageFromFile,
    closeTableMenu,
    insertTableRowAtHover,
    insertTableColumnAtHover,
    closeImageToolbar,
    setImageAlign,
    setImageSize,
    deleteSelectedImage,
  } = useRichNoteEditor({
    noteId,
    markdown,
    editable,
    placeholder,
    spellCheckEnabled,
    onMarkdownChange,
  });

  useEffect(() => {
    onTocChange?.(tocItems);
  }, [onTocChange, tocItems]);

  useEffect(
    () => () => {
      onTocChange?.([]);
    },
    [noteId, onTocChange],
  );

  useEffect(() => {
    onEditorReady?.(editor || null);
    return () => onEditorReady?.(null);
  }, [editor, onEditorReady]);

  return (
    <div className="notes-rich-editor-shell">
      {editable ? (
        <RichTextToolbar
          editor={editor}
          formatting={formatting}
          onOpenLinkEditor={openLinkEditor}
          onOpenImagePicker={() => fileInputRef.current?.click()}
        />
      ) : null}
      <div className="notes-rich-editor-content">
        <EditorContent editor={editor} />
      </div>
      <input
        ref={fileInputRef}
        type="file"
        accept={NOTE_IMAGE_ACCEPT}
        className="notes-rich-editor-file-input"
        onChange={(event) => {
          const file = event.target.files?.[0] || null;
          if (file) {
            void insertImageFromFile(file);
          }
          event.target.value = "";
        }}
      />
      {linkEditor.visible ? (
        <LinkPopover
          key={`${linkEditor.range?.from || 0}-${linkEditor.range?.to || 0}-${linkEditor.link?.href || ""}`}
          visible={linkEditor.visible}
          position={linkEditor.position}
          link={linkEditor.link}
          mode={linkEditor.mode}
          onSave={saveLinkEditor}
          onRemove={linkEditor.canRemove ? removeLink : undefined}
          onCancel={closeLinkEditor}
        />
      ) : null}
      {editable ? (
        <LinkBubble
          visible={linkBubble.visible}
          position={linkBubble.position}
          onOpen={() => openLinkInNewTab(linkBubble.link?.href)}
          onEdit={startLinkTitleEdit}
        />
      ) : null}
      {editable ? (
        <ImagePopover
          visible={imageUI.visible}
          position={imageUI.position}
          align={imageUI.align}
          size={imageUI.size}
          onSetAlign={setImageAlign}
          onSetSize={setImageSize}
          onDelete={deleteSelectedImage}
          onClose={closeImageToolbar}
        />
      ) : null}
      {editable ? (
        <TablePopover
          visible={tableUI.visible}
          triggerPosition={tableUI.triggerPosition}
          menuPosition={tableUI.menuPosition}
          tableRect={tableUI.tableRect}
          hoverInsert={tableUI.hoverInsert}
          actions={tableUI.actions}
          onInsertRow={insertTableRowAtHover}
          onInsertColumn={insertTableColumnAtHover}
          onClose={closeTableMenu}
        />
      ) : null}
    </div>
  );
}
