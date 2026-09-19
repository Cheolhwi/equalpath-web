import CareJourney from "./CareJourney.jsx";
import { isShortCare } from "../shared/request.mjs";
import { useId, useRef, useState } from "react";
import { ArrowRight, ArrowUpRight, ArrowDownUp, Check, ChevronDown, ChevronUp, ClipboardList, Copy, Link2, MapPin } from "lucide-react";
import { PublishedContacts, SourceLink } from "./ProviderViews.jsx";
import { childAge, enquiryMessage, enquiryView, pickupPreference, visitDate } from "../shared/enquiry-view.mjs";
import "./enquiry.css";

export default function Enquiry({ p, request, selection, onSelection, onPreparation }) {
  const shortCare = isShortCare(request);
  const [copyState, setCopyState] = useState("");
  const [reordering, setReordering] = useState(false);
  const previewRef = useRef(null);
  const messageRef = useRef(null);
  const copyAttempt = useRef(0);
  const uid = useId();
  const questions = enquiryView(p, request);
  const ids = (selection ?? questions.map(q => q.id)).filter(id => questions.some(q => q.id === id));
  // Keep unticked questions in place so a selection never moves under the pointer.
  const [questionOrder, setQuestionOrder] = useState(() => [...ids, ...questions.filter(q => !ids.includes(q.id)).map(q => q.id)]);
  const ordered = [...questionOrder, ...questions.map(q => q.id).filter(id => !questionOrder.includes(id))].map(id => questions.find(q => q.id === id)).filter(Boolean);
  const selected = ids.map(id => questions.find(q => q.id === id));
  const text = selected.length ? enquiryMessage(p, request, selected) : "";
  const update = next => { copyAttempt.current++; onSelection(next); setCopyState(""); };
  const toggle = id => update(ordered.filter(q => q.id === id ? !ids.includes(id) : ids.includes(q.id)).map(q => q.id));
  const move = (id, delta) => {
    const next = [...ids], i = next.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= next.length) return;
    const order = ordered.map(q => q.id), from = order.indexOf(id), to = order.indexOf(next[j]);
    [order[from], order[to]] = [order[to], order[from]];
    [next[i], next[j]] = [next[j], next[i]];
    setQuestionOrder(order);
    update(next);
  };
  const copy = async () => {
    const attempt = ++copyAttempt.current;
    try {
      await navigator.clipboard.writeText(text);
      if (attempt === copyAttempt.current) setCopyState("copied");
    } catch {
      if (attempt !== copyAttempt.current) return;
      setCopyState("manual");
      messageRef.current?.focus();
      messageRef.current?.select();
    }
  };
  const allSelected = ids.length === questions.length;
  const toggleAll = () => update(allSelected ? [] : ordered.map(q => q.id));
  const preview = () => {
    previewRef.current?.scrollIntoView({ block: "start" });
    previewRef.current?.focus({ preventScroll: true });
  };
  return <div className="enquiry-page question-flow">
    <section className="request-context enquiry-visit" aria-label="Centre and visit">
      <h3>{p.name}</h3>
      <p className="contact-visit-summary">{shortCare ? <time dateTime={request.date}>{visitDate(request.date)}</time> : <span>Long term</span>}<span>{childAge(request.age)}</span></p>
      <details className="contact-request" open><summary>Your search details<ChevronDown size={16} aria-hidden="true" /></summary>
        {shortCare && <CareJourney request={request} centreName={p.name} />}
        <p className="enquiry-pickup"><MapPin size={14} aria-hidden="true" /><span>From {request.pickup.label}</span></p>
        <small>{pickupPreference(request.transport)}</small>
      </details>
    </section>
    <section className="enquiry-contact" aria-label="Contact the centre">
      <div className="contact-buttons"><PublishedContacts p={p} compact /></div>
      {p.sourcePage && <a className="text-link" href={p.sourcePage} target="_blank" rel="noreferrer">Centre website or listing<ArrowUpRight size={14} /></a>}
      {p.mode === "demo" && <p className="demo-notice">Demo centre — no real contact details.</p>}
    </section>
    <div className="enquiry-layout">
      <section className="enquiry-questions" aria-labelledby={`${uid}-questions`}>
        <h3 className="enquiry-step" id={`${uid}-questions`}><span aria-hidden="true">1</span>Choose questions</h3>
        <p className="enquiry-guide">Keep the questions you want to ask. Untick any you do not need.</p>
        <div className="question-selection-bar"><strong aria-live="polite">{ids.length} of {questions.length} selected</strong><button className="text-link" onClick={toggleAll}>{allSelected ? "Unselect all" : "Select all"}</button></div>
        <div className="question-edit-tools">
          <button className="secondary" aria-pressed={reordering} disabled={ids.length < 2 && !reordering} onClick={() => setReordering(value => !value)}>{reordering ? <Check size={16} /> : <ArrowDownUp size={16} />}{reordering ? "Done ordering" : "Change order"}</button>
          <button className="text-link" onClick={preview}>Preview message<ArrowRight size={16} /></button>
        </div>
        {reordering && <p className="enquiry-order-help">Use the arrows to move checked questions up or down.</p>}
        <div className="question-list">
          {ordered.map(q => <article key={q.id} className={`enquiry-question ${q.state} ${ids.includes(q.id) ? "" : "not-selected"}`} data-question-id={q.id}>
            <div className="enquiry-question-main">
              <label><input type="checkbox" checked={ids.includes(q.id)} onChange={() => toggle(q.id)} aria-describedby={`${uid}-${q.id}-reason`} /><span>{q.text}</span></label>
              {reordering && ids.includes(q.id) && <div className="enquiry-reorder">
                <button aria-label={`Move ${q.topic} question up`} disabled={ids.indexOf(q.id) === 0} onClick={() => move(q.id, -1)}><ChevronUp size={18} /></button>
                <button aria-label={`Move ${q.topic} question down`} disabled={ids.indexOf(q.id) === ids.length - 1} onClick={() => move(q.id, 1)}><ChevronDown size={18} /></button>
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
      </section>
      <section className="enquiry-send" aria-labelledby={`${uid}-preview`} ref={previewRef} tabIndex={-1}>
        <h3 className="enquiry-step" id={`${uid}-preview`}><span aria-hidden="true">2</span>Review and copy</h3>
        <p className="enquiry-guide" id={`${uid}-copy-help`}>Your search details and checked questions are included. This preview updates as you make changes.</p>
        {selected.length ? <><label className="message-preview-label" htmlFor={`${uid}-message`}>Message to copy <span>{selected.length} {selected.length === 1 ? "question" : "questions"}</span></label><textarea id={`${uid}-message`} className="enquiry-message" ref={messageRef} readOnly value={text} aria-describedby={`${uid}-copy-help ${uid}-scroll-help`} /><p className="message-scroll-hint" id={`${uid}-scroll-help`}>Scroll to read the full message. Copy includes it all.</p></> : <p className="message-empty">Select at least one question to make your message.</p>}
        <div className="message-copy-action">
          <button className="primary" disabled={!selected.length} onClick={copy}>{copyState === "copied" ? <Check size={18} /> : <Copy size={18} />}{copyState === "copied" ? "Message copied" : "Copy message to send"}</button>
          <p className="enquiry-copy-status" role="status">{copyState === "copied" ? "Copied. Paste it into WhatsApp or a text message to send." : copyState === "manual" ? "Copy did not work. The message is selected above. Copy it using your device’s copy option." : "After copying, paste it into WhatsApp or a text message to send."}</p>
        </div>
        <p className="enquiry-call-hint">Calling instead? You can read these questions on the call.</p>
      </section>
    </div>
    <section className="enquiry-next"><div><h3>After the centre says yes</h3><p>Check pickup times and what to bring.</p></div><button className="primary" onClick={onPreparation}><ClipboardList size={18} />Get ready for child care<ArrowRight size={16} /></button></section>
  </div>;
}
