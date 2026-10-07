import { useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock3, Check, Pencil } from "lucide-react";
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
const HOURS = Array.from({ length: 24 }, (_, n) => n);
// Minutes are listed in 5-minute steps so the list is short on a phone. An
// exact minute (typed, or already saved) is added to the list, never rounded.
const minuteOptions = (selected) => {
  const steps = Array.from({ length: 12 }, (_, n) => n * 5);
  return Number.isInteger(selected) && selected % 5 ? [...steps, selected].sort((a, b) => a - b) : steps;
};
export default function TimeInput({ id, label, pickerLabel = label, value, onChange, invalid, describedBy, variant = "field", allowClear = true, icon: Icon = Clock3, shortLabel, onOpen, pending = false, suggest }) {
  const generatedId = useId(), popupId = `${generatedId}-time`;
  const inputId = id || generatedId;
  const displayLabel = pickerLabel.replace(/^Template /, "").replace(/^./, (letter) => letter.toUpperCase());
  const root = useRef(null), trigger = useRef(null), popup = useRef(null);
  const columns = useRef([]), typed = useRef({ column: -1, text: "", at: 0 });
  const focused = useRef(false);
  const [open, setOpen] = useState(false), [draft, setDraft] = useState([13, 0]);
  const [position, setPosition] = useState(null);
  const changed = useRef(false), dismiss = useRef(null);
  const close = (restore = false) => {
    setOpen(false);
    if (restore) trigger.current?.focus({ preventScroll: true });
  };
  const show = () => {
    onOpen?.();
    const time = normalise(value);
    // An empty field opens on the caller's suggestion (for example 09:00 on a
    // future date), otherwise on the current Malaysian time.
    const initial = minutes(time) !== null ? time : minutes(suggest ?? "") !== null ? suggest : new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kuala_Lumpur", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
    }).format(new Date());
    setDraft(initial.split(":").map(Number));
    changed.current = false;
    typed.current = { column: -1, text: "", at: 0 };
    focused.current = false; setPosition(null); setOpen(true);
  };
  const commit = (next = draft.map(pad).join(":")) => { changed.current = false; onChange(next); close(true); };
  const update = (column, next) => { changed.current = true; setDraft((current) => current.map((n, i) => i === column ? next : n)); };
  // Event listeners need the latest selection, and must leave focus on the
  // control the user clicked. Opening then dismissing an empty field adds no time.
  dismiss.current = (restore = false) => {
    if (changed.current) { changed.current = false; onChange(draft.map(pad).join(":")); }
    close(restore);
  };

  useLayoutEffect(() => {
    if (!open) return;
    const place = (event) => {
      if (event?.target instanceof Node && popup.current?.contains(event.target)) return;
      const rect = root.current.getBoundingClientRect(), viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      if (rect.bottom < y || rect.top > y + height) { dismiss.current(); return; }
      const below = y + height - rect.bottom - 12, above = rect.top - y - 12;
      const preferredHeight = variant === "chip" ? 236 : 288;
      const upward = below < preferredHeight && above > below;
      const menuHeight = Math.min(preferredHeight, height - 24, Math.max(160, upward ? above : below));
      const menuWidth = Math.min(Math.max(rect.width, 240), width - 24);
      setPosition({ width: menuWidth, height: menuHeight,
        left: Math.max(x + 12, Math.min(rect.left, x + width - menuWidth - 12)),
        top: Math.max(y + 12, Math.min(upward ? rect.top - menuHeight - 6 : rect.bottom + 6, y + height - menuHeight - 12)),
      });
    };
    const outside = (event) => {
      if (!root.current?.contains(event.target) && !popup.current?.contains(event.target)) dismiss.current();
    };
    const escape = (event) => {
      if (event.key === "Escape") {
        event.preventDefault(); event.stopPropagation(); changed.current = false; setOpen(false);
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
      if (column === 1 && !["Home", "End"].includes(event.key)) {
        // Minutes move in the same 5-minute steps as the list; typed digits stay exact.
        const step = event.key === "ArrowUp" ? -5 : event.key === "ArrowDown" ? 5 : event.key === "PageUp" ? -15 : 15;
        const base = step > 0 ? Math.floor(current / 5) * 5 : Math.ceil(current / 5) * 5;
        update(column, (base + step + 60) % 60);
        return;
      }
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
      event.preventDefault(); dismiss.current(true);
    }
  };
  const tabAfter = (event) => {
    if (event.key !== "Tab" || event.shiftKey) return;
    const controls = [...(root.current.closest("dialog") || document).querySelectorAll('input,select,textarea,button,a[href],[tabindex="0"]')]
      .filter((el) => !el.disabled && !el.closest('[inert]') && el.getClientRects().length && !popup.current?.contains(el));
    const next = controls[controls.indexOf(trigger.current) + 1];
    if (next) { event.preventDefault(); dismiss.current(); next.focus(); }
  };
  return <div className="time-input" ref={root}>
    {variant === "chip" ? <button id={inputId} ref={trigger} type="button" className={`search-chip${invalid ? " invalid" : ""}${pending ? " unapplied" : ""}`} data-pending={pending || undefined}
      aria-label={`${shortLabel ? `${shortLabel}: ` : ""}${label} ${value || "Choose time"}`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      onClick={() => open ? dismiss.current() : show()}><Icon size={21} aria-hidden="true" /><span><small>{shortLabel}{pending && <Pencil size={11} aria-hidden="true" />}</small><strong>{value || "Set time"}</strong></span></button> : variant === "button" ? <button ref={trigger} type="button" className="time-value-button"
      aria-label={`Change ${label.toLowerCase()} time: ${value || "not set"}`} aria-describedby={describedBy}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      onClick={() => open ? dismiss.current() : show()}><strong>{value || "Set time"}</strong><Pencil size={15} aria-hidden="true" /></button> : variant === "box" ? <button id={inputId} ref={trigger} type="button"
      className={`time-box${value ? "" : " empty"}`} aria-label={`${label}: ${value || "not set"}`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      onClick={() => open ? dismiss.current() : show()}><span>{value || "--:--"}</span><Clock3 size={17} aria-hidden="true" /></button> : <>
    <input id={inputId} type="text" inputMode="numeric" autoComplete="off" maxLength={5}
      placeholder="--:--" aria-label={`${shortLabel ? `${shortLabel}: ` : ""}${label}`} aria-invalid={invalid || undefined} aria-describedby={describedBy}
      value={value} onChange={(event) => onChange(event.target.value)}
      onBlur={() => { const next = normalise(value); if (next !== value) onChange(next); }}
      onKeyDown={(event) => { if (event.key === "ArrowDown") { event.preventDefault(); show(); } }} />
    <button ref={trigger} type="button" className="time-input-trigger" aria-label={`Choose ${label.toLowerCase()} time`}
      aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? popupId : undefined}
      onClick={() => open ? dismiss.current() : show()}><Clock3 size={17} aria-hidden="true" /></button></>}
    {open && createPortal(<div id={popupId} role="dialog" aria-label={`${displayLabel} time`} className="time-picker" ref={popup}
      style={{ ...position, visibility: position ? "visible" : "hidden" }}>
      <div className="time-picker-columns">
        {["Hour", "Minute"].map((name, column) => <div className="time-picker-column" key={name}>
          <span id={`${popupId}-${column}-label`}>{name}</span>
          <div role="listbox" aria-labelledby={`${popupId}-${column}-label`} tabIndex={0}
            aria-activedescendant={`${popupId}-${column}-${draft[column]}`} ref={(el) => { columns.current[column] = el; }}
            onKeyDown={(event) => navigate(event, column)}>
            {(column === 0 ? HOURS : minuteOptions(draft[1])).map((n) => <div key={n} id={`${popupId}-${column}-${n}`}
              role="option" aria-selected={draft[column] === n} className="time-picker-option"
              onClick={() => { update(column, n); columns.current[column]?.focus({ preventScroll: true }); }}>
              <span>{pad(n)}</span>{draft[column] === n && <Check size={13} aria-hidden="true" />}
            </div>)}
          </div>
        </div>)}
      </div>
      <footer>{allowClear && <button type="button" onClick={() => commit("")}>Clear</button>}
        <button type="button" className="time-picker-done" onClick={() => commit()} onKeyDown={tabAfter}>Done <Check size={14} aria-hidden="true" /></button></footer>
    </div>, root.current?.closest("dialog") || root.current?.closest(".equalpath") || document.body)}
  </div>;
}
