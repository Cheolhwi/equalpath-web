import { useId, useState } from "react";
import CareJourney from "./CareJourney.jsx";
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
} from "lucide-react";
import { todayKL, isShortCare } from "../shared/request.mjs";
import { drivingLabel, feeSummary, formatFee, feesForCare } from "../shared/result-summary.mjs";
import { registrationBadge } from "../shared/registration.mjs";
export function OrderingNote({ ordering, radius }) {
  if (!ordering) return null;
  const text = ordering.factor === "distance"
    ? ordering.pageSelection === "nearest"
      ? `Each page shows the next ${ordering.pageSize ?? 20} nearest centres${radius ? ` within ${radius} km` : ""}. Centres with conflicting details appear last.`
      : "Compare nearby options, with conflicting details last."
    : ordering.explanation;
  return <p>{text}</p>;
}
export function SourceLink({ source, children }) {
  if (!source)
    return (
      <span className="source-missing">No source listed</span>
    );
  return (
    <span className="source-link">
      {source.url ? (
        <a href={source.url} target="_blank" rel="noreferrer">
          {children ?? source.label}
          <ArrowUpRight size={12} />
        </a>
      ) : (
        <span>{source.label}</span>
      )}
      {source.retrievedAt && (
        <small>
          Retrieved {source.retrievedAt.slice(0, 10)}
          {source.sourceDate
            ? ` · Published ${source.sourceDate}`
            : " · Publication date not listed"}
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
              Website number · ask for this centre.
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
  return <div className="registration-badge-wrap" onKeyDown={e=>{
    if(e.key==='Escape' && open){e.stopPropagation();setOpen(false);e.currentTarget.querySelector('button').focus();}
  }}>
    <button className={`registration-badge ${badge.state}`} title={`${badge.label} · ${badge.number}`}
      aria-label={`${badge.label} for ${p.name}`} aria-expanded={open} aria-controls={id} onClick={()=>setOpen(!open)}>
      <Icon size={19} aria-hidden="true" />
    </button>
    {open && <div className="registration-popover" id={id} role="region" aria-label="Registration record">
      <strong>{badge.label}</strong><span>{badge.authority} · {badge.number}</span>
      <p>{badge.description}</p>
      <a href={badge.source.url} target="_blank" rel="noreferrer">View source <ArrowUpRight size={12} /></a>
    </div>}
  </div>;
}
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
}) {
  const fees = feeSummary(p);
  const revealRef = useCardReveal();
  return (
    <article
      ref={revealRef}
      style={{ "--card-delay": `${Math.min(index, 3) * 70}ms` }}
      className={`provider-row ${selected ? "selected" : ""} ${p.fit.counts.conflict ? "lower-priority" : ""} ${p.suggested ? "suggested" : ""}`}
      id={"card-" + p.id}
      data-provider-id={p.id}
    >
      <div className="provider-main" onClick={e=>{
        if(!e.target.closest('button, a, .registration-badge-wrap'))onSelect();
      }}>
        <div className="row-kicker">
          <span>
            {p.district || p.category}
          </span>

        </div>
        <div className="provider-heading">
          <button className="provider-select" aria-label={"Select " + p.name} aria-pressed={selected} onClick={onSelect}>
            <h3>{p.name}</h3>
          </button>
          <RegistrationBadge p={p} />
        </div>
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
          <strong>{fees.label}</strong>
        </div>
        <div className="row-status">
          {p.suggested && <span className="suggestion-tag"><Star size={12} fill="currentColor" />Suggested first</span>}
          <Status state={p.fit.counts.conflict ? "conflict" : "unknown"}>
            {p.fit.counts.conflict
              ? `${p.fit.counts.conflict} ${p.fit.counts.conflict === 1 ? "issue" : "issues"} to check`
              : "Ask the centre"}
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
          View centre <ArrowRight size={16} />
        </button>
      </div>
    </article>
  );
}
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
              : "Registration not yet verified";
  return (
    <section className="detail-section">
      <h3>{status}</h3>
      <dl className="facts-grid">
        <div>
          <dt>Published name</dt>
          <dd>{r.publishedName ?? p.registeredName}</dd>
        </div>
        <div>
          <dt>Authority / record</dt>
          <dd>
            {r.authority ? `${r.authority} · ` : ''}{r.number ?? "No matched record"}
          </dd>
        </div>
        <div>
          <dt>Recorded category</dt>
          <dd>{r.category ?? "Not included"}</dd>
        </div>
        <div>
          <dt>Recorded validity</dt>
          <dd>
            {r.from ?? "Not included"} → {r.until ?? "Not included"}
          </dd>
        </div>
      </dl>
      <p>
        {expired
          ? "This registration period has ended. Check with the centre whether it has been renewed."
          : r.matchBasis}
      </p>
      {r.missingImportedFields?.length > 0 && (
        <p className="notice">
          Postal address and telephone were not included in the JKM import.
          Contact and address shown here have separate sources.
        </p>
      )}
      {!r.official && !r.number && p.mode !== "demo" && (
        <p>
          We haven’t verified the official registration. This doesn’t mean
          the centre is unregistered.
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
      <div className="section-kicker">COST BREAKDOWN</div>
      <h3>
        {c.available
          ? "Estimate your cost"
          : fees.length
            ? p.careType==='short_term' ? "Short-stay fees" : fees.every(f=>f.verification==='area_estimate') ? "Estimated budget" : "Published fees"
          : "Ask the centre for a quote"}
      </h3>
      {fees.length ? (
        fees.map((f, i) => (
          <div className="fee-line" key={i}>
            {f.programme && <span className="fee-programme">{f.programme}</span>}
            <strong>{feeLabel(f)}</strong>
            <p>{f.conditions}</p>
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
        <details className="fee-questions"><summary>{isShortCare(p) ? "Check one-off fees & extras" : "Check programme fees & extras"}</summary>
          <ul>{c.missing.map(item=><li key={item}>{item}</li>)}</ul>
          <p className="notice">{isShortCare(p) ? "Ask for a quote for your visit, including the minimum stay and any extras." : "Check which programme the fee covers and which extras are charged separately."}</p>
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
                {c.durationMinutes} requested minutes · {c.chargedMinutes}{" "}
                chargeable minutes
                <br />
                Minimum {c.minimumMinutes} minutes · rounded to{" "}
                {c.roundingMinutes} minutes
                <br />
                {c.calculation}
              </p>
              <p>Included: {c.includedExtras.join(", ")}</p>
              <SourceLink source={c.source} />
              <p className="notice">{c.notice}</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}
const detailAgeLabel = p => (p.age?.rangeLabel ?? p.age?.wording ?? "Not listed").replace(/\s*\(controlled example\)/i, "").replace(/(\d+) years? to under (\d+) years?/i, "$1–under $2 years");
const checkLabels = { care: "Care ends at", age: "Age", admission: "Care for a few hours", transport: "Centre pickup", coverage: "Pickup area", pickup: "Pickup time", transfer: "Travel time" };
function checkValue(c, p, request) {
  switch (c.id) {
    case "care": return `${p.careEndTimeLabel ?? p.businessHoursLabel ?? "Hours not listed"} · you need ${request.end}`;
    case "age": return detailAgeLabel(p);
    case "admission": return p.admission?.value === true ? "Care for a few hours listed" : p.admission?.value === false ? "Care for a few hours not offered" : "Ask if they can take your child on this date";
    case "transport": return request.transport === "self" ? "You’ll handle pickup" : p.transport?.exists === true ? "Pickup service listed" : p.transport?.exists === false ? "Centre pickup not offered" : "Pickup service not listed";
    case "coverage": return request.transport === "self" ? "Centre pickup not needed" : c.state === "supported" ? "Pickup from your address is listed" : c.state === "conflict" ? "Outside the listed pickup area" : "Ask if they can pick up from your address";
    case "pickup": return request.transport === "self" ? `You’ll handle pickup by ${request.deadline}` : `Leave pickup address by ${request.deadline}`;
    case "transfer": return p.driving?.state === "available" ? `About ${p.driving.minutes} min driving, plus time to drop off your child` : "Ask about driving and drop-off time";
    default: return c.label;
  }
}
function CareSchedule({ p }) {
  return <section className="centre-hours centre-section" aria-label="Care hours">
    <div className="centre-section-heading"><h3>Care hours</h3><span>{p.businessHoursDay}</span></div>
    {isShortCare(p) && <div className="care-day"><span>Care ends at</span><strong>{p.careEndTimeLabel ?? p.businessHoursLabel}</strong></div>}
    <SourceDisclosure source={p.careEndTimeSource ?? p.businessHours?.source}>Care schedule source</SourceDisclosure>
    {p.businessHours?.publishedSchedule && <div className="notice"><p>{p.businessHours.publishedSchedule.notes}</p><SourceDisclosure source={p.businessHours.publishedSchedule.source} /></div>}
    {p.businessHours?.alternative && <div className="notice"><p>Another listing: {p.businessHours.alternative.notes}</p><SourceDisclosure source={p.businessHours.alternative.source}>Additional care schedule source</SourceDisclosure></div>}
    <details className="weekly-hours"><summary>View weekly care end times</summary><dl>
      {(p.weeklyCareEndTimes ?? []).map(({ day, label, source }) => <div key={day} className={day === p.businessHoursDay ? "requested-day" : ""}><dt>{day}{day === p.businessHoursDay ? " · your visit" : ""}</dt><dd>{label}{source?.url && source.url !== p.businessHours?.source?.url && <SourceDisclosure source={source} />}</dd></div>)}
    </dl></details>
  </section>;
}
export function Details({ p, request, onPrepare, onCompare, compared, onSave, saved, onPreparation }) {
  const counts = p.fit.counts, fees = feeSummary(p), badge = registrationBadge(p, todayKL());
  const shortCare = isShortCare(request);
  const date = shortCare ? new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(request.date + "T12:00:00+08:00")) : "Long term";
  const checks = [...p.fit.conditions].sort((a, b) => ({conflict:0,unknown:1,supported:2,reference:3}[a.state] - {conflict:0,unknown:1,supported:2,reference:3}[b.state]));
  const care = p.fit.conditions.find(c => c.id === "care");
  const renderCheck = c => <details key={c.id} className={`fit-check ${c.state}`} data-condition-id={c.id} open={c.state === "conflict"}>
    <summary><div><strong>{checkLabels[c.id] ?? c.label}</strong>{c.state === "conflict" && <span>{checkValue(c,p,request)}</span>}</div><Status state={c.state}>{c.statusLabel}</Status><ChevronDown size={15} className="disclosure-chevron" /></summary>
    <div className="fit-check-explanation"><p>{c.reason}</p><SourceDisclosure source={c.source} extra={c.id === "age" && p.age?.alternative ? <SourceLink source={p.age.alternative.source} /> : null} /></div>
  </details>;
  return <div className="centre-details">
    <div className="centre-identity"><span>{p.category} · {p.district}, {p.region}</span><p><MapPin size={14} />{p.address ?? "Exact address not listed"}</p></div>
    {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
    <details className="centre-request" aria-label="Your visit">
      <summary>Your search · {date}<ChevronDown size={16} aria-hidden="true" /></summary>
      <p><MapPin size={13} /><span>From {request.pickup.label}</span></p>
      {shortCare && <CareJourney request={request} centreName={p.name} />}
    </details>
    <dl className={`centre-metrics ${shortCare ? "" : "regular-metrics"}`} aria-label="Key information">
      {shortCare && <div className={care?.state === "conflict" ? "metric-conflict" : ""}><dt><Clock3 size={15} />Care ends at</dt><dd>{p.careEndTimeLabel ?? p.businessHoursLabel ?? "Not listed"}</dd><small>{p.businessHoursDay ?? "For your visit"}</small></div>}
      <div><dt><Users size={15} />Age</dt><dd>{detailAgeLabel(p)}</dd><small>{p.age?.basis === "type_reference" ? "Age guide for this centre type" : "Listed ages"}</small></div>
      <div><dt><Car size={15} />Drive</dt><dd>{p.driving?.state === "available" ? `About ${p.driving.minutes} min` : "Ask the centre"}</dd><small>{p.driving?.state === "available" ? `${p.driving.distanceKm} km by road · no live traffic` : "Travel time couldn’t be checked"}</small></div>
      <div className="metric-fee"><dt><Wallet size={15} />Fee</dt><dd>{fees.label}</dd><small>{p.cost?.available ? "For your selected care hours" : p.careType === "short_term" ? fees.note : p.fees?.every(f=>f.verification==='area_estimate') && p.fees.length ? "Estimated from nearby centres" : "Check what the fee includes"}</small></div>
    </dl>
    <div className="centre-layout">
      <section className="centre-fit centre-section" aria-label="Your care needs">
        <div className="centre-section-heading"><h3>Before you choose</h3><span className="check-totals"><CheckCircle2 size={15} aria-hidden="true" />{counts.supported} match <HelpCircle size={15} aria-hidden="true" />{counts.unknown} to ask</span></div>
        <div className={`fit-verdict ${counts.conflict ? "conflict" : counts.unknown ? "unknown" : "supported"}`}>
          {counts.conflict ? <AlertTriangle size={19} /> : counts.unknown ? <HelpCircle size={19} /> : <CheckCircle2 size={19} />}
          <div><strong>{counts.conflict ? `${counts.conflict} ${counts.conflict === 1 ? "detail doesn’t" : "details don’t"} match` : counts.unknown ? "Ask the centre before you decide" : "The listed details match your request"}</strong><p>{counts.conflict ? "Check the issues below before arranging care." : shortCare ? "Ask if they can take your child on your date." : "Ask if your child can join."}</p></div>
        </div>
        <div className="fit-checks condition-list">{checks.filter(c => c.state === "conflict").map(renderCheck)}
          {checks.some(c => c.state === "unknown") && <details className="unknown-checks"><summary><HelpCircle size={17} aria-hidden="true" />{counts.unknown} things to ask about<ChevronDown size={15} aria-hidden="true" /></summary>{checks.filter(c => c.state === "unknown").map(renderCheck)}</details>}
          {checks.some(c => c.state === "supported" || c.state === "reference") && <details className="matched-checks"><summary><CheckCircle2 size={17} aria-hidden="true" />More details<ChevronDown size={15} aria-hidden="true" /></summary>{checks.filter(c => c.state === "supported" || c.state === "reference").map(renderCheck)}</details>}
        </div>
      </section>
      <aside className="centre-next" aria-label="Contact and next steps">
        <div className="centre-next-card"><h3>Next step</h3><p>Ask if your child can come.</p>
          <button className="primary" onClick={onPrepare}>Contact the centre <ArrowRight size={16} /></button>
          <div className="centre-shortlist"><button className="secondary" aria-pressed={compared} onClick={onCompare}>{compared ? <Check size={15} /> : <Plus size={15} />}Compare</button><button className="secondary" aria-pressed={saved} onClick={onSave}><Bookmark size={15} />{saved ? "Saved centre" : "Save centre"}</button></div>
          <details className="centre-contact"><summary>Phone & website<ChevronDown size={16} aria-hidden="true" /></summary><PublishedContacts p={p} compact />{p.sourcePage && <a className="centre-listing" href={p.sourcePage} target="_blank" rel="noreferrer">More about this centre <ArrowUpRight size={13} /></a>}</details>
          <div className="centre-preparation"><h4>After the centre says yes</h4><button onClick={onPreparation}><ClipboardList size={15} />Get ready for child care<ArrowRight size={14} /></button></div>
        </div>
      </aside>
      <details className="centre-fees extra-details"><summary><Wallet size={18} aria-hidden="true" />Fees & extras<ChevronDown size={16} aria-hidden="true" /></summary><Costs p={p} /></details>
      <details className="centre-hours extra-details"><summary><Clock3 size={18} aria-hidden="true" />Weekly opening hours<ChevronDown size={16} aria-hidden="true" /></summary><CareSchedule p={p} /></details>
      <details className="centre-evidence" open={badge?.state === "attention"}><summary><div><strong>Registration & sources</strong><span>{badge ? `${badge.authority} · ${badge.number}${badge.state === "attention" ? " · needs checking" : ""}` : "Where these details come from"}</span></div><ChevronDown size={17} className="disclosure-chevron" /></summary>
        <Registration p={p} />
        <div className="centre-source-group"><h4>Address & travel</h4><p>{p.address ?? "Exact address not listed"}</p><SourceLink source={p.addressSource} />{p.driving?.source && <SourceLink source={p.driving.source} />}{!p.location && <p className="notice">We don’t have a map address for this centre yet.</p>}</div>
        {p.transport?.source && <div className="centre-source-group"><h4>Pickup service</h4><p>{p.transport.wording}</p><SourceLink source={p.transport.source} /></div>}
        {(p.notes ?? []).map((n,i)=><p className="notice" key={i}>{n}</p>)}
      </details>
    </div>
  </div>;
}
