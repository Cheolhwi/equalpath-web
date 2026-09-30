// Session memory only: never persist pickup coordinates, dates or child details.
export function createRouteCache(requestAPI, { now = Date.now, limit = 400 } = {}) {
  const cache = new Map(), pending = new Map();
  let generation = 0;
  const key = (results, mode, id) => JSON.stringify([mode, results.version,
    results.request.pickup.lng.toFixed(5), results.request.pickup.lat.toFixed(5), id]);
  const lookup = k => cache.get(k)?.expires > now() ? cache.get(k).driving : null;
  const unavailable = { state: 'unavailable', reason: 'service_unavailable' };
  const snapshot = (results, mode, waiting = true) => ({ version: results.version, items: results.items.map(p => ({
    id: p.id, driving: lookup(key(results, mode, p.id)) ?? (waiting ? { state: 'loading' } : unavailable),
  })) });
  return {
    snapshot,
    clear() { generation++; cache.clear(); pending.clear(); },
    async load(results, mode) {
      const epoch = generation;
      const missing = results.items.filter(p => !lookup(key(results, mode, p.id)) && !pending.has(key(results, mode, p.id)));
      if (missing.length) {
        const job = Promise.resolve().then(() => requestAPI({ action: 'routes', mode,
          request: results.request, version: results.version, ids: missing.map(p => p.id),
        }, { timeoutMs: 10000 })).then(response => {
          if (epoch !== generation || response.version !== results.version) return;
          const found = new Map((response.items ?? []).map(p => [p.id, p.driving]));
          for (const p of missing) {
            const driving = found.get(p.id) ?? unavailable;
            cache.set(key(results, mode, p.id), { driving, expires: now() + (driving.state === 'available' ? 86400000 : 30000) });
          }
          while (cache.size > limit) cache.delete(cache.keys().next().value);
        }).catch(() => {
          if (epoch === generation) for (const p of missing)
            cache.set(key(results, mode, p.id), { driving: unavailable, expires: now() + 30000 });
        }).finally(() => {
          for (const p of missing) {
            const k = key(results, mode, p.id);
            if (pending.get(k) === job) pending.delete(k);
          }
        });
        missing.forEach(p => pending.set(key(results, mode, p.id), job));
      }
      await Promise.all(results.items.map(p => pending.get(key(results, mode, p.id))));
      return snapshot(results, mode, false);
    },
  };
}
