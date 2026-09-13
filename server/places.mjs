import { ServiceError } from "./appwrite-store.mjs";
import { regionAt, regions, distanceKm } from "./geography.mjs";

export function placeQuery(value) {
  return String(value ?? "").normalize("NFKC").trim().slice(0, 100)
    .replace(/\bjln\.?\b/gi, "Jalan")
    .replace(/\btmn\.?\b/gi, "Taman")
    .replace(/\bkg\.?\b/gi, "Kampung").replace(/\s+/g, " ");
}
export function photonPlaces(data) {
  if (!Array.isArray(data?.features)) throw new ServiceError("PLACE_SEARCH_UNAVAILABLE", 503);
  const seen = new Set();
  return data.features.flatMap((f) => {
    const p = f.properties ?? {}, [lng, lat] = f.geometry?.coordinates ?? [];
    const region = regionAt({ lat, lng });
    if (f.geometry?.type !== "Point" || !regions.includes(region)) return [];
    const label = String(p.name || [p.housenumber, p.street].filter(Boolean).join(" ") || p.district || p.city || "").slice(0, 160);
    if (!label || !/^[NWR]$/.test(p.osm_type) || !Number.isSafeInteger(p.osm_id)) return [];
    const id = `osm:${p.osm_type}:${p.osm_id}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const address = [...new Set([p.housenumber, p.street, p.district, p.city, p.postcode, region].filter(Boolean))].join(", ").slice(0, 320);
    return [{ id, label, address, region, lat, lng, source: "OpenStreetMap", kind: p.osm_value ?? "place" }];
  }).filter((p, i, all) => !all.slice(0, i).some((earlier) =>
    earlier.label.toLowerCase() === p.label.toLowerCase() && earlier.kind === p.kind && distanceKm(earlier, p) < 0.1
  )).slice(0, 10);
}

// Photon explicitly supports partial names, multilingual names and typo tolerance.
// Searches are button/Enter initiated, cached and coalesced; never per keystroke.
// A private or hosted compatible endpoint can replace the public service via env.
export function createPlaceSearch({ fetcher = fetch, endpoint = process.env.EQUALPATH_PHOTON_URL || "https://photon.komoot.io/api/", interval = 1100, now = Date.now } = {}) {
  const cache = new Map(), pending = new Map();
  let queue = Promise.resolve(), next = 0;
  const lookup = async (key, url, parse) => {
    const hit = cache.get(key);
    if (hit && hit.expires > now()) return hit.value;
    if (pending.has(key)) return pending.get(key);
    if (pending.size >= 8) throw new ServiceError("PLACE_SEARCH_BUSY", 429);
    const job = queue.then(async () => {
      const delay = Math.max(0, next - now());
      if (delay) await new Promise((r) => setTimeout(r, delay));
      next = now() + interval;
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(10000), headers: { "User-Agent": "EqualPath-Web/1.0 (https://equalpath-web.appwrite.network)", Accept: "application/json" } });
        if (!response.ok) throw Error("geocoder unavailable");
        const value = parse(await response.json());
        cache.set(key, { value, expires: now() + 86400000 });
        if (cache.size > 512) cache.delete(cache.keys().next().value);
        return value;
      } catch {
        throw new ServiceError("PLACE_SEARCH_UNAVAILABLE", 503);
      }
    });
    queue = job.catch(() => {});
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  };
  const search = async (input) => {
    const query = placeQuery(input);
    if (query.length < 2) return { items: [], total: 0, source: "OpenStreetMap / Photon" };
    const url = new URL(endpoint);
    for (const [k, v] of Object.entries({ q: query, limit: 20, lang: "en", bbox: "100.7,2.55,102.05,3.95", lat: 3.139, lon: 101.6869 })) url.searchParams.set(k, v);
    return lookup(`search:${query.toLocaleLowerCase("en")}`, url, data => {
      const items = photonPlaces(data);
      return { items, total: items.length, source: "OpenStreetMap / Photon" };
    });
  };
  // Only resolve a confirmed pickup, never map movements. Share the forward
  // search queue/cache, and keep the user's coordinates rather than the road centre.
  search.reverse = async (point) => {
    if (!regions.includes(regionAt(point))) throw new ServiceError("OUTSIDE_SERVICE_AREA", 422);
    const url = new URL(process.env.EQUALPATH_PHOTON_REVERSE_URL || "../reverse/", endpoint);
    for (const [k,v] of Object.entries({lat:point.lat,lon:point.lng,lang:"en",limit:3,radius:1,layer:"street"})) url.searchParams.set(k,v);
    const resolved = await lookup(`reverse:${point.lat.toFixed(5)},${point.lng.toFixed(5)}`, url, data => {
      if (!Array.isArray(data?.features)) throw Error("Invalid geocoder response");
      const candidates = data.features.flatMap(f => {
        const p=f.properties ?? {}, [lng,lat]=f.geometry?.coordinates ?? [];
        if (f.geometry?.type!=="Point" || !regions.includes(regionAt({lat,lng})) || distanceKm(point,{lat,lng})>1) return [];
        const street=p.street || ((p.type==="street" || p.osm_key==="highway") ? p.name : null);
        if (typeof street!=="string" || !street.trim()) return [];
        const label=[...new Set([street,p.locality || p.district,p.city || p.county].filter(x=>typeof x==="string" && x.trim()))].join(", ").slice(0,160);
        return [{label,lat,lng,distance:distanceKm(point,{lat,lng})}];
      }).sort((a,b)=>a.distance-b.distance);
      return {label:candidates[0]?.label ?? null,source:"OpenStreetMap / Photon"};
    });
    return {pickup:resolved.label ? {id:null,label:resolved.label,lat:point.lat,lng:point.lng} : null,source:resolved.source};
  };
  return search;
}
