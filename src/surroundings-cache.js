const CACHE = 'equalpath:surroundings:v1';
const MAX_ENTRIES = 100;
const pending = new Map();
let generation = 0;
export async function clearSurroundingsCache() {
  generation++;
  pending.clear();
  if (typeof caches !== 'undefined') {
    for (const name of await caches.keys()) if (name.startsWith('equalpath:surroundings:')) await caches.delete(name);
  }
}
export function loadSurrounding(url) {
  if (pending.has(url)) return pending.get(url);
  const started = generation;
  const request = (async () => {
    let cache;
    try { cache = typeof caches === 'undefined' ? null : await caches.open(CACHE); } catch { /* Private mode: use normal HTTP caching. */ }
    const hit = await cache?.match(url).catch(() => null);
    if (hit) return hit.blob();
    const response = await fetch(url, { credentials: 'omit', signal: AbortSignal.timeout(15000) });
    if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw Error('Photo unavailable');
    const blob = await response.blob();
    if (cache && started === generation) {
      try {
        await cache.put(url, new Response(blob, {headers: {'Content-Type': blob.type}}));
        const keys = await cache.keys();
        for (const key of keys.slice(0, Math.max(0, keys.length - MAX_ENTRIES))) await cache.delete(key);
      } catch { /* Storage quota must not block the image. */ }
    }
    return blob;
  })();
  pending.set(url, request);
  request.finally(() => { if(pending.get(url) === request) pending.delete(url); }).catch(() => {});
  return request;
}
