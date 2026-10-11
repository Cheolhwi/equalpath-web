import { useEffect, useRef, useState } from "react";
import { ArrowRight, Car, Check, ChevronDown, ChevronLeft, ChevronUp, Clock3, ClipboardList, Copy, Download, Heart, LoaderCircle, MessageCircle, PanelLeftClose, PanelLeftOpen, Phone, Plus, TriangleAlert, Wallet } from "lucide-react";
import PlaceInput from "./PlaceInput.jsx";
import VirtualEnquiry, { VirtualEnquiryGroup } from './VirtualEnquiry.jsx';
import { DeclinedNote, PlanActions } from './OneChildPanel.jsx';
import { displayName } from "../shared/display.mjs";
import { timeLabel } from "../shared/request.mjs";
import { visitDate } from "../shared/enquiry-view.mjs";
import {
  KIDS, childName, childWithAge, childRequest, openChecks, legMinutes, planSteps, sameCentreMessage, childMessage, familyPlanText,
} from "../shared/two-child.mjs";
import { familyComparisonFee, childFeeShort } from "../shared/family-comparison.mjs";
import "./two-children.css";

// Estimated fee for an option: both children's totals for their own times,
// or what is known per child when one total is missing.
export function optionFee(o) {
  const total = familyComparisonFee({ a: o.a, b: o.b });
  if (total !== "Ask the centre") return `${total} for both`;
  return KIDS.some((k) => o[k]?.cost?.available) ? KIDS.map((k) => `${childName(k)} ${childFeeShort(o[k])}`).join(" · ") : "Ask the centre";
}

// Epic 8 inside the main map: suggested options for two children, then a
// plain "leave by" plan. Uses the map-card glass material and pin numbers.
const name = (p) => displayName(p?.name ?? "");
const SHOWN = 3;
// Right edge of the panel on wider screens (left 16 + width 420, see two-children.css) plus a gap.
export const FAMILY_PANEL_RIGHT = 16 + 420 + 12;
const BUSY_TEXT = "The map service is busy. Trying again in about half a minute…";
const fixText = (c, plan) => c.field === "start"
  ? `Drop off ${childName(c.child)} at ${c.value} instead of ${plan.children[c.child].start}`
  : `Pick up ${childName(c.child)} at ${c.value} instead of ${plan.children[c.child].end}`;

export function shownOptions(family) {
  const all = family.built?.options ?? [];
  return family.state?.showAll ? all : all.slice(0, SHOWN);
}
// Map pins: the chosen option's centres in stop order (so pin 01/02 match the
// plan), otherwise every centre in the options on screen. Drive time is from
// the starting point. On the options list the centres of the top suggestions
// (first three distinct centres, in option order) are "suggested", so the map
// shows the same floating centre cards as a one-child search.
const SUGGESTED_CARDS = 3;
const forLabel = (k) => (k === "ab" ? "Fits both children" : `For ${childName(k)}`);
export function familyMapItems(family) {
  const s = family.state;
  if (!s?.results || s.status !== "ready") return [];
  const role = new Map();
  const add = (p, k) => {
    const had = role.get(p.id);
    if (!had) role.set(p.id, { p, k });
    else if (had.k !== k && had.k !== "ab") had.k = "ab";
  };
  const plan = s.view === "plan" && family.option;
  if (plan) {
    const o = family.option, order = family.lp?.dropoff.best?.order.map((x) => x.key) ?? ["a", "b"];
    for (const k of order) for (const kid of k === "ab" ? ["a"] : [k]) add(o[kid], kid);
    for (const k of KIDS) add(o[k], k);
  } else for (const o of shownOptions(family)) { add(o.a, "a"); add(o.b, "b"); }
  const items = [...role.values()];
  // In a plan the chosen centres get cards too, with whose care it is and when.
  const times = (k) => (k === "ab"
    ? (s.plan.children.a.start === s.plan.children.b.start && s.plan.children.a.end === s.plan.children.b.end
      ? `Both children · ${s.plan.children.a.start}–${s.plan.children.a.end}` : "Both children")
    : `${childName(k)} · ${s.plan.children[k].start}–${s.plan.children[k].end}`);
  return items.map(({ p, k }, i) => {
    const minutes = legMinutes(family.legs, "start", p.id);
    return { ...p, familyRole: k, familyFor: plan ? times(k) : forLabel(k), suggested: plan || i < SUGGESTED_CARDS,
      personalised: !plan && i < SUGGESTED_CARDS && !!p.personalisedReason,
      driving: minutes === null ? { state: "unavailable", reason: "not_loaded" } : { state: "available", minutes, traffic: false } };
  });
}

export default function FamilyPanel({ family, mode, top = 300, onFix, onWider, onRetrySearch, onChecklist, onToast, compareIds = [], onCompare, onViewOption }) {
  const s = family.state;
  // Opening a plan (or going back to the options) starts at the top of the panel.
  const panel = useRef(null);
  useEffect(() => { panel.current?.scrollTo?.({ top: 0 }); }, [s?.view, s?.selected, s?.collapsed]);
  // Hiding slides the panel out first; the map then moves into the freed space.
  const [closing, setClosing] = useState(false);
  const hide = () => {
    const still = panel.current?.closest(".map-first")?.dataset.reduced === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) { family.collapse(true); return; }
    setClosing(true);
    setTimeout(() => { family.collapse(true); setClosing(false); }, 180);
  };
  if (!s) return null;
  // The parent can tuck the panel away to see the whole map, and bring it back
  // from a small tab in the same place.
  if (s.collapsed) {
    const label = family.busy ? "Finding care…" : s.view === "plan" && family.option ? "Show your plan"
      : s.status === "ready" && family.built?.options.length ? "Show the options" : "Show details";
    return <button className="family-tab" style={{ "--family-top": `${top}px` }} onClick={() => family.collapse(false)} aria-label={`${label} for two children`}>
      {family.busy ? <LoaderCircle size={17} className="family-spin" aria-hidden="true" /> : <><PanelLeftOpen size={18} className="family-wide" aria-hidden="true" /><ChevronUp size={18} className="family-narrow" aria-hidden="true" /></>}
      {label}
    </button>;
  }
  return <section ref={panel} className={`family-panel${s.view === "plan" ? " is-plan" : ""}${closing ? " is-closing" : ""}`} style={{ "--family-top": `${top}px` }} aria-label="Plan for two children" aria-busy={family.busy || undefined}>
    <div className="family-topbar"><button className="family-collapse" onClick={hide} disabled={closing} aria-label="Hide the panel and show the whole map" title="Hide panel">
      <PanelLeftClose size={18} className="family-wide" aria-hidden="true" /><ChevronDown size={20} className="family-narrow" aria-hidden="true" /></button></div>
    {family.busy && <p className="family-status" role="status"><LoaderCircle size={18} className="family-spin" aria-hidden="true" />
      {s.status === "searching" ? "Finding care for both children…" : s.waitUntil ? BUSY_TEXT : "Checking drive times…"}</p>}
    {s.status === "error" && <div className="family-status family-error" role="alert">We couldn’t load centres. <button className="text-link" onClick={onRetrySearch}>Try again</button></div>}
    {s.status === "ready" && (s.view === "plan" && family.option
      ? <Plan family={family} mode={mode} onFix={onFix} onChecklist={onChecklist} onToast={onToast} />
      : <Options family={family} onWider={onWider} compareIds={compareIds} onCompare={onCompare} onViewOption={onViewOption} />)}
  </section>;
}

function Options({ family, onWider, compareIds, onCompare, onViewOption }) {
  const { built, state: s } = family, plan = s.plan, options = shownOptions(family);
  const pins = new Map(familyMapItems(family).map((p, i) => [p.id, i + 1]));
  const who = built.missing.length > 1 ? "either child" : childName(built.missing[0]);
  if (built.missing.length) return <div className="family-empty">
    <h3>No match for {who}</h3>
    <p>No centre within {plan.radius} km can take {who} at these times. Try other times{plan.radius < 10 ? ", or look further away" : ""}.</p>
    {plan.radius < 10 && <button className="family-primary" onClick={onWider}>Search within 10 km<ArrowRight size={17} /></button>}
  </div>;
  return <>
    <header className="family-head">
      <h3>Suggested for your two children</h3>
      <p>{visitDate(plan.date)} · {KIDS.map((k) => childWithAge(k, plan)).join(" and ")}</p>
    </header>
    {s.declineNote && <DeclinedNote name={s.declineNote.name} two onUndo={() => family.undecline(s.declineNote.id)} onClose={family.dismissDecline} />}
    {!options.length && <p className="family-note">None of the suggested plans has a place left. Try other times or another date.</p>}
    {options.some((o) => o.dropOff === null) && <p className="family-note">Some drive times didn’t load. <button className="text-link" onClick={family.retry}>Try again</button></p>}
    <ol className="family-options">
      {options.map((o, i) => <li key={o.id}><Option o={o} index={i + 1} pins={pins} lp={family.plans.get(o.id)} onSee={() => { onViewOption?.(o); family.select(o.id); }} compareIds={compareIds} onCompare={onCompare} /></li>)}
    </ol>
    {!s.showAll && built.options.length > SHOWN && <button className="family-more" onClick={family.showAll}>Show {built.options.length - SHOWN} more options</button>}
    <p className="family-note">A match isn’t a booking. Call each centre to confirm a place.</p>
  </>;
}

const Pin = ({ n }) => n ? <span className="map-card-number family-pin" aria-label={`Map point ${n}`}>{String(n).padStart(2, "0")}</span> : null;
function Option({ o, index, pins, lp, onSee, compareIds = [], onCompare }) {
  const same = o.kind === "same", d = lp?.dropoff;
  const ask = [...new Set(KIDS.flatMap((k) => openChecks(o[k]).map((c) => c.label.toLowerCase())))];
  return <article className="family-option" data-family-provider-a={o.a.id} data-family-provider-b={o.b.id} aria-label={`Option ${index}`}>
    <div className="family-option-main">
      {same ? <p className="family-option-centre"><Pin n={pins.get(o.a.id)} /><strong>Both at {name(o.a)}</strong></p>
        : <div className="family-option-pair">{KIDS.map((k) => <p key={k} className="family-option-centre"><Pin n={pins.get(o[k].id)} /><span><small>{childName(k)}</small><strong>{name(o[k])}</strong></span></p>)}</div>}
      {o.reason && <p className="family-reason" title={o.reason}><Heart size={13} aria-hidden="true" /><span>{o.reason}</span></p>}
      <p className="family-meta"><Car size={15} aria-hidden="true" />{same ? "One stop" : "Two stops"}{o.dropOff !== null && ` · about ${o.dropOff} min by car`}</p>
      {d?.state === "works" ? <p className="family-leave"><Clock3 size={15} aria-hidden="true" />Leave by <strong>{timeLabel(d.best.leaveBy)}</strong></p>
        : d && d.state !== "unknown" ? <p className="family-leave warn"><TriangleAlert size={15} aria-hidden="true" />Times need a small change</p>
          : <p className="family-leave muted">See the plan to check when to leave</p>}
      <p className="family-meta"><Wallet size={15} aria-hidden="true" />Fee: {optionFee(o)}</p>
      <p className={`family-fit${o.status === "supported" ? " ok" : ""}`}>{o.status === "supported" ? <><Check size={14} aria-hidden="true" />Listed details fit both</> : `Ask the centre about: ${ask.join(", ")}`}</p>
    </div>
    <div className="family-option-actions">
      {onCompare && (() => { const ids = [...new Set([o.a.id, o.b.id])], added = ids.every((id) => compareIds.includes(id));
        return <button className="family-secondary family-option-compare" aria-pressed={added} onClick={() => onCompare(ids)} aria-label={`${added ? "Remove" : "Add"} option ${index} ${added ? "from" : "to"} compare`}>
          {added ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{added ? "Added" : "Compare"}</button>; })()}
      <button className="family-primary" onClick={onSee} aria-label={`See plan ${index}`}>See plan<ArrowRight size={17} aria-hidden="true" /></button>
    </div>
  </article>;
}

// A quick Call / WhatsApp link beside the centre's name in the plan.
function Contact({ p }) {
  const wa = p.whatsapp?.find((c) => c.href);
  if (p.phone?.display) return <a className="plan-centre-call" href={`tel:${p.phone.display.replace(/[^+0-9]/g, "")}`} aria-label={`Call ${name(p)}, ${p.phone.display}`}><Phone size={14} aria-hidden="true" />Call</a>;
  if (wa) return <a className="plan-centre-call" href={wa.href} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${name(p)}`}><MessageCircle size={14} aria-hidden="true" />WhatsApp</a>;
  return null;
}

// The two-children plan as a Checklist entry (saved from the plan, or from
// the chat once both places are confirmed).
export function familyChecklistEntry(o, plan, lp) {
  const steps = planSteps(o, plan, lp, name);
  return { id: `family:${o.id}:${plan.date}`, kind: "family", text: familyPlanText(o, plan, lp, name), date: plan.date,
    title: o.kind === "same" ? name(o.a) : `${name(o.a)} + ${name(o.b)}`,
    items: KIDS.map((k) => ({ key: k, p: o[k], request: childRequest(plan, k) })),
    steps: steps.map((st) => ({ time: timeLabel(st.time), label: st.label, kind: st.kind })) };
}

function Plan({ family, mode, onFix, onChecklist, onToast }) {
  const o = family.option, lp = family.lp, s = family.state, plan = s.plan;
  const [editingPickup, setEditingPickup] = useState(false);
  const [copied, setCopied] = useState("");
  const steps = planSteps(o, plan, lp, name);
  const problems = [["dropoff", "drop off"], ["collection", "pick up"]].filter(([j]) => ["late", "short"].includes(lp[j].state));
  const unknown = [lp.dropoff, lp.collection].some((r) => r.state === "unknown");
  // While the opened plan's road times load, show one line instead of a plan
  // (or a fix) that may change a moment later.
  const checking = s.ensuring === o.id;
  const messages = o.kind === "same" ? [["ab", o.a, sameCentreMessage(o, plan)]] : KIDS.map((k) => [k, o[k], childMessage(o, plan, k)]);
  const copy = async (key, text) => { try { await navigator.clipboard.writeText(text); setCopied(key); onToast?.("Message copied. Paste it into WhatsApp or a text message."); } catch { setCopied(`manual:${key}`); } };
  const planText = familyPlanText(o, plan, lp, name);
  const pins = new Map(familyMapItems(family).map((p, i) => [p.id, i + 1]));
  const span = (k) => `${plan.children[k].start}–${plan.children[k].end}`;
  const who = (key) => key === "ab" ? `Both children${span("a") === span("b") ? ` · ${span("a")}` : ` · ${span("a")} and ${span("b")}`}` : `${childName(key)} · ${span(key)}`;
  const download = () => {
    const url = URL.createObjectURL(new Blob([planText], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `equalpath-family-plan-${plan.date}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <header className="family-head">
      <button className="family-back" onClick={family.back}><ChevronLeft size={18} aria-hidden="true" />All options</button>
      <h3>Your plan</h3>
      <p>{visitDate(plan.date)} · {o.kind === "same" ? `both at ${name(o.a)}` : `${name(o.a)} and ${name(o.b)}`}</p>
      <p className="family-meta"><Wallet size={15} aria-hidden="true" />Fee: {optionFee(o)}</p>
    </header>
    {checking && <p className="family-status" role="status"><LoaderCircle size={18} className="family-spin" aria-hidden="true" />
      {s.waitUntil ? BUSY_TEXT : o.kind === "same" ? "Checking the drive time…" : "Checking the drive between the two centres…"}</p>}
    {checking ? null : problems.length > 1 && problems.every(([j]) => lp[j].fix) ? (() => {
      // Both journeys need a change: one button, so nobody has to fix twice.
      const changes = problems.flatMap(([j]) => lp[j].fix.changes);
      return <div className="family-fix" role="alert">
        <p><TriangleAlert size={18} aria-hidden="true" /><span>One person can’t drop off and pick up both children on time.</span></p>
        <button className="family-primary" onClick={() => onFix(changes)}>{changes.map((c, i) => (i ? fixText(c, plan).replace(/^./, (x) => x.toLowerCase()) : fixText(c, plan))).join(", and ")}<ArrowRight size={17} aria-hidden="true" /></button>
      </div>;
    })() : problems.map(([j, verb]) => {
      const r = lp[j];
      return <div key={j} className="family-fix" role="alert">
        <p><TriangleAlert size={18} aria-hidden="true" /><span>{r.state === "short"
          ? "The time between drop-off and pickup is too short for one person."
          : `One person can’t ${verb} both children on time.`}</span></p>
        {r.fix ? <button className="family-primary" onClick={() => onFix(r.fix.changes)}>{r.fix.changes.map((c) => fixText(c, plan)).join(", ")}<ArrowRight size={17} aria-hidden="true" /></button>
          : <p className="family-note">Try different times, or choose another option.</p>}
      </div>;
    })}
    {unknown && !checking && <p className="family-note family-warn"><TriangleAlert size={15} aria-hidden="true" /><span>{steps.some((st) => st.unknownDrive)
      ? "The drive between the two centres didn’t load, so this plan isn’t checked yet."
      : "A drive time didn’t load, so part of the plan is missing."} <button className="text-link" onClick={family.ensure}>Try again</button></span></p>}
    {!checking && <ol className="family-timeline">
      {steps.map((st, i) => {
        const leave = st.kind.startsWith("leave");
        const ask = !leave && st.kind === "drop" ? (st.key === "ab" ? KIDS : [st.key]).flatMap((k) => openChecks(o[k]).map((c) => c.label.toLowerCase())) : [];
        return <li key={`${st.journey}-${i}`} className={leave ? "leave" : st.kind}>
          <span className="family-dot" aria-hidden="true">{i + 1}</span>
          <time>{timeLabel(st.time)}</time>
          <div className="family-step">
            <strong>{st.label}</strong>
            {leave && <small>{st.partial ? "Latest time, for the first stop" : "Latest time"}{st.drive !== null ? ` · ${st.drive} min drive` : ""}</small>}
            {!leave && st.same && <small>Same centre</small>}
            {!leave && !st.same && st.drive !== null && <small>{st.drive} min from the last stop</small>}
            {!leave && st.unknownDrive && <small className="family-ask">Drive time from the last stop didn’t load</small>}
            {!leave && st.lateBy > 0 && <small className="family-late"><TriangleAlert size={13} aria-hidden="true" />{st.lateBy} min after {st.key === "ab" ? "the" : `${childName(st.key)}’s`} {st.kind === "drop" ? "start time" : "end time"}</small>}
            {ask.length > 0 && <small className="family-ask">Ask: {[...new Set(ask)].join(", ")}</small>}
          </div>
        </li>;
      })}
    </ol>}
    <div className="family-pickup-from">
      {editingPickup
        ? <PlaceInput mode={mode} idPrefix="family-collect" label="Pickup starts from" value={s.plan.run.collectPlace} placeholder="e.g. your office"
            onChange={(p) => { if (p) { family.setCollectPlace(p, o); setEditingPickup(false); } }} />
        : <p>Pickup starts from <strong>{s.plan.run.collectPlace?.label}</strong>. <button className="text-link" onClick={() => setEditingPickup(true)}>Change</button></p>}
    </div>
    <PlanActions date={plan.date}
      askAll={o.kind === "same" ? null : <VirtualEnquiryGroup items={KIDS.map((k) => ({ providerId: o[k].id, centre: o[k], requests: [{ ...childRequest(plan, k), label: childName(k) }] }))} />}
      onChecklist={() => onChecklist(familyChecklistEntry(o, plan, lp))} onDownload={download}
      centres={messages.map(([key, p, text]) => ({ key, p, pin: pins.get(p.id), who: who(key), call: <Contact p={p} />,
        requests: (key === "ab" ? KIDS : [key]).map(k => childRequest(plan, k)),
        message: <button className="family-secondary" onClick={() => copy(key, text)}>{copied === key ? <Check size={17} aria-hidden="true" /> : <Copy size={17} aria-hidden="true" />}{copied === key ? "Copied" : "Copy message"}</button>,
        ask: o.kind === "same" ? <VirtualEnquiry providerId={p.id} centre={p} family requests={KIDS.map((k) => ({ ...childRequest(plan, k), label: childName(k) }))} /> : null,
        after: copied === `manual:${key}` && <textarea readOnly value={text} aria-label="Message to copy" className="enquiry-manual-message" /> }))} />
    <p className="family-note">Times allow 5 minutes per handover; drives don’t include traffic. Each centre still needs to confirm a place.</p>
  </>;
}

// 8.6.3 The family plan inside the Checklist: a dated draft kept in memory.
export function FamilyPlanCard({ plan, onOpen, onRemove }) {
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([plan.text], { type: "text/plain" }));
    const a = document.createElement("a");
    a.href = url; a.download = `equalpath-family-plan-${plan.date}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="family-plan-card" aria-label="Family plan for two children">
    <h3>Family plan · {plan.title}</h3>
    <pre>{plan.text}</pre>
    <div className="family-actions">
      <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(plan.text); setCopied(true); } catch { setCopied(false); } }}>
        {copied ? <Check size={16} /> : <Copy size={16} />}{copied ? "Copied" : "Copy plan"}</button>
      <button className="secondary" onClick={download}><Download size={16} />Download</button>
      {onOpen && <button className="secondary" onClick={onOpen}>Show on the map<ArrowRight size={16} /></button>}
      <button className="text-link" onClick={onRemove}>Remove from Checklist</button>
    </div>
  </section>;
}
