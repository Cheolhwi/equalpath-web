import { useState } from "react";
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
  ChevronUp,
  ChevronDown,
} from "lucide-react";
import { requestCaption, todayKL } from "../shared/request.mjs";
export function SourceLink({ source, children }) {
  if (!source)
    return (
      <span className="source-missing">No applicable published source</span>
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
            ? ` · Source date ${source.sourceDate}`
            : " · Source date unavailable"}
        </small>
      )}
    </span>
  );
}
export function PublishedContacts({ p }) {
  return (
    <>
      {p.phone && (
        <div className="published-contact">
          <div className="call-link" aria-label="Institution phone">
            <Phone size={19} />
            {p.phone.display}
          </div>
          <SourceLink source={p.phone.source} />
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
          <SourceLink source={contact.source} />
          {contact.scope === "website" && (
            <small className="notice">
              Website enquiry number — may serve multiple branches.
            </small>
          )}
        </div>
      ))}
      {!p.phone && !p.whatsapp?.length && (
        <p>
          No published contact number is available for this branch. Check the
          institution source page.
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
            ? "Supported"
            : state === "conflict"
              ? "Conflict"
              : "Needs confirmation")}
    </span>
  );
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
  return (
    <article
      className={`provider-row ${selected ? "selected" : ""}`}
      id={"card-" + p.id}
      data-provider-id={p.id}
    >
      <button
        className="provider-main"
        aria-label={"Select " + p.name}
        aria-pressed={selected}
        onClick={onSelect}
      >
        <div className="row-kicker">
          <span>
            {String(index + 1).padStart(2, "0")} / {p.category}
          </span>
          <span>
            {p.distanceKm == null
              ? "Location incomplete"
              : `${p.distanceKm.toFixed(1)} km · straight-line`}
          </span>
        </div>
        <h3>{p.name}</h3>
        <p>
          {p.district} · {p.region}
        </p>
        <div className="row-facts">
          <span>
            {p.businessHoursDay
              ? `Care end time · ${p.businessHoursDay}`
              : "Care end time"}
          </span>
          <strong>{p.careEndTimeLabel ?? p.businessHoursLabel}</strong>
        </div>
        {p.age && (
          <div className="row-facts">
            <span>
              {p.age.basis === "type_reference"
                ? "Age · type reference"
                : "Admission age"}
            </span>
            <strong>{p.age.rangeLabel ?? p.age.wording}</strong>
          </div>
        )}
        <div className="row-status">
          <Status state={p.fit.counts.conflict ? "conflict" : "unknown"}>
            {p.fit.counts.conflict
              ? `${p.fit.counts.conflict} conflicting condition${p.fit.counts.conflict === 1 ? "" : "s"}`
              : `${p.fit.counts.unknown} condition${p.fit.counts.unknown === 1 ? "" : "s"} to confirm`}
          </Status>
          {p.admission.value === true && (
            <span className="published-tag">Hourly / one-off care listed</span>
          )}
        </div>
      </button>
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
          aria-label={"Check conditions for " + p.name}
        >
          Check conditions <ArrowUpRight size={16} />
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
        ? "Controlled example"
        : expired
          ? "Recorded term has ended"
          : unresolved
            ? "Branch match unresolved"
            : r.official
              ? "Matched imported JKM record"
              : "Official registration not verified";
  return (
    <section className="detail-section">
      <div className="section-kicker">02 / REGISTRATION EVIDENCE</div>
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
          ? "The recorded validity term has ended. Renewal is unknown until separately evidenced."
          : r.matchBasis}
      </p>
      {r.missingImportedFields?.length > 0 && (
        <p className="notice">
          Postal address and telephone were not included in the JKM import.
          Contact and address shown here have separate sources.
        </p>
      )}
      {!r.official && p.mode !== "demo" && (
        <p>
          Missing official verification does not prove that the institution is
          unregistered.
        </p>
      )}
      <SourceLink source={r.source} />
    </section>
  );
}
export const feeLabel = (f) =>
  `${f.currency ?? "MYR"} ${f.amount != null ? f.amount : f.min != null ? `${f.min}${f.max != null && f.max !== f.min ? "–" + f.max : ""}` : "amount unavailable"} / ${f.basis ?? "basis unspecified"}`;
export function Costs({ p }) {
  const [show, setShow] = useState(false),
    c = p.cost;
  return (
    <section className="detail-section">
      <div className="section-kicker">03 / COST BASIS</div>
      <h3>
        {c.available
          ? "A reference estimate is available"
          : "One-off total unavailable"}
      </h3>
      {p.fees.length ? (
        p.fees.map((f, i) => (
          <div className="fee-line" key={i}>
            <strong>{feeLabel(f)}</strong>
            <p>{f.conditions}</p>
            <SourceLink source={f.source} />
          </div>
        ))
      ) : (
        <p>No applicable fee has been published in the current sources.</p>
      )}
      {!c.available ? (
        <p className="notice">
          Confirm: {c.missing.join("; ")}. Monthly fees are not converted into
          hourly prices.
        </p>
      ) : (
        <>
          <button className="secondary" onClick={() => setShow((x) => !x)}>
            {show ? "Hide calculation" : "Calculate reference total"}
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
export function Details({
  p,
  onPrepare,
  onCompare,
  compared,
  onSave,
  saved,
  onPreparation,
}) {
  return (
    <>
      <div className="profile-location">
        {p.category} · {p.district}, {p.region}
      </div>
      {p.mode === "demo" && (
        <p className="demo-notice">
          Controlled example — fictional institution and service facts.
        </p>
      )}
      <div className="profile-address">
        <p>{p.address ?? "Exact address not included in current sources."}</p>
        <SourceLink source={p.addressSource} />
        {!p.location && (
          <p className="notice">
            Coordinates unavailable. This institution remains in the list
            without a map marker.
          </p>
        )}
      </div>
      <div className="profile-actions">
        <button className="secondary" aria-pressed={saved} onClick={onSave}>
          <Bookmark size={16} />
          {saved ? "Saved institution" : "Save institution"}
        </button>
        <button className="primary" onClick={onPrepare}>
          Prepare questions <ArrowRight size={16} />
        </button>
        <button
          className="secondary"
          aria-pressed={compared}
          onClick={onCompare}
        >
          {compared ? <Check size={16} /> : <Plus size={16} />}Compare
        </button>
      </div>
      {(p.phone || p.whatsapp?.length > 0) && (
        <section className="detail-section">
          <div className="section-kicker">PUBLISHED CONTACTS</div>
          <PublishedContacts p={p} />
        </section>
      )}
      <section className="detail-section">
        <div className="section-kicker">01 / THIS REQUEST</div>
        <h3>{p.fit.summary}</h3>
        <p className="notice">{p.fit.acceptance}</p>
        <div className="condition-list">
          {p.fit.conditions.map((c) => (
            <div key={c.id} className="condition">
              <div>
                <h4>{c.label}</h4>
                <Status state={c.state}>{c.statusLabel}</Status>
              </div>
              <p>{c.reason}</p>
              <SourceLink source={c.source} />
              {c.id === "age" && p.age?.alternative && (
                <SourceLink source={p.age.alternative.source} />
              )}
            </div>
          ))}
        </div>
        <div className="business-note">
          <strong>
            Care end time{p.businessHoursDay ? ` · ${p.businessHoursDay}` : ""}:{" "}
            {p.careEndTimeLabel ?? p.businessHoursLabel}
          </strong>
          <p>Published care end time for your selected day.</p>
          <SourceLink source={p.careEndTimeSource ?? p.businessHours.source}>
            Care schedule source
          </SourceLink>
          {p.businessHours.alternative && (
            <div className="notice">
              <p>
                Additional care schedule: {p.businessHours.alternative.notes}
              </p>
              <SourceLink source={p.businessHours.alternative.source}>
                Additional care schedule source
              </SourceLink>
            </div>
          )}
          <details className="weekly-hours">
            <summary>View weekly care end times</summary>
            <dl>
              {(p.weeklyCareEndTimes ?? []).map(({ day, label, source }) => {
                return (
                  <div
                    key={day}
                    className={
                      day === p.businessHoursDay ? "requested-day" : ""
                    }
                  >
                    <dt>
                      {day}
                      {day === p.businessHoursDay ? " · requested" : ""}
                    </dt>
                    <dd>
                      {label}
                      {source?.url &&
                        source.url !== p.businessHours.source?.url && (
                          <SourceLink source={source} />
                        )}
                    </dd>
                  </div>
                );
              })}
            </dl>
          </details>
        </div>
        {p.transport?.source && (
          <div className="business-note">
            <strong>
              Transport:{" "}
              {p.transport.exists === true
                ? "Advertised"
                : p.transport.exists === false
                  ? "Listed as unavailable"
                  : "Enquire with institution"}
            </strong>
            <p>{p.transport.wording}</p>
            <SourceLink source={p.transport.source} />
          </div>
        )}
        {p.notes.map((n, i) => (
          <p className="notice" key={i}>
            {n}
          </p>
        ))}
      </section>
      <Registration p={p} />
      <Costs p={p} />
      <section className="detail-section">
        <h3>Get ready for this occasion.</h3>
        <p>
          Organise handover questions, collection steps and a packing list for
          this request.
        </p>
        <button className="primary" onClick={onPreparation}>
          <ClipboardList size={16} />
          Create preparation sheet
        </button>
      </section>
      <section className="detail-section">
        <h3>Keep the important questions together.</h3>
        <p>
          Use these conditions to prepare a focused enquiry for this branch.
        </p>
        <button className="primary" onClick={onPrepare}>
          Prepare questions <ArrowRight size={16} />
        </button>
      </section>
    </>
  );
}
export function Comparison({
  items,
  onRemove,
  onPrepare,
  sort,
  onSort,
  ordering,
}) {
  const rows = [
    [
      "Temporary admission",
      (p) => p.fit.conditions.find((c) => c.id === "admission"),
    ],
    ["Age", (p) => p.fit.conditions.find((c) => c.id === "age")],
    [
      "Institutional transport",
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
        The same request. The same factors. Different questions to resolve.
      </p>
      <div className="compare-sort">
        <label>
          Investigate first{" "}
          <select
            aria-label="Comparison priority"
            value={sort}
            onChange={(e) => onSort(e.target.value)}
          >
            {[
              ["distance", "Nearest (straight-line)"],
              ["closing", "Later care end time"],
              ["pickup", "Published institutional pickup"],
              ["name", "Institution name"],
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
      </div>
      <div className="comparison-scroll">
        <table>
          <thead>
            <tr>
              <th>FOR THIS OCCASION</th>
              {items.map((p) => (
                <th key={p.id}>
                  <button
                    className="remove-compare"
                    aria-label={"Remove " + p.name + " from comparison"}
                    onClick={() => onRemove(p.id)}
                  >
                    Remove
                  </button>
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
                        ? "Controlled example"
                        : p.registration.official
                          ? "Imported record matched"
                          : "Official verification outstanding"}
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
                      ? "Reference calculation available in conditions."
                      : "One-off total unavailable. Confirm: " +
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
  const context = `Enquiry for ${p.name}\n${requestCaption(request)}\nAge: ${request.age === "" ? "not specified" : request.age === "0" ? "under 1 year" : request.age + " years"} · ${request.transport === "self" ? "Self-arranged delivery" : request.transport === "institution" ? "Institutional pickup requested" : "Transport not specified"}`;
  const text =
    context +
    "\n\n" +
    selected.map((x, i) => `${i + 1}. ${x.text}`).join("\n") +
    "\n\nPlease confirm the actual arrangement directly. No place or pickup has been booked.";
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
        A short enquiry for this branch and this occasion.
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
            ? "Self-arranged delivery"
            : request.transport === "institution"
              ? "Institutional pickup"
              : "Transport unspecified"}
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
            ? "Copied with the institution and request details."
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
            Open institution source page <ArrowUpRight size={15} />
          </a>
        )}
        {p.mode === "demo" && (
          <p>Controlled examples have no real contact action.</p>
        )}
        <p className="notice">
          Contact the institution using the displayed number or WhatsApp link.
          This page does not record contact, acceptance or a booking.
        </p>
      </section>
      <button className="text-link" onClick={onCompare}>
        Return to comparison <ArrowRight size={16} />
      </button>
    </>
  );
}
