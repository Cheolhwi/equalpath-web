import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";

// A manual popover keeps the decorative pointer above native modal dialogs.
// Never hide the system cursor unless the replacement is actually visible.
export default function Pointer({ reduced }) {
  const ref = useRef(null);
  useEffect(() => {
    const pointer = ref.current;
    const media = matchMedia("(hover: hover) and (pointer: fine) and (forced-colors: none)");
    if (reduced || !pointer?.showPopover) return;
    const hide = () => {
      delete document.documentElement.dataset.equalpathCursor;
      pointer.dataset.pressed = "false";
      if (pointer.matches(":popover-open")) pointer.hidePopover();
    };
    const move = (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!media.matches || event.pointerType !== "mouse" || !target?.closest(".experience") ||
        target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"]), .map-canvas canvas, [disabled], [aria-disabled="true"], [inert], .equalpath[data-reduced="true"]') ||
        (event.buttons && target.closest(".care-scene-canvas"))) {
        hide(); return;
      }
      pointer.style.transform = `translate3d(${event.clientX - 16}px, ${event.clientY - 16}px, 0)`;
      pointer.dataset.interactive = String(!!target.closest('a, button, summary, label, [role="button"], [role="option"], [role="combobox"], .provider-main'));
      pointer.dataset.dark = String(!!target.closest(".equalpath.dark"));
      if (!pointer.matches(":popover-open")) pointer.showPopover();
      document.documentElement.dataset.equalpathCursor = "true";
    };
    const press = (event) => {
      move(event);
      pointer.dataset.pressed = "true";
    };
    const release = () => { pointer.dataset.pressed = "false"; };
    const leave = (event) => { if (!event.relatedTarget) hide(); };
    const visibility = () => { if (document.hidden) hide(); };
    const layerChanged = (event) => {
      // A newly opened dialog now owns the top layer; re-show on the next move.
      if (event.target instanceof HTMLDialogElement) hide();
    };
    document.addEventListener("pointermove", move, { passive: true });
    document.addEventListener("pointerdown", press, { passive: true });
    document.addEventListener("pointerup", release, { passive: true });
    document.addEventListener("pointercancel", hide);
    document.addEventListener("pointerout", leave);
    document.addEventListener("keydown", hide);
    document.addEventListener("scroll", hide, true);
    document.addEventListener("visibilitychange", visibility);
    document.addEventListener("toggle", layerChanged, true);
    window.addEventListener("blur", hide);
    media.addEventListener("change", hide);
    return () => {
      hide();
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerdown", press);
      document.removeEventListener("pointerup", release);
      document.removeEventListener("pointercancel", hide);
      document.removeEventListener("pointerout", leave);
      document.removeEventListener("keydown", hide);
      document.removeEventListener("scroll", hide, true);
      document.removeEventListener("visibilitychange", visibility);
      document.removeEventListener("toggle", layerChanged, true);
      window.removeEventListener("blur", hide);
      media.removeEventListener("change", hide);
    };
  }, [reduced]);
  return createPortal(<div ref={ref} className="care-pointer" popover="manual" aria-hidden="true" />, document.body);
}
