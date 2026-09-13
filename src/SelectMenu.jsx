import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import "./select-menu.css";

export const SORT_OPTIONS = [
  ["distance", "Nearest first"],
  ["price", "Lowest monthly fee"],
  ["closing", "Later care end time"],
  ["pickup", "Centres with pickup first"],
  ["name", "By name"],
].map(([value, label]) => ({ value, label }));

// Select-only combobox: navigation previews an option; Enter/click commits it.
export default function SelectMenu({ label, value, options, available, disabled, onChange }) {
  const id = useId(), trigger = useRef(null), menu = useRef(null);
  const typed = useRef({ text: "", at: 0 });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [position, setPosition] = useState(null);
  const enabled = (index) => index >= 0 && available?.[options[index]?.value] !== false;
  const selected = options.findIndex((option) => option.value === value);
  const enabledIndexes = options.map((_, i) => i).filter(enabled);
  const close = () => { setOpen(false); typed.current = { text: "", at: 0 }; };
  const show = (index = selected) => {
    if (disabled || !enabledIndexes.length) return;
    setActive(enabled(index) ? index : enabledIndexes[0]);
    setPosition(null);
    setOpen(true);
  };
  const choose = (index) => {
    if (!enabled(index) || disabled) return;
    close();
    trigger.current?.focus({ preventScroll: true });
    if (options[index].value !== value) onChange(options[index].value);
  };

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useLayoutEffect(() => {
    if (!open) return;
    const place = (event) => {
      if (event?.target instanceof Node && menu.current?.contains(event.target)) return;
      const rect = trigger.current.getBoundingClientRect();
      const viewport = window.visualViewport;
      const leftEdge = viewport?.offsetLeft ?? 0, topEdge = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? window.innerWidth, height = viewport?.height ?? window.innerHeight;
      if (rect.bottom < topEdge || rect.top > topEdge + height) { setOpen(false); return; }
      const menuWidth = Math.min(Math.max(rect.width, 270), width - 24);
      const below = topEdge + height - rect.bottom - 18, above = rect.top - topEdge - 18;
      const naturalHeight = menu.current?.scrollHeight || options.length * 50 + 12;
      const upward = below < Math.min(naturalHeight, 280) && above > below;
      const maxHeight = Math.max(44, Math.min(320, upward ? above : below));
      setPosition({
        width: menuWidth,
        left: Math.max(leftEdge + 12, Math.min(rect.right - menuWidth, leftEdge + width - menuWidth - 12)),
        top: upward ? Math.max(topEdge + 12, rect.top - Math.min(naturalHeight, maxHeight) - 6) : rect.bottom + 6,
        maxHeight,
      });
    };
    const outside = (event) => {
      if (!trigger.current?.contains(event.target) && !menu.current?.contains(event.target)) setOpen(false);
    };
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    document.addEventListener("pointerdown", outside);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      document.removeEventListener("pointerdown", outside);
    };
  }, [open, options.length]);
  useLayoutEffect(() => {
    if (open && position) menu.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [active, open, position?.maxHeight, position?.width]);

  const onKeyDown = (event) => {
    const { key } = event;
    if (key === "Escape" && open) {
      event.preventDefault(); event.stopPropagation(); close(); return;
    }
    if (key === "Tab") { close(); return; }
    if (["ArrowDown", "ArrowUp", "Home", "End", "Enter", " "].includes(key)) {
      event.preventDefault();
      if (key === "Enter" || key === " ") { open ? choose(active) : show(); return; }
      if (key === "Home" || key === "End") {
        const next = key === "Home" ? enabledIndexes[0] : enabledIndexes.at(-1);
        open ? setActive(next) : show(next); return;
      }
      if (open && event.altKey && key === "ArrowUp") { close(); return; }
      if (!open) { show(); return; }
      const index = enabledIndexes.indexOf(active), step = key === "ArrowDown" ? 1 : -1;
      setActive(enabledIndexes[(index + step + enabledIndexes.length) % enabledIndexes.length]);
    } else if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      typed.current = { text: (now - typed.current.at < 700 ? typed.current.text : "") + key.toLowerCase(), at: now };
      let next = enabledIndexes.find((i) => options[i].label.toLowerCase().startsWith(typed.current.text));
      if (next == null) {
        typed.current.text = key.toLowerCase();
        next = enabledIndexes.find((i) => options[i].label.toLowerCase().startsWith(typed.current.text));
      }
      if (next != null) open ? setActive(next) : show(next);
    }
  };

  return (
    <div className="select-menu">
      <button type="button" role="combobox" className="select-menu-trigger" ref={trigger}
        aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={open ? id : undefined} aria-activedescendant={open ? `${id}-${active}` : undefined}
        disabled={disabled} onClick={() => open ? close() : show()} onKeyDown={onKeyDown}
        onBlur={(event) => { if (!menu.current?.contains(event.relatedTarget)) close(); }}>
        <span>{options[selected]?.label ?? "Choose an option"}</span><ChevronDown size={16} aria-hidden="true" />
      </button>
      {open && createPortal(
        <div id={id} role="listbox" aria-label={`${label} options`} ref={menu} className="select-menu-popup"
          style={{ ...position, visibility: position ? "visible" : "hidden" }}>
          {options.map((option, i) => (
            <div key={option.value} id={`${id}-${i}`} role="option" aria-selected={option.value === value}
              aria-disabled={!enabled(i)} className={`select-menu-option${i === active ? " active" : ""}`}
              onPointerDown={(event) => event.preventDefault()}
              onPointerMove={() => { if (enabled(i)) setActive(i); }} onClick={() => choose(i)}>
              <span className="select-menu-check">{option.value === value && <Check size={16} aria-hidden="true" />}</span>
              <span className="select-menu-option-label">{option.label}{!enabled(i) && <small>Unavailable</small>}</span>
            </div>
          ))}
        </div>,
        // A modal's popup stays inside that dialog so it remains interactive.
        trigger.current?.closest("dialog") || trigger.current?.closest(".equalpath") || document.body,
      )}
    </div>
  );
}
