// One bounded road-network table per result page. No calls while browsing the map.
// Cache individual origin/destination pairs so details and comparison reuse them.
const attribution = { label: "OSRM · © OpenStreetMap contributors", url: "https://routing.openstreetmap.de/about.html" };
const unavailable = (reason) => ({ state: "unavailable", reason });
export function createDrivingRoutes({ fetcher = fetch, now = Date.now, interval = 1100, budgetMs = 6500, timeoutMs = 6000,
  endpoint = process.env.EQUALPATH_WEB_ROUTING_URL || "https://routing.openstreetmap.de/routed-car" } = {}) {
  const cache = new Map(), pending = new Map();
  let queue = Promise.resolve(), next = 0, jobs = 0, retryAfter = 0;
  const coord = (p) => `${p.lng.toFixed(5)},${p.lat.toFixed(5)}`;
  const routes = async (origin, items) => {
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
  // Two children: every road time between one origin and a few centres (origin →
  // each centre, and each centre → each other centre) in ONE table request, so a
  // family search costs the routing service what a one-child search does. Same
  // queue, pause, budget and per-pair cache as above.
  routes.matrix = async (origin, items) => {
    const deadline = performance.now() + budgetMs;
    const located = items.filter(p => Number.isFinite(p.location?.lat) && Number.isFinite(p.location?.lng)).slice(0, 20);
    const points = [coord(origin), ...located.map(p => coord(p.location))];
    const pairs = [];
    points.forEach((from, i) => located.forEach((p, j) => { if (i !== j + 1) pairs.push({ i, j: j + 1, key: `${from};${points[j + 1]}`, same: from === points[j + 1] }); }));
    const fresh = [...new Set(pairs.filter(x => !x.same && !pending.has(x.key) && !(cache.get(x.key)?.expires > now())).map(x => x.key))];
    if (fresh.length && jobs < 3 && now() >= retryAfter) {
      jobs++;
      const job = queue.then(async () => {
        const delay = Math.max(0, next - now());
        if (performance.now() + delay >= deadline) return;
        if (delay) await new Promise(resolve => setTimeout(resolve, delay));
        next = now() + interval;
        const values = new Map(fresh.map(key => [key, unavailable("service_unavailable")]));
        try {
          const unique = [...new Set(fresh.flatMap(key => key.split(";")))];
          const froms = [...new Set(fresh.map(key => key.split(";")[0]))], tos = [...new Set(fresh.map(key => key.split(";")[1]))];
          const url = new URL(`${endpoint.replace(/\/$/, "")}/table/v1/driving/${unique.join(";")}`);
          url.searchParams.set("sources", froms.map(c => unique.indexOf(c)).join(";"));
          url.searchParams.set("destinations", tos.map(c => unique.indexOf(c)).join(";"));
          url.searchParams.set("annotations", "duration,distance");
          if (now() < retryAfter) return;
          const remaining = Math.floor(deadline - performance.now());
          if (remaining <= 0) return;
          const response = await fetcher(url, { signal: AbortSignal.timeout(Math.min(timeoutMs, remaining)), headers: { Accept: "application/json", "User-Agent": "EqualPath-Web/1.0 (https://equalpathcare.me)" } });
          const data = response.ok ? await response.json() : null;
          if (data?.code !== "Ok") throw Error("Routing unavailable");
          for (const key of fresh) {
            const [from, to] = key.split(";"), r = froms.indexOf(from), c = tos.indexOf(to);
            const seconds = data.durations?.[r]?.[c], metres = data.distances?.[r]?.[c];
            if (!Number.isFinite(seconds) || seconds < 0 || !Number.isFinite(metres) || metres < 0) values.set(key, unavailable("no_route"));
            else if (!Number.isFinite(data.sources?.[r]?.distance) || !Number.isFinite(data.destinations?.[c]?.distance) || data.sources[r].distance > 500 || data.destinations[c].distance > 500) values.set(key, unavailable("location_too_far_from_road"));
            else values.set(key, { state: "available", minutes: Math.max(1, Math.ceil(seconds / 60)), distanceKm: Math.round(metres / 100) / 10, source: attribution, traffic: false, checkedAt: new Date(now()).toISOString() });
          }
        } catch { retryAfter = now() + 30000; }
        fresh.forEach(key => cache.set(key, { value: values.get(key), expires: now() + (values.get(key).state === "available" ? 86400000 : 30000) }));
        while (cache.size > 4000) cache.delete(cache.keys().next().value);
      }).finally(() => { jobs--; fresh.forEach(key => pending.delete(key)); });
      queue = job.catch(() => {});
      fresh.forEach(key => pending.set(key, job));
    }
    let timer;
    try {
      await Promise.race([Promise.all(pairs.map(x => pending.get(x.key))),
        new Promise(resolve => { timer = setTimeout(resolve, Math.max(0, deadline - performance.now())); })]);
    } finally { clearTimeout(timer); }
    return pairs.map(({ i, j, key, same }) => {
      const entry = cache.get(key);
      return { from: i ? located[i - 1] : null, to: located[j - 1],
        driving: same ? { state: "available", minutes: 1, distanceKm: 0, source: attribution, traffic: false, checkedAt: new Date(now()).toISOString() }
          : entry?.expires > now() ? entry.value : unavailable("service_busy") };
    });
  };
  return routes;
}
