import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { displayName } from "../shared/display.mjs";
import { plainReason } from "../shared/plain-copy.mjs";
import { ArrowRight, ArrowUpRight, Check, ChevronDown, Copy, X } from "lucide-react";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import { contactIntro, contactMessage, contactQuestions } from "../shared/contact-message.mjs";
import "./enquiry.css";
import { ReviewQuote } from './ReviewEvidence.jsx';
import VirtualEnquiry from './VirtualEnquiry.jsx';

const visitLine = (request) => {
  if (!request?.date) return "Your search details";
  let day = request.date;
  try { day = new Date(`${request.date}T12:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }); } catch { /* keep ISO date */ }
  const age = request.age === "" || request.age == null ? "" : request.age === "0" ? " · under 1" : ` · ${request.age} yrs`;
  return `${day} · ${request.deadline}–${request.end}${age}`;
};

/* Contact the centre (10 Oct 2026): a non-modal panel beside the map, in the
   same place as the Ask for me chat, so the plan and map stay in view. Ask for
   me turns this panel into the chat. */
export default function Enquiry({ p, request, selection, onSelection, onPreparation, onClose, notices = null, tourBehind = false }) {
  const [copyState, setCopyState] = useState("");
  const messageRef = useRef(null), copyAttempt = useRef(0), headingRef = useRef(null);
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
  // Keyboard users land in the panel; closing it returns them where they were.
  useEffect(() => {
    if (tourBehind) return;
    const previous = document.activeElement;
    headingRef.current?.focus({ preventScroll: true });
    return () => { if (previous?.isConnected && !document.activeElement?.closest?.(".enquiry-chat")) previous.focus?.({ preventScroll: true }); };
  }, [tourBehind]);
  const copy = async () => {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(text);
      if (attempt === copyAttempt.current) setCopyState("copied");
    } catch {
      if (attempt === copyAttempt.current) setCopyState("manual");
    }
  };
  return <section className={`contact-panel simple-contact${tourBehind ? " tour-behind" : ""}`} role="dialog" aria-modal="false" aria-labelledby={`${uid}-title`}
    onKeyDown={e => { if (e.key === "Escape" && !e.defaultPrevented) { e.stopPropagation(); onClose?.(); } }}>
    <header className="contact-panel-top">
      <div>
        <p className="contact-panel-kicker">Contact the centre</p>
        <h2 id={`${uid}-title`} ref={headingRef} tabIndex={-1}>{displayName(p.name)}</h2>
      </div>
      <button className="contact-panel-close" onClick={onClose} aria-label="Close contact" title="Close"><X size={19} /></button>
    </header>
    <div className="contact-panel-body">
      {notices}
      <section className="enquiry-contact" aria-label="Call or message the centre">
        <div className="contact-buttons"><PublishedContacts p={p} compact showSources={false} /></div>
        {p.sourcePage && <a className="text-link contact-website" aria-label="Centre website or listing" href={p.sourcePage} target="_blank" rel="noreferrer">Website<ArrowUpRight size={14} /></a>}
        {p.mode === "demo" && <p className="demo-notice">Demo centre — no real contact details.</p>}
      </section>
      <section className="enquiry-send" aria-labelledby={`${uid}-message`}>
        <div className="contact-message-heading"><div><h3 id={`${uid}-message`}>Your message</h3>
          <p className="enquiry-guide">Untick anything you don’t want to ask.</p></div></div>
        <details className="contact-request"><summary><span>{visitLine(request)}</span><ChevronDown size={16} aria-hidden="true" /></summary>
          <p className="contact-message-intro">{contactIntro(p, request)}</p>
        </details>
        <div className="question-list" aria-label="Questions to include">
          {questions.map(q => <div key={q.id} className={`contact-question ${ids.includes(q.id) ? "" : "not-selected"}`} data-question-id={q.id}>
            <label><input type="checkbox" checked={ids.includes(q.id)} onChange={() => toggle(q.id)} /><span>{q.text}</span></label>
            {!ids.includes(q.id) && <small className="question-excluded">Not included</small>}
            {q.checks.some(c => c.reviewTopic) && <small className="question-review-note">Based on parent reviews</small>}
            {q.conflicts.length > 0 && <p className="contact-question-warning">{q.conflicts.map(c => c.why).join(" ")}</p>}
          </div>)}
        </div>
        {copyState === "manual" && <textarea className="enquiry-manual-message" ref={messageRef} readOnly aria-label="Message to copy" value={text} />}
        <details className="contact-question-evidence"><summary>Why these questions<ChevronDown size={16} aria-hidden="true" /></summary>
          {(p.phone || p.whatsapp?.length > 0) && <div className="contact-evidence-item"><strong>Contact details</strong>
            {p.phone && <SourceLink source={p.phone.source}>{p.phone.display}</SourceLink>}
            {(p.whatsapp ?? []).map(contact => <SourceLink key={contact.href} source={contact.source}>{contact.display}</SourceLink>)}
          </div>}
          {questions.flatMap(q => q.checks).map(q => <div className="contact-evidence-item" key={q.id} data-check-id={q.id}>
            <strong>{q.topic}</strong><p>{q.why}</p>
            {q.reviewExcerpts?.map(review => <ReviewQuote key={review.id} review={review} topic={q.reviewTopic} />)}
            {q.check && <>{plainReason(q.check.reason) !== q.why && <p>{plainReason(q.check.reason)}</p>}{q.check.source && <SourceLink source={q.check.source} />}{q.id === "age" && p.age?.alternative?.source && <SourceLink source={p.age.alternative.source} />}</>}
            {q.fee && (p.fees?.length || p.cost?.available) ? <><strong>{q.fee.label}</strong><p>{q.fee.note}</p>{p.cost?.available && <SourceLink source={p.cost.source} />}{!p.cost?.available && [...new Map((p.fees ?? []).filter(f => f.source).map(f => [f.source.url ?? f.source.label, f.source])).values()].map((source, i) => <SourceLink key={i} source={source} />)}</> : null}
          </div>)}
        </details>
      </section>
      <p className="contact-panel-next"><span>After the centre says yes:</span><button className="text-link" onClick={onPreparation}>Get ready for childcare<ArrowRight size={15} aria-hidden="true" /></button></p>
    </div>
    <footer className="contact-panel-footer message-copy-action">
      <div className="enquiry-button-row"><button className="primary" disabled={!selected.length} onClick={copy}>{copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}{copyState === "copied" ? "Copied" : "Copy message"}</button>
        <VirtualEnquiry providerId={p.id} centre={p} requests={[request]} questionIds={selected.map(q => q.id)} /></div>
      <p className="enquiry-copy-status" role="status">{!selected.length ? "Tick a question to include it." : copyState === "copied" ? "Paste it into WhatsApp or a text message to send." : copyState === "manual" ? "Copying didn’t work. Select the text above and copy it." : `Copies your details and ${selected.length === 1 ? "the ticked question" : `the ${selected.length} ticked questions`}.`}</p>
    </footer>
  </section>;
}
