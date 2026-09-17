import CareJourney from "./CareJourney.jsx";
import { isShortCare } from "../shared/request.mjs";
import { useId, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ChevronUp, ClipboardList, Copy, Link2, MapPin, MessageCircle } from "lucide-react";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import { childAge, enquiryMessage, enquiryView, pickupPreference, visitDate } from "../shared/enquiry-view.mjs";
import "./enquiry.css";

export default function Enquiry({ p, request, selection, onSelection, onPreparation, showQuestions = false }) {
  const shortCare = isShortCare(request);
  const [copyState, setCopyState] = useState("");
  const uid = useId();
  const questions = enquiryView(p, request);
  const ids = (selection ?? questions.map(q => q.id)).filter(id => questions.some(q => q.id === id));
  const selected = ids.map(id => questions.find(q => q.id === id));
  const ordered = [...selected, ...questions.filter(q => !ids.includes(q.id))];
  const text = enquiryMessage(p, request, selected);
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
  return <div className="enquiry-page contact-first">

    <section className="request-context enquiry-visit" aria-label="Centre and visit">
      <h3>{p.name}</h3>
      <p className="contact-visit-summary">{shortCare ? <time dateTime={request.date}>{visitDate(request.date)}</time> : <span>Long term</span>}<span>{childAge(request.age)}</span></p>
      <details className="contact-request" open><summary>Your search details<ChevronDown size={16} aria-hidden="true" /></summary>
        {shortCare && <CareJourney request={request} centreName={p.name} />}
        <p className="enquiry-pickup"><MapPin size={14} aria-hidden="true" /><span>From {request.pickup.label}</span></p>
        <small>{pickupPreference(request.transport)}</small>
      </details>
    </section>
    <div className="enquiry-layout">
      <section className="enquiry-contact" aria-label="Contact the centre">
        <div className="contact-buttons"><PublishedContacts p={p} compact /></div>
        {p.sourcePage && <a className="text-link" href={p.sourcePage} target="_blank" rel="noreferrer">Centre website or listing<ArrowUpRight size={14} /></a>}
        {p.mode === "demo" && <p className="demo-notice">Demo centre — no real contact details.</p>}
      </section>
      <section className="enquiry-send" aria-label="Message for the centre">
        <h3><MessageCircle size={22} aria-hidden="true" />Not sure what to say?</h3>
        {selected.length ? <div className="message-sample"><p>Hello, {shortCare ? "I need childcare for a few hours." : "I’m looking for long-term childcare."}</p><ol>{selected.slice(0, 2).map(q => <li key={q.id}>{q.text}</li>)}</ol></div> : <div className="message-empty"><p>Your message has no questions.</p><button className="secondary" onClick={() => update(questions.map(q => q.id))}>Use suggested message</button></div>}
        <details className="enquiry-preview"><summary>{selected.length > 2 ? `Read all ${selected.length} questions` : "Read full message"}<ChevronDown size={16} aria-hidden="true" /></summary><div>{text}</div></details>
        <div className="message-copy-action"><button className="secondary" disabled={!selected.length} onClick={copy}>{copyState === "copied" ? <Check size={17} /> : <Copy size={17} />}{copyState === "copied" ? "Message copied" : "Copy message to send"}</button><p className="enquiry-copy-status" role="status">{copyState === "copied" ? "Now paste it into WhatsApp or a text message." : "Use these words on a call, or copy and send them."}</p></div>
        {copyState === "manual" && <div className="enquiry-manual"><p>Select the message below, then copy it.</p><textarea readOnly aria-label="Message to copy" value={text} ref={el => { if (el) { el.focus(); el.select(); } }} /></div>}
      </section>
      <details className="enquiry-questions question-editor" open={showQuestions || undefined}><summary><ClipboardList size={19} aria-hidden="true" /><span>Change the message</span><ChevronDown size={18} aria-hidden="true" /></summary>
      <div>
        <div className="enquiry-section-heading"><h3 id={`${uid}-questions`}>What to ask</h3><button className="text-link" onClick={toggleAll}>{ids.length === questions.length ? "Remove all questions" : "Use all questions"}</button></div>
        <p className="enquiry-guide">Untick a question to leave it out of your message.</p>
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
                <div className="question-check-content"><p>{q.why}</p><p>{q.check.reason}</p>{q.check.source && <SourceLink source={q.check.source} />}{q.id === "age" && p.age?.alternative?.source && <SourceLink source={p.age.alternative.source} />}</div>
              </details> : <span className="question-routine">{q.topic} · {q.status}</span>}
              {q.state === "conflict" && <p>{q.why}</p>}
              {q.fee && (p.fees?.length || p.cost?.available) ? <details className="question-fee"><summary>View fee reference</summary><strong>{q.fee.label}</strong><p>{q.fee.note}</p>{p.cost?.available && <SourceLink source={p.cost.source} />}{!p.cost?.available && [...new Map((p.fees ?? []).filter(f => f.source).map(f => [f.source.url ?? f.source.label, f.source])).values()].map((source, i) => <SourceLink key={i} source={source} />)}</details> : null}
            </div>
          </article>)}
        </div>
      </div></details>
      <section className="enquiry-next"><div><h3>After the centre says yes</h3><p>Check pickup times and what to bring.</p></div><button className="primary" onClick={onPreparation}><ClipboardList size={18} />Get ready for child care<ArrowRight size={16} /></button></section>
    </div>
  </div>;
}
