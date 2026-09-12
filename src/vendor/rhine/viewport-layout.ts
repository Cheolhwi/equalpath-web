/** Reference coordinates remain exact during the film and at 1920 × 1080. */
export function openingLayout(width: number, height: number) {
  width = Math.max(1, width); height = Math.max(1, height);
  const scale = Math.min(height / 1080, width / 1280);
  return { width: width / scale, height: height / scale, scale, kind: "opening" as const };
}
export function viewportLayout(width: number, height: number, coarse: boolean, cinematic = false) {
  width = Math.max(1, width);
  height = Math.max(1, height);
  if (cinematic) return {
    width: 1920, height: 1080, scale: Math.min(width / 1920, height / 1080),
    kind: "cinematic" as const,
  };
  const portrait = width / height < 1.05;
  const compact = portrait || width < 1100 || (coarse && height < 600);
  const scale = compact ? 1 : height / 1080;
  return { width: width / scale, height: height / scale, scale,
    kind: portrait ? "portrait" as const : compact ? "compact" as const : "desktop" as const };
}

/** Preserve the long-lens perspective. Reframe only the camera, never the card. */
// The original scene sits in a dedicated landing viewport, with controls below it.
// Keep the original long-lens camera and object scale, centering the selected item.
export function archiveFraming(width: number, height: number, span: number, detail: number, compact: boolean) {
  const aspect = width / Math.max(1, height);
  const baseSpan = span + (5.9 - span) * detail;
  return {
    span: Math.max(baseSpan, 6.2 / aspect),
    portrait: aspect < 1.05,
    previewY: 0.5, detailX: 0.5, detailY: 0.5,
  };
}
