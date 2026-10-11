import { useEffect, useRef, useState } from "react";
import { ArrowRight, Car, Check, ChevronDown, ChevronLeft, ChevronUp, Clock3, ClipboardList, Download, Heart, Info, MessageCircle, PanelLeftClose, PanelLeftOpen, Phone, TriangleAlert, Wallet, X } from "lucide-react";
import { displayName } from "../shared/display.mjs";
import { timeLabel } from "../shared/request.mjs";
import { visitDate, childAge } from "../shared/enquiry-view.mjs";
import { feeSummary } from "../shared/result-summary.mjs";
import { askChecks, oneChildPlan, oneChildSteps, oneChildPlanText } from "../shared/one-child-plan.mjs";
import VirtualEnquiry, { useEnquiryStatus } from "./VirtualEnquiry.jsx";
import { StatusChip } from "./Preparation.jsx";
import { contactQuestions } from "../shared/contact-message.mjs";
import "./two-children.css";
import "./one-child-panel.css";

// The one-child journey in the same shape as the two-children panel: suggested
// centres on the left of the map (a bottom sheet on phones), then a plain plan
// for the chosen centre. Same glass material, pin numbers and actions.
const SHOWN = 3;
const name = (p) => displayName(p?.name ?? "");
const shortReason = (r) => r ? r.replace(/^Matches your choices:\s*/, "Matches: ") : null;
export const initialOnePanel = { view: "options", selected: null, showAll: false, collapsed: false };

const Pin = ({ n }) => n ? <span className="map-card-number family-pin" aria-label={`Map point ${n}`}>{String(n).padStart(2, "0")}</span> : null;

/* The end of a plan, the same for one child and two (10 Oct 2026): one block
   per centre with its name, whose care and when, then two equal buttons —
   message the centre and Ask for me — and under all centres two quiet
   buttons for the checklist and the download. */
// What to do with a plan (11 Oct 2026, user: "下方的按钮还是特别奇怪"): each
// centre has one main action (Ask for me, or View reply) and a quieter
// Contact/Copy; where the enquiry stands shows under the centre's name. Saving
// and downloading the plan are small tools under a rule, not two more big
// buttons.
export function PlanActions({ centres, date, onChecklist, onDownload, askAll = null }) {
  const statusOf = useEnquiryStatus();
  const [saved, setSaved] = useState(false);
  const sig = centres.map((c) => `${c.key}:${c.p.id}:${c.who ?? ""}`).join("|") + date;
  useEffect(() => setSaved(false), [sig]);
  return <div className={`plan-actions${askAll ? " has-ask-all" : ""}`}>
    {centres.map((c) => {
      const status = statusOf(c.p.id, c.requests);
      return <div key={c.key} className="plan-centre">
        <div className="plan-centre-head">
          <Pin n={c.pin} />
          <div><strong>{name(c.p)}</strong>{c.who && <small>{c.who}</small>}{status && <StatusChip status={status} />}</div>
          {c.onDetails && <button className="text-link plan-centre-about" onClick={c.onDetails} aria-label={`About ${name(c.p)}`}>About<ArrowRight size={14} aria-hidden="true" /></button>}
          {c.call}
        </div>
        <div className="plan-centre-buttons">{c.ask}{c.message}</div>
        {c.after}
      </div>;
    })}
    {askAll && <div className="plan-ask-all">
      {askAll}
      <p>One message to each centre. If either has no place, this plan comes off your options.</p>
    </div>}
    <div className="plan-more">
      <button className="plan-tool" onClick={() => { onChecklist(); setSaved(true); }}>
        {saved ? <Check size={16} aria-hidden="true" /> : <ClipboardList size={16} aria-hidden="true" />}{saved ? "Saved to Checklist" : "Save to Checklist"}
      </button>
      <button className="plan-tool" onClick={onDownload}><Download size={16} aria-hidden="true" />Download plan</button>
    </div>
  </div>;
}

// A centre that replied it has no place (and offered no other time) is taken
// off the options, with a short note and Undo (10 Oct 2026).
export function DeclinedNote({ name: centre, two = false, onUndo, onClose }) {
  return <div className="family-declined" role="status">
    <Info size={17} aria-hidden="true" />
    <p><strong>{name({ name: centre })}</strong> {two ? "can’t take the times in this plan" : "has no place for this visit"}, so we’ve taken it off your options. <button className="text-link" onClick={onUndo}>Undo</button></p>
    <button className="family-declined-close" onClick={onClose} aria-label="Dismiss"><X size={16} /></button>
  </div>;
}

export default function OneChildPanel({ items, request, state, onChange, top = 300, onSelectCentre, onContact, onChecklist, onDetails, extra = null, hidden = [], note = null, onUndo, onCloseNote, questionIds }) {
  const panel = useRef(null);
  useEffect(() => { panel.current?.scrollTo?.({ top: 0 }); }, [state.view, state.selected, state.collapsed]);
  const [closing, setClosing] = useState(false);
  const set = (patch) => onChange((s) => ({ ...s, ...patch }));
  const hide = () => {
    const still = panel.current?.closest(".map-first")?.dataset.reduced === "true" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (still) { set({ collapsed: true }); return; }
    setClosing(true);
    setTimeout(() => { set({ collapsed: true }); setClosing(false); }, 180);
  };
  const chosen = state.view === "plan" && !hidden.includes(state.selected) ? items.find((p) => p.id === state.selected) : null;
  if (state.collapsed) {
    const label = chosen ? "Show your plan" : "Show the options";
    // The tab and "All N centres" share one row under the search bar.
    return <div className="family-tab-row" style={{ "--family-top": `${top}px` }}>
      <button className="family-tab" onClick={() => set({ collapsed: false })} aria-label={label}>
        <PanelLeftOpen size={18} className="family-wide" aria-hidden="true" /><ChevronUp size={18} className="family-narrow" aria-hidden="true" />{label}
      </button>{extra}
    </div>;
  }
  return <>{extra && <div className="family-side-extra" style={{ "--family-top": `${top}px` }}>{extra}</div>}<section ref={panel} className={`family-panel one-child-panel${chosen ? " is-plan" : ""}${closing ? " is-closing" : ""}`} style={{ "--family-top": `${top}px` }} aria-label={chosen ? "Your plan" : "Suggested centres"}>
    <div className="family-topbar"><button className="family-collapse" onClick={hide} disabled={closing} aria-label="Hide the panel and show the whole map" title="Hide panel">
      <PanelLeftClose size={18} className="family-wide" aria-hidden="true" /><ChevronDown size={20} className="family-narrow" aria-hidden="true" /></button></div>
    {chosen
      ? <Plan p={chosen} pin={items.indexOf(chosen) + 1} request={request} questionIds={questionIds} onBack={() => { set({ view: "options", selected: null }); onSelectCentre?.(null); }}
          onContact={onContact} onChecklist={onChecklist} onDetails={onDetails} />
      : <Options items={items} hidden={hidden} note={note && <DeclinedNote name={note.name} onUndo={() => onUndo?.(note.id)} onClose={onCloseNote} />} request={request} showAll={state.showAll} onShowAll={() => set({ showAll: true })}
          onSee={(p) => { set({ view: "plan", selected: p.id }); onSelectCentre?.(p.id); }} />}
  </section></>;
}

function Options({ items, hidden = [], note = null, request, showAll, onShowAll, onSee }) {
  const open = items.filter((p) => !hidden.includes(p.id));
  const shown = showAll ? open : open.slice(0, SHOWN);
  return <>
    <header className="family-head">
      <h3>Suggested for your child</h3>
      <p>{visitDate(request.date)} · {request.age ? childAge(request.age) : "Age not chosen"} · {request.deadline}–{request.end}</p>
    </header>
    {note}
    {!open.length && <p className="family-note">None of the suggested centres has a place left for this visit. Try another time or date, or see all centres.</p>}
    <ol className="family-options">
      {shown.map((p) => <li key={p.id}><Option p={p} pin={items.indexOf(p) + 1} request={request} onSee={() => onSee(p)} /></li>)}
    </ol>
    {!showAll && open.length > SHOWN && <button className="family-more" onClick={onShowAll}>Show {open.length - SHOWN} more {open.length - SHOWN === 1 ? "option" : "options"}</button>}
    <p className="family-note">A match isn’t a booking. Contact the centre to confirm a place.</p>
  </>;
}

function Option({ p, pin, request, onSee }) {
  const plan = oneChildPlan(p, request), asks = askChecks(p, request), fee = feeSummary(p);
  const loading = p.driving?.state === "loading";
  return <article className="family-option" data-provider-id={p.id} aria-label={`Option ${pin}`}>
    <div className="family-option-main">
      <p className="family-option-centre"><Pin n={pin} /><strong>{name(p)}</strong></p>
      {p.personalised && p.personalisedReason && <p className="family-reason" title={p.personalisedReason}><Heart size={13} aria-hidden="true" /><span>{shortReason(p.personalisedReason)}</span></p>}
      <p className="family-meta"><Car size={15} aria-hidden="true" />{loading ? "Checking drive time…" : plan.drive !== null
        ? plan.centrePickup ? `About ${plan.drive} min by car · centre pickup` : `About ${plan.drive} min by car · arrive about ${timeLabel(plan.arrive)}`
        : "Drive time not available"}</p>
      {plan.leaveForPickup !== null
        ? <p className="family-leave"><Clock3 size={15} aria-hidden="true" />Leave for pickup by <strong>{timeLabel(plan.leaveForPickup)}</strong></p>
        : <p className="family-leave muted">{loading ? "Working out when to leave…" : "See the plan for the times"}</p>}
      <p className="family-meta"><Wallet size={15} aria-hidden="true" />Fee: {fee.label}</p>
      <p className={`family-fit${asks.length ? "" : " ok"}`}>{asks.length
        ? `Ask the centre about: ${[...new Set(asks.map((c) => c.label.toLowerCase()))].join(", ")}`
        : <><Check size={14} aria-hidden="true" />Listed details fit your search</>}</p>
    </div>
    <button className="family-primary" onClick={onSee} aria-label={`See plan ${pin}`}>See plan<ArrowRight size={17} aria-hidden="true" /></button>
  </article>;
}

const safeQuestionIds = (p, request) => { try { return contactQuestions(p, request).map((q) => q.id); } catch { return undefined; } };
function Plan({ p, pin, request, onBack, onContact, onChecklist, onDetails, questionIds }) {
  const { plan, steps } = oneChildSteps(p, request, name);
  const asks = [...new Set(askChecks(p, request).map((c) => c.label.toLowerCase()))];
  const download = () => {
    const url = URL.createObjectURL(new Blob([oneChildPlanText(p, request, name)], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `equalpath-plan-${request.date}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <>
    <header className="family-head">
      <button className="family-back" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" />All options</button>
      <h3>Your plan</h3>
      <p><Pin n={pin} /> {visitDate(request.date)} · {name(p)}</p>
    </header>
    {plan.drive === null && <p className="family-note family-warn"><TriangleAlert size={15} aria-hidden="true" /><span>The drive time didn’t load, so only your own times are shown.</span></p>}
    <ol className="family-timeline">
      {steps.map((st, i) => <li key={i} className={st.kind === "leave" ? "leave" : st.kind}>
        <span className="family-dot" aria-hidden="true">{i + 1}</span>
        <time>{st.time === null ? "—" : timeLabel(st.time)}</time>
        <div className="family-step">
          <strong>{st.label}</strong>
          {st.note && <small>{st.note}</small>}
          {st.kind === "drop" && asks.length > 0 && <small className="family-ask">Ask: {asks.join(", ")}</small>}
        </div>
      </li>)}
    </ol>
    {plan.short && <p className="family-note family-warn"><Info size={15} aria-hidden="true" /><span>This is a short visit: you may want to wait nearby instead of going back.</span></p>}
    <PlanActions date={request.date} onChecklist={() => onChecklist(p)} onDownload={download} centres={[{ key: p.id, p, pin, requests: [request], onDetails: () => onDetails(p),
      message: <button className="family-secondary" onClick={() => onContact(p)}><Phone size={16} aria-hidden="true" />Contact</button>,
      ask: <VirtualEnquiry providerId={p.id} centre={p} requests={[request]} questionIds={questionIds?.(p) ?? safeQuestionIds(p, request)} /> }]} />
    <p className="family-note">Drive times don’t include traffic. The centre still needs to confirm a place.</p>
  </>;
}
