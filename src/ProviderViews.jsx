import Surroundings, { surroundingImages } from "./Surroundings.jsx";
import ArrivalFlags from "./ArrivalFlags.jsx";
import { flagItems } from "../shared/arrival-flags.mjs";
import { useId, useState } from "react";
import CareJourney from "./CareJourney.jsx";
import ReviewEvidence from "./ReviewEvidence.jsx";
import CentreHighlights from "./CentreHighlights.jsx";
import useCardReveal from "./useCardReveal.js";
import {
  Bookmark,
  ClipboardList,
  ArrowRight,
  ArrowUpRight,
  Check,
  Phone,
  MessageCircle,
  Plus,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  Star,
  ChevronDown,
  BadgeCheck,
  MapPin,
  Clock3,
  Car,
  Users,
  Wallet,
  X,
  Heart,
  Flag,
} from "lucide-react";
import { todayKL, isShortCare, ageBounds } from "../shared/request.mjs";
import { drivingLabel, feeSummary, formatFee, feesForCare } from "../shared/result-summary.mjs";
import { registrationBadge } from "../shared/registration.mjs";
import { primaryHoursWin } from "../shared/conditions.mjs";
import { displayName, displayAddress, dateLabel, placeLabel, placeLine, categoryLabel } from "../shared/display.mjs";
import { plainEvidence, plainReason, plainSource } from "../shared/plain-copy.mjs";
import { centreHighlights } from "../shared/recommendations.mjs";
export function OrderingNote({ ordering, radius }) {
  if (!ordering) return null;
  const text = ordering.factor === "recommended"
    ? ordering.pageSelection === "nearest"
      ? `Each page starts with the next ${ordering.pageSize ?? 20} nearest centres${radius ? ` within ${radius} km` : ""}. Recommended then orders them by how well they fit your needs and choices.`
      : "Centres with details that don’t match your search come last."
    : ordering.explanation;
  return <p>{text}</p>;
}
export function SourceLink({ source, children }) {
  // A check we worked out ourselves (like arrival time) has no source to show.
  if (!source) return null;
  return (
    <span className="source-link">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {children ?? plainSource(source.label)}
          <ArrowUpRight size={12} />
        </a>
      ) : (
        <span>{plainSource(source.label)}</span>
      )}
      {source.retrievedAt && (
        <small>
          Checked {dateLabel(source.retrievedAt.slice(0, 10))}
          {source.sourceDate ? ` · published ${dateLabel(source.sourceDate)}` : ""}
        </small>
      )}
    </span>
  );
}
function SourceDisclosure({ source, children = "View source", extra }) {
  if (!source) return null;
  return <details className="source-disclosure"><summary>{children}</summary><SourceLink source={source} />{extra}</details>;
}
export function PublishedContacts({ p, compact = false, showSources = true }) {
  const ContactSource = compact ? SourceDisclosure : SourceLink;
  return (
    <>
      {p.phone && (
        <div className="published-contact">
          <a className="call-link" aria-label={`Call ${p.name}`} href={`tel:${p.phone.display.replace(/[^+0-9]/g, "")}`}>
            <Phone size={19} />
            Call · {p.phone.display}
          </a>
          {showSources && <ContactSource source={p.phone.source} />}
        </div>
      )}
      {(p.whatsapp ?? []).map((contact) => (
        <div className="published-contact" key={contact.href}>
          <a
            className="call-link"
            href={contact.href}
            target="_blank"
            rel="noreferrer"
            aria-label={`Open WhatsApp for ${p.name}`}
          >
            <MessageCircle size={19} />
            WhatsApp · {contact.display}
            <ArrowUpRight size={15} />
          </a>
          {showSources && <ContactSource source={contact.source} />}
          {contact.scope === "website" && (
            <small className="notice">
              Main enquiry number. Ask for this branch.
            </small>
          )}
        </div>
      ))}
      {!p.phone && !p.whatsapp?.length && (
        <p>
          No phone number listed. Try the centre’s website.
        </p>
      )}
    </>
  );
}
export function Status({ state, children }) {
  const confirmedRange = state === "reference";
  const Icon =
    state === "supported" || confirmedRange
      ? CheckCircle2
      : state === "conflict"
        ? AlertTriangle
        : HelpCircle;
  return (
    <span className={`state-pill ${confirmedRange ? "supported" : state}`}>
      <Icon size={12} />
      {children ??
        (confirmedRange
          ? "Confirmed range"
          : state === "supported"
            ? "Matches"
            : state === "conflict"
              ? "Doesn’t match"
              : "Ask the centre")}
    </span>
  );
}
export function RegistrationBadge({p}) {
  const [open,setOpen]=useState(false), id=useId(), badge=registrationBadge(p,todayKL());
  if (!badge) return null;
  const Icon=badge.state==='attention'?AlertTriangle:BadgeCheck;
  return <span className="registration-badge-wrap" onKeyDown={e=>{
    if(e.key==='Escape' && open){e.stopPropagation();setOpen(false);e.currentTarget.querySelector('button').focus();}
  }}>
    <button className={`registration-badge ${badge.state}`} title={`${badge.label} · ${badge.number}`}
      aria-label={`${badge.label} for ${p.name}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
      <Icon size={19} aria-hidden="true" />
    </button>
    {open && <span className="registration-popover" id={id} role="region" aria-label="Registration record">
      <strong>{badge.label}</strong><span>{badge.authority} · {badge.number}</span>
      <span className="registration-popover-text">{badge.description}</span>
      <a href={badge.source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a>
    </span>}
  </span>;
}
const matchedLabel = n => `${n} ${n === 1 ? "thing matches" : "things match"} your search`;
// Arrival time always needs confirming, so it does not make a card stand out.
// Pickup-service checks only count when the parent asked the centre to pick up.
const PICKUP_CHECKS = ["transport", "coverage", "pickup"];
const toAsk = (p, transport) => (p.fit?.conditions ?? []).filter(c => c.state === "unknown" && c.id !== "transfer" && (transport === "institution" || !PICKUP_CHECKS.includes(c.id))).length;
export function ProviderCard({
  p,
  index,
  selected,
  compared,
  onSelect,
  onDetail,
  onCompare,
  saved,
  onSave,
  transport,
}) {
  const fees = feeSummary(p);
  const ask = toAsk(p, transport);
  const revealRef = useCardReveal();
  return (
    <article
      ref={revealRef}
      style={{ "--card-delay": `${Math.min(index, 3) * 70}ms` }}
      className={`provider-row ${selected ? "selected" : ""} ${p.fit.counts.conflict ? "lower-priority" : ""} ${p.suggested ? "suggested" : ""}`}
      id={"card-" + p.id}
      data-provider-id={p.id}
      data-rerank-position={p.personalisedRank ?? undefined}
      data-rerank-score={p.rerankScore ?? undefined}
    >
      <div className="provider-main" onClick={e=>{
        if(!e.target.closest('button, a, .registration-badge-wrap'))onSelect();
      }}>
        <div className="row-kicker">
          <span className="row-number" aria-label={`Map point ${index + 1}`}>{String(index + 1).padStart(2, "0")}</span>
          <span>{placeLabel(p) || categoryLabel(p)}</span>
        </div>
        <div className="provider-heading">
          <button className="provider-select" aria-label={"Select " + p.name} aria-pressed={selected} onClick={onSelect}>
            <h3>{displayName(p.name)}</h3>
          </button>
          <RegistrationBadge p={p} />
        </div>
        {!p.suggested && !p.personalised && <CentreHighlights highlights={centreHighlights(p)} />}
        <div className="row-facts">
          <span><Users size={16} aria-hidden="true" />Age</span>
          <strong>{detailAgeLabel(p)}</strong>
        </div>
        <div className="row-facts">
          <span><Car size={16} aria-hidden="true" />Drive</span>
          <strong>{drivingLabel(p.driving)}</strong>
        </div>
        <div className="row-facts">
          <span><Wallet size={16} aria-hidden="true" />Fee</span>
          <strong className={fees.estimate ? "fee-estimate" : undefined}>{fees.label}</strong>
        </div>
        <div className="row-status">
          {p.personalised && <span className="personalised-tag"><Heart size={12} aria-hidden="true" />{p.personalisedReason}</span>}
          {p.suggested && !p.personalised && <span className="suggestion-tag"><Star size={12} fill="currentColor" />Suggested</span>}
          <Status state={p.fit.counts.conflict ? "conflict" : ask ? "unknown" : "supported"}>
            {p.fit.counts.conflict
              ? `${p.fit.counts.conflict} ${p.fit.counts.conflict === 1 ? "detail doesn’t" : "details don’t"} match`
              : ask ? `${ask} ${ask === 1 ? "thing" : "things"} to ask` : "No known issues"}
          </Status>
        </div>
      </div>
      <div className="row-actions">
        <button
          aria-label={`Save ${p.name}`}
          aria-pressed={saved}
          onClick={onSave}
        >
          <Bookmark size={14} />
          {saved ? "Saved" : "Save"}
        </button>
        <button
          aria-label={"Compare " + p.name}
          aria-pressed={compared}
          onClick={onCompare}
        >
          {compared ? <Check size={14} /> : <Plus size={14} />}Compare
        </button>
        <button
          onClick={onDetail}
          aria-label={"View details for " + p.name}
        >
          Details <ArrowRight size={16} />
        </button>
      </div>
    </article>
  );
}
const tidyCategory = value => value === value.toLowerCase()
  ? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, " ")
  : categoryLabel({ category: value });
export function Registration({ p }) {
  const r = p.registration,
    expired = r.until && r.until < todayKL(),
    unresolved = r.match === "unresolved",
    status =
      p.mode === "demo"
        ? "Demo centre"
        : expired
          ? "Registration period has ended"
          : unresolved
            ? "Branch registration needs checking"
            : r.official
              ? "Listed in the JKM register"
              : r.authority === "KPM" && r.number
                ? "KPM code listed"
              : "Not found in a government register yet";
  return (
    <section className="detail-section">
      <h3>{status}</h3>
      <dl className="facts-grid">
        <div>
          <dt>Name in the record</dt>
          <dd>{displayName(r.publishedName ?? p.registeredName)}</dd>
        </div>
        <div>
          <dt>Record</dt>
          <dd>
            {r.authority ? `${r.authority} · ` : ''}{r.number ?? "No record found"}
          </dd>
        </div>
        <div>
          <dt>Type</dt>
          <dd>{r.category ? tidyCategory(r.category) : "Not listed"}</dd>
        </div>
        <div>
          <dt>Valid</dt>
          <dd>
            {r.from || r.until ? `${r.from ? dateLabel(r.from) : "Not listed"} – ${r.until ? dateLabel(r.until) : "Not listed"}` : "Not listed"}
          </dd>
        </div>
      </dl>
      <p>
        {expired
          ? "This registration has ended. Ask the centre if it has been renewed."
          : plainEvidence(r.matchBasis)}
      </p>
      {r.missingImportedFields?.length > 0 && (
        <p className="notice">
          The government list has no address or phone number. The ones shown
          here come from other sources.
        </p>
      )}
      {!r.official && !r.number && p.mode !== "demo" && (
        <p>
          We haven’t found this centre in a government register. This doesn’t
          mean it isn’t registered.
        </p>
      )}
      <SourceLink source={r.source} />
    </section>
  );
}
export const feeLabel = formatFee;
export function Costs({ p }) {
  const [show, setShow] = useState(false),
    c = p.cost, fees = feesForCare(p);
  return (
    <section className="detail-section">
      <h3>
        {c.available
          ? "Estimate your cost"
          : fees.length
            ? p.careType==='short_term' ? "Short-stay fees" : fees.every(f=>f.verification==='area_estimate') ? "Estimated budget" : "Published fees"
          : "Ask the centre for the price"}
      </h3>
      {fees.length ? (
        fees.map((f, i) => (
          <div className="fee-line" key={i}>
            {f.programme && <span className="fee-programme">{f.programme}</span>}
            <strong>{feeLabel(f)}</strong>
            <p>{plainEvidence(f.conditions)}</p>
            <SourceDisclosure source={f.source} extra={<>
              {f.originalSource && f.originalSource !== f.source?.url && <a className="source-link" href={f.originalSource} target="_blank" rel="noreferrer">Original fee source <ArrowUpRight size={12} /></a>}
              {f.documentURL && <a className="source-link" href={f.documentURL} target="_blank" rel="noreferrer">Fee document <ArrowUpRight size={12} /></a>}
            </>} />
          </div>
        ))
      ) : (
        <p>We couldn’t find a published fee for this service.</p>
      )}
      {!c.available ? (
        <details className="fee-questions"><summary>Other fees to ask about</summary>
          <ul>{c.missing.map(item=><li key={item}>{item}</li>)}</ul>
          <p className="notice">{isShortCare(p) ? "Ask the centre for the full price of your visit, including the minimum stay and any extras." : "Ask which programme the fee is for, and which extras cost more."}</p>
        </details>
      ) : (
        <>
          <button className="secondary" onClick={() => setShow((x) => !x)}>
            {show ? "Hide calculation" : "Show estimated total"}
          </button>
          {show && (
            <div className="cost-calculation">
              <strong>
                {c.currency} {c.total.toFixed(2)}
              </strong>
              <p>
                Your time: {c.durationMinutes} minutes · charged: {c.chargedMinutes}{" "}
                minutes
                <br />
                Minimum {c.minimumMinutes} minutes · charged in steps of{" "}
                {c.roundingMinutes} minutes
                <br />
                {c.calculation}
              </p>
              <p>Included: {c.includedExtras.join(", ")}</p>
              <SourceLink source={c.source} />
              <p className="notice">{plainReason(c.notice)}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
const detailAgeLabel = p => (p.age?.rangeLabel ?? p.age?.wording ?? "Not listed").replace(/\s*\(controlled example\)/i, "").replace(/(\d+) years? to under (\d+) years?/i, "$1–under $2 years");
// Say exactly which part of the child's age group needs asking about.
const monthsLabel = n => n >= 12 && n % 12 === 0 ? `${n / 12} ${n === 12 ? "year" : "years"}` : `${n} ${n === 1 ? "month" : "months"}`;
function ageAdvice(p, request) {
  const a = p.age;
  if (!a || request.age === "" || request.age == null || a.basis === "type_reference" || a.alternative || a.min == null) return null;
  const [lo, hi] = ageBounds(request.age), min = a.min ?? 0, max = a.max ?? Infinity;
  const child = request.age === "0" ? "under 1 year" : `${String(request.age).replace("-", "–")} years`;
  const listed = `This centre lists ${detailAgeLabel(p)}`;
  if (lo < min) return `Your child is ${child} old. ${listed}, so ask first if your child is younger than ${monthsLabel(min)}.`;
  if (hi > max) return `Your child is ${child} old. ${listed}, so ask first if your child is ${monthsLabel(max)} or older.`;
  return null;
}
const checkReason = (c, p, request) => (c.id === "age" && c.state === "unknown" && ageAdvice(p, request)) || plainReason(c.reason);
const checkLabels = { care: "Care ends at", age: "Age", admission: "Care for a few hours", transport: "Centre pickup", coverage: "Pickup area", pickup: "Pickup time", transfer: "Arrival time" };
function checkValue(c, p, request) {
  switch (c.id) {
    case "care": return `${p.careEndTimeLabel ?? p.businessHoursLabel ?? "Hours not listed"} · you need ${request.end}`;
    case "age": return detailAgeLabel(p);
    case "admission": return p.admission?.value === true ? "Care for a few hours listed" : p.admission?.value === false ? "Care for a few hours not offered" : "Ask if they can take your child on this date";
    case "transport": return request.transport === "self" ? "You’ll bring your child" : p.transport?.exists === true ? "Pickup service listed" : p.transport?.exists === false ? "Centre pickup not offered" : "Pickup service not listed";
    case "coverage": return request.transport === "self" ? "Centre pickup not needed" : c.state === "supported" ? "Pickup from your starting point is listed" : c.state === "conflict" ? "Outside the listed pickup area" : "Ask if they can pick up from your starting point";
    case "pickup": return request.transport === "self" ? `You’ll leave with your child by ${request.deadline}` : `Leave your starting point by ${request.deadline}`;
    case "transfer": return p.driving?.state === "available" ? `About ${p.driving.minutes} min driving, plus time to drop off your child` : "Ask about driving and drop-off time";
    default: return c.label;
  }
}
function CareSchedule({ p }) {
  return <section className="centre-hours centre-section" aria-label="Care hours">
    <div className="centre-section-heading"><h3>Care hours</h3><span>{p.businessHoursDay}</span></div>
    {isShortCare(p) && <div className="care-day"><span>Care ends at</span><strong>{p.careEndTimeLabel ?? p.businessHoursLabel}</strong></div>}
    <SourceDisclosure source={p.careEndTimeSource ?? p.businessHours?.source}>Source</SourceDisclosure>
    {p.businessHours?.publishedSchedule && <div className="notice"><p>{plainEvidence(p.businessHours.publishedSchedule.notes)}</p><SourceDisclosure source={p.businessHours.publishedSchedule.source} /></div>}
    {p.businessHours?.alternative && <div className="notice"><p>{primaryHoursWin(p) ? "An older directory listing says" : "Another listing"}: {plainEvidence(p.businessHours.alternative.notes)}</p><SourceDisclosure source={p.businessHours.alternative.source}>Other source</SourceDisclosure></div>}
    <details className="weekly-hours"><summary>Closing time for each day</summary><dl>
      {(p.weeklyCareEndTimes ?? []).map(({ day, label, source }) => <div key={day} className={day === p.businessHoursDay ? "requested-day" : ""}><dt>{day}{day === p.businessHoursDay ? " · your visit" : ""}</dt><dd>{label}{source?.url && source.url !== p.businessHours?.source?.url && <SourceDisclosure source={source} />}</dd></div>)}
    </dl></details>
  </section>;
}
export function Details({ p, request, onAskReview, onCompare, compared, onShowOnMap }) {
  // Epic 7.5: a flag form opened from the photo viewer or the flag link.
  const [flagRequest, setFlagRequest] = useState(null);
  const openFlag = (item = "") => setFlagRequest({ item, at: Date.now() });
  const counts = p.fit.counts, badge = registrationBadge(p, todayKL());
  const fees = feeSummary(p);
  const shortCare = isShortCare(request);
  const date = shortCare ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(request.date + "T12:00:00+08:00")) : "Regular care";
  const care = p.fit.conditions.find(c => c.id === "care");
  // Same counting as the result cards: optional pickup checks and the arrival
  // time are not things the parent still needs to ask.
  const optionalPickup = c => c.state === "unknown" && request.transport !== "institution" && PICKUP_CHECKS.includes(c.id);
  const asks = p.fit.conditions.filter(c => c.state === "unknown" && !optionalPickup(c) && c.id !== "transfer").length;
  const status = counts.conflict
    ? { tone: "conflict", icon: <AlertTriangle size={16} aria-hidden="true" />, text: `${counts.conflict} ${counts.conflict === 1 ? "detail doesn’t" : "details don’t"} match your search` }
    : asks ? { tone: "unknown", icon: <HelpCircle size={16} aria-hidden="true" />, text: asks === 1 ? "1 thing to ask the centre" : `${asks} things to ask the centre` }
      : { tone: "supported", icon: <CheckCircle2 size={16} aria-hidden="true" />, text: "The listed details match your search" };
  return <div className="centre-details centre-profile">
    <div className="centre-hero">
    <div className="centre-hero-main">
    <div className="centre-identity"><span>{[categoryLabel(p), placeLine(p)].filter(Boolean).join(" · ")}</span><p><MapPin size={14} />{displayAddress(p.address) ?? "Exact address not listed"}</p></div>
    {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
    <div className="centre-search-line" aria-label="Your search">
      <div className="centre-search-text">
        {p.familyFor
          ? <p><strong>Two children</strong><span>{p.familyFor} · {date}</span></p>
          : <p><strong>Your search</strong><span>{shortCare ? `${date} · ${request.deadline}–${request.end}` : date}{request.pickup?.label ? ` · from ${request.pickup.label}` : ""}</span></p>}
        {!p.familyFor && <p className={`centre-search-status ${status.tone}`}>{status.icon}{status.text}{asks > 0 || counts.conflict ? <small>Compare shows the details and the questions to ask.</small> : null}</p>}
      </div>
      {onCompare && <button className={`centre-compare ${compared ? "secondary" : "primary"}`} aria-pressed={compared} onClick={onCompare}>
        {compared ? <Check size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />}{compared ? "Added to compare" : "Add to compare"}</button>}
    </div>
    </div>
    <div className="centre-hero-side">
      <Surroundings key={p.id} p={p} onFlag={openFlag} onShowOnMap={onShowOnMap} />
      {p.mode !== "demo" && <button type="button" className="text-link centre-flag-link" onClick={() => openFlag()}><Flag size={14} aria-hidden="true" />Something look wrong? Flag it</button>}
    </div>
    </div>
    {p.mode !== "demo" && <ArrivalFlags key={p.id} p={p} items={flagItems(p, surroundingImages(p))} request={flagRequest} onDone={() => setFlagRequest(null)} />}
    <dl className={`centre-metrics ${shortCare ? "" : "regular-metrics"}`} aria-label="Key information">
      {shortCare && <div className={care?.state === "conflict" ? "metric-conflict" : ""}><dt><Clock3 size={15} />Care ends at</dt><dd>{p.careEndTimeLabel ?? p.businessHoursLabel ?? "Not listed"}</dd><small>{p.businessHoursDay ?? "For your visit"}</small></div>}
      <div><dt><Users size={15} />Age</dt><dd>{detailAgeLabel(p)}</dd><small>{p.age?.basis === "type_reference" ? "Age guide for this centre type" : "Listed ages"}</small></div>
      <div><dt><Car size={15} />Drive</dt><dd>{p.driving?.state === "available" ? `About ${p.driving.minutes} min` : p.driving?.state === "loading" ? "Checking…" : "Ask the centre"}</dd><small>{p.driving?.state === "available" ? `${p.driving.distanceKm ? `${p.driving.distanceKm} km by road · ` : ""}without traffic` : p.driving?.state === "loading" ? "This takes a moment" : "Drive time not available"}</small></div>
      <div className="metric-fee"><dt><Wallet size={15} />Fee</dt><dd>{fees.label}</dd><small>{p.cost?.available ? `For ${request.deadline}–${request.end}` : p.careType === "short_term" ? fees.note : p.fees?.every(f=>f.verification==='area_estimate') && p.fees.length ? "Estimated from nearby centres" : "Ask what the fee includes"}</small></div>
    </dl>
    <div className="centre-layout profile-layout">
      <ReviewEvidence p={p} onAsk={onAskReview} defaultOpen askLabel="Add to my questions" />
      <div className="centre-profile-side">
        <details className="centre-fees extra-details" open><summary><Wallet size={18} aria-hidden="true" />Fees & extras<ChevronDown size={16} aria-hidden="true" /></summary><Costs p={p} /></details>
        <details className="centre-hours extra-details" open><summary><Clock3 size={18} aria-hidden="true" />Opening hours<ChevronDown size={16} aria-hidden="true" /></summary><CareSchedule p={p} /></details>
        <details className="centre-contact extra-details"><summary><Phone size={18} aria-hidden="true" />Phone & website<ChevronDown size={16} aria-hidden="true" /></summary><PublishedContacts p={p} compact />{p.sourcePage && <a className="centre-listing" href={p.sourcePage} target="_blank" rel="noreferrer">More about this centre <ArrowUpRight size={13} /></a>}</details>
      </div>
      <details className="centre-evidence" open={badge?.state === "attention"}><summary><div><strong>Registration & sources</strong><span>{badge ? `${badge.authority} · ${badge.number}${badge.state === "attention" ? " · needs checking" : ""}` : "Where these details come from"}</span></div><ChevronDown size={17} className="disclosure-chevron" /></summary>
        <Registration p={p} />
        <div className="centre-source-group"><h4>Address & travel</h4><p>{displayAddress(p.address) ?? "Exact address not listed"}</p><SourceLink source={p.addressSource} />{p.driving?.source && <SourceLink source={p.driving.source} />}{!p.location && <p className="notice">We don’t have a map address for this centre yet.</p>}</div>
        {p.transport?.source && <div className="centre-source-group"><h4>Pickup service</h4><p>{plainEvidence(p.transport.wording)}</p><SourceLink source={p.transport.source} /></div>}
        {(p.notes ?? []).map((n,i)=><p className="notice" key={i}>{plainEvidence(n)}</p>)}
      </details>
    </div>
  </div>;
}
