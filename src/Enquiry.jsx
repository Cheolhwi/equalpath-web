import { isShortCare } from "../shared/request.mjs";
import { useId, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronUp, ClipboardList, Copy, Link2, MapPin } from "lucide-react";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import { childAge, enquiryMessage, enquiryView, pickupPreference, visitDate } from "../shared/enquiry-view.mjs";
import "./enquiry.css";

export default function Enquiry({ p, request, selection, onSelection, onCompare, onPreparation }) {
  const shortCare = isShortCare(request);
  const [copyState, setCopyState] = useState("");
  const uid = useId();
  const questions = enquiryView(p, request);
  const ids = (selection ?? questions.map(q => q.id)).filter(id => questions.some(q => q.id === id));
  const selected = ids.map(id => questions.find(q => q.id === id));
  const ordered = [...selected, ...questions.filter(q => !ids.includes(q.id))];
  const text = enquiryMessage(p, request, selected);
  const linkedCount = questions.filter(q => !q.routine).length;
  const routineCount = questions.length - linkedCount;
  const update = next => { onSelection(next); setCopyState(""); };
  const toggle = id => update(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const move = (id, delta) => {
    const next = [...ids], i = next.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    update(next);
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); setCopyState("copied"); }
    catch { setCopyState("manual"); }
  };
  const toggleAll = () => {
    update(ids.length === questions.length ? [] : questions.map(q => q.id));
  };
  return <div className="enquiry-page">
    <p className="enquiry-intro">A few questions to help you decide if this centre works for you.</p>
    <section className="request-context enquiry-visit" aria-label="Centre and visit">
      <span className="section-kicker">CARE AT</span>
      <h3>{p.name}</h3>
      {shortCare ? <dl><div><dt>Your date</dt><dd>{visitDate(request.date)}</dd></div><div><dt>Collect by</dt><dd>{request.deadline}</dd></div><div><dt>Care until</dt><dd>{request.end}</dd></div></dl> : <p>Regular childcare</p>}
      <p className="enquiry-pickup"><MapPin size={14} aria-hidden="true" /><span>From {request.pickup.label}</span></p>
      <small>{childAge(request.age)} · {pickupPreference(request.transport)}</small>
    </section>
    <div className="enquiry-layout">
      <section className="enquiry-questions" aria-labelledby={`${uid}-questions`}>
        <div className="enquiry-section-heading"><h3 id={`${uid}-questions`}>What to ask</h3><button className="text-link" onClick={toggleAll}>{ids.length === questions.length ? "Clear selection" : "Select all"}</button></div>
        <p className="enquiry-guide">{linkedCount} {linkedCount === 1 ? "question linked" : "questions linked"} to your checks · {routineCount} {shortCare ? "for every visit" : "about enrolment"}</p>
        <div className="question-list">
          {ordered.map(q => <article key={q.id} className={`enquiry-question ${q.state} ${ids.includes(q.id) ? "" : "not-selected"}`} data-question-id={q.id}>
            <div className="enquiry-question-main">
              <label><input type="checkbox" checked={ids.includes(q.id)} onChange={() => toggle(q.id)} aria-describedby={`${uid}-${q.id}-reason`} /><span>{q.text}</span></label>
              {ids.includes(q.id) && <div className="enquiry-reorder">
                <button aria-label={`Move ${q.id} question up`} disabled={ids.indexOf(q.id) === 0} onClick={() => move(q.id, -1)}><ChevronUp size={15} /></button>
                <button aria-label={`Move ${q.id} question down`} disabled={ids.indexOf(q.id) === ids.length - 1} onClick={() => move(q.id, 1)}><ChevronDown size={15} /></button>
              </div>}
            </div>
            <div className="question-connection" id={`${uid}-${q.id}-reason`}>
              {q.check ? <details className="question-check">
                <summary><Link2 size={13} aria-hidden="true" /><span>{q.topic} <span className="connection-status">· {q.status}</span></span><ChevronDown size={13} aria-hidden="true" /></summary>
                <div className="question-check-content"><strong>From your centre checks</strong><p>{q.check.reason}</p>{q.check.source && <SourceLink source={q.check.source} />}{q.id === "age" && p.age?.alternative?.source && <SourceLink source={p.age.alternative.source} />}</div>
              </details> : <span className="question-routine">{q.topic} · {q.status}</span>}
              <p>{q.why}</p>
              {q.fee && (p.fees?.length || p.cost?.available) ? <details className="question-fee"><summary>View fee reference</summary><strong>{q.fee.label}</strong><p>{q.fee.note}</p>{p.cost?.available && <SourceLink source={p.cost.source} />}{!p.cost?.available && [...new Map((p.fees ?? []).filter(f => f.source).map(f => [f.source.url ?? f.source.label, f.source])).values()].map((source, i) => <SourceLink key={i} source={source} />)}</details> : null}
            </div>
          </article>)}
        </div>
      </section>
      <aside className="enquiry-tools" aria-label="Copy and contact">
        <section className="enquiry-send" aria-label="Your question list">
          <div className="enquiry-send-heading"><h3>Ready to ask?</h3><span role="status">{selected.length} selected</span></div>
          <button className="primary" disabled={!selected.length} onClick={copy}>{copyState === "copied" ? <Check size={16} /> : <Copy size={16} />}{copyState === "copied" ? "Questions copied" : "Copy questions"}</button>
          <p className="enquiry-copy-status" role="status">{copyState === "copied" ? shortCare ? "Copied with your date, times and pickup place." : "Copied with your care preferences." : !selected.length ? "Select at least one question to copy." : shortCare ? "Your date, times and pickup place are included." : "Your care preferences are included."}</p>
          {copyState === "manual" ? <div className="enquiry-manual"><p>Copy didn’t work here. Select the message below and copy it.</p><textarea readOnly aria-label="Questions to copy" value={text} ref={el => { if (el) { el.focus(); el.select(); } }} /></div> : <details className="enquiry-preview"><summary>Preview message</summary><div>{text}</div></details>}
        </section>
        <section className="enquiry-contact" aria-label="Contact the centre"><h3>Contact the centre</h3><p>Paste your questions into a message, or keep them handy for a call.</p>
          <PublishedContacts p={p} compact />
          {p.sourcePage && <a className="text-link" href={p.sourcePage} target="_blank" rel="noreferrer">View centre listing <ArrowUpRight size={14} /></a>}
          {p.mode === "demo" && <p className="demo-notice">Demo centre — no real contact details.</p>}
          <p className="notice">Arrange the visit directly with the centre.</p>
        </section>
        <section className="enquiry-next"><h3>After you’ve spoken</h3><p>Plan pickup and what to bring.</p><button className="secondary" onClick={onPreparation}><ClipboardList size={16} />Create checklist <ArrowRight size={15} /></button><button className="text-link" onClick={onCompare}>Compare childcare <ArrowRight size={14} /></button></section>
      </aside>
    </div>
  </div>;
}
