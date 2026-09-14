import { cloneElement, useEffect, useLayoutEffect, useState } from "react";

export const DIALOG_EXIT_MS = 360;

// Keep the last visible content while its native dialog leaves the top layer.
export default function DialogPresence({ children, immediate = false }) {
  const [retained, setRetained] = useState(children);
  useLayoutEffect(() => { if (children) setRetained(children); }, [children]);
  const closing = !children && Boolean(retained);
  useEffect(() => {
    if (!closing) return;
    if (immediate) { setRetained(null); return; }
    // Animation events can be cancelled by a browser/tab visibility change.
    const timer = setTimeout(() => setRetained(null), DIALOG_EXIT_MS + 80);
    return () => clearTimeout(timer);
  }, [closing, immediate]);
  const content = children || retained;
  if (!content || (closing && immediate)) return null;
  return cloneElement(content, {
    closing,
    exitDuration: DIALOG_EXIT_MS,
    onExited: () => { if (closing) setRetained(null); },
  });
}
