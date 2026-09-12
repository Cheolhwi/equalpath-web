import { readFileSync } from "node:fs";
const geometry = JSON.parse(
  readFileSync(new URL("./data/service-boundaries.json", import.meta.url)),
);
export const regions = ["Kuala Lumpur", "Selangor"];
const polygons = geometry.features.flatMap((f) =>
  (f.geometry.type === "MultiPolygon"
    ? f.geometry.coordinates
    : [f.geometry.coordinates]
  ).map((rings) => ({
    name: f.properties.shapeName,
    rings,
    bbox: rings[0].reduce(
      (b, [x, y]) => [
        Math.min(b[0], x),
        Math.min(b[1], y),
        Math.max(b[2], x),
        Math.max(b[3], y),
      ],
      [Infinity, Infinity, -Infinity, -Infinity],
    ),
  })),
);
function insideRing([x, y], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i],
      [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      inside = !inside;
  }
  return inside;
}
export function regionAt(location) {
  if (
    !location ||
    !Number.isFinite(location.lat) ||
    !Number.isFinite(location.lng)
  )
    return null;
  const p = [location.lng, location.lat];
  // Explicit excluded enclave checked first, even if upstream geometry overlaps.
  for (const x of [...polygons].sort(
    (a, b) => (b.name === "Putrajaya") - (a.name === "Putrajaya"),
  )) {
    const [a, b, c, d] = x.bbox;
    if (p[0] < a || p[0] > c || p[1] < b || p[1] > d) continue;
    if (
      insideRing(p, x.rings[0]) &&
      !x.rings.slice(1).some((r) => insideRing(p, r))
    )
      return x.name;
  }
  return null;
}
export function distanceKm(a, b) {
  if (!a || !b) return null;
  const rad = Math.PI / 180,
    dlat = (b.lat - a.lat) * rad,
    dlng = (b.lng - a.lng) * rad,
    v =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(v), Math.sqrt(1 - v));
}
export function providerRegion(p) {
  if (!regions.includes(p.state))
    return { allowed: false, reason: "outside_source_region" };
  const l = p.location,
    loc =
      l && Number.isFinite(l.latitude) && Number.isFinite(l.longitude)
        ? { lat: l.latitude, lng: l.longitude }
        : null;
  if (loc) {
    const actual = regionAt(loc);
    return {
      allowed: actual === p.state,
      region: actual,
      location: loc,
      reason:
        actual === p.state
          ? "boundary_and_source_agree"
          : "coordinate_region_conflict",
    };
  }
  const districts =
    p.state === "Kuala Lumpur"
      ? /kuala lumpur|sentul|cheras|kepong|segambut|titiwangsa|wangsa maju|bukit bintang|lembah pantai|seputeh|bandar tun razak/i
      : /petaling|klang|gombak|hulu langat|ulu langat|hulu selangor|ulu selangor|kuala langat|kuala selangor|sabak bernam|sepang/i;
  return {
    allowed: districts.test(p.district ?? ""),
    region: p.state,
    location: null,
    reason: districts.test(p.district ?? "")
      ? "source_area_only_missing_coordinate"
      : "unresolved_area",
  };
}
