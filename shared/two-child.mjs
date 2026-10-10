// Epic 8: a few hours of care for two children, with one adult doing the runs.
// Pure planning helpers shared by the Two children window and its tests.
// Children are only "Child A" and "Child B" with an age range: no names,
// birth dates or profiles. Nothing here stores or sends anything.
import { minutes, timeLabel, isChildAge } from "./request.mjs";
import { childAge, visitDate } from "./enquiry-view.mjs";
import { contactQuestions } from "./contact-message.mjs";
import { hasContact } from "./conditions.mjs";

export const KIDS = ["a", "b"];
export const childName = (k) => (k === "a" ? "Child 1" : "Child 2");
export const TOP_PER_CHILD = 5;
export const OPTIONS_SHOWN = 10;
export const DEFAULT_ALLOWANCE = 5;
// The adult brings each child, so only the centre's own conditions matter here.
export const CHILD_CHECKS = ["age", "admission", "opening", "care"];
export const MAX_LEG_KM = 10;

export function emptyPlan(seed = {}) {
  return {
    start: seed.pickup ?? null,
    date: seed.date ?? "",
    radius: 5,
    preference: "prefer",
    children: { a: { age: "", start: "", end: "" }, b: { age: "", start: "", end: "" } },
    run: { dropDepart: "", collectPlace: null, collectDepart: "", allowance: { a: DEFAULT_ALLOWANCE, b: DEFAULT_ALLOWANCE }, combined: null, extra: 0 },
  };
}

const validDate = (d) =>
  /^\d{4}-\d{2}-\d{2}$/.test(d ?? "") && new Date(d + "T12:00:00Z").toISOString().slice(0, 10) === d;
const validPlace = (p) => !!p?.label?.trim() && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// 8.1.3: name each problem with its child and field; keep valid entries.
export function planErrors(plan) {
  const e = {};
  if (!validPlace(plan.start)) e.start = "Choose a starting point from the search results or the map.";
  if (!validDate(plan.date)) e.date = "Choose a date for care.";
  for (const k of KIDS) {
    const c = plan.children[k], s = minutes(c.start), t = minutes(c.end);
    if (s === null) e[`${k}.start`] = `${childName(k)}: choose a start time.`;
    if (t === null) e[`${k}.end`] = `${childName(k)}: choose an end time.`;
    else if (s !== null && t <= s) e[`${k}.end`] = `${childName(k)}: choose an end time after the start time, on the same day.`;
    if (c.age !== "" && !isChildAge(c.age)) e[`${k}.age`] = `${childName(k)}: choose an age.`;
  }
  return e;
}

// One ordinary short-care search per child, in the Recommended order. The adult
// brings the child, so centre pickup is not requested; known mismatches are left out.
export function childRequest(plan, k) {
  const c = plan.children[k];
  return {
    careType: "short_term",
    pickup: plan.start,
    date: plan.date,
    deadline: c.start,
    end: c.end,
    age: c.age,
    transport: "self",
    radius: plan.radius,
    query: "",
    includeUnknown: true,
    includeConflicts: false,
    sort: "recommended",
  };
}

export const childChecks = (p) => (p?.fit?.conditions ?? []).filter((c) => CHILD_CHECKS.includes(c.id));
export const openChecks = (p) => childChecks(p).filter((c) => c.state !== "supported");
export const hasConflict = (p) => childChecks(p).some((c) => c.state === "conflict");

export const legKey = (from, to) => `${from}>${to}`;
export function legMinutes(legs, from, to) {
  if (from === to) return 0;
  const value = legs?.get?.(legKey(from, to));
  return Number.isFinite(value) ? value : null;
}

export function straightKm(a, b) {
  if (![a?.lat, a?.lng, b?.lat, b?.lng].every(Number.isFinite)) return Infinity;
  const r = Math.PI / 180, dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export const pools = (results) => ({
  a: (results.a ?? []).filter((p) => !hasConflict(p)).slice(0, TOP_PER_CHILD),
  b: (results.b ?? []).filter((p) => !hasConflict(p)).slice(0, TOP_PER_CHILD),
});

// ---- Which road times to ask for -----------------------------------------
// Road times come from the existing routes action: one origin and at most ten
// public IDs per request. The public routing service behind it answers about one
// request every few seconds and pauses after a refusal, so every request counts:
// ask only for what the options on screen and the opened plan need.
export const START_IDS = 10;
const usable = (list) => (list ?? []).filter((p) => !hasConflict(p));
// Start → centre for the ten centres most likely to appear: best rank in either
// child's Recommended list first (the first five per child make every pair).
export function startIds(results) {
  const best = new Map();
  for (const list of [usable(results.a), usable(results.b)])
    list.forEach((p, i) => { if (p.location && !(best.get(p.id)?.i <= i)) best.set(p.id, { p, i }); });
  const listB = new Set(usable(results.b).map((p) => p.id));
  const { a, b } = pools(results);
  const wanted = new Set([...a, ...b].map((p) => p.id));
  for (const p of usable(results.a)) if (listB.has(p.id)) wanted.add(p.id);
  return [...best.values()].filter(({ p }) => wanted.has(p.id)).sort((x, y) => x.i - y.i).slice(0, START_IDS).map(({ p }) => p.id);
}
// Which child's centre comes first on a journey: the earlier handover; at the
// same time, the one nearer the starting point (that gives the later leave time).
export function firstStop(option, plan, journey, legs) {
  const field = journey === "dropoff" ? "start" : "end";
  const ta = minutes(plan.children.a[field]), tb = minutes(plan.children.b[field]);
  if (ta !== tb && ta !== null && tb !== null) return ta < tb ? "a" : "b";
  const ra = legMinutes(legs, "start", option.a.id), rb = legMinutes(legs, "start", option.b.id);
  return ra !== null && rb !== null && rb < ra ? "b" : "a";
}
// The centre-to-centre road times one option needs: the likely order of each
// journey (drop-off and pickup), or both directions when asked to check fully.
// The routes action only accepts centres within 10 km of the origin, so pairs
// further apart than that have no lookup (internal filtering, never shown).
export function legsNeeded(option, plan, legs, { both = false } = {}) {
  if (option.a.id === option.b.id || !(straightKm(option.a.location, option.b.location) < MAX_LEG_KM - 0.05)) return [];
  const out = [];
  const add = (from, to) => { if (!out.some(([f, t]) => f === from && t === to)) out.push([from, to]); };
  for (const journey of ["dropoff", "collection"]) {
    const k = firstStop(option, plan, journey, legs), o = k === "a" ? "b" : "a";
    add(option[k].id, option[o].id);
  }
  if (both) { add(option.a.id, option.b.id); add(option.b.id, option.a.id); }
  return out;
}
// The next routes request that can change the top `want` options, or null.
// Pairs whose centre-to-centre time is still missing are scored with the
// shortest drive they could possibly have (the longer of the two start legs);
// a pair is looked up only while that best case could still beat the
// `want`-th fully known option. `skip` holds road times that cannot be found.
export function nextLegCall(results, plan, legs, { want = 3, skip = new Set(), preference = "prefer" } = {}) {
  const built = buildOptions(results, { preference, legs });
  const listA = usable(results.a), listB = usable(results.b);
  const missing = (o) => legsNeeded(o, plan, legs).filter(([f, t]) => legMinutes(legs, f, t) === null && !skip.has(legKey(f, t)));
  const known = built.all.filter((o) => o.dropOff !== null && !missing(o).length).sort((x, y) => y.score - x.score);
  const bar = known[want - 1]?.score ?? -Infinity;
  const open = built.all.filter((o) => o.kind === "pair" && missing(o).length).map((o) => {
    const ra = legMinutes(legs, "start", o.a.id), rb = legMinutes(legs, "start", o.b.id);
    return ra === null || rb === null ? null : { o, best: optionScore({ ...o, dropOff: o.dropOff ?? Math.max(ra, rb) }, listA, listB, preference) };
  }).filter((x) => x && x.best > bar).sort((x, y) => y.best - x.best);
  if (!open.length) return null;
  const from = missing(open[0].o)[0][0];
  const ids = [...new Set(open.slice(0, 2 * want + 4).flatMap(({ o }) => missing(o)).filter(([f]) => f === from).map(([, t]) => t))].slice(0, 10);
  return { from, ids };
}

function optionStatus(pa, pb) {
  return [...childChecks(pa), ...childChecks(pb)].every((c) => c.state === "supported") ? "supported" : "confirm";
}
// Drop-off road time from the starting point through both centres, in the
// better of the two orders. Null when no order has every road time.
export function dropOffMinutes(option, legs) {
  const a = option.a.id, b = option.b.id;
  if (a === b) return legMinutes(legs, "start", a);
  const totals = [[a, b], [b, a]]
    .map(([x, y]) => [legMinutes(legs, "start", x), legMinutes(legs, x, y)])
    .filter((pair) => pair.every(Number.isFinite))
    .map(([x, y]) => x + y);
  return totals.length ? Math.min(...totals) : null;
}

// Recommendation-aware score for one option. Each child's list arrives in the
// personalised Recommended order (preferences, saves, comparisons, review
// themes, proximity and fit). Rank 1 scores 1 and the last rank 0, averaged over
// both children; one centre for both (+0.25), listed details that fit both (+0.1)
// and a phone or WhatsApp at both centres (+0.1) add a little; every minute of
// driving to drop off both subtracts 0.025 (capped at 90 minutes), so 5 extra
// minutes weigh about one Recommended place for one child and a long detour
// always loses. Contact is an internal rule and is never shown.
const rankScore = (list, id) => {
  const i = list.findIndex((p) => p.id === id);
  return i < 0 ? 0 : list.length <= 1 ? 1 : 1 - i / (list.length - 1);
};
export function optionScore(o, listA, listB, preference = "prefer") {
  const rec = (rankScore(listA, o.a.id) + rankScore(listB, o.b.id)) / 2;
  const same = o.kind === "same" && preference !== "separate" ? 0.25 : 0;
  const fit = o.status === "supported" ? 0.1 : 0;
  const contact = hasContact(o.a) && hasContact(o.b) ? 0.1 : 0;
  const drive = o.dropOff === null ? 0 : Math.min(o.dropOff, 90) * 0.025;
  return Math.round((rec + same + fit + contact - drive) * 1000) / 1000;
}
const shortReason = (r) => (r ? r.replace(/^Matches your choices:\s*/, "Matches: ") : null);

// 8.2 and 8.3: same-centre options and pairs from each child's first five
// conflict-free centres, ranked by the score above; options without a road time last.
export function buildOptions(results, { preference = "prefer", legs = new Map(), keep = null } = {}) {
  const listA = (results.a ?? []).filter((p) => !hasConflict(p)), listB = (results.b ?? []).filter((p) => !hasConflict(p));
  const byB = new Map(listB.map((p) => [p.id, p]));
  const same = listA.filter((p) => byB.has(p.id)).map((p) => ({ kind: "same", a: p, b: byB.get(p.id) }));
  const { a: poolA, b: poolB } = pools(results);
  const pairs = preference === "same" ? [] : poolA.flatMap((x) => poolB.filter((y) => y.id !== x.id).map((y) => ({ kind: "pair", a: x, b: y })));
  let options = [...same, ...pairs].map((o) => ({ ...o, id: `${o.a.id}|${o.b.id}`, status: optionStatus(o.a, o.b), dropOff: dropOffMinutes(o, legs),
    reason: shortReason([o.a, o.b].filter(p => p.personalisedReason)
      .sort((a,b) => (b.personalisedReasonContribution ?? 0) - (a.personalisedReasonContribution ?? 0))[0]?.personalisedReason) }))
    .map((o) => ({ ...o, score: optionScore(o, listA, listB, preference) }));
  if (keep) options = options.filter((o) => o[keep.child].id === keep.id);
  const rank = (o) => [o.dropOff === null ? 1 : 0, -o.score, (o.a.distanceKm ?? 0) + (o.b.distanceKm ?? 0)];
  options.sort((x, y) => {
    const rx = rank(x), ry = rank(y);
    for (let i = 0; i < rx.length; i++) if (rx[i] !== ry[i]) return rx[i] - ry[i];
    return x.id.localeCompare(y.id);
  });
  const missing = KIDS.filter((k) => !(k === "a" ? listA : listB).length);
  return { options: options.slice(0, OPTIONS_SHOWN), all: options, total: options.length, sameCount: same.length, missing };
}

// ---- Run check (timing rules) -------------------------------------------
// A planned time is when that handover is complete. An adult who arrives
// early waits; the wait is the margin. Every order of the stops is checked.
export function journeyStops(option, plan, journey) {
  const field = journey === "dropoff" ? "start" : "end";
  const at = (k) => minutes(plan.children[k][field]);
  const allow = (k) => Number(plan.run.allowance?.[k] ?? DEFAULT_ALLOWANCE);
  if (option.a.id === option.b.id && at("a") === at("b")) {
    const combined = plan.run.combined ?? allow("a") + allow("b");
    return [{ key: "ab", centre: option.a.id, planned: at("a"), allowance: Number(combined) }];
  }
  return KIDS.map((k) => ({ key: k, centre: option[k].id, planned: at(k), allowance: allow(k) }));
}

const orders = (stops) => (stops.length < 2 ? [stops] : [stops, [stops[1], stops[0]]]);

export function runOrder({ order, departure, origin, legs, extra = 0 }) {
  let time = departure, at = origin, late = null, missing = null, totalDrive = 0;
  const rows = [];
  for (const s of order) {
    const drive = at === s.centre ? 0 : legMinutes(legs, at, s.centre);
    if (drive === null) { missing = { from: at, to: s.centre }; break; }
    const arrive = time + drive + (at === s.centre ? 0 : extra), ready = arrive + s.allowance, margin = s.planned - ready;
    const complete = Math.max(ready, s.planned);
    rows.push({ ...s, drive, arrive, wait: Math.max(0, margin), complete, margin });
    if (margin < 0 && !late) late = { index: rows.length - 1, key: s.key, minutes: -margin };
    totalDrive += drive; time = complete; at = s.centre;
  }
  const state = missing ? "unknown" : late ? "conflict" : "works";
  const tightest = state === "works" ? rows.reduce((m, r) => (r.margin < m.margin ? r : m), rows[0]) : null;
  return { keys: order.map((s) => s.key), rows, state, late, missing, tightest, totalDrive, end: time };
}

const clampDay = (n) => Number.isInteger(n) && n >= 0 && n < 24 * 60;
// One-change fixes, each kept only when re-running that order makes it work.
function fixesFor(result, ctx) {
  const { order, journey, departureInput } = ctx, L = result.late.minutes, i = result.late.index;
  const field = journey === "dropoff" ? "start" : "end";
  const departField = journey === "dropoff" ? "dropDepart" : "collectDepart";
  const candidates = [];
  // Round in the safe direction to the 5-minute steps the time picker lists.
  const step = (n, later) => (later ? Math.ceil(n / 5) : Math.floor(n / 5)) * 5;
  const moveStop = (idx, delta) => {
    const stop = order[idx], planned = step(stop.planned + delta, delta > 0);
    if (!clampDay(planned)) return;
    const children = stop.key === "ab" ? ["a", "b"] : [stop.key];
    candidates.push({ changes: children.map((k) => ({ child: k, field, value: timeLabel(planned) })), stops: order.map((s, j) => (j === idx ? { ...s, planned } : s)), departure: departureInput });
  };
  moveStop(i, L);
  if (i > 0) moveStop(i - 1, -L);
  else if (clampDay(step(departureInput - L, false))) candidates.push({ changes: [{ field: departField, value: timeLabel(step(departureInput - L, false)) }], stops: order, departure: step(departureInput - L, false) });
  return candidates.filter((c) => runOrder({ ...ctx, order: c.stops, departure: Math.max(c.departure, ctx.notBefore ?? -Infinity) }).state === "works")
    .map(({ changes }) => ({ changes }));
}

export function checkJourney({ stops, departure, notBefore = null, origin, legs, extra = 0, journey }) {
  const effective = Math.max(departure, notBefore ?? -Infinity);
  const results = orders(stops).map((order) => {
    const r = runOrder({ order, departure: effective, origin, legs, extra });
    return r.state === "conflict" ? { ...r, fixes: fixesFor(r, { order, journey, departureInput: departure, notBefore, origin, legs, extra }) } : r;
  });
  const working = results.filter((r) => r.state === "works").sort((x, y) =>
    y.tightest.margin - x.tightest.margin || x.totalDrive - y.totalDrive || (x.keys[0] === "b" ? 1 : 0) - (y.keys[0] === "b" ? 1 : 0));
  const state = working.length ? "works" : results.some((r) => r.state === "unknown") ? "unknown" : "conflict";
  return { journey, state, departure: effective, delayed: effective > departure, best: working[0] ?? null, alternatives: working.slice(1), orders: results };
}

// Both runs for one option. Collection never starts before the last drop-off
// handover: the same adult does both journeys.
export function planRuns(option, plan, legs) {
  const run = plan.run, extra = Math.max(0, Number(run.extra) || 0);
  const dropStops = journeyStops(option, plan, "dropoff");
  const lastDrop = Math.max(...KIDS.map((k) => minutes(plan.children[k].start)));
  const drop = minutes(run.dropDepart) === null
    ? { journey: "dropoff", state: "input", needs: ["the time the adult leaves the starting point"] }
    : checkJourney({ stops: dropStops, departure: minutes(run.dropDepart), origin: "start", legs, extra, journey: "dropoff" });
  const needs = [...(!validPlace(run.collectPlace) ? ["where the collection starts"] : []), ...(minutes(run.collectDepart) === null ? ["the time the adult leaves for the collection"] : [])];
  const collect = needs.length
    ? { journey: "collection", state: "input", needs }
    : checkJourney({ stops: journeyStops(option, plan, "collection"), departure: minutes(run.collectDepart), notBefore: lastDrop, origin: "collect", legs, extra, journey: "collection" });
  const states = [drop.state, collect.state];
  const state = states.includes("input") ? "input" : states.every((s) => s === "works") ? "works" : states.includes("conflict") ? "conflict" : "unknown";
  return { state, drop, collect, lastDrop };
}

// ---- Leave-by plan (what the parent actually sees) ------------------------
// Instead of asking when the adult can leave, work out the latest time that
// still makes every handover on time, in the better stop order. Times shown to
// the parent are rounded to 5 minutes in the safe direction.
const floor5 = (n) => Math.floor(n / 5) * 5, ceil5 = (n) => Math.ceil(n / 5) * 5;

export function journeyLeave({ stops, origin, legs, extra = 0, notBefore = null }) {
  const tried = orders(stops).map((order) => {
    const [s1, s2] = order;
    const r1 = legMinutes(legs, origin, s1.centre);
    if (r1 === null) return { order, state: "unknown", missing: { from: origin, to: s1.centre } };
    const leave = s1.planned - s1.allowance - r1 - extra;
    if (!s2) return { order, state: "works", leave, r1, r12: null, slack: Infinity, late: 0 };
    const same = s1.centre === s2.centre;
    const r12 = same ? 0 : legMinutes(legs, s1.centre, s2.centre);
    if (r12 === null) return { order, state: "unknown", missing: { from: s1.centre, to: s2.centre } };
    const late = s1.planned + r12 + (same ? 0 : extra) + s2.allowance - s2.planned;
    return { order, state: late > 0 ? "late" : "works", leave, r1, r12, slack: -late, late: Math.max(0, late) };
  }).map((t) => (t.state === "works" && notBefore !== null && t.leave < notBefore ? { ...t, state: "short", short: notBefore - t.leave } : t));
  const working = tried.filter((t) => t.state === "works")
    .sort((x, y) => y.leave - x.leave || y.slack - x.slack || (x.order[0].key === "b") - (y.order[0].key === "b"));
  if (working.length) return { state: "works", best: { ...working[0], leaveBy: floor5(working[0].leave) }, tried };
  // Only when no order has its road times is the journey undetermined. A known
  // order that needs a change is used; the other order is looked up when the
  // plan is opened.
  if (tried.every((t) => t.state === "unknown")) return { state: "unknown", missing: tried[0].missing, tried };
  const known = tried.filter((t) => t.state !== "unknown");
  return { state: known.some((t) => t.state === "short") ? "short" : "late", tried: known, unchecked: known.length < tried.length };
}

// One safe change that makes the journey work. Drop-off and pickup mismatches
// shorten one child's care (a later drop-off, an earlier pickup), so the care
// stays inside hours the centre was already checked for. "Short" (the pickup
// would have to start before the last drop-off) lengthens the first pickup.
function leaveFix(result, journey, plan, check) {
  const field = journey === "dropoff" ? "start" : "end";
  const options = result.tried.flatMap((t) => {
    const [s1, s2] = t.order;
    if (t.state === "late" && journey === "dropoff") return [{ stop: s2, value: ceil5(s2.planned + t.late), t }];
    if (t.state === "late") return [{ stop: s1, value: floor5(s1.planned - t.late), t }];
    if (t.state === "short") return [{ stop: s1, value: ceil5(s1.planned + t.short), t }];
    return [];
  });
  for (const o of options.sort((x, y) => Math.abs(x.value - x.stop.planned) - Math.abs(y.value - y.stop.planned))) {
    const kids = o.stop.key === "ab" ? KIDS : [o.stop.key];
    const changes = kids.map((k) => ({ child: k, field, value: timeLabel(o.value) }));
    const next = { ...plan, children: { ...plan.children } };
    for (const c of changes) next.children[c.child] = { ...next.children[c.child], [c.field]: c.value };
    if (!Object.keys(planErrors(next)).length && check(next)) return { changes, order: o.t.order };
  }
  return null;
}

export function leavePlan(option, plan, legs, { extra = 0 } = {}) {
  const lastDrop = Math.max(...KIDS.map((k) => minutes(plan.children[k].start)));
  const drop = (p) => journeyLeave({ stops: journeyStops(option, p, "dropoff"), origin: "start", legs, extra });
  const collect = (p) => journeyLeave({ stops: journeyStops(option, p, "collection"), origin: "collect", legs, extra,
    notBefore: Math.max(...KIDS.map((k) => minutes(p.children[k].start))) });
  const d = drop(plan), c = collect(plan);
  const withFix = (r, journey, run) => (["late", "short"].includes(r.state) ? { ...r, fix: leaveFix(r, journey, plan, (next) => run(next).state === "works") } : r);
  // Without the centre-to-centre time, still show the likely order and when to
  // leave for the first stop; the second stop's drive is marked as not loaded.
  const partial = (r, journey, origin) => {
    if (r.state !== "unknown") return r;
    const stops = journeyStops(option, plan, journey), k = firstStop(option, plan, journey, legs);
    const order = stops.length < 2 ? stops : stops[0].key === k ? stops : [stops[1], stops[0]];
    const r1 = legMinutes(legs, origin, order[0].centre);
    return r1 === null ? r : { ...r, partial: { order, r1, leaveBy: floor5(order[0].planned - order[0].allowance - r1 - extra) } };
  };
  // A journey that needs a change still gets a timeline: the order closest to
  // working, with the times one person would actually manage.
  const shown = (r, origin, notBefore = null) => {
    if (!["late", "short"].includes(r.state)) return r;
    // The order the fix is for, so the timeline and the fix button agree.
    const t = r.tried.find((x) => x.order === r.fix?.order)
      ?? [...r.tried].sort((x, y) => (x.late ?? 0) + (x.short ?? 0) - (y.late ?? 0) - (y.short ?? 0) || y.leave - x.leave)[0];
    const departure = Math.max(floor5(t.leave), notBefore ?? -Infinity);
    return { ...r, shown: { order: t.order, departure, r1: t.r1, rows: runOrder({ order: t.order, departure, origin, legs, extra }).rows } };
  };
  const dropoff = partial(shown(withFix(d, "dropoff", drop), "start"), "dropoff", "start");
  const collection = partial(shown(withFix(c, "collection", collect), "collect", lastDrop), "collection", "collect");
  const state = [dropoff.state, collection.state].every((x) => x === "works") ? "works"
    : [dropoff.state, collection.state].some((x) => x === "late" || x === "short") ? "change" : "unknown";
  return { state, dropoff, collection, lastDrop };
}

// Ordered, plain steps for the timeline, the Checklist and the copy-out plan.
export function planSteps(option, plan, lp, names = (p) => p.name, places = {}) {
  const steps = [];
  const add = (journey, kind, r, placeLabel) => {
    if (r.shown) {
      // Needs a change: actual times, with how late each handover would be.
      steps.push({ kind: `leave-${kind}`, time: r.shown.departure, place: placeLabel, drive: r.shown.r1, journey });
      r.shown.rows.forEach((row, i) => steps.push({
        kind, time: row.complete, key: row.key, centre: row.key === "ab" ? option.a : option[row.key], drive: i ? row.drive : null,
        same: i > 0 && row.drive === 0, journey, lateBy: Math.max(0, -row.margin),
      }));
      return;
    }
    const best = r.state === "works" ? r.best : r.partial ? { ...r.partial, r12: null } : null;
    if (!best) return;
    steps.push({ kind: `leave-${kind}`, time: best.leaveBy, place: placeLabel, drive: best.r1, journey, partial: !!r.partial });
    best.order.forEach((s, i) => steps.push({
      kind, time: s.planned, key: s.key, centre: s.key === "ab" ? option.a : option[s.key], drive: i ? best.r12 : null,
      same: i > 0 && best.r12 === 0, journey, unknownDrive: i > 0 && best.r12 === null,
    }));
  };
  add("dropoff", "drop", lp.dropoff, places.start ?? plan.start?.label ?? "the starting point");
  add("collection", "collect", lp.collection, places.collect ?? plan.run.collectPlace?.label ?? plan.start?.label ?? "the starting point");
  return steps.map((s) => ({ ...s, label: stepLabel(s, names) }));
}
export const childWithAge = (k, plan) => `${childName(k)}${plan.children[k].age ? ` (${String(plan.children[k].age).replace("-", "–")} yrs)` : ""}`;
function stepLabel(s, names) {
  const who = s.key === "ab" ? "both children" : childName(s.key);
  return s.kind === "leave-drop" ? `Leave ${s.place}`
    : s.kind === "leave-collect" ? `Leave ${s.place} for pickup`
      : s.kind === "drop" ? `Drop off ${who} at ${names(s.centre)}`
        : `Pick up ${who} at ${names(s.centre)}`;
}

// ---- Words -------------------------------------------------------------
export const stopName = (option, key, names) =>
  key === "ab" ? `${names(option.a)} (both children)` : `${names(option[key])} (${childName(key)})`;
export const changeLabel = (c) =>
  c.field === "dropDepart" ? `Leave the starting point at ${c.value}`
    : c.field === "collectDepart" ? `Leave for the collection at ${c.value}`
      : `${childName(c.child)}’s care ${c.field === "start" ? "start" : "end"} ${c.value}`;
export const ageText = (age) => (age ? childAge(age) : "age not chosen");

function mergedQuestions(option, plan) {
  const lists = KIDS.map((k) => contactQuestions(option[k], childRequest(plan, k)).map((q) => ({ ...q, k })));
  const texts = new Map();
  for (const list of lists) for (const q of list) texts.set(q.text, [...(texts.get(q.text) ?? []), q.k]);
  const out = [], seen = new Set();
  for (const list of lists) for (const q of list) {
    // Fees stay per child: a shared "estimated total" would read as one price for both.
    const both = texts.get(q.text).length > 1 && q.id !== "fees", key = both ? q.text : `${q.k}:${q.text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(both ? q.text.replace(/\bmy child\b/g, "my children") : `For ${childName(q.k)}: ${q.text}`);
  }
  return out;
}

// 8.6.1 one centre: one message for both children, asking about two places.
export function sameCentreMessage(option, plan) {
  const [a, b] = KIDS.map((k) => plan.children[k]);
  const intro = [
    "Hello, I’m looking for childcare for a few hours for my two children.",
    `Date: ${visitDate(plan.date)}`,
    `${childName("a")}: ${ageText(a.age)}, from ${a.start} to ${a.end}`,
    `${childName("b")}: ${ageText(b.age)}, from ${b.start} to ${b.end}`,
    "An adult will bring both children and collect them.",
  ].join("\n");
  const questions = ["Do you have places for both children on this date, at these times?", ...mergedQuestions(option, plan)];
  return [intro, ...questions.map((q, i) => `${i + 1}. ${q}`), "Thank you!"].join("\n\n");
}
// 8.6.2 two centres: each centre hears only about its own child.
export function childMessage(option, plan, k) {
  const c = plan.children[k], p = option[k];
  const intro = [
    "Hello, I’m looking for childcare for a few hours.",
    c.age ? `My child is ${childAge(c.age).toLowerCase()}.` : null,
    `Date: ${visitDate(plan.date)}`,
    `Drop-off: ${c.start} · Collection: ${c.end}`,
  ].filter(Boolean).join("\n");
  const questions = contactQuestions(p, childRequest(plan, k)).map((q) => q.text);
  return [intro, ...questions.map((q, i) => `${i + 1}. ${q}`), "Thank you!"].join("\n\n");
}

// 8.6.3 the family plan for the Checklist and its export. A dated draft.
export function familyPlanText(option, plan, lp, names = (p) => p.name) {
  const steps = planSteps(option, plan, lp, names);
  const fixLine = (r, what) => r.fix ? `${what}: ${r.fix.changes.map(changeLabel).join(", ")} would make it work.` : null;
  const lines = [
    "EqualPath family plan — DRAFT, not confirmed with any centre",
    `Date: ${visitDate(plan.date)}`,
    "",
    ...KIDS.map((k) => `${childWithAge(k, plan)}: ${names(option[k])}, ${plan.children[k].start}–${plan.children[k].end}`),
    "",
    "Plan",
    ...(steps.length ? steps.map((s) => `${timeLabel(s.time)}  ${s.kind.startsWith("leave") ? `${s.label} (latest)` : `${s.label} by ${timeLabel(s.time)}${s.lateBy ? ` (${s.lateBy} min late)` : ""}`}`) : ["Not worked out yet."]),
    ...[fixLine(lp.dropoff, "Drop-off"), fixLine(lp.collection, "Pickup")].filter(Boolean),
    ...(steps.some((s) => s.unknownDrive) ? ["The drive time between the two centres did not load. Check it before relying on this plan."] : []),
    "",
    "Still to ask",
  ];
  const open = KIDS.flatMap((k) => openChecks(option[k]).map((c) => `- ${childName(k)} at ${names(option[k])}: ${c.label}`));
  lines.push(...(open.length ? open : ["- Nothing from the published details. Still ask each centre to confirm a place."]));
  if (option.a.id === option.b.id) lines.push("- Ask whether there are places for both children.");
  lines.push("", "Good to know",
    "- Leave times allow 5 minutes for each handover and are rounded to the earlier 5 minutes.",
    "- Drive times are road estimates from OpenStreetMap routing. They do not include traffic, so leave a little earlier.",
    "- No centre has agreed to these times. Confirm each child’s place with the centre.");
  return lines.join("\n");
}
