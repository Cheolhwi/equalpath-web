import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  kicker = "EQUALPATH",
  children,
  onClose,
  wide = false,
  tourBehind = false,
}) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    const dialog = ref.current;
    if (dialog.open) dialog.close();
    if (tourBehind) dialog.show(); else dialog.showModal();
    return () => { dialog.close(); if (!tourBehind) previous?.focus?.(); };
  }, [tourBehind]);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [title, kicker]);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={`${wide ? "wide" : ""} ${tourBehind ? "tour-behind" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
    >
      <div className="dialog-content">
        <div className="dialog-top">
          <span>{kicker}</span>
          <button onClick={onClose} aria-label="Close dialog">
            <X size={20} />
          </button>
        </div>
        <h2 id={titleId}>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
