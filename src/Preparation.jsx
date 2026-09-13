import { useMemo, useState } from "react";
import { Download, Printer, ArrowRight } from "lucide-react";
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
        "The preparation sheet could not be exported. Your draft remains here. Please retry.",
      );
    }
  };
  return (
    <div className="preparation">
      <div className="preparation-head">
        <div>
          <div className="section-kicker">FOR THIS OCCASION</div>
          <h3>{p.name}</h3>
        </div>
        <div className="saved-actions">
          <button className="primary" onClick={() => exportSheet(true)}>
            <Printer size={16} />
            Print / Save PDF
          </button>
          <button className="secondary" onClick={() => exportSheet(false)}>
            <Download size={16} />
            Download sheet
          </button>
        </div>
      </div>
      {p.mode === "demo" && (
        <p className="demo-notice">
          Controlled example — fictional institution and service facts.
        </p>
      )}
      <p className="dialog-context">{sheet.request}</p>
      <p className="draft-notice">{sheet.notice}</p>
      <p className="notice">
        Prepared {sheet.preparationDate} · Malaysia time · {sheet.interval}
      </p>
      {changed && (
        <div className="notice-panel">
          <p>
            This sheet still uses the earlier request above. Regenerate it to
            use your updated search.
          </p>
          <button className="secondary" onClick={onRefresh}>
            Recheck & regenerate <ArrowRight size={15} />
          </button>
        </div>
      )}
      {failure && (
        <p className="error-box" role="alert">
          {failure}
        </p>
      )}
      {!!sheet.conflicts.length && (
        <div className="error-box">
          <strong>Conditions to resolve before arranging care</strong>
          {sheet.conflicts.map((c) => (
            <p key={c.id}>
              {c.label}: {c.reason}
            </p>
          ))}
        </div>
      )}
      <section className="detail-section">
        <div className="section-kicker">01 / THE SEQUENCE</div>
        <h3>From pickup to final collection.</h3>
        <div className="preparation-sequence">
          {sheet.sequence.map((step) => (
            <article key={step.title}>
              <h4>{step.title}</h4>
              <small className="basis-label">{step.basis}</small>
              <p>{step.text}</p>
              <p className="notice">{step.detail}</p>
              {step.source && <SourceLink source={step.source} />}
            </article>
          ))}
        </div>
      </section>
      <section className="detail-section">
        <div className="section-kicker">02 / HANDOVER QUESTIONS</div>
        <h3>Ask the right person.</h3>
        <p className="notice">
          General handover prompts. Discuss these directly; this page does not
          record anyone’s agreement.
        </p>
        <div className="preparation-parties">
          {sheet.groups.map((g) => (
            <article key={g.id}>
              <h4>{g.name}</h4>
              <p>{g.party}</p>
              <small>{g.contact}</small>
              <ul>
                {g.questions.map((q) => (
                  <li key={q.id}>{q.text}</li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        <button className="text-link" onClick={onEnquiry}>
          Return to provider-selection enquiries <ArrowRight size={14} />
        </button>
      </section>
      <section className="detail-section">
        <div className="section-kicker">03 / PACKING & INFORMATION</div>
        <h3>A few things to have ready.</h3>
        <p className="notice">
          General packing prompts for this request. Tick items as you prepare
          them; ticks stay on this page and are included in your downloaded
          sheet.
        </p>
        <div className="packing-list">
          {sheet.packing.map((x) => (
            <label className="checkbox" key={x.id}>
              <input
                type="checkbox"
                checked={checked.includes(x.id)}
                onChange={() => toggle(x.id)}
              />
              {x.text}
            </label>
          ))}
        </div>
        <h4>Provider-sourced requirements</h4>
        {sheet.published.length ? (
          sheet.published.map((x) => (
            <div key={x.id}>
              <label className="checkbox">
                <input
                  type="checkbox"
                  checked={checked.includes(x.id)}
                  onChange={() => toggle(x.id)}
                />
                {x.text}
              </label>
              <SourceLink source={x.source} />
            </div>
          ))
        ) : (
          <p className="notice">
            No specific packing or handover requirements are published in this
            record. Ask the receiving centre.
          </p>
        )}
        <p className="private-info">
          Provide identity, emergency and health information privately to the
          institution. Your printed sheet has blank spaces to complete offline.
        </p>
      </section>
      <section className="detail-section">
        <div className="section-kicker">04 / CONTACTS TO KEEP HANDY</div>
        <h3>{p.name}</h3>
        <PublishedContacts p={p} />
        <p className="notice">
          Usual centre release contact and collector / transport contact: to be
          confirmed.
        </p>
      </section>
      <div className="saved-actions preparation-footer">
        <button className="primary" onClick={() => exportSheet(true)}>
          <Printer size={16} />
          Print / Save PDF
        </button>
        <button className="secondary" onClick={() => exportSheet(false)}>
          Download sheet <Download size={16} />
        </button>
      </div>
    </div>
  );
}
