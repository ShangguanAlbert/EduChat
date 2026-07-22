import { useEffect, useRef } from "react";

export default function TablePopover({
  visible = false,
  triggerPosition = null,
  menuPosition = null,
  tableRect = null,
  hoverInsert = null,
  actions = [],
  onInsertRow,
  onInsertColumn,
  onClose,
}) {
  const menuRef = useRef(null);
  const MENU_ESTIMATED_WIDTH = 820;
  const MENU_ESTIMATED_HEIGHT = 160;

  useEffect(() => {
    if (!visible) return undefined;

    const handlePointerDown = (event) => {
      if (menuRef.current?.contains(event.target)) return;
      if (event.target?.closest?.(".notes-table-overlay-button")) return;
      if (event.target?.closest?.(".notes-table-insert-button")) return;
      onClose?.();
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose?.();
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [visible, onClose]);

  const hasTableRect = tableRect?.width > 0 && tableRect?.height > 0;
  if (!hasTableRect && !triggerPosition) return null;

  const toolbarWidth = Math.min(
    Math.max(320, Math.min(MENU_ESTIMATED_WIDTH, (tableRect?.width || 620) + 24)),
    window.innerWidth - 32,
  );
  const resolvedMenuPosition = menuPosition
    || (hasTableRect
      ? {
          left: (tableRect?.left || 0) + (tableRect?.width || 0) / 2 - toolbarWidth / 2,
          top: Math.max(16, (tableRect?.top || 0) - 54),
        }
      : {
          left: triggerPosition.left,
          top: triggerPosition.top + 42,
        });

  const menuLeft = Math.max(
    16,
    Math.min(resolvedMenuPosition.left, window.innerWidth - toolbarWidth - 16),
  );
  const menuTop = Math.max(
    16,
    Math.min(resolvedMenuPosition.top, window.innerHeight - MENU_ESTIMATED_HEIGHT),
  );

  return (
    <>
      {hasTableRect ? (
        <>
          <div
            className="notes-table-active-frame"
            style={{
              left: tableRect.left,
              top: tableRect.top,
              width: tableRect.width,
              height: tableRect.height,
            }}
          />
          {hoverInsert?.lineStyle ? (
            <div
              className={`notes-table-insert-line is-${hoverInsert.axis}`}
              style={hoverInsert.lineStyle}
            />
          ) : null}
          {hoverInsert?.buttonStyle ? (
            <button
              type="button"
              className={`notes-table-insert-button is-${hoverInsert.axis}`}
              style={hoverInsert.buttonStyle}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() =>
                hoverInsert.axis === "row" ? onInsertRow?.() : onInsertColumn?.()
              }
              aria-label={hoverInsert.axis === "row" ? "插入一行" : "插入一列"}
              title={hoverInsert.axis === "row" ? "在此处插入一行" : "在此处插入一列"}
            >
              +
            </button>
          ) : null}
        </>
      ) : null}

      {hasTableRect || visible ? (
        <div
          ref={menuRef}
          className="notes-table-popover"
          style={{ left: menuLeft, top: menuTop, width: toolbarWidth }}
        >
          {actions.map((action) => (
            <button
              key={action.id}
              type="button"
              className={`notes-table-popover-item${action.active ? " active" : ""}${action.danger ? " danger" : ""}`}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                action.onClick?.();
                onClose?.();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      ) : null}
    </>
  );
}
