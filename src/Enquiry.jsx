import { useId, useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, ClipboardList, Copy, MessageCircle } from "lucide-react";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import { contactIntro, contactMessage, contactQuestions } from "../shared/contact-message.mjs";
import "./enquiry.css";

export default function Enquiry({ p, request, selection, onSelection, onPreparation }) {
  const [copyState, setCopyState] = useState("");
  const messageRef = useRef(null), copyAttempt = useRef(0);
  const uid = useId();
  const questions = contactQuestions(p, request);
  const ids = selection ?? questions.map(q => q.id);
  const selected = questions.filter(q => ids.includes(q.id));
  const text = contactMessage(p, request, selected);
  const update = next => { copyAttempt.current++; onSelection(next); setCopyState(""); };
  const toggle = id => update(ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  useLayoutEffect(() => {
    if (copyState === "manual") { messageRef.current?.focus(); messageRef.current?.select(); }
  }, [copyState]);
  const copy = async () => {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(text);
      if (attempt === copyAttempt.current) setCopyState("copied");
    } catch {
      if (attempt === copyAttempt.current) setCopyState("manual");
    }
  };
  return <div className="enquiry-page simple-contact">
    <section className="request-context enquiry-visit" aria-label="Centre and visit">
      <h3>{p.name}</h3>
      <section className="enquiry-contact" aria-label="Contact the centre">
        <div className="contact-buttons"><PublishedContacts p={p} compact showSources={false} /></div>
        {p.sourcePage && <a className="text-link contact-website" aria-label="Centre website or listing" href={p.sourcePage} target="_blank" rel="noreferrer">Website<ArrowUpRight size={14} /></a>}
        {p.mode === "demo" && <p className="demo-notice">Demo centre — no real contact details.</p>}
      </section>
    </section>
    <div className="enquiry-layout">
      <section className="enquiry-send" aria-labelledby={`${uid}-message`}>
        <div className="contact-message-heading"><MessageCircle size={23} aria-hidden="true" /><div><h3 id={`${uid}-message`}>Your message</h3>
        <p className="enquiry-guide">Untick anything you don’t want to ask.</p></div></div>
        <div className="contact-message-paper">
          <details className="contact-request" open><summary>Your search details<ChevronDown size={16} aria-hidden="true" /></summary>
            <p className="contact-message-intro">{contactIntro(p, request)}</p>
          </details>
          <div className="question-list" aria-label="Questions to include">
            {questions.map(q => <div key={q.id} className={`contact-question ${ids.includes(q.id) ? "" : "not-selected"}`} data-question-id={q.id}>
              <label><input type="checkbox" checked={ids.includes(q.id)} onChange={() => toggle(q.id)} /><span>{q.text}</span></label>
              {!ids.includes(q.id) && <small className="question-excluded">Not included</small>}
              {q.conflicts.length > 0 && <p className="contact-question-warning">{q.conflicts.map(c => c.why).join(" ")}</p>}
            </div>)}
          </div>
          <p className="contact-message-thanks">Thank you!</p>
        </div>
        <div className="message-copy-action">
          <button className="primary" disabled={!selected.length} onClick={copy}>{copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}{copyState === "copied" ? "Copied" : "Copy message"}</button>
          <p className="enquiry-copy-status" role="status">{!selected.length ? "Tick a question to include it." : copyState === "copied" ? "Paste it into WhatsApp or a text message to send." : copyState === "manual" ? "Copy did not work. Copy the selected text below." : "Copies your details and the checked questions."}</p>
        </div>
        {copyState === "manual" && <textarea className="enquiry-manual-message" ref={messageRef} readOnly aria-label="Message to copy" value={text} />}
        <details className="contact-question-evidence"><summary>More details<ChevronDown size={16} aria-hidden="true" /></summary>
          {(p.phone || p.whatsapp?.length > 0) && <div className="contact-evidence-item"><strong>Contact details</strong>
            {p.phone && <SourceLink source={p.phone.source}>{p.phone.display}</SourceLink>}
            {(p.whatsapp ?? []).map(contact => <SourceLink key={contact.href} source={contact.source}>{contact.display}</SourceLink>)}
          </div>}
          {questions.flatMap(q => q.checks).map(q => <div className="contact-evidence-item" key={q.id} data-check-id={q.id}>
            <strong>{q.topic}</strong><p>{q.why}</p>
            {q.check && <><p>{q.check.reason}</p>{q.check.source && <SourceLink source={q.check.source} />}{q.id === "age" && p.age?.alternative?.source && <SourceLink source={p.age.alternative.source} />}</>}
            {q.fee && (p.fees?.length || p.cost?.available) ? <><strong>{q.fee.label}</strong><p>{q.fee.note}</p>{p.cost?.available && <SourceLink source={p.cost.source} />}{!p.cost?.available && [...new Map((p.fees ?? []).filter(f => f.source).map(f => [f.source.url ?? f.source.label, f.source])).values()].map((source, i) => <SourceLink key={i} source={source} />)}</> : null}
          </div>)}
        </details>
      </section>
    </div>
    <section className="enquiry-next"><div><h3>After the centre says yes</h3><p>Check pickup times and what to bring.</p></div><button className="secondary" onClick={onPreparation}><ClipboardList size={18} />Get ready for child care<ArrowRight size={16} /></button></section>
  </div>;
}
