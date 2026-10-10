import { useMemo, useRef, useState } from "react";
import { requestAPI } from "./api.js";
import { minutes, isChildAge } from "../shared/request.mjs";
import { KIDS, childRequest, buildOptions, legKey, legMinutes, leavePlan, emptyPlan, startIds, nextLegCall, legsNeeded, hasConflict } from "../shared/two-child.mjs";
import { rankFamilyResults } from "../shared/family-learning.mjs";

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
  if (!isChildAge(s.age)) e.secondAge = "Choose Child 2’s age.";
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
const GAP_MS = 1500, BUSY_MS = 31000, MAX_LOOKUPS = 6, MATRIX_IDS = 20;
const NO_ROUTE = new Set(["no_route", "location_too_far_from_road", "missing_location", "demo"]);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export default function useFamily(mode) {
  const [f, setF] = useState(null);
  const cache = useRef(new Map()), dead = useRef(new Set()), seq = useRef(0), nextAt = useRef(0), matrixOK = useRef(true);
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
  // Newer search service: every road time the options and plans need (start →
  // each listed centre, and both directions between centres) in ONE request.
  // Returns false when the service does not offer it yet, so the caller falls
  // back to the one-origin lookups below.
  async function matrix(results, plan, run) {
    const listed = [...new Map([...results.a, ...results.b].filter((p) => p.location && !hasConflict(p)).map((p) => [p.id, p])).values()].slice(0, MATRIX_IDS);
    if (!listed.length) return true;
    const where = new Map(listed.map((p) => [p.id, p.location]));
    for (let attempt = 0; attempt < 2; attempt++) {
      const wait = nextAt.current - Date.now();
      if (wait > 0) {
        if (wait > 3000) setF((x) => x && { ...x, waitUntil: nextAt.current });
        await sleep(wait);
      }
      if (run !== seq.current) return true;
      let busy = false;
      try {
        const res = await requestAPI({ action: "matrix", mode, version: results.version, ids: listed.map((p) => p.id), request: childRequest(plan, "a") }, { timeoutMs: 20000 });
        for (const leg of res.legs ?? []) {
          const origin = leg.from === "start" ? plan.start : where.get(leg.from);
          if (!origin) continue;
          const key = `${coord(origin)}>${leg.to}`;
          if (leg.driving?.state === "available") cache.current.set(key, leg.driving.minutes);
          else if (NO_ROUTE.has(leg.driving?.reason)) dead.current.add(key);
          else busy = true;
        }
      } catch (e) {
        if (e?.code === "UNKNOWN_ACTION") { matrixOK.current = false; return false; }
        if (["PLACE_UNAVAILABLE", "INVALID_SELECTION", "FACTS_CHANGED"].includes(e?.code)) return false;
        busy = true;
      }
      nextAt.current = Date.now() + (busy ? BUSY_MS : GAP_MS);
      if (run !== seq.current) return true;
      setF((x) => x && { ...x, waitUntil: null, tick: (x.tick ?? 0) + 1 });
      if (!busy) return true;
    }
    // Still busy after one wait: show what is known; an opened plan asks again.
    return true;
  }
  // Start legs for the likely centres, then only the centre-to-centre times
  // that can change the three options shown first.
  async function lookups(results, plan, run, want = 3) {
    if (matrixOK.current && (await matrix(results, plan, run))) return;
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
      ...(keep ? {} : { selected: null, view: "options", showAll: false, collapsed: false }) }));
    try {
      const [ra, rb] = await Promise.all(KIDS.map((k) => requestAPI({ action: "search", mode, request: childRequest(plan, k), page: 0, seedIds: personal?.seedIds ?? [] })));
      if (r !== seq.current) return null;
      const results = rankFamilyResults({ a: ra, b: rb }, personal,
        { id: crypto.randomUUID(), at: Date.now(), mode });
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
  // A centre that replied it has no place for a child (and offered no other
  // time) leaves every option that uses it for that child (10 Oct 2026).
  const built = useMemo(() => {
    if (!f?.results) return null;
    const b = buildOptions(f.results, { preference: "prefer", legs });
    const no = new Set(f.declined ?? []);
    if (!no.size) return b;
    const all = b.all.filter((o) => !no.has(`a:${o.a.id}`) && !no.has(`b:${o.b.id}`));
    return { ...b, all, options: all.slice(0, b.options.length), total: all.length, declined: b.all.length - all.length };
  }, [f?.results, legs, f?.declined]);
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
    decline: (kids, centre) => setF((x) => {
      if (!x?.results || !kids.length) return x;
      const declined = [...new Set([...(x.declined ?? []), ...kids.map((k) => `${k}:${centre.id}`)])];
      const [sa, sb] = (x.selected ?? "").split("|");
      const hit = x.view === "plan" && kids.some((k) => (k === "a" ? sa : sb) === centre.id);
      return { ...x, declined, declineNote: { id: centre.id, name: centre.name, kids }, ...(hit ? { view: "options", selected: null } : {}) };
    }),
    undecline: (id) => setF((x) => x && { ...x, declined: (x.declined ?? []).filter((k) => !k.endsWith(`:${id}`)), declineNote: null }),
    dismissDecline: () => setF((x) => x && { ...x, declineNote: null }),
    showAll: () => setF((x) => ({ ...x, showAll: true })),
    collapse: (collapsed) => setF((x) => x && { ...x, collapsed }),
  };
}
