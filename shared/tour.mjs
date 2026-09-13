export const TOUR_KEY = "equalpath:tour:v1";
export function tourSeen(storage) {
  try {
    const saved = JSON.parse(storage.getItem(TOUR_KEY));
    return saved?.version === 1 && ["completed", "skipped"].includes(saved.status);
  } catch { return false; }
}
export function saveTour(storage, status) {
  if (!["completed", "skipped"].includes(status)) return false;
  try { storage.setItem(TOUR_KEY, JSON.stringify({ version: 1, status })); return true; }
  catch { return false; }
}
// Keep the coach card on-screen, preferably beside the highlighted control.
export function tourPlacement(target, viewport, cardHeight) {
  const gap = 18, margin = 16;
  const width = Math.min(380, viewport.width - margin * 2);
  const height = Math.min(cardHeight, viewport.height - margin * 2);
  let left = (viewport.width - width) / 2, top = (viewport.height - height) / 2;
  if (target) {
    if (viewport.width > 760 && target.right + gap + width <= viewport.width - margin) {
      left = target.right + gap; top = target.top;
    } else if (viewport.width > 760 && target.left - gap - width >= margin) {
      left = target.left - gap - width; top = target.top;
    } else if (target.bottom + gap + height <= viewport.height - margin) {
      left = target.left; top = target.bottom + gap;
    } else { left = viewport.width > 760 ? viewport.width - width - 28 : margin; top = viewport.height - height - margin; }
  }
  return { width, left: Math.max(margin, Math.min(left, viewport.width - width - margin)), top: Math.max(margin, Math.min(top, viewport.height - height - margin)) };
}
