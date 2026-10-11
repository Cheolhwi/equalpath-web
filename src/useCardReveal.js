import { useLayoutEffect, useRef } from "react";

export default function useCardReveal() {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const card = ref.current;
    if (!card || card.dataset.reveal === "ready" || !window.IntersectionObserver || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (card.dataset.reveal !== "visible") card.dataset.reveal = "waiting";
    const observer = new IntersectionObserver((entries) => {
      if (card.dataset.reveal !== "waiting" || !entries.some(entry => entry.isIntersecting)) return;
      card.dataset.reveal = "visible";
      observer.disconnect();
    }, { threshold: 0.05 });
    observer.observe(card);
    // A focused offscreen card must never stay hidden from a keyboard user.
    const show = () => { card.dataset.reveal = "ready"; observer.disconnect(); };
    // A hidden/reopened scroll panel may miss an intersection notification.
    // End the animation as well, even when compositor frames arrive late.
    const fallback = setTimeout(show, 1500);
    card.addEventListener("focusin", show);
    return () => { clearTimeout(fallback); observer.disconnect(); card.removeEventListener("focusin", show); };
  }, []);
  return ref;
}
