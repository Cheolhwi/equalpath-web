import { useMemo, useState } from "react";
import { dateLabel, displayName } from "../shared/display.mjs";
import { plainReason } from "../shared/plain-copy.mjs";
import { Download, Printer, ArrowRight, CalendarDays, ChevronDown, AlertTriangle, MapPin, Building2, Backpack, Shirt, Phone, Apple, BedDouble, Baby, Moon, CarFront, NotebookTabs, ClipboardCheck, MessageCircle, Milk, FileText, NotebookPen, Footprints, Palette, Users, Receipt } from "lucide-react";
import Surroundings, { surroundingImages } from "./Surroundings.jsx";
import { preparationFor, preparationHTML } from "../shared/preparation.mjs";
import { requestErrors } from "../shared/request.mjs";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import TimeInput from "./TimeInput.jsx";
import "./preparation-visual.css";

function WaterBottle({ size, strokeWidth }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 2h6v4H9zM9 6 7 9v11a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2V9l-2-3M7 13c3-2 7 2 10 0M7 17h10" /></svg>;
}
function ParentAndChild({ size }) {
  return <svg width={size} height={size} viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="15" cy="8" r="4" /><circle cx="34" cy="20" r="3.5" /><path d="M7 29V22a8 8 0 0 1 16 0l4 7 3-2h8l4 8M11 22v21M19 22v21M30 29v14M38 29v14" /></svg>;
}
function CarSeat({ size, strokeWidth }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M8 3h5l2 9 5 3v5H5V10l3-7ZM5 20v2h15v-2M8 7l7 9M13 7 7 16M7 16h8" /><rect x="9" y="11" width="3" height="3" rx=".5" /></svg>;
}

// One picture per kind of item; the words come from the checklist itself.
const packingPictures = {
  bag: Backpack, clothes: Shirt, water: WaterBottle, instructions: Phone, meal: Apple, rest: BedDouble,
  young: Baby, milk: Milk, evening: Moon, "transport-items": CarSeat, "self-items": NotebookTabs,
  papers: FileText, notes: NotebookPen, socks: Footprints, materials: Palette, adult: Users, registration: Receipt,
};
const BRING = new Set(["papers", "notes", "instructions", "transport-items", "self-items", "evening"]);
export function packingGroups(sheet) {
  return [
    { id: "pack", title: "Pack for your child", items: sheet.packing.filter((x) => !BRING.has(x.id)) },
    { id: "bring", title: "Bring and sort out", items: sheet.packing.filter((x) => BRING.has(x.id)) },
    { id: "centre", title: "This centre also lists", items: sheet.published },
  ].filter((g) => g.items.length);
}
const Why = ({ item }) => item.why?.length ? <span className="ready-item-why">{item.why.map((w) => <span key={w}>{w}</span>)}</span> : null;
function ItemBody({ item, size = 38 }) {
  const Picture = packingPictures[item.id] ?? ClipboardCheck, label = item.label ?? item.text;
  return <>
    <span className="ready-item-picture" aria-hidden="true"><Picture size={size} strokeWidth={1.6} /></span>
    <span className="ready-item-label">{label}</span>
    {label !== item.text && <span className="ready-item-text">{item.text}</span>}
    {item.centre && <span className="ready-item-centre">{item.centre.text}</span>}
    <Why item={item} />
  </>;
}
// The street outside, so whoever takes the child knows what to look for.
export function FindCentre({ p }) {
  return <div className="ready-find-row">
    <Surroundings p={p} />
    <div className="ready-find-text">
      <strong>{displayName(p.name)}</strong>
      {p.address && <p>{p.address}</p>}
      {surroundingImages(p).length > 0 && <p className="ready-find-note">Street View near the centre — open it to look left and right. It isn’t a confirmed view of the entrance.</p>}
    </div>
  </div>;
}
const journeyPictures = [CarFront, Building2, ParentAndChild];
const journeyLabels = ["Leave for the centre", "At the centre", "Collect your child"];

// Where the enquiry stands, shown instead of a fixed "Draft plan" label.
export const STATUS = {
  confirmed: ["good", "Place confirmed"], available: ["good", "Place offered — confirm it in the chat"],
  replied: ["warn", "The centre replied"], asked: ["neutral", "Asked · waiting for a reply"], null: ["neutral", "Draft · not confirmed yet"],
};
export function StatusChip({ status }) {
  const [tone, text] = STATUS[status ?? null] ?? STATUS.null;
  return <span className={`checklist-status ${tone}`}>{text}</span>;
}

export default function Preparation({
  p,
  request,
  onEnquiry,
  onTimesChange,
  checked: liftedChecked,
  onToggle,
  status = null,
}) {
  const sheet = useMemo(() => preparationFor(p, request), [p, request]);
  const [ownChecked, setOwnChecked] = useState([]),
    [failure, setFailure] = useState(""),
    [timeError, setTimeError] = useState("");
  // Ticks live with the saved checklist, so they survive closing the window.
  const checked = liftedChecked ?? ownChecked;
  const changeTime = (field, value) => {
    const next = { ...request, [field]: value };
    const errors = requestErrors(next);
    if (errors.deadline || errors.end) {
      setTimeError(errors.deadline || errors.end);
      return;
    }
    setTimeError("");
    onTimesChange({ deadline: next.deadline, end: next.end });
  };
  const toggle = (id) => onToggle ? onToggle(id) :
    setOwnChecked((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id],
    );
  const exportSheet = (print) => {
    setFailure("");
    try {
      const html = preparationHTML(sheet, checked, { photos: surroundingImages(p) });
      if (print) {
        const returnFocus = document.activeElement;
        const frame = document.createElement("iframe");
        frame.title = "Printable preparation sheet";
        frame.className = "preparation-print-frame";
        // Same-origin static document, with all imported strings escaped. No scripts.
        frame.onload = () => {
          frame.contentWindow.addEventListener(
            "afterprint",
            () => {
              frame.remove();
              returnFocus?.focus();
            },
            { once: true },
          );
          frame.contentWindow.focus();
          frame.contentWindow.print();
        };
        frame.srcdoc = html;
        document.body.appendChild(frame);
        setTimeout(() => frame.remove(), 120000);
      } else {
        const url = URL.createObjectURL(
          new Blob([html], { type: "text/html;charset=utf-8" }),
        );
        const a = document.createElement("a");
        a.href = url;
        a.download = `EqualPath-preparation-${request.date || "regular-care"}.html`;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch {
      setFailure(
        "We couldn’t export your checklist. It’s still here — please try again.",
      );
    }
  };
  const packingItems = [...sheet.packing, ...sheet.published];
  const completed = packingItems.filter((item) => checked.includes(item.id)).length;
  const questions = ["receiving", "usual", "transport"].map((id) =>
    sheet.groups.find((group) => group.id === id),
  );
  const renderItem = (item) => (
    <div className={`ready-item${checked.includes(item.id) ? " is-ready" : ""}`} key={item.id}>
      <label>
        <input type="checkbox" aria-label={item.text} checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
        <ItemBody item={item} size={42} />
      </label>
      {item.source && <div className="ready-item-source"><SourceLink source={item.source} /></div>}
    </div>
  );
  return (
    <div className="preparation preparation-visual">
      <header className="preparation-overview">
        <div>
          <h3>{displayName(p.name)}</h3>
        </div>
        <div className="preparation-date">
          <CalendarDays size={18} aria-hidden="true" />{sheet.date ? <time dateTime={sheet.date}>{sheet.dateLabel}</time> : <strong>Regular care</strong>}
        </div>
      </header>
      <div className="ready-plan-note"><StatusChip status={status} />{status !== "confirmed" && onEnquiry && <button className="text-link" onClick={onEnquiry}>Contact the centre<ArrowRight size={15} aria-hidden="true" /></button>}</div>
      {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
      {failure && <p className="error-box" role="alert">{failure}</p>}
      {!!sheet.conflicts.length && (
        <section className="preparation-conflicts" aria-label="Things to sort out">
          <h3><AlertTriangle size={18} aria-hidden="true" />Check before you go</h3>
          {sheet.conflicts.map((c) => (
            <details key={c.id} open>
              <summary>{c.label}<ChevronDown size={16} aria-hidden="true" /></summary>
              <p>{plainReason(c.reason)}</p>
              {c.source && <SourceLink source={c.source} />}
            </details>
          ))}
        </section>
      )}
      <div className="preparation-layout">
        <section className="preparation-plan" aria-labelledby="pickup-plan-title">
          <h3 id="pickup-plan-title" className="sr-only">Your plan for the day</h3>
          <ol className="preparation-sequence">
            {sheet.sequence.map((step, i) => {
              const Picture = journeyPictures[i];
              return <li key={step.title}>
                <span className="ready-journey-picture" aria-hidden="true"><Picture size={48} strokeWidth={1.5} /></span>
                {i < 2 && <ArrowRight className="ready-journey-arrow" size={24} aria-hidden="true" />}
                <h4>{journeyLabels[i]}</h4>
                {i === 1 ? <p className="ready-centre-name">{displayName(step.place)}</p> : <div className={`preparation-step-time${step.time ? "" : " needs-time"}`}>
                  {step.time && onTimesChange ? <TimeInput variant="button" allowClear={false} label={journeyLabels[i]} pickerLabel={i === 0 ? "Start" : "End"}
                    value={step.time} onChange={value => changeTime(i === 0 ? "deadline" : "end", value)}
                    describedBy={timeError ? "preparation-time-error" : undefined} />
                    : step.time ? <><span className="sr-only">{step.timeLabel} </span><strong>{step.time}</strong></> : <strong>Ask the centre</strong>}
                </div>}
              </li>;
            })}
          </ol>
          {timeError && <p id="preparation-time-error" className="error-box" role="alert">{timeError}</p>}
          <details className="ready-addresses"><summary><MapPin size={17} aria-hidden="true" /><span>Addresses & times</span><ChevronDown size={17} aria-hidden="true" /></summary>
            <div>{sheet.sequence.map(step => <section key={step.title}>
              <h4>{step.title}{step.time && ` · ${step.timeLabel.toLowerCase()} ${step.time}`}</h4>
              <p className="preparation-step-place">{step.place}</p>
              {step.address && <p className="preparation-step-address">{step.address}</p>}
              <p>{step.detail}</p>
            </section>)}</div>
            <p className="preparation-transport">{sheet.transport}</p>
          </details>
        </section>
        <section className="ready-find" aria-labelledby="find-title">
          <h3 id="find-title">Finding the centre</h3>
          <FindCentre p={p} />
        </section>
        <div className="preparation-main">
          <section className="preparation-section" aria-labelledby="packing-title">
            <div className="ready-packing-heading"><h3 id="packing-title">Before you go</h3><div className="preparation-packing-progress">
              <span aria-live="polite">{completed} of {packingItems.length} done</span>
              <progress value={completed} max={packingItems.length} aria-label="Packing checklist progress" />
            </div></div>
            {sheet.basisLine && <p className="ready-basis">{sheet.basisLine} · {sheet.dateLabel}</p>}
            {packingGroups(sheet).map((g) => <div key={g.id} className="ready-group">
              <h4>{g.title}</h4>
              <div className="packing-list">{g.items.map(renderItem)}</div>
            </div>)}
          </section>
        </div>
        <aside className="preparation-tools" aria-label="Centre contact and checklist tools">
          <section className="preparation-takeaway">
            <div className="saved-actions">
              <button className="primary" onClick={() => exportSheet(true)}><Printer size={16} />Print / Save PDF</button>
              <button className="secondary" onClick={() => exportSheet(false)}><Download size={16} />Download checklist</button>
            </div>
            <p className="preparation-private">Your ticks stay while this page is open. Print or download to keep a copy.</p>
          </section>
          <details className="ready-support"><summary><MessageCircle size={20} aria-hidden="true" /><span>Questions & contacts</span><ChevronDown size={18} aria-hidden="true" /></summary>
            <section className="preparation-contact"><PublishedContacts p={p} compact /><button className="text-link" onClick={onEnquiry}>Contact the centre<ArrowRight size={15} /></button></section>
            <div className="preparation-parties">
              {questions.map(group => <details key={group.id}><summary><h4>{group.name}</h4><ChevronDown size={18} aria-hidden="true" /></summary>
                <div className="preparation-party-content"><p className="preparation-party-name">{group.party}</p><ul>{group.questions.map(q => <li key={q.id}>{q.text}</li>)}</ul></div>
              </details>)}
            </div>
          </details>
          <details className="preparation-about">
            <summary>About this checklist<ChevronDown size={16} aria-hidden="true" /></summary>
            <p>{sheet.notice}</p>
            <p>Write private notes, such as allergies, on the printed copy.</p>
            <p>Your ticks stay while this page is open. Download or print it to keep a copy.</p>
            <p>Prepared {dateLabel(sheet.preparationDate)}. {sheet.date ? "Times come from your search. Agree the arrival time with the centre." : "Agree your usual hours and pickup arrangements with the centre."}</p>
            {sheet.sequence.filter((step) => step.source).map((step) => (
              <div key={step.title}><strong>{step.title === "At childcare" ? "Centre address" : "Care hours"}</strong><SourceLink source={step.source} /></div>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}

/* Two children (11 Oct 2026): the same kind of checklist as one child — the
   day as a timeline, then one set of "before you go" cards. Each card is
   ticked per child, so the same bag isn't listed twice. */
const kidName = (k) => (k === "a" ? "Child 1" : "Child 2");
export function familyPacking(entry) {
  const sheets = entry.items.map((it) => ({ ...it, sheet: preparationFor(it.p, it.request) }));
  const oneCentre = new Set(entry.items.map((it) => it.p.id)).size === 1;
  const merged = new Map();
  for (const s of sheets) for (const it of [...s.sheet.packing, ...s.sheet.published]) {
    // Same item, same words: one card. Different words (two sets of clothes for
    // a 2-year-old, one for a 4-year-old): a card each.
    const key = `${it.id}|${it.text}`;
    const m = merged.get(key) ?? { key, item: { ...it, why: [] }, kids: [], group: s.sheet.published.includes(it) ? "centre" : BRING.has(it.id) ? "bring" : "pack" };
    m.item.why = [...new Set([...m.item.why, ...(it.why ?? [])])];
    m.kids.push(s.key); merged.set(key, m);
  }
  // Phone numbers (and the address, when it's one centre) are for the grown-up: one tick.
  const order = [...new Set([...merged.values()].map((m) => m.item.id))];
  const cards = [...merged.values()].sort((x, y) => order.indexOf(x.item.id) - order.indexOf(y.item.id)).map((m) => ({ ...m,
    ticks: m.item.id === "instructions" || (m.item.id === "self-items" && oneCentre) ? [{ id: `family:${m.item.id}` }] : m.kids.map((k) => ({ id: `${k}:${m.item.id}`, kid: k })) }));
  return { sheets, oneCentre, cards, all: cards.flatMap((c) => c.ticks.map((t) => t.id)) };
}
// "Child 1: age 2 · Child 2: age 3 · 5 h of care", hours once when they match.
function familyBasis(sheets) {
  const parts = sheets.map((s) => s.sheet.basisLine.split(" · "));
  const ages = sheets.map((s, i) => `${kidName(s.key)}: ${parts[i][0]?.startsWith("For ") ? parts[i][0].replace(/^For an? /, "").replace(/(\d+)-year-old/, "age $1") : "age not set"}`);
  const hours = [...new Set(parts.map((x) => x.find((y) => y.endsWith("of care"))).filter(Boolean))];
  return [...ages, hours.length === 1 ? hours[0] : hours.length ? sheets.map((s, i) => `${kidName(s.key)} ${parts[i].find((y) => y.endsWith("of care"))}`).join(", ") : null].filter(Boolean).join(" · ");
}
function familyDay(entry) {
  if (entry.steps?.length) return entry.steps;
  // Drive times didn't load: still show the handovers at the times asked for.
  const group = (field, verb) => {
    const by = new Map();
    for (const it of entry.items) { const k = `${it.request[field]}|${it.p.id}`; by.set(k, [...(by.get(k) ?? []), it]); }
    return [...by.values()].map((its) => ({ time: its[0].request[field], kind: verb,
      label: `${verb === "drop" ? "Drop off" : "Pick up"} ${its.length > 1 ? "both children" : kidName(its[0].key)} at ${displayName(its[0].p.name)}` }));
  };
  return [...group("deadline", "drop"), ...group("end", "collect")].sort((x, y) => x.time.localeCompare(y.time));
}
export function FamilyPreparation({ entry, checked = [], onToggle, statusFor, onContact }) {
  const { sheets, oneCentre, cards, all } = useMemo(() => familyPacking(entry), [entry]);
  const day = useMemo(() => familyDay(entry), [entry]);
  const done = all.filter((id) => checked.includes(id)).length;
  const centres = [...new Map(entry.items.map((it) => [it.p.id, it])).values()];
  const [copied, setCopied] = useState(false);
  const download = () => {
    const url = URL.createObjectURL(new Blob([entry.text], { type: "text/plain" }));
    const a = document.createElement("a"); a.href = url; a.download = `equalpath-family-plan-${entry.date}.txt`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  const card = ({ key, item, ticks }) => {
    const ready = ticks.every((t) => checked.includes(t.id)), single = ticks.length === 1 && !ticks[0].kid;
    const body = <ItemBody item={item} />;
    return <div className={`ready-item${ready ? " is-ready" : ""}`} key={key}>
      {single
        ? <label><input type="checkbox" aria-label={item.text} checked={checked.includes(ticks[0].id)} onChange={() => onToggle(ticks[0].id)} />{body}</label>
        : <>
          <div className="ready-item-body">{body}</div>
          <div className="family-ticks">{ticks.map((t) => <label key={t.id} className={checked.includes(t.id) ? "is-ticked" : ""}>
            <input type="checkbox" aria-label={`${item.text} (${kidName(t.kid)})`} checked={checked.includes(t.id)} onChange={() => onToggle(t.id)} />{kidName(t.kid)}
          </label>)}</div>
        </>}
    </div>;
  };
  return <div className="preparation preparation-visual family-preparation">
    <header className="preparation-overview">
      <div><h3>{entry.title}</h3></div>
      <div className="preparation-date"><CalendarDays size={18} aria-hidden="true" /><time dateTime={entry.date}>{sheets[0]?.sheet.dateLabel}</time></div>
    </header>
    <div className="family-prep-status">{oneCentre
      ? <span><StatusChip status={statusFor?.(centres[0].p.id, entry.date)} /><small>Two children</small></span>
      : centres.map((it) => <span key={it.p.id}><strong>{displayName(it.p.name)}</strong><StatusChip status={statusFor?.(it.p.id, entry.date)} /></span>)}</div>
    {day.length > 0 && <section className="family-prep-day" aria-label="Your day">
      <h3>Your day</h3>
      <ol>{day.map((st, i) => <li key={i} className={st.kind?.startsWith("leave") ? "leave" : ""}><time>{st.time}</time><span>{st.label}</span></li>)}</ol>
    </section>}
    <section className="ready-find" aria-labelledby="family-find-title">
      <h3 id="family-find-title">Finding the {centres.length > 1 ? "centres" : "centre"}</h3>
      <div className="ready-find-list">{centres.map((it) => <FindCentre key={it.p.id} p={it.p} />)}</div>
    </section>
    <section className="preparation-section" aria-labelledby="family-packing-title">
      <div className="ready-packing-heading"><h3 id="family-packing-title">Before you go</h3><div className="preparation-packing-progress">
        <span aria-live="polite">{done} of {all.length} done</span>
        <progress value={done} max={all.length} aria-label="Packing checklist progress" />
      </div></div>
      <p className="ready-basis">{familyBasis(sheets)}</p>
      {[["pack", "Pack for the children"], ["bring", "Bring and sort out"], ["centre", "The centre also lists"]].map(([g, title]) => {
        const list = cards.filter((c) => c.group === g);
        return list.length ? <div key={g} className="ready-group"><h4>{title}</h4><div className="packing-list family-packing">{list.map(card)}</div></div> : null;
      })}
    </section>
    <section className="family-prep-tools">
      <div className="family-prep-contacts">{centres.map((it) => <div key={it.p.id} className="family-prep-contact">
        <strong>{displayName(it.p.name)}</strong>
        <div className="contact-buttons"><PublishedContacts p={it.p} compact showSources={false} /></div>
        {onContact && statusFor?.(it.p.id, entry.date) !== "confirmed" && <button className="text-link" onClick={() => onContact(it.p, it.request)}>Contact the centre<ArrowRight size={15} aria-hidden="true" /></button>}
      </div>)}</div>
      <div className="saved-actions">
        <button className="secondary" onClick={async () => { try { await navigator.clipboard.writeText(entry.text); setCopied(true); } catch { setCopied(false); } }}><ClipboardCheck size={16} />{copied ? "Copied" : "Copy plan"}</button>
        <button className="secondary" onClick={download}><Download size={16} />Download plan</button>
      </div>
      <p className="preparation-private">Your ticks stay while this page is open. Each centre still needs to confirm a place.</p>
    </section>
  </div>;
}
