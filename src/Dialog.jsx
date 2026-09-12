import { useEffect, useRef, useId } from "react";
import { X } from "lucide-react";
export default function Dialog({
  title,
  kicker = "EQUALPATH",
  children,
  onClose,
  wide = false,
}) {
  const ref = useRef(null),
    titleId = useId();
  useEffect(() => {
    const previous = document.activeElement;
    ref.current.showModal();
    return () => previous?.focus?.();
  }, []);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [title, kicker]);
  return (
    <dialog
      aria-labelledby={titleId}
      ref={ref}
      className={wide ? "wide" : ""}
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
