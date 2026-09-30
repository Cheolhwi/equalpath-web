// One bounded road-network table per result page. No calls while browsing the map.
// Cache individual origin/destination pairs so details and comparison reuse them.
const attribution = { label: "OSRM · © OpenStreetMap contributors", url: "https://routing.openstreetmap.de/about.html" };
const unavailable = (reason) => ({ state: "unavailable", reason });
export function createDrivingRoutes({ fetcher = fetch, now = Date.now, interval = 1100, budgetMs = 6500, timeoutMs = 6000,
  endpoint = process.env.EQUALPATH_WEB_ROUTING_URL || "https://routing.openstreetmap.de/routed-car" } = {}) {
  const cache = new Map(), pending = new Map();
  let queue = Promise.resolve(), next = 0, jobs = 0, retryAfter = 0;
  const coord = (p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;
  return async (origin, items) => {
    const deadline = performance.now() + budgetMs;
    const located = items.filter(p => Number.isFinite(p.location?.lat) && Number.isFinite(p.location?.lng)).slice(0, 20);
    const prefix = coord(origin), keys = located.map(p => `${prefix};${coord(p.location)}`);
    const fresh = [...new Set(keys.filter(key => !pending.has(key) && !(cache.get(key)?.expires > now())))];
    if (fresh.length && jobs < 3 && now() >= retryAfter) {
      jobs++;
      const job = queue.then(async () => {
        const delay = Math.max(0, next - now());
        // The budget includes time in the queue, not just the HTTP request.
        if (performance.now() + delay >= deadline) return;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        next = now() + interval;
        let values = fresh.map(() => unavailable("service_unavailable"));
        try {
          const coords = [prefix, ...fresh.map(key => key.split(";")[1])];
          const url = new URL(`${endpoint.replace(/\/$/, "")}/table/v1/driving/${coords.join(";")}`);
          url.searchParams.set("sources", "0");
          url.searchParams.set("destinations", fresh.map((_, i) => i + 1).join(";"));
          url.searchParams.set("annotations", "duration,distance");
          if (now() < retryAfter) return;
          const remaining = Math.floor(deadline - performance.now());
          if (remaining <= 0) return;
          const response = await fetcher(url, { signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)), headers: { Accept: "application/json", "User-Agent": "EqualPath-Web/1.0 (https://equalpathcare.me)" } });
          const data = response.ok ? await response.json() : null;
          if (data?.code !== "Ok") throw Error("Routing unavailable");
          values = fresh.map((_, i) => {
            const seconds = data.durations?.[0]?.[i], metres = data.distances?.[0]?.[i];
            if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(metres) || metres < 0) return unavailable("no_route");
            if (!Number.isFinite(data.sources?.[0]?.distance) || !Number.isFinite(data.destinations?.[i]?.distance) || data.sources[0].distance > 500 || data.destinations[i].distance > 500) return unavailable("location_too_far_from_road");
            return { state: "available", minutes: Math.max(1, Math.ceil(seconds / 60)), distanceKm: Math.round(metres / 100) / 10, source: attribution, traffic: false, checkedAt: new Date(now()).toISOString() };
          });
        } catch { retryAfter = now() + 30000; /* Brief circuit break across origins during an outage. */ }
        fresh.forEach((key, i) => cache.set(key, { value: values[i], expires: now() + (values[i].state === "available" ? 86400000 : 30000) }));
        while (cache.size > 4000) cache.delete(cache.keys().next().value);
      }).finally(() => { jobs--; fresh.forEach(key => pending.delete(key)); });
      queue = job.catch(() => {});
      fresh.forEach(key => pending.set(key, job));
    }
    let timer;
    try {
      await Promise.race([Promise.all(keys.map(key => pending.get(key))),
        new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, deadline - performance.now())); })]);
    } finally { clearTimeout(timer); }
    return items.map(p => {
      const entry = p.location && cache.get(`${prefix};${coord(p.location)}`);
      return { ...p, driving: entry?.expires > now() ? entry.value : unavailable(p.location ? "service_busy" : "missing_location") };
    });
  };
}
