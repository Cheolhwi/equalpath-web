import { useEffect, useRef, useState } from "react";
import { ArrowRight, Car, Check, ChevronDown, ChevronLeft, ChevronUp, Clock3, ClipboardList, Download, Heart, Info, MessageCircle, PanelLeftClose, PanelLeftOpen, Phone, TriangleAlert, Wallet } from "lucide-react";
import { displayName } from "../shared/display.mjs";
import { timeLabel } from "../shared/request.mjs";
import { visitDate, childAge } from "../shared/enquiry-view.mjs";
import { feeSummary } from "../shared/result-summary.mjs";
import { askChecks, oneChildPlan, oneChildSteps, oneChildPlanText } from "../shared/one-child-plan.mjs";
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

function Call({ p }) {
  const wa = p.whatsapp?.find((c) => c.href);
  if (p.phone?.display) return <a className="family-call" href={`tel:${p.phone.display.replace(/[^+0-9]/g, "")}`}><Phone size={15} aria-hidden="true" />Call {p.phone.display}</a>;
  if (wa) return <a className="family-call" href={wa.href} target="_blank" rel="noreferrer"><MessageCircle size={15} aria-hidden="true" />WhatsApp</a>;
  return null;
}

export default function OneChildPanel({ items, request, state, onChange, top = 300, onSelectCentre, onContact, onChecklist, onDetails, extra = null }) {
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
  const chosen = state.view === "plan" ? items.find((p) => p.id === state.selected) : null;
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
      ? <Plan p={chosen} pin={items.indexOf(chosen) + 1} request={request} onBack={() => { set({ view: "options", selected: null }); onSelectCentre?.(null); }}
          onContact={onContact} onChecklist={onChecklist} onDetails={onDetails} />
      : <Options items={items} request={request} showAll={state.showAll} onShowAll={() => set({ showAll: true })}
          onSee={(p) => { set({ view: "plan", selected: p.id }); onSelectCentre?.(p.id); }} />}
  </section></>;
}

function Options({ items, request, showAll, onShowAll, onSee }) {
  const shown = showAll ? items : items.slice(0, SHOWN);
  return <>
    <header className="family-head">
      <h3>Suggested for your child</h3>
      <p>{visitDate(request.date)} · {request.age ? childAge(request.age) : "Age not chosen"} · {request.deadline}–{request.end}</p>
    </header>
    <ol className="family-options">
      {shown.map((p, i) => <li key={p.id}><Option p={p} pin={i + 1} request={request} onSee={() => onSee(p)} /></li>)}
    </ol>
    {!showAll && items.length > SHOWN && <button className="family-more" onClick={onShowAll}>Show {items.length - SHOWN} more {items.length - SHOWN === 1 ? "option" : "options"}</button>}
    <p className="family-note">A match isn’t a booking. Contact the centre to confirm a place.</p>
  </>;
}

function Option({ p, pin, request, onSee }) {
  const plan = oneChildPlan(p, request), asks = askChecks(p, request), fee = feeSummary(p);
  const loading = p.driving?.state === "loading";
  return <article className="family-option" aria-label={`Option ${pin}`}>
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

function Plan({ p, pin, request, onBack, onContact, onChecklist, onDetails }) {
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
          {st.kind === "drop" && <Call p={p} />}
        </div>
      </li>)}
    </ol>
    {plan.short && <p className="family-note family-warn"><Info size={15} aria-hidden="true" /><span>This is a short visit: you may want to wait nearby instead of going back.</span></p>}
    <div className="family-pickup-from"><p>Pickup starts from <strong>{request.pickup?.label ?? "your starting point"}</strong>.</p></div>
    <div className="family-actions">
      <button className="family-primary" onClick={() => onContact(p)}><MessageCircle size={17} aria-hidden="true" />Contact the centre</button>
      <button className="family-secondary" onClick={() => onChecklist(p)}><ClipboardList size={16} aria-hidden="true" />Save to Checklist</button>
      <button className="family-secondary" onClick={() => onDetails(p)}>About this centre<ArrowRight size={16} aria-hidden="true" /></button>
      <button className="text-link family-download" onClick={download}><Download size={15} aria-hidden="true" />Download the plan</button>
    </div>
    <p className="family-note">Drive times are road estimates without traffic. The centre still needs to confirm a place and the arrival time.</p>
  </>;
}
