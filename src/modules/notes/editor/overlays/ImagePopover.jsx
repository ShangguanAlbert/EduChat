import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { AlignCenter, AlignLeft, AlignRight, Trash2 } from "lucide-react";

const EXIT_ANIMATION_MS = 150;

const ALIGN_OPTIONS = [
  { value: "left", label: "左对齐", icon: AlignLeft },
  { value: "center", label: "居中", icon: AlignCenter },
  { value: "right", label: "右对齐", icon: AlignRight },
];

const SIZE_OPTIONS = [
  { value: "small", label: "小图", width: 12 },
  { value: "medium", label: "中图", width: 16 },
  { value: "large", label: "大图", width: 20 },
];

function ImageSizeIcon({ width = 16 }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect
        x={(24 - width) / 2}
        y="7.5"
        width={width}
        height="9"
        rx="2.2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M8.3 13.85L10 12.05C10.37 11.66 10.99 11.68 11.32 12.09L12.3 13.28L13.88 11.92C14.28 11.57 14.87 11.59 15.24 11.97L16.95 13.7"
        stroke="currentColor"
        strokeWidth="1.45"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="10.05" cy="10.35" r="0.95" fill="currentColor" />
    </svg>
  );
}

export default function ImagePopover({
  visible = false,
  position = null,
  align = "left",
  size = "medium",
  onSetAlign,
  onSetSize,
  onDelete,
  onClose,
}) {
  const containerRef = useRef(null);
  const [resolvedStyle, setResolvedStyle] = useState(null);
  const [shouldRender, setShouldRender] = useState(visible);
  const [animationState, setAnimationState] = useState(
    visible ? "entered" : "exited",
  );

  useEffect(() => {
    if (!visible) return undefined;

    const handlePointerDown = (event) => {
      if (containerRef.current?.contains(event.target)) return;
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

  useEffect(() => {
    let frameId = 0;
    let timeoutId = 0;

    if (visible && !shouldRender) {
      frameId = window.requestAnimationFrame(() => {
        setShouldRender(true);
      });
    } else if (visible) {
      frameId = window.requestAnimationFrame(() => {
        setAnimationState("entering");
        frameId = window.requestAnimationFrame(() => {
          setAnimationState("entered");
        });
      });
    } else if (shouldRender) {
      frameId = window.requestAnimationFrame(() => {
        setAnimationState("leaving");
        timeoutId = window.setTimeout(() => {
          setShouldRender(false);
          setAnimationState("exited");
          setResolvedStyle(null);
        }, EXIT_ANIMATION_MS);
      });
    }

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      if (timeoutId) window.clearTimeout(timeoutId);
    };
  }, [visible, shouldRender]);

  useLayoutEffect(() => {
    if (!shouldRender || !position || !containerRef.current) {
      return undefined;
    }

    const updatePosition = () => {
      const popoverWidth = containerRef.current?.offsetWidth || 0;
      const popoverHeight = containerRef.current?.offsetHeight || 0;
      const left = Math.max(
        16,
        Math.min(
          Number(position.anchorX || 0) - popoverWidth / 2,
          window.innerWidth - popoverWidth - 16,
        ),
      );
      const top = Math.max(
        16,
        Math.min(
          Number(position.top || 0),
          window.innerHeight - popoverHeight - 16,
        ),
      );

      setResolvedStyle({ left, top });
    };

    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [shouldRender, position]);

  if (!shouldRender || !position) return null;

  return (
    <div
      ref={containerRef}
      className={`notes-image-popover is-${animationState}`}
      style={resolvedStyle || { left: -9999, top: -9999 }}
      data-notes-image-popover
    >
      <div className="notes-image-popover-group">
        {ALIGN_OPTIONS.map((option) => {
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              className={`notes-image-popover-chip icon-only${align === option.value ? " active" : ""}`}
              onClick={() => onSetAlign?.(option.value)}
              title={option.label}
              aria-label={option.label}
            >
              <Icon size={16} />
            </button>
          );
        })}
      </div>

      <span className="notes-image-popover-divider" aria-hidden="true" />

      <div className="notes-image-popover-group">
        {SIZE_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`notes-image-popover-chip icon-only${size === option.value ? " active" : ""}`}
            onClick={() => onSetSize?.(option.value)}
            title={option.label}
            aria-label={option.label}
          >
            <ImageSizeIcon width={option.width} />
          </button>
        ))}
      </div>

      <span className="notes-image-popover-divider" aria-hidden="true" />

      <button
        type="button"
        className="notes-image-popover-chip icon-only danger"
        onClick={onDelete}
        title="删除图片"
        aria-label="删除图片"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}
