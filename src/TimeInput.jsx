import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Check } from "lucide-react";
import { minutes } from "../shared/request.mjs";
import "./time-input.css";

const pad = (n) => String(n).padStart(2, "0");
function normalise(value) {
  const match = value.trim().match(/^(\d{1,2}):?(\d{2})$/);
  const time = match ? `${pad(match[1])}:${match[2]}` : value;
  return minutes(time) !== null ? time : value;
}

// The OS time popup does not inherit the site's palette. Keep a text field and
// provide a themed, minute-precise picker without changing the HH:mm contract.
export default function TimeInput({ id, label, value, onChange, invalid, describedBy }) {
  const generatedId = useId(), popupId = `${generatedId}-time`;
  const inputId = id || generatedId;
  const displayLabel = label.replace(/^Template /, "").replace(/^./, (letter) => letter.toUpperCase());
  const root = useRef(null), trigger = useRef(null), popup = useRef(null);
  const columns = useRef([]), typed = useRef({ column: -1, text: "", at: 0 });
  const focused = useRef(false);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState([13, 0]);
  const [position, setPosition] = useState(null);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  const show = () => {
    const time = normalise(value);
    const initial = minutes(time) !== null ? time : new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date());
    setDraft(initial.split(":").map(Number));
    typed.current = { column: -1, text: "", at: 0 };
    focused.current = false; setPosition(null); setOpen(true);
  };
  const commit = (next = draft.map(pad).join(":")) => { onChange(next); close(true); };
  const update = (column, next) => setDraft((current) => current.map((n, i) => i === column ? next : n));

  useLayoutEffect(() => {
    if (!open) return;
    const place = (event) => {
      if (event?.target instanceof Node && popup.current?.contains(event.target)) return;
      const rect = root.current.getBoundingClientRect(), viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      if (rect.bottom < y || rect.top > y + height) { setOpen(false); return; }
      const below = y + height - rect.bottom - 12, above = rect.top - y - 12;
      const upward = below < 344 && above > below;
      const menuHeight = Math.min(344, height - 24, Math.max(160, upward ? above : below));
      const menuWidth = Math.min(Math.max(rect.width, 240), width - 24);
      setPosition({ width: menuWidth, height: menuHeight,
        left: Math.max(x + 12, Math.min(rect.left, x + width - menuWidth - 12)),
        top: Math.max(y + 12, Math.min(upward ? rect.top - menuHeight - 6 : rect.bottom + 6, y + height - menuHeight - 12)),
      });
    };
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); setOpen(false);
        trigger.current?.focus({ preventScroll: true });
      }
    };
    place();
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", outside);
    document.addEventListener("keydown", escape, true);
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    viewportListeners("addEventListener");
    function viewportListeners(method) {
      window.visualViewport?.[method]("resize", place);
      window.visualViewport?.[method]("scroll", place);
    }
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", outside);
      document.removeEventListener("keydown", escape, true);
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      viewportListeners("removeEventListener");
    };
  }, [open]);
  useLayoutEffect(() => {
    if (open && position) columns.current.forEach((column) => {
      const option = column?.querySelector('[aria-selected="true"]');
      if (option) column.scrollTop = option.offsetTop - (column.clientHeight - option.clientHeight) / 2;
    });
    if (open && position && !focused.current) {
      focused.current = true; columns.current[0]?.focus({ preventScroll: true });
    }
  }, [draft, open, position?.height]);

  const navigate = (event, column) => {
    const max = column === 0 ? 24 : 60, current = draft[column];
    if (["ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) {
      event.preventDefault();
      const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : event.key === "PageUp" ? -5 : 5;
      update(column, event.key === "Home" ? 0 : event.key === "End" ? max - 1 : (current + step + max) % max);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); columns.current[1 - column]?.focus();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault(); column === 0 ? columns.current[1]?.focus() : commit();
    } else if (/^\d$/.test(event.key)) {
      event.preventDefault();
      const now = Date.now(), previous = typed.current;
      let text = previous.column === column && now - previous.at < 800 ? previous.text + event.key : event.key;
      if (Number(text) >= max || text.length > 2) text = event.key;
      typed.current = { column, text, at: now }; update(column, Number(text));
    } else if (event.key === "Tab" && event.shiftKey && column === 0) {
      event.preventDefault(); close(true);
    }
  };
  const tabAfter = (event) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    const controls = [...(root.current.closest("dialog") || document).querySelectorAll('input,select,textarea,button,a[href],[tabindex="0"]')]
      .filter((el) => !el.disabled && !el.closest('[inert]') && el.getClientRects().length && !popup.current?.contains(el));
    const next = controls[controls.indexOf(trigger.current) + 1];
    if (next) { event.preventDefault(); close(); next.focus(); }
  };
  return <div className="time-input" ref={root}>
    <input id={inputId} type="text" inputMode="numeric" autoComplete="off" maxLength={5}
      placeholder="--:--" aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value} onChange={(event) => onChange(event.target.value)}
      onBlur={() => { const next = normalise(value); if (next !== value) onChange(next); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }} />
    <button ref={trigger} type="button" className="time-input-trigger" aria-label={`Choose ${label.toLowerCase()} time`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      onClick={() => open ? close() : show()}><Clock3 size={17} aria-hidden="true" /></button>
    {open && createPortal(<div id={popupId} role="dialog" aria-label={`${label} time`} className="time-picker" ref={popup}
      style={{ ...position, visibility: position ? "visible" : "hidden" }}>
      <header><span>{displayLabel}</span><span>{draft.map(pad).join(":")}</span></header>
      <div className="time-picker-columns">
        {["Hour", "Minute"].map((name, column) => <div className="time-picker-column" key={name}>
          <span id={`${popupId}-${column}-label`}>{name}</span>
          <div role="listbox" aria-labelledby={`${popupId}-${column}-label`} tabIndex={0}
            aria-activedescendant={`${popupId}-${column}-${draft[column]}`} ref={(el) => { columns.current[column] = el; }}
            onKeyDown={(event) => navigate(event, column)}>
            {Array.from({ length: column === 0 ? 24 : 60 }, (_, n) => <div key={n} id={`${popupId}-${column}-${n}`}
              role="option" aria-selected={draft[column] === n} className="time-picker-option"
              onClick={() => { update(column, n); columns.current[column]?.focus({ preventScroll: true }); }}>
              <span>{pad(n)}</span>{draft[column] === n && <Check size={13} aria-hidden="true" />}
            </div>)}
          </div>
        </div>)}
      </div>
      <footer><button type="button" onClick={() => commit("")}>Clear</button>
        <button type="button" className="time-picker-done" onClick={() => commit()} onKeyDown={tabAfter}>Done <Check size={14} aria-hidden="true" /></button></footer>
    </div>, root.current?.closest("dialog") || root.current?.closest(".equalpath") || document.body)}
  </div>;
}
