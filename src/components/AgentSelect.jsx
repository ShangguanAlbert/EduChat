import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import "../styles/agentselect.css";

const AGENTS = [
  { id: "A", name: "智能体 A" },
  { id: "B", name: "智能体 B" },
  { id: "C", name: "智能体 C" },
  { id: "D", name: "千问3.5" },
  { id: "E", name: "SSCI审稿人" },
];

export default function AgentSelect({
  value = "A",
  onChange,
  onOpenApiSettings,
  disabled = false,
  disabledTitle = "",
}) {
  const selectedIndex = useMemo(
    () =>
      Math.max(
        0,
        AGENTS.findIndex((a) => a.id === value),
      ),
    [value],
  );

  const current = useMemo(
    () => AGENTS.find((a) => a.id === value) ?? AGENTS[0],
    [value],
  );

  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(() => selectedIndex);

  const btnRef = useRef(null);
  const popRef = useRef(null);

  // 点击外部关闭
  useEffect(() => {
    function onDocMouseDown(e) {
      if (!open || disabled) return;
      const t = e.target;
      if (btnRef.current && btnRef.current.contains(t)) return;
      if (popRef.current && popRef.current.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    return () => document.removeEventListener("mousedown", onDocMouseDown);
  }, [open, disabled]);

  function commitSelect(idx) {
    if (disabled) return;
    const a = AGENTS[idx];
    if (!a) return;
    onChange?.(a.id);
    setOpen(false);
    btnRef.current?.focus();
  }

  function onButtonKeyDown(e) {
    if (disabled) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      setOpen((v) => {
        const next = !v;
        if (next) setActiveIndex(selectedIndex);
        return next;
      });
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.min(AGENTS.length - 1, selectedIndex + 1));
      } else {
        setActiveIndex((i) => Math.min(AGENTS.length - 1, i + 1));
      }
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setActiveIndex(Math.max(0, selectedIndex - 1));
      } else {
        setActiveIndex((i) => Math.max(0, i - 1));
      }
    }
  }

  function onMenuKeyDown(e) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      btnRef.current?.focus();
      return;
    }

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(AGENTS.length - 1, i + 1));
      return;
    }

    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(0, i - 1));
      return;
    }

    if (e.key === "Enter") {
      e.preventDefault();
      commitSelect(activeIndex);
    }
  }

  return (
    <div className="agent">
      <span className="agent-label"></span>

      <button
        ref={btnRef}
        className="agent-trigger"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open && !disabled}
        disabled={disabled}
        title={disabled ? disabledTitle : "切换智能体"}
        onClick={() =>
          disabled
            ? null
            : setOpen((v) => {
                const next = !v;
                if (next) setActiveIndex(selectedIndex);
                return next;
              })
        }
        onKeyDown={onButtonKeyDown}
      >
        <span className="agent-trigger-title">{current.name}</span>
        <ChevronDown className="agent-caret" size={18} strokeWidth={2.4} aria-hidden="true" />
      </button>

      {open && !disabled && (
        <div
          ref={popRef}
          className="agent-popover"
          role="menu"
          aria-label="智能体切换"
          tabIndex={-1}
          onKeyDown={onMenuKeyDown}
        >
          {AGENTS.map((a, idx) => {
            const selected = a.id === value;
            const active = idx === activeIndex;

            return (
              <div
                key={a.id}
                role="menuitemradio"
                aria-checked={selected}
                className={`agent-item ${active ? "active" : ""}`}
                onMouseEnter={() => setActiveIndex(idx)}
                onMouseLeave={() => setActiveIndex(selectedIndex)}
                onMouseDown={(e) => e.preventDefault()} // 防止先失焦导致弹层先关
                onClick={() => commitSelect(idx)}
              >
                <span className="agent-check" aria-hidden="true">
                  {selected ? "✓" : ""}
                </span>
                <span className="agent-name">{a.name}</span>
              </div>
            );
          })}

          {onOpenApiSettings ? (
            <>
              <div className="agent-divider" />
              <button
                type="button"
                className="agent-settings-item"
                onMouseEnter={() => setActiveIndex(selectedIndex)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  setOpen(false);
                  onOpenApiSettings();
                }}
              >
                API 设置
              </button>
            </>
          ) : null}
        </div>
      )}
    </div>
  );
}
