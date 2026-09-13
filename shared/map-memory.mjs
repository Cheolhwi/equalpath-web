export const DEFAULT_MAP = Object.freeze({ center: { lat: 3.139, lng: 101.6869 }, zoom: 12.5 });
export const mapStorageKey = (mode) => `equalpath:map:v1:${mode}`;
export const validMapPoint = (p) => !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && p.lat >= 2.55 && p.lat <= 3.95 && p.lng >= 100.7 && p.lng <= 102.05;
export function cleanMapMemory(value) {
  if (value?.version !== 1 || !validMapPoint(value.center) || !Number.isFinite(value.zoom) || value.zoom < 7 || value.zoom > 18) return null;
  const p = value.pickup;
  if (p && (!validMapPoint(p) || typeof p.label !== "string" || !p.label.trim())) return null;
  return {
    version: 1, center: { lat: value.center.lat, lng: value.center.lng }, zoom: value.zoom,
    pickup: p ? { id: typeof p.id === "string" ? p.id.slice(0, 80) : null, label: p.label.slice(0, 160), lat: p.lat, lng: p.lng } : null,
  };
}
export function readMapMemory(storage, mode) {
  try { return cleanMapMemory(JSON.parse(storage.getItem(mapStorageKey(mode)))); } catch { return null; }
}
export function writeMapMemory(storage, mode, value) {
  const clean = cleanMapMemory({ ...value, version: 1 });
  if (!clean) return false;
  try { storage.setItem(mapStorageKey(mode), JSON.stringify(clean)); return true; } catch { return false; }
}
