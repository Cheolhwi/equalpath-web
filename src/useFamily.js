import { useMemo, useRef, useState } from "react";
import { requestAPI } from "./api.js";
import { minutes } from "../shared/request.mjs";
import { KIDS, childRequest, buildOptions, legKey, legMinutes, leavePlan, emptyPlan, startIds, nextLegCall, legsNeeded } from "../shared/two-child.mjs";
import { personaliseSearchItems } from "../shared/recommendations.mjs";

// Epic 8 inside the main search: two ordinary short-care searches (one per
// child) plus road times from the existing routes action. Memory only.
const coord = (p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
export const familyKey = (d) => JSON.stringify([d?.pickup?.label, d?.pickup?.lat, d?.pickup?.lng, d?.date, d?.deadline, d?.end, d?.age, d?.second, d?.radius]);
export const secondChild = (d) => ({ age: d.second?.age ?? "", same: d.second?.same !== false, deadline: d.second?.deadline ?? "", end: d.second?.end ?? "" });

export function familyPlanFrom(d, collectPlace = null) {
  const s = secondChild(d), base = emptyPlan({ pickup: d.pickup, date: d.date });
  return {
    ...base, radius: d.radius, preference: "prefer",
    children: { a: { age: d.age, start: d.deadline, end: d.end }, b: { age: s.age, start: s.same ? d.deadline : s.deadline, end: s.same ? d.end : s.end } },
    run: { ...base.run, collectPlace: collectPlace ?? d.pickup },
  };
}
// Child 1 uses the existing search-form checks; these cover Child 2.
export function secondChildErrors(d) {
  const s = secondChild(d), e = {};
  if (!["1-3", "4-6"].includes(s.age)) e.secondAge = "Choose Child 2’s age.";
  if (!s.same) {
    const a = minutes(s.deadline), b = minutes(s.end);
    if (a === null || b === null) e.second = "Choose Child 2’s start and end times.";
    else if (b <= a) e.second = "Child 2’s end time must be after the start time.";
  }
  return e;
}
// Road times live in a per-session cache keyed by origin coordinates, so the
// starting point, the pickup place and each centre share lookups. Lookups that
// can never succeed (no road, too far from a road) are remembered as `skip`.
function legsFor(plan, collectPlace, results, cache, dead) {
  const legs = new Map(), skip = new Set(), loc = new Map([...results.a, ...results.b].filter((p) => p.location).map((p) => [p.id, p.location]));
  const put = (from, origin, id) => {
    const key = `${coord(origin)}>${id}`, v = cache.get(key);
    if (Number.isFinite(v)) legs.set(legKey(from, id), v);
    else if (dead.has(key)) skip.add(legKey(from, id));
  };
  for (const [id] of loc) {
    put("start", plan.start, id);
    if (collectPlace) put("collect", collectPlace, id);
    for (const [other, l] of loc) if (other !== id) put(other, l, id);
  }
  return { legs, skip };
}

// The public routing service behind the routes action answers about one
// request every few seconds and pauses for 30 seconds after refusing one, so
// requests go one at a time with a gap after each reply, and a refusal waits
// out the pause once before asking again. Never estimated from distance.
const GAP_MS = 1500, BUSY_MS = 31000, MAX_LOOKUPS = 6;
const NO_ROUTE = new Set(["no_route", "location_too_far_from_road", "missing_location"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function useFamily(mode) {
  const [f, setF] = useState(null);
  const cache = useRef(new Map()), dead = useRef(new Set()), seq = useRef(0), nextAt = useRef(0);
  const placeOf = (results, id) => {
    const p = [...results.a, ...results.b].find((x) => x.id === id);
    return p?.location ? { id: null, label: p.name, lat: p.location.lat, lng: p.location.lng } : null;
  };
  // One routes request: one origin, up to ten centres. Returns false when the
  // service is still busy after one wait (or the search was replaced).
  async function ask(version, base, origin, ids, run) {
    const key = (id) => `${coord(origin)}>${id}`;
    let todo = ids.filter((id) => !cache.current.has(key(id)) && !dead.current.has(key(id)));
    for (let attempt = 0; todo.length && attempt < 2; attempt++) {
      const wait = nextAt.current - Date.now();
      if (wait > 0) {
        if (wait > 3000) setF((x) => x && { ...x, waitUntil: nextAt.current });
        await sleep(wait);
      }
      if (run !== seq.current) return false;
      let busy = false;
      try {
        const res = await requestAPI({ action: "routes", mode, version, ids: todo,
          request: { ...base, pickup: { id: null, label: origin.label, lat: origin.lat, lng: origin.lng }, radius: 10 } }, { timeoutMs: 15000 });
        for (const item of res.items ?? []) {
          if (item.driving?.state === "available") cache.current.set(key(item.id), item.driving.minutes);
          else if (NO_ROUTE.has(item.driving?.reason)) dead.current.add(key(item.id));
          else busy = true;
        }
      } catch (e) {
        // A rejected request (centre no longer listed, too far apart) will not
        // succeed on a second try; anything else is treated as busy.
        if (["PLACE_UNAVAILABLE", "INVALID_SELECTION", "OUTSIDE_SERVICE_AREA", "FACTS_CHANGED"].includes(e?.code)) todo.forEach((id) => dead.current.add(key(id)));
        else busy = true;
      }
      nextAt.current = Date.now() + (busy ? BUSY_MS : GAP_MS);
      if (run !== seq.current) return false;
      setF((x) => x && { ...x, waitUntil: null, tick: (x.tick ?? 0) + 1 });
      todo = todo.filter((id) => !cache.current.has(key(id)) && !dead.current.has(key(id)));
    }
    return !todo.length;
  }
  // Start legs for the likely centres, then only the centre-to-centre times
  // that can change the three options shown first.
  async function lookups(results, plan, run, want = 3) {
    const base = childRequest(plan, "a");
    if (!(await ask(results.version, base, plan.start, startIds(results), run))) return;
    for (let i = 0; i < MAX_LOOKUPS; i++) {
      if (run !== seq.current) return;
      const { legs, skip } = legsFor(plan, plan.run.collectPlace, results, cache.current, dead.current);
      const call = nextLegCall(results, plan, legs, { want, skip });
      const origin = call && placeOf(results, call.from);
      if (!origin) return;
      if (!(await ask(results.version, base, origin, call.ids, run))) return;
    }
  }
  // Everything one opened plan needs: start legs for its centres, the likely
  // order of each journey, and the other order when the likely one needs a change.
  async function ensure(option, state = f) {
    if (!state?.results || !option) return;
    const run = seq.current, { results, plan } = state;
    const { legs, skip } = legsFor(plan, plan.run.collectPlace, results, cache.current, dead.current);
    const lp = leavePlan(option, plan, legs);
    const both = [lp.dropoff, lp.collection].some((j) => j.state !== "works");
    const need = [
      ...[...new Set([option.a.id, option.b.id])].filter((id) => legMinutes(legs, "start", id) === null).map((id) => ["start", id]),
      ...legsNeeded(option, plan, legs, { both }).filter(([from, to]) => legMinutes(legs, from, to) === null),
    ].filter(([from, to]) => !skip.has(legKey(from, to)));
    if (!need.length) return;
    setF((x) => x && { ...x, ensuring: option.id });
    const base = childRequest(plan, "a");
    for (const from of [...new Set(need.map(([from]) => from))]) {
      const origin = from === "start" ? plan.start : placeOf(results, from);
      if (origin && !(await ask(results.version, base, origin, need.filter(([x]) => x === from).map(([, to]) => to), run))) break;
    }
    if (run === seq.current) setF((x) => x && { ...x, ensuring: null, tick: (x.tick ?? 0) + 1 });
  }

  // `personal` carries the same signals as the normal search (saved centres,
  // interest history and seeds), so each child's list is in Recommended order.
  async function run(draft, { keep = false, personal = null } = {}) {
    const r = ++seq.current;
    const collectPlace = keep ? f?.collectPlace ?? null : null;
    const plan = familyPlanFrom(draft, collectPlace);
    setF((x) => ({ ...(keep ? x : {}), request: draft, plan, collectPlace, status: "searching", error: null, waitUntil: null, ensuring: null,
      ...(keep ? {} : { selected: null, view: "options", showAll: false }) }));
    try {
      const [ra, rb] = await Promise.all(KIDS.map((k) => requestAPI({ action: "search", mode, request: childRequest(plan, k), page: 0, seedIds: personal?.seedIds ?? [] })));
      if (r !== seq.current) return null;
      const ranked = (res) => personal
        ? personaliseSearchItems({ items: res.items ?? [], seeds: res.seeds ?? [], request: res.request, library: personal.library, history: personal.history })
        : res.items ?? [];
      const results = { a: ranked(ra), b: ranked(rb), version: ra.version, mode };
      setF((x) => ({ ...x, results, status: "routing" }));
      await lookups(results, plan, r);
      if (r !== seq.current) return null;
      setF((x) => ({ ...x, status: "ready", waitUntil: null, tick: (x.tick ?? 0) + 1 }));
      // A fix re-runs the search with the same option open: check its plan again.
      if (keep && f?.selected) {
        const legsNow = legsFor(plan, plan.run.collectPlace, results, cache.current, dead.current).legs;
        const opened = buildOptions(results, { preference: "prefer", legs: legsNow }).all.find((o) => o.id === f.selected);
        if (opened) await ensure(opened, { results, plan });
      }
      return results;
    } catch (error) {
      if (r === seq.current) setF((x) => ({ ...x, status: "error", error }));
      throw error;
    }
  }
  async function retry() {
    if (!f?.results) return;
    const r = ++seq.current, { results, plan } = f;
    setF((x) => ({ ...x, status: "routing", waitUntil: null }));
    await lookups(results, plan, r);
    if (r === seq.current) setF((x) => ({ ...x, status: "ready", waitUntil: null, tick: (x.tick ?? 0) + 1 }));
  }
  async function setCollectPlace(place, option) {
    if (!f?.results || !place) return;
    const plan = { ...f.plan, run: { ...f.plan.run, collectPlace: place } };
    setF((x) => ({ ...x, collectPlace: place, plan: { ...x.plan, run: { ...x.plan.run, collectPlace: place } }, collectBusy: true }));
    await ask(f.results.version, childRequest(plan, "a"), place, [...new Set([option.a.id, option.b.id])], seq.current);
    setF((x) => x && { ...x, collectBusy: false, tick: (x.tick ?? 0) + 1 });
  }

  const legs = useMemo(() => (f?.results ? legsFor(f.plan, f.plan.run.collectPlace, f.results, cache.current, dead.current).legs : new Map()),
    [f?.results, f?.plan, f?.tick]);
  const built = useMemo(() => (f?.results ? buildOptions(f.results, { preference: "prefer", legs }) : null), [f?.results, legs]);
  const option = built?.all.find((o) => o.id === f?.selected) ?? null;
  const plans = useMemo(() => new Map((built?.options ?? []).map((o) => [o.id, leavePlan(o, f.plan, legs)])), [built, legs, f?.plan]);
  const lp = option ? plans.get(option.id) ?? leavePlan(option, f.plan, legs) : null;
  return {
    state: f, legs, built, option, lp, plans,
    busy: f?.status === "searching" || f?.status === "routing",
    run, retry, setCollectPlace,
    ensure: () => ensure(option),
    clear: () => { seq.current++; setF(null); },
    select: (id) => {
      setF((x) => ({ ...x, selected: id, view: id ? "plan" : "options" }));
      const picked = built?.all.find((o) => o.id === id);
      if (picked) ensure(picked);
    },
    back: () => setF((x) => ({ ...x, view: "options" })),
    showAll: () => setF((x) => ({ ...x, showAll: true })),
  };
}
