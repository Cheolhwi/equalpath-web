import { useMemo, useState } from "react";
import { Download, Printer, ArrowRight, CalendarDays, ChevronDown, AlertTriangle } from "lucide-react";
import { preparationFor, preparationHTML } from "../shared/preparation.mjs";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";

export default function Preparation({
  p,
  request,
  currentRequest,
  onEnquiry,
  onRefresh,
}) {
  const sheet = useMemo(() => preparationFor(p, request), [p, request]);
  const [checked, setChecked] = useState([]),
    [failure, setFailure] = useState("");
  const changed =
    currentRequest &&
    JSON.stringify(currentRequest) !== JSON.stringify(request);
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
        a.download = `EqualPath-preparation-${request.date}.html`;
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
    <div className="preparation-pack-item" key={item.id}>
      <label className="checkbox">
        <input type="checkbox" checked={checked.includes(item.id)} onChange={() => toggle(item.id)} />
        <span>{item.text}</span>
      </label>
      {item.source && <details className="source-disclosure"><summary>View source</summary><SourceLink source={item.source} /></details>}
    </div>
  );
  return (
    <div className="preparation">
      <header className="preparation-overview">
        <div>
          <span className="section-kicker">CARE AT</span>
          <h3>{p.name}</h3>
        </div>
        <div className="preparation-date">
          <CalendarDays size={18} aria-hidden="true" />
          <time dateTime={sheet.date}>{sheet.dateLabel}</time>
          <span>Malaysia time</span>
        </div>
      </header>
      <p className="preparation-draft">Draft · Confirm these arrangements with the centre.</p>
      {p.mode === "demo" && <p className="demo-notice">Demo centre — fictional details.</p>}
      {changed && (
        <div className="notice-panel" role="status">
          <strong>Your search has changed</strong>
          <p>This checklist still uses your earlier date and times. Update it when you’re ready.</p>
          <button className="secondary" onClick={onRefresh}>Update checklist <ArrowRight size={15} /></button>
        </div>
      )}
      {failure && <p className="error-box" role="alert">{failure}</p>}
      {!!sheet.conflicts.length && (
        <section className="preparation-conflicts" aria-label="Arrangements to resolve">
          <h3><AlertTriangle size={18} aria-hidden="true" />Resolve before you go</h3>
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
          <h3 id="pickup-plan-title">Your pickup plan</h3>
          <ol className="preparation-sequence">
            {sheet.sequence.map((step, i) => (
              <li key={step.title}>
                <div className="preparation-step-title"><span>{i + 1}</span><h4>{step.title}</h4></div>
                <div className={`preparation-step-time${step.time ? "" : " needs-time"}`}>
                  {step.time ? <><span>{step.timeLabel}</span><strong>{step.time}</strong></> : <strong>Agree a time</strong>}
                </div>
                <p className="preparation-step-place">{step.place}</p>
                {step.address && <p className="preparation-step-address">{step.address}</p>}
                <p className="preparation-step-detail">{step.detail}</p>
              </li>
            ))}
          </ol>
          <p className="preparation-transport">{sheet.transport}</p>
        </section>
        <div className="preparation-main">
          <section className="preparation-section" aria-labelledby="handover-title">
            <div className="preparation-section-heading"><span>01</span><h3 id="handover-title">Confirm the arrangements</h3></div>
            <p className="preparation-hint">A few questions for the people helping with care.</p>
            <div className="preparation-parties">
              {questions.map((group) => (
                <details key={group.id} open={group.id === "receiving"}>
                  <summary><h4>{group.name}</h4><ChevronDown size={18} aria-hidden="true" /></summary>
                  <div className="preparation-party-content">
                    <p className="preparation-party-name">{group.party}</p>
                    <ul>{group.questions.map((q) => <li key={q.id}>{q.text}</li>)}</ul>
                  </div>
                </details>
              ))}
            </div>
          </section>
          <section className="preparation-section" aria-labelledby="packing-title">
            <div className="preparation-section-heading"><span>02</span><h3 id="packing-title">Before you leave</h3></div>
            <div className="preparation-packing-progress">
              <span aria-live="polite">{completed} of {packingItems.length} done</span>
              <progress value={completed} max={packingItems.length} aria-label="Packing checklist progress" />
            </div>
            <p className="preparation-hint">Tick off what’s ready. Print or download to keep your ticks.</p>
            <div className="packing-list">{sheet.packing.map(renderItem)}</div>
            {!!sheet.published.length && (
              <div className="preparation-published">
                <h4>The centre also asks for</h4>
                <div className="packing-list">{sheet.published.map(renderItem)}</div>
              </div>
            )}
            {!sheet.published.length && <p className="preparation-hint">Ask the centre if they need anything else.</p>}
          </section>
        </div>
        <aside className="preparation-tools" aria-label="Centre contact and checklist tools">
          <section className="preparation-contact">
            <h3>Contact the centre</h3>
            <PublishedContacts p={p} compact />
            <button className="text-link" onClick={onEnquiry}>More questions for the centre <ArrowRight size={15} /></button>
          </section>
          <section className="preparation-takeaway">
            <h3>Take this with you</h3>
            <p>Keep the plan, phone numbers and your ticked items together.</p>
            <div className="saved-actions">
              <button className="primary" onClick={() => exportSheet(true)}><Printer size={16} />Print / Save PDF</button>
              <button className="secondary" onClick={() => exportSheet(false)}><Download size={16} />Download checklist</button>
            </div>
            <p className="preparation-private">The printed checklist has space for emergency contacts and care notes. Fill these in privately.</p>
          </section>
          <details className="preparation-about">
            <summary>About this checklist<ChevronDown size={16} aria-hidden="true" /></summary>
            <p>{sheet.notice}</p>
            <p>Your ticks stay while this checklist is open. Download or print it before closing.</p>
            <p>Prepared {sheet.preparationDate}. Times and pickup choices come from your request; arrival still needs to be agreed.</p>
            {sheet.sequence.filter((step) => step.source).map((step) => (
              <div key={step.title}><strong>{step.title === "Drop off" ? "Centre address" : "Care hours"}</strong><SourceLink source={step.source} /></div>
            ))}
          </details>
        </aside>
      </div>
    </div>
  );
}
