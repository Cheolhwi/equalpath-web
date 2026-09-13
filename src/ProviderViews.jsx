import { useId, useState } from "react";
import {
  Bookmark,
  ClipboardList,
  ArrowRight,
  ArrowUpRight,
  Check,
  Copy,
  Phone,
  MessageCircle,
  Plus,
  CheckCircle2,
  HelpCircle,
  AlertTriangle,
  Star,
  ChevronUp,
  ChevronDown,
  BadgeCheck,
  MapPin,
  Clock3,
  Car,
  Users,
  Wallet,
} from "lucide-react";
import { requestCaption, todayKL } from "../shared/request.mjs";
import { drivingLabel, feeSummary, formatFee } from "../shared/result-summary.mjs";
import { bestForPriority } from "../shared/conditions.mjs";
import { registrationBadge } from "../shared/registration.mjs";
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
export function PublishedContacts({ p, compact = false }) {
  const ContactSource = compact ? SourceDisclosure : SourceLink;
  return (
    <>
      {p.phone && (
        <div className="published-contact">
          <div className="call-link" aria-label="Institution phone">
            <Phone size={19} />
            {p.phone.display}
          </div>
          <ContactSource source={p.phone.source} />
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
          <ContactSource source={contact.source} />
          {contact.scope === "website" && (
            <small className="notice">
              General enquiry number; may cover more than one branch.
            </small>
          )}
        </div>
      ))}
      {!p.phone && !p.whatsapp?.length && (
        <p>
          We couldn’t find a contact number for this branch. Check its
          listing for other ways to get in touch.
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
  return (
    <article
      className={`provider-row ${selected ? "selected" : ""} ${p.fit.counts.conflict ? "lower-priority" : ""} ${p.suggested ? "suggested" : ""}`}
      id={"card-" + p.id}
      data-provider-id={p.id}
    >
      <div className="provider-main" onClick={e=>{
        if(!e.target.closest('button, a, .registration-badge-wrap'))onSelect();
      }}>
        <div className="row-kicker">
          <span>
            {String(index + 1).padStart(2, "0")} / {p.category}
          </span>
          <span>
            {p.driving?.state === "available"
              ? `${p.driving.distanceKm} km by road`
              : "Distance unavailable"}
          </span>
        </div>
        <div className="provider-heading">
          <button className="provider-select" aria-label={"Select " + p.name} aria-pressed={selected} onClick={onSelect}>
            <h3>{p.name}</h3>
          </button>
          <RegistrationBadge p={p} />
        </div>
        <div className="row-facts">
          <span>Age</span>
          <strong>{p.age?.rangeLabel ?? p.age?.wording ?? "Not listed"}</strong>
        </div>
        <div className="row-facts">
          <span>Drive from pickup</span>
          <strong>{drivingLabel(p.driving)}</strong>
        </div>
        <div className="row-facts">
          <span>Fee</span>
          <strong>{fees.label}</strong>
        </div>
        <div className="row-status">
          {p.suggested && <span className="suggestion-tag"><Star size={12} fill="currentColor" />Suggested first</span>}
          <Status state={p.fit.counts.conflict ? "conflict" : "unknown"}>
            {p.fit.counts.conflict
              ? `${p.fit.counts.conflict} ${p.fit.counts.conflict === 1 ? "detail doesn’t" : "details don’t"} match`
              : `${p.fit.counts.unknown} ${p.fit.counts.unknown === 1 ? "detail" : "details"} to confirm`}
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
          View details <ArrowUpRight size={16} />
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
            {r.authority} · {r.number ?? "No matched record"}
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
    c = p.cost;
  return (
    <section className="detail-section">
      <div className="section-kicker">COST BREAKDOWN</div>
      <h3>
        {c.available
          ? "Estimate your cost"
          : p.fees.length
            ? p.fees.every(f=>f.verification==='area_estimate') ? "Estimated budget" : "Published fees"
          : "Ask about the cost for your date"}
      </h3>
      {p.fees.length ? (
        p.fees.map((f, i) => (
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
        <details className="fee-questions"><summary>Check one-off fees & extras</summary>
          <ul>{c.missing.map(item=><li key={item}>{item}</li>)}</ul>
          <p className="notice">Ask for a quote for your date. Monthly fees don’t give a one-off care total.</p>
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
const detailAgeLabel = p => (p.age?.rangeLabel ?? p.age?.wording ?? "Not listed").replace(/\s*\(controlled example\)/i, "");
const checkLabels = { care: "Care end time", age: "Age", admission: "Temporary care", transport: "Centre pickup", coverage: "Pickup area", pickup: "Collection time", transfer: "Travel & handover" };
function checkValue(c, p, request) {
  switch (c.id) {
    case "care": return `${p.careEndTimeLabel ?? p.businessHoursLabel ?? "Hours not listed"} · you need ${request.end}`;
    case "age": return detailAgeLabel(p);
    case "admission": return p.admission?.value === true ? "One-off care listed" : p.admission?.value === false ? "One-off care not offered" : "Ask about a place for this date";
    case "transport": return request.transport === "self" ? "You’ll arrange delivery" : p.transport?.exists === true ? "Pickup service listed" : p.transport?.exists === false ? "Centre pickup not offered" : "Pickup service not listed";
    case "coverage": return request.transport === "self" ? "Centre pickup not needed" : c.state === "supported" ? "Your pickup place is covered" : c.state === "conflict" ? "Outside the listed pickup area" : "Confirm coverage of your pickup place";
    case "pickup": return request.transport === "self" ? `You’ll arrange collection by ${request.deadline}` : `Collection needed by ${request.deadline}`;
    case "transfer": return p.driving?.state === "available" ? `About ${p.driving.minutes} min driving + handover time` : "Confirm travel and handover time";
    default: return c.label;
  }
}
function CareSchedule({ p }) {
  return <section className="centre-hours centre-section" aria-label="Care hours">
    <div className="centre-section-heading"><h3>Care hours</h3><span>{p.businessHoursDay}</span></div>
    <div className="care-day"><span>Care ends at</span><strong>{p.careEndTimeLabel ?? p.businessHoursLabel}</strong></div>
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
  const date = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kuala_Lumpur" }).format(new Date(request.date + "T12:00:00+08:00"));
  const checks = [...p.fit.conditions].sort((a, b) => ({conflict:0,unknown:1,supported:2,reference:3}[a.state] - {conflict:0,unknown:1,supported:2,reference:3}[b.state]));
  const care = p.fit.conditions.find(c => c.id === "care");
  return <div className="centre-details">
    <div className="centre-identity"><span>{p.category} · {p.district}, {p.region}</span><p><MapPin size={14} />{p.address ?? "Exact address not listed"}</p></div>
    {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
    <div className="centre-request" aria-label="Your visit">
      <div><span>Your visit</span><strong>{date}</strong></div>
      <div><span>Collect by</span><strong>{request.deadline}</strong></div>
      <ArrowRight size={16} aria-hidden="true" />
      <div><span>Care until</span><strong>{request.end}</strong></div>
      <p><MapPin size={13} /><span>From {request.pickup.label}</span></p>
    </div>
    <dl className="centre-metrics" aria-label="Key information">
      <div className={care?.state === "conflict" ? "metric-conflict" : ""}><dt><Clock3 size={15} />Care end time</dt><dd>{p.careEndTimeLabel ?? p.businessHoursLabel ?? "Not listed"}</dd><small>{p.businessHoursDay ?? "For your visit"}</small></div>
      <div><dt><Users size={15} />Age</dt><dd>{detailAgeLabel(p)}</dd><small>{p.age?.basis === "type_reference" ? "Official type range" : "Published age range"}</small></div>
      <div><dt><Car size={15} />Drive from pickup</dt><dd>{p.driving?.state === "available" ? `About ${p.driving.minutes} min` : "Unavailable"}</dd><small>{p.driving?.state === "available" ? `${p.driving.distanceKm} km by road · no live traffic` : "Travel time couldn’t be checked"}</small></div>
      <div className="metric-fee"><dt><Wallet size={15} />Fee</dt><dd>{fees.label}</dd><small>{p.cost?.available ? "For your selected care hours" : p.fees?.every(f=>f.verification==='area_estimate') && p.fees.length ? "Area budget reference" : "Check the programme and extras"}</small></div>
    </dl>
    <div className="centre-layout">
      <section className="centre-fit centre-section" aria-label="Your care needs">
        <div className="centre-section-heading"><h3>Your care needs</h3><span>{counts.supported} match · {counts.unknown} to check</span></div>
        <div className={`fit-verdict ${counts.conflict ? "conflict" : counts.unknown ? "unknown" : "supported"}`}>
          {counts.conflict ? <AlertTriangle size={19} /> : counts.unknown ? <HelpCircle size={19} /> : <CheckCircle2 size={19} />}
          <div><strong>{counts.conflict ? `${counts.conflict} ${counts.conflict === 1 ? "detail doesn’t" : "details don’t"} match` : counts.unknown ? "Check a few details with the centre" : "The listed details match your request"}</strong><p>{counts.conflict ? "Review these differences before you choose." : "Ask the centre to confirm a place for your date."}</p></div>
        </div>
        <div className="fit-checks condition-list">{checks.map(c=><details key={c.id} className={`fit-check ${c.state}`} data-condition-id={c.id} open={c.state === "conflict"}>
          <summary><div><strong>{checkLabels[c.id] ?? c.label}</strong><span>{checkValue(c,p,request)}</span></div><Status state={c.state}>{c.statusLabel}</Status><ChevronDown size={15} className="disclosure-chevron" /></summary>
          <div className="fit-check-explanation"><p>{c.reason}</p><SourceDisclosure source={c.source} extra={c.id === "age" && p.age?.alternative ? <SourceLink source={p.age.alternative.source} /> : null} /></div>
        </details>)}</div>
      </section>
      <aside className="centre-next" aria-label="Contact and next steps">
        <div className="centre-next-card"><span className="section-kicker">NEXT STEP</span><h3>Ask about a place</h3><p>Prepare what to ask for your date and care hours.</p>
          <button className="primary" onClick={onPrepare}>Prepare questions <ArrowRight size={16} /></button>
          <div className="centre-shortlist"><button className="secondary" aria-pressed={compared} onClick={onCompare}>{compared ? <Check size={15} /> : <Plus size={15} />}Compare</button><button className="secondary" aria-pressed={saved} onClick={onSave}><Bookmark size={15} />{saved ? "Saved centre" : "Save centre"}</button></div>
          <div className="centre-contact"><h4>Contact the centre</h4><PublishedContacts p={p} compact />{p.sourcePage && <a className="centre-listing" href={p.sourcePage} target="_blank" rel="noreferrer">View centre listing <ArrowUpRight size={13} /></a>}</div>
          <div className="centre-preparation"><h4>After you’ve spoken</h4><p>Get your pickup and handover checklist ready.</p><button onClick={onPreparation}><ClipboardList size={15} />Create preparation sheet<ArrowRight size={14} /></button></div>
        </div>
      </aside>
      <div className="centre-fees"><Costs p={p} /></div>
      <CareSchedule p={p} />
      <details className="centre-evidence" open={badge?.state === "attention"}><summary><div><strong>Registration & sources</strong><span>{badge ? `${badge.authority} · ${badge.number}${badge.state === "attention" ? " · needs checking" : ""}` : "Where these details come from"}</span></div><ChevronDown size={17} className="disclosure-chevron" /></summary>
        <Registration p={p} />
        <div className="centre-source-group"><h4>Address & travel</h4><p>{p.address ?? "Exact address not listed"}</p><SourceLink source={p.addressSource} />{p.driving?.source && <SourceLink source={p.driving.source} />}{!p.location && <p className="notice">We can’t place this centre on the map yet.</p>}</div>
        {p.transport?.source && <div className="centre-source-group"><h4>Pickup service</h4><p>{p.transport.wording}</p><SourceLink source={p.transport.source} /></div>}
        {(p.notes ?? []).map((n,i)=><p className="notice" key={i}>{n}</p>)}
      </details>
    </div>
  </div>;
}
export function Comparison({
  items,
  onRemove,
  onPrepare,
  sort,
  onSort,
  ordering,
  date,
}) {
  const best=bestForPriority(items,sort,date);
  const rows = [
    [
      "Temporary admission",
      (p) => p.fit.conditions.find((c) => c.id === "admission"),
    ],
    ["Age", (p) => p.fit.conditions.find((c) => c.id === "age")],
    [
      "Centre pickup",
      (p) => p.fit.conditions.find((c) => c.id === "transport"),
    ],
    [
      "Pickup coverage",
      (p) => p.fit.conditions.find((c) => c.id === "coverage"),
    ],
    [
      "Collection deadline",
      (p) => p.fit.conditions.find((c) => c.id === "pickup"),
    ],
    ["Care end", (p) => p.fit.conditions.find((c) => c.id === "care")],
    [
      "Transfer / arrival",
      (p) => p.fit.conditions.find((c) => c.id === "transfer"),
    ],
  ];
  return (
    <>
      <p className="dialog-lead">
        Compare care hours, pickup options and fees for the date you chose.
      </p>
      <div className="compare-sort">
        <label>
          Sort by{" "}
          <select
            aria-label="Comparison priority"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
          >
            {[
              ["distance", "Nearest (straight-line)"],
              ["price", "Lowest monthly fee"],
              ["closing", "Later care end time"],
              ["pickup", "Centres with pickup"],
              ["name", "Centre name"],
            ].map(([id, label]) => (
              <option
                value={id}
                key={id}
                disabled={ordering?.available[id] === false}
              >
                {label}
                {ordering?.available[id] === false
                  ? " — facts unavailable"
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <p>{ordering?.explanation}</p>
        <p className="comparison-priority-message" role="status">{best.message}</p>
      </div>
      <div className="comparison-scroll">
        <table>
          <colgroup><col />{items.map(p=><col key={p.id} className={best.ids.includes(p.id) ? "comparison-best-column" : undefined} />)}</colgroup>
          <thead>
            <tr>
              <th>YOUR CARE NEEDS</th>
              {items.map((p) => (
                <th key={p.id} data-provider-id={p.id} className={best.ids.includes(p.id) ? "comparison-best" : undefined}>
                  <button
                    className="remove-compare"
                    aria-label={"Remove " + p.name + " from comparison"}
                    onClick={() => onRemove(p.id)}
                  >
                    Remove
                  </button>
                  {best.ids.includes(p.id) && <span className="comparison-best-tag"><Star size={12} fill="currentColor" />{best.label}</span>}
                  <h3>{p.name}</h3>
                  <small>
                    {p.district} · {p.region}
                  </small>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map(([label, get]) => (
              <tr key={label}>
                <th>{label}</th>
                {items.map((p) => {
                  const c = get(p);
                  return (
                    <td key={p.id}>
                      <Status state={c.state}>{c.statusLabel}</Status>
                      <p>{c.reason}</p>
                      <SourceLink source={c.source} />
                    </td>
                  );
                })}
              </tr>
            ))}
            <tr>
              <th>Drive from pickup</th>
              {items.map(p => <td key={p.id}>{drivingLabel(p.driving)}{p.driving?.state === "available" && <p>{p.driving.distanceKm} km by road · no live traffic</p>}</td>)}
            </tr>
            <tr>
              <th>Location</th>
              {items.map((p) => (
                <td key={p.id}>
                  {p.distanceKm == null
                    ? "Coordinates unavailable"
                    : `${p.distanceKm.toFixed(1)} km straight-line`}
                  <p>{p.address}</p>
                </td>
              ))}
            </tr>
            <tr>
              <th>Care end time</th>
              {items.map((p) => (
                <td key={p.id}>
                  {p.careEndTimeLabel ?? p.businessHoursLabel}
                  <p>Used for the care end check.</p>
                </td>
              ))}
            </tr>
            <tr>
              <th>Registration</th>
              {items.map((p) => (
                <td key={p.id}>
                  {p.registration.authority} ·{" "}
                  {p.registration.number ?? "Not matched"}
                  <p>
                    {p.registration.until && p.registration.until < todayKL()
                      ? "Recorded term ended; renewal unknown"
                      : p.mode === "demo"
                        ? "Demo centre"
                        : p.registration.official
                          ? "Registration record matched"
                          : p.registration.authority === "KPM" && p.registration.number
                            ? "KPM code listed by CariSchool"
                          : "Registration not yet verified"}
                  </p>
                  <SourceLink source={p.registration.source} />
                </td>
              ))}
            </tr>
            <tr>
              <th>Published fees</th>
              {items.map((p) => (
                <td key={p.id}>
                  {p.fees.length
                    ? p.fees.map((f, i) => (
                        <div key={i}>
                          <strong>{feeLabel(f)}</strong>
                          <p>{f.conditions}</p>
                          <SourceLink source={f.source} />
                        </div>
                      ))
                    : "No published rate"}
                  <p>
                    {p.cost.available
                      ? "View details for a cost estimate."
                      : "Ask the centre about: " +
                        p.cost.missing.join("; ") +
                        "."}
                  </p>
                </td>
              ))}
            </tr>
          </tbody>
          <tfoot>
            <tr>
              <th>NEXT STEP</th>
              {items.map((p) => (
                <td key={p.id}>
                  <button className="primary" onClick={() => onPrepare(p)}>
                    Prepare questions <ArrowRight size={15} />
                  </button>
                </td>
              ))}
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );
}
export function Enquiry({ p, request, selection, onSelection, onCompare }) {
  const [copyState, setCopyState] = useState(""),
    q = p.enquiries,
    ids = selection ?? q.map((x) => x.id),
    selected = ids.map((id) => q.find((x) => x.id === id)).filter(Boolean);
  const context = `Questions for ${p.name}\n${requestCaption(request)}\nAge: ${request.age === "" ? "not specified" : request.age === "0" ? "under 1 year" : request.age + " years"} · ${request.transport === "self" ? "I’ll arrange transport" : request.transport === "institution" ? "Centre pickup requested" : "Transport not specified"}`;
  const text =
    context +
    "\n\n" +
    selected.map((x, i) => `${i + 1}. ${x.text}`).join("\n") +
    "\n\nCould you let me know whether you can accommodate this? Thank you.";
  const toggle = (id) => {
    onSelection(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]);
    setCopyState("");
  };
  const move = (id, delta) => {
    const next = [...ids],
      i = next.indexOf(id),
      j = i + delta;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    onSelection(next);
    setCopyState("");
  };
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopyState("copied");
    } catch {
      setCopyState("manual");
    }
  };
  return (
    <>
      <p className="dialog-lead">
        Choose the questions you want to ask, then copy them for your call or message.
      </p>
      <div className="request-context">
        <strong>{p.name}</strong>
        <p>{requestCaption(request)}</p>
        <small>
          Age{" "}
          {request.age === ""
            ? "unspecified"
            : request.age === "0"
              ? "under 1"
              : request.age}{" "}
          ·{" "}
          {request.transport === "self"
            ? "I’ll arrange transport"
            : request.transport === "institution"
              ? "Centre pickup"
              : "Pickup not specified"}
        </small>
      </div>
      <div className="question-list">
        {[...selected, ...q.filter((x) => !ids.includes(x.id))].map((x) => (
          <div className="question" key={x.id}>
            <label>
              <input
                type="checkbox"
                checked={ids.includes(x.id)}
                onChange={() => toggle(x.id)}
              />
              <span>{x.text}</span>
            </label>
            {ids.includes(x.id) && (
              <div>
                <button
                  aria-label={"Move " + x.id + " question up"}
                  disabled={ids.indexOf(x.id) === 0}
                  onClick={() => move(x.id, -1)}
                >
                  <ChevronUp size={15} />
                </button>
                <button
                  aria-label={"Move " + x.id + " question down"}
                  disabled={ids.indexOf(x.id) === ids.length - 1}
                  onClick={() => move(x.id, 1)}
                >
                  <ChevronDown size={15} />
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      <div className="enquiry-actions">
        <button className="primary" disabled={!selected.length} onClick={copy}>
          <Copy size={16} />
          {copyState === "copied" ? "Questions copied" : "Copy questions"}
        </button>
        <span role="status">
          {copyState === "copied"
            ? "Copied with the centre name, date and times."
            : !selected.length
              ? "Select at least one question."
              : ""}
        </span>
      </div>
      {copyState === "manual" && (
        <div className="manual-copy">
          <p>
            Clipboard access is unavailable. Select and copy the text below.
          </p>
          <textarea
            readOnly
            aria-label="Questions to copy"
            value={text}
            onFocus={(e) => e.target.select()}
          />
        </div>
      )}
      <section className="contact-panel">
        <div className="section-kicker">CONTACT WHEN YOU ARE READY</div>
        <PublishedContacts p={p} />
        {p.sourcePage && (
          <a
            className="text-link"
            href={p.sourcePage}
            target="_blank"
            rel="noreferrer"
          >
            View the centre’s listing <ArrowUpRight size={15} />
          </a>
        )}
        {p.mode === "demo" && (
          <p>Demo centres have no real contact details.</p>
        )}
        <p className="notice">
          Call the number or open WhatsApp when you’re ready. You’ll need
          to agree the arrangement with the centre directly; this page doesn’t
          make a booking.
        </p>
      </section>
      <button className="text-link" onClick={onCompare}>
        Compare centres <ArrowRight size={16} />
      </button>
    </>
  );
}
