import { useMemo, useState } from "react";
import { Download, Printer, ArrowRight, CalendarDays, ChevronDown, AlertTriangle, MapPin, Building2, Backpack, Shirt, Phone, Apple, BedDouble, Baby, Moon, CarFront, NotebookTabs, ClipboardCheck, MessageCircle } from "lucide-react";
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

const packingPictures = {
  bag: [Backpack, "Bag with name"], clothes: [Shirt, "Spare clothes"], water: [WaterBottle, "Water bottle"],
  instructions: [Phone, "Contact numbers"], meal: [Apple, "Check food"], rest: [BedDouble, "Check nap time"],
  young: [Baby, "Baby items"], evening: [Moon, "Evening pickup"],
  "transport-items": [CarSeat, "Check car seat"], "self-items": [NotebookTabs, "Driver’s details"],
};
const journeyPictures = [CarFront, Building2, ParentAndChild];
const journeyLabels = ["Go to childcare", "Child care", "Pick up child"];

export default function Preparation({
  p,
  request,
  currentRequest,
  sourceRequest = request,
  onEnquiry,
  onRefresh,
  onTimesChange,
}) {
  const sheet = useMemo(() => preparationFor(p, request), [p, request]);
  const [checked, setChecked] = useState([]),
    [failure, setFailure] = useState(""),
    [timeError, setTimeError] = useState("");
  const changed =
    currentRequest &&
    JSON.stringify(currentRequest) !== JSON.stringify(sourceRequest);
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
  const toggle = (id) =>
    setChecked((xs) =>
      xs.includes(id) ? xs.filter((x) => x !== id) : [...xs, id],
    );
  const exportSheet = (print) => {
    setFailure("");
    try {
      const html = preparationHTML(sheet, checked);
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
  const renderItem = (item) => {
    const [Picture, label] = packingPictures[item.id] ?? [ClipboardCheck, item.text];
    return <div className={`ready-item${checked.includes(item.id) ? " is-ready" : ""}`} key={item.id}>
      <label>
        <input type="checkbox" aria-label={item.text} checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
        <span className="ready-item-picture" aria-hidden="true"><Picture size={42} strokeWidth={1.6} /></span>
        <span className="ready-item-label">{label}</span>
      </label>
      <details className="ready-item-detail"><summary aria-label={`Details: ${label}`}>Details<ChevronDown size={13} aria-hidden="true" /></summary><p>{item.text}</p>{item.source && <SourceLink source={item.source} />}</details>
    </div>;
  };
  return (
    <div className="preparation preparation-visual">
      <header className="preparation-overview">
        <div>
          <h3>{p.name}</h3>
        </div>
        <div className="preparation-date">
          <CalendarDays size={18} aria-hidden="true" />{sheet.date ? <time dateTime={sheet.date}>{sheet.dateLabel}</time> : <strong>Long term</strong>}
        </div>
      </header>
      <div className="ready-plan-note"><span>Draft plan</span><button className="text-link" onClick={onEnquiry}>Contact the centre<ArrowRight size={15} aria-hidden="true" /></button></div>
      {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
      {changed && (
        <div className="notice-panel" role="status">
          <strong>Your search has changed</strong>
          <p>{sheet.date ? "This checklist still uses your earlier date and times. Update it when you’re ready." : "This checklist uses your earlier care choices. Update it when you’re ready."}</p>
          <button className="secondary" onClick={onRefresh}>Update checklist <ArrowRight size={15} /></button>
        </div>
      )}
      {failure && <p className="error-box" role="alert">{failure}</p>}
      {!!sheet.conflicts.length && (
        <section className="preparation-conflicts" aria-label="Arrangements to resolve">
          <h3><AlertTriangle size={18} aria-hidden="true" />Check before you go</h3>
          {sheet.conflicts.map((c) => (
            <details key={c.id} open>
              <summary>{c.label}<ChevronDown size={16} aria-hidden="true" /></summary>
              <p>{c.reason}</p>
              {c.source && <SourceLink source={c.source} />}
            </details>
          ))}
        </section>
      )}
      <div className="preparation-layout">
        <section className="preparation-plan" aria-labelledby="pickup-plan-title">
          <h3 id="pickup-plan-title" className="sr-only">Your pickup plan</h3>
          <ol className="preparation-sequence">
            {sheet.sequence.map((step, i) => {
              const Picture = journeyPictures[i];
              return <li key={step.title}>
                <span className="ready-journey-picture" aria-hidden="true"><Picture size={48} strokeWidth={1.5} /></span>
                {i < 2 && <ArrowRight className="ready-journey-arrow" size={24} aria-hidden="true" />}
                <h4>{journeyLabels[i]}</h4>
                {i === 1 ? <p className="ready-centre-name">{step.place}</p> : <div className={`preparation-step-time${step.time ? "" : " needs-time"}`}>
                  {step.time && onTimesChange ? <TimeInput variant="button" allowClear={false} label={journeyLabels[i]} pickerLabel={i === 0 ? "When will your child leave this address?" : "When will you pick up your child from childcare?"}
                    value={step.time} onChange={value => changeTime(i === 0 ? "deadline" : "end", value)}
                    describedBy={timeError ? "preparation-time-error" : undefined} />
                    : step.time ? <><span className="sr-only">{step.timeLabel} </span><strong>{step.time}</strong></> : <strong>Ask centre</strong>}
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
        <div className="preparation-main">
          <section className="preparation-section" aria-labelledby="packing-title">
            <div className="ready-packing-heading"><h3 id="packing-title">Before you go</h3><div className="preparation-packing-progress">
              <span aria-live="polite">{completed} of {packingItems.length} done</span>
              <progress value={completed} max={packingItems.length} aria-label="Packing checklist progress" />
            </div></div>
            <div className="packing-list">{sheet.packing.map(renderItem)}</div>
            {!!sheet.published.length && (
              <div className="preparation-published">
                <h4>The centre also asks for</h4>
                <div className="packing-list">{sheet.published.map(renderItem)}</div>
              </div>
            )}
          </section>
        </div>
        <aside className="preparation-tools" aria-label="Centre contact and checklist tools">
          <section className="preparation-takeaway">
            <div className="saved-actions">
              <button className="primary" onClick={() => exportSheet(true)}><Printer size={16} />Print / Save PDF</button>
              <button className="secondary" onClick={() => exportSheet(false)}><Download size={16} />Download checklist</button>
            </div>
            <p className="preparation-private">Print or download to keep your ticks.</p>
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
            <p>Add private care notes after printing.</p>
            <p>Your ticks stay while this checklist is open. Download or print it before closing.</p>
            <p>Prepared {sheet.preparationDate}. {sheet.date ? "Times and pickup choices come from your request; arrival still needs to be agreed." : "Agree your usual hours and pickup arrangements with the centre."}</p>
            {sheet.sequence.filter((step) => step.source).map((step) => (
              <div key={step.title}><strong>{step.title === "At childcare" ? "Centre address" : "Care hours"}</strong><SourceLink source={step.source} /></div>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}
