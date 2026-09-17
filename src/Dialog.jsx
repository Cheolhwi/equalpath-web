import { useEffect, useLayoutEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  kicker = "EQUALPATH",
  children,
  onClose,
  wide = false,
  tourBehind = false,
  className = "",
  titleAccessory,
  closing = false,
  exitDuration,
  onExited,
}) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    if (dialog.open) dialog.close();
    if (tourBehind) dialog.show(); else dialog.showModal();
    return () => { dialog.close(); if (!tourBehind && previous?.isConnected) previous.focus?.({ preventScroll: true }); };
  }, [tourBehind]);
  useEffect(() => {
    if (ref.current) {
      ref.current.scrollTop = 0;
      ref.current.querySelector('.dialog-body')?.scrollTo(0, 0);
    }
  }, [title, kicker]);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!closing) { delete dialog.dataset.exitReady; return; }
    // A quick dismissal starts from the current entrance frame, without flashing opaque.
    const style = getComputedStyle(dialog);
    dialog.style.setProperty("--dialog-exit-opacity", style.opacity);
    dialog.style.setProperty("--dialog-exit-transform", style.transform);
    dialog.style.setProperty("--dialog-exit-backdrop", getComputedStyle(dialog, "::backdrop").opacity);
    dialog.dataset.exitReady = "true";
  }, [closing]);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      data-closing={closing || undefined}
      style={{ "--dialog-exit-duration": `${exitDuration}ms` }}
      className={`${wide ? "wide" : ""} ${tourBehind ? "tour-behind" : ""} ${className}`}
      onCancel={(e) => {
        e.preventDefault();
        if (!closing) onClose();
      }}
      onClick={(e) => {
        if (!closing && e.target === ref.current) onClose();
      }}
      onAnimationEnd={(e) => {
        if (closing && e.target === ref.current && e.animationName === "care-surface-disappear") onExited?.();
      }}
    >
      <div className="dialog-content" inert={closing || undefined}>
        <div className="dialog-top">
          <div className="dialog-heading">
            <span className="dialog-kicker">{kicker}</span>
            <div className="dialog-title-row"><h2 id={titleId}>{title}</h2>{titleAccessory}</div>
          </div>
          <button onClick={onClose} aria-label="Close dialog">
            <X size={20} /><span>Close</span>
          </button>
        </div>
        <div className="dialog-body">{children}</div>
      </div>
    </dialog>
  );
}
