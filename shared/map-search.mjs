export const MIN_SEARCH_ZOOM = 12;
export function areaMoved(a, b) {
  if (!a || !b) return false;
  const dy = (a.lat - b.lat) * 111.2;
  const dx = (a.lng - b.lng) * 111.2 * Math.cos(a.lat * Math.PI / 180);
  return Math.hypot(dx, dy) >= 0.5;
}
export function nearbyCacheKey(body) {
  return JSON.stringify([body.mode ?? "live", body.radius ?? 5, Number(body.center?.lat).toFixed(3), Number(body.center?.lng).toFixed(3)]);
}
