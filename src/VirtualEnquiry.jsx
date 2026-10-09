import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, ChevronDown, ClipboardList, Clock3, List, LoaderCircle, MessageCircle, Square, TriangleAlert, X } from 'lucide-react';
import { displayName } from '../shared/display.mjs';
import './virtual-enquiry.css';
import cloudConfig from './enquiry-config.json';

const cloud = cloudConfig.enabled && /^https:\/\/[a-z0-9.-]+\.appwrite\.(run|network)$/.test(cloudConfig.endpoint);
export const virtualEnquiryEnabled = cloud || (import.meta.env.DEV && import.meta.env.VITE_VIRTUAL_ENQUIRY === '1');
const OUTCOMES = { available: 'A place is available in this demo', unavailable: 'This request cannot be accepted', partial: 'Only one child can be accepted', conditional: 'One more step is needed', more_info: 'Some details still need checking' };
const CHILD_STATES = { available: 'Demo place available', unavailable: 'Cannot accept', conditional: 'A condition applies', more_info: 'Needs checking' };
const ENDED = ['failed', 'timed_out', 'cancelled'];
// A place for every child is the news, even when other questions are still open.
const summary = r => r.outcome !== 'available' && r.children?.length && r.children.every(c => c.state === 'available')
  ? { good: true, title: OUTCOMES.available, note: 'Your other questions still need an answer from the centre.' }
  : { good: r.outcome === 'available', title: OUTCOMES[r.outcome] };
const active = j => j && ['queued', 'waiting'].includes(j.state);
const sessionKey = 'equalpath:virtual-enquiry:session', jobsKey = 'equalpath:virtual-enquiry:jobs';
function session() {
  let token = sessionStorage.getItem(sessionKey);
  if (!/^[a-f0-9]{64}$/.test(token ?? '')) {
    token = [...crypto.getRandomValues(new Uint8Array(32))].map(x => x.toString(16).padStart(2, '0')).join('');
    sessionStorage.setItem(sessionKey, token);
  }
  return token;
}
async function signature(payload) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(payload))))].map(x => x.toString(16).padStart(2, '0')).join(''); }
function call(body, signal) {
  return fetch(cloud ? cloudConfig.endpoint : '/virtual-enquiry-api', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-EqualPath-Sandbox': '1', Authorization: `Bearer ${session()}` }, body: JSON.stringify(body), signal });
}
async function query(body, signal) {
  const r = await call(body, signal || AbortSignal.timeout(cloud ? 30000 : 8000)), value = await r.json();
  if (!r.ok) { const error = new Error(value.error || 'The demo service is unavailable.'); error.status = r.status; throw error; }
  return value.job;
}
const visitDay = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }); } catch { return date; } };
const ageText = (age) => age === '' ? 'age not set' : age === '0' ? 'under 1' : `${age} years old`;
const centreName = (t) => displayName(t.centre?.name || t.job?.branch?.listedName || t.job?.branch?.name || 'The centre');

/* Ask for me (10 Oct 2026): the enquiry runs at page level, so it keeps going
   after the Contact window closes. Its chat is a small window at the bottom
   right (a sheet on phones), and a reply that arrives while the chat is tucked
   away, or while another window is open, raises a notice with the next step. */
const EnquiryContext = createContext(null);

function useTopModal() {
  const [modal, setModal] = useState(null);
  useEffect(() => {
    const check = () => {
      const open = [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch { return true; } });
      setModal(open.at(-1) || null);
    };
    check();
    const watcher = new MutationObserver(check);
    watcher.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => watcher.disconnect();
  }, []);
  return modal;
}

export function EnquiryProvider({ children, actions, onChatChange }) {
  const [threads, setThreads] = useState([]);
  const [view, setView] = useState({ key: null, open: false });
  const [notice, setNotice] = useState(null);
  const modal = useTopModal();
  const threadsRef = useRef(threads), viewRef = useRef(view), modalRef = useRef(modal), actionsRef = useRef(actions), locks = useRef(new Set());
  threadsRef.current = threads; viewRef.current = view; modalRef.current = modal; actionsRef.current = actions;
  const patch = useCallback((key, change) => setThreads(list => list.map(t => t.key === key ? { ...t, ...(typeof change === 'function' ? change(t) : change) } : t)), []);
  const start = useCallback(async (key, payload) => {
    const current = threadsRef.current.find(t => t.key === key);
    if (locks.current.has(key) || (current?.job && !ENDED.includes(current.job.state))) return;
    locks.current.add(key); patch(key, { busy: true, error: '' });
    try {
      const sig = await signature(payload);
      let cached; try { cached = JSON.parse(sessionStorage.getItem(jobsKey) || '{}')[sig]; } catch { /* No saved request. */ }
      let next, expired = false;
      if (cached) {
        try { next = await query({ action: 'get', id: cached }); }
        catch (e) { if (e.status !== 404) throw e; expired = true; }
      }
      if (!next || ENDED.includes(next.state)) {
        const nonceKey = `equalpath:virtual-enquiry:nonce:${sig}`;
        let nonce = sessionStorage.getItem(nonceKey);
        // Preserve the same idempotency key after a lost network response.
        // Only an explicit retry of a known terminal failure creates a new one.
        if (!/^[a-f0-9]{32}$/.test(nonce || '') || next || expired) {
          nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
          sessionStorage.setItem(nonceKey, nonce);
        }
        next = await query({ action: 'create', request: payload, ...(cloud ? { nonce } : {}) });
      }
      patch(key, t => ({ job: next, paused: false, retry: t.retry + 1, settled: !active(next) }));
      try {
        const cachedJobs = JSON.parse(sessionStorage.getItem(jobsKey) || '{}'); cachedJobs[sig] = next.id;
        sessionStorage.setItem(jobsKey, JSON.stringify(Object.fromEntries(Object.entries(cachedJobs).slice(-30))));
      } catch { patch(key, { error: 'The request is running, but this browser could not remember it for a refresh.' }); }
    } catch (e) { patch(key, { error: e.message }); }
    finally { locks.current.delete(key); patch(key, { busy: false }); }
  }, [patch]);
  const settle = useCallback((key) => {
    const v = viewRef.current;
    if (v.open && v.key === key && !modalRef.current) return;
    patch(key, { unread: true }); setNotice(key);
  }, [patch]);
  const ask = useCallback(({ payload, centre, request, family }) => {
    const key = JSON.stringify(payload);
    setThreads(list => list.some(t => t.key === key) ? list : [...list.slice(-4),
      { key, payload, centre, request, family, job: null, error: '', busy: false, paused: false, retry: 0, unread: false }]);
    setView({ key, open: true }); setNotice(n => n === key ? null : n);
    // The chat replaces the window it was started from, so the map stays usable.
    actionsRef.current?.closeDialogs?.();
    start(key, payload);
  }, [start]);
  const show = useCallback((key) => { actionsRef.current?.closeDialogs?.(); setView({ key, open: true }); setNotice(null); patch(key, { unread: false }); }, [patch]);
  const minimise = useCallback(() => setView(v => ({ ...v, open: false })), []);
  const remove = useCallback((key) => { setThreads(list => list.filter(t => t.key !== key)); setView(v => v.key === key ? { key: null, open: false } : v); setNotice(n => n === key ? null : n); }, []);
  const chatShown = view.open && !modal && threads.some(t => t.key === view.key);
  useEffect(() => { onChatChange?.(chatShown); }, [chatShown, onChatChange]);
  // Reading the open chat clears its unread mark.
  useEffect(() => {
    if (!view.open || modal) return;
    const t = threads.find(x => x.key === view.key);
    if (t?.unread) patch(t.key, { unread: false });
    if (notice === view.key) setNotice(null);
  }, [view, modal, threads, notice, patch]);
  const value = { threads, view, notice, modal, ask, show, minimise, remove, start, patch, settle, dismissNotice: () => setNotice(null), actions: actionsRef };
  return <EnquiryContext.Provider value={value}>{children}{threads.map(t => <ThreadFollower key={t.key} thread={t} />)}</EnquiryContext.Provider>;
}

// Follows one request's durable events without holding anything open on the server.
function ThreadFollower({ thread }) {
  const { patch, settle } = useContext(EnquiryContext);
  const { key, job, paused, retry } = thread;
  useEffect(() => {
    if (!job?.id || !active(job) || paused) return;
    const controller = new AbortController();
    const update = (next) => { if (controller.signal.aborted) return false; const done = !active(next); patch(key, { job: next, settled: done }); if (done) settle(key); return done; };
    (async () => {
      try {
        if (cloud) {
          const until = Date.now() + 13 * 60000;
          for (let attempt = 0; Date.now() < until; attempt++) {
            await new Promise((resolve, reject) => {
              const stop = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
              const timer = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, attempt < 4 ? 2500 : 5000);
              controller.signal.addEventListener('abort', stop, { once: true });
              if (controller.signal.aborted) stop();
            });
            const next = await query({ action: 'get', id: job.id }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
            if (update(next)) return;
          }
          throw new Error('Live updates paused. Reconnect to check the reply.');
        }
        const r = await call({ action: 'watch', id: job.id }, controller.signal);
        if (!r.ok || !r.body) throw new Error('Live updates paused. Reconnect to check the reply.');
        const reader = r.body.getReader(), decoder = new TextDecoder(); let pending = '', terminal = false;
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          pending += decoder.decode(value, { stream: true });
          let end;
          while ((end = pending.indexOf('\n')) !== -1) {
            const line = pending.slice(0, end); pending = pending.slice(end + 1);
            if (!line.trim()) continue;
            terminal = update(JSON.parse(line).job) || terminal;
          }
        }
        if (!terminal && !controller.signal.aborted) throw new Error('Live updates paused. Reconnect to check the reply.');
      } catch (e) { if (!controller.signal.aborted) patch(key, { error: e.message, paused: true }); }
    })();
    return () => controller.abort();
  }, [job?.id, paused, retry]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

/* The button beside Copy message. It only starts (or reopens) the chat. */
export default function VirtualEnquiry(props) {
  const ctx = useContext(EnquiryContext);
  if (!virtualEnquiryEnabled || !ctx) return null;
  // Different request details can never inherit an earlier acceptance.
  const children = (props.requests || []).map((r, i) => ({ label: r.label || `Child ${i + 1}`, age: String(r.age ?? ''), start: r.deadline, end: r.end }));
  const payload = { branchId: props.providerId, date: props.requests?.[0]?.date, children,
    questions: props.questionIds ?? ['visit', 'fees'], scenario: props.scenario || 'rules' };
  const thread = ctx.threads.find(t => t.key === JSON.stringify(payload));
  const disabled = !payload.date || !children.length || children.some(c => !c.start || !c.end) || !payload.questions.length;
  const label = thread?.job?.state === 'replied' ? 'View reply' : active(thread?.job) ? 'View chat' : 'Ask for me';
  return <button className="secondary virtual-enquiry-toggle" disabled={disabled}
    onClick={() => thread?.job && !ENDED.includes(thread.job.state) ? ctx.show(thread.key) : ctx.ask({ payload, centre: props.centre, request: props.requests?.[0], family: children.length > 1 || !!props.family })}>
    {active(thread?.job) ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageCircle size={17} aria-hidden="true" />}
    {label}<span className="virtual-badge">Demo</span>
  </button>;
}

function nextSteps(t, act) {
  const r = t.job?.result;
  const options = { label: t.family ? 'Back to your plan' : 'See other options', icon: List, run: () => act.current?.options?.(t.family) };
  const prepare = { label: 'Get ready for childcare', icon: ClipboardList, run: () => act.current?.prepare?.(t.centre, t.request) };
  const contact = { label: 'Contact the centre', icon: MessageCircle, run: () => act.current?.contact?.(t.centre, t.request) };
  if (!r) return [];
  if (t.family || !t.centre) return [options];
  if (r.outcome === 'available') return [prepare, options];
  if (summary(r).good) return [prepare, contact];
  if (r.outcome === 'unavailable') return [options, contact];
  return [contact, options];
}

/* Rendered inside the app, beside the map: the chat window, its tucked-away
   pill, and the reply notice. */
export function EnquiryDock() {
  const ctx = useContext(EnquiryContext);
  if (!ctx || !ctx.threads.length) return <ReplyNotice />;
  const { threads, view, modal } = ctx;
  const current = threads.find(t => t.key === view.key);
  return <>
    {!modal && view.open && current && <ChatWindow thread={current} />}
    {!modal && !(view.open && current) && <ChatPill />}
    <ReplyNotice />
  </>;
}

function ChatPill() {
  const { threads, show } = useContext(EnquiryContext);
  const t = threads.find(x => x.unread) || [...threads].reverse().find(x => active(x.job)) || threads.at(-1);
  if (!t) return null;
  const waiting = threads.filter(x => active(x.job)).length;
  const text = t.unread ? `${centreName(t)} replied` : active(t.job) || t.busy ? `Asking ${centreName(t)}…` : t.job?.state === 'replied' ? `Reply from ${centreName(t)}` : centreName(t);
  return <button className={`enquiry-pill${t.unread ? ' has-unread' : ''}`} onClick={() => show(t.key)} aria-label={`Open chat: ${text}`}>
    <span className="enquiry-pill-icon" aria-hidden="true">{active(t.job) || t.busy ? <LoaderCircle size={17} className="spin" /> : <MessageCircle size={17} />}{t.unread && <i />}</span>
    <span className="enquiry-pill-text">{text}</span>
    {waiting > 1 && <small>{waiting} waiting</small>}
  </button>;
}

function ReplyNotice() {
  const ctx = useContext(EnquiryContext);
  const t = ctx?.notice && ctx.threads.find(x => x.key === ctx.notice);
  if (!t) return null;
  const r = t.job?.result, failed = !r;
  const steps = nextSteps(t, ctx.actions).slice(0, 1);
  const body = <div className={`enquiry-notice${ctx.modal ? ' in-window' : ''}`} role="status" aria-live="polite">
    <span className={`enquiry-notice-icon ${r && summary(r).good ? 'good' : 'warn'}`} aria-hidden="true">{r && summary(r).good ? <Check size={18} /> : failed ? <Clock3 size={18} /> : <TriangleAlert size={18} />}</span>
    <div className="enquiry-notice-main">
      <strong>{failed ? `No reply from ${centreName(t)}` : `${centreName(t)} replied`}</strong>
      <p>{failed ? 'No place has been confirmed. You can try again from the chat.' : summary(r).title}</p>
      <div className="enquiry-notice-actions">
        {steps.map(s => <button key={s.label} className="primary" onClick={() => { ctx.dismissNotice(); ctx.patch(t.key, { unread: false }); s.run(); }}>{s.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
        <button className="text-link enquiry-notice-view" onClick={() => ctx.show(t.key)}>View chat</button>
      </div>
    </div>
    <button className="enquiry-notice-close" aria-label="Dismiss" onClick={ctx.dismissNotice}><X size={17} /></button>
  </div>;
  // Inside an open window the rest of the page can't be reached, so the
  // notice joins that window.
  return ctx.modal ? createPortal(body, ctx.modal) : body;
}

function ChatWindow({ thread: t }) {
  const ctx = useContext(EnquiryContext);
  const { threads, show, minimise, remove, start, patch, actions } = ctx;
  const log = useRef(null), nearEnd = useRef(true), shown = useRef(new Set());
  const { payload, job, busy, error, paused } = t;
  const ended = job && ENDED.includes(job.state);
  useEffect(() => { nearEnd.current = true; }, [t.key]);
  useEffect(() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [t.key, job?.events?.length, job?.state, busy]);
  const cancel = async () => { patch(t.key, { busy: true }); try { const j = await query({ action: 'cancel', id: job.id }); patch(t.key, { job: j }); } catch (e) { patch(t.key, { error: e.message }); } finally { patch(t.key, { busy: false }); } };
  const one = payload.children.length === 1;
  const steps = nextSteps(t, actions);
  return <section className="enquiry-chat" role="dialog" aria-modal="false" aria-label={`Ask for me: ${centreName(t)}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); minimise(); } }}>
    <header className="enquiry-chat-top">
      <div><p className="enquiry-chat-kicker">Ask for me <span className="virtual-badge">Demo</span></p><h2>{centreName(t)}</h2></div>
      <button className="enquiry-chat-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><ChevronDown size={19} /></button>
      {!active(job) && !busy && <button className="enquiry-chat-icon" onClick={() => remove(t.key)} aria-label="Close chat" title="Close"><X size={18} /></button>}
    </header>
    {threads.length > 1 && <nav className="enquiry-chat-threads" aria-label="Your enquiries">{threads.map(x => <button key={x.key} aria-current={x.key === t.key ? 'true' : undefined} onClick={() => show(x.key)}>
      {active(x.job) ? <LoaderCircle size={13} className="spin" aria-hidden="true" /> : x.job?.result && summary(x.job.result).good ? <Check size={13} aria-hidden="true" /> : <MessageCircle size={13} aria-hidden="true" />}<span>{centreName(x)}</span><small>{visitDay(x.payload.date)}</small>{x.unread && <i aria-label="New reply" />}</button>)}</nav>}
    <p className="enquiry-chat-note">Simulated reply. Uses the centre’s listed ages and hours; no real centre is contacted.</p>
    <div className="enquiry-chat-log" ref={log} role="log" aria-label="Enquiry messages" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = log.current; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      <article className="virtual-bubble virtual-bubble-you">
        <p>{visitDay(payload.date)} · {payload.children.map(c => `${one ? 'my child' : c.label}, ${ageText(c.age)}, ${c.start}–${c.end}`).join('; ')}</p>
        <p>Can you take {payload.children.length === 2 ? 'both children' : 'my child'} for this visit?</p>
        {payload.questions.length > 1 && <small>Also asks your {payload.questions.length - 1} other {payload.questions.length === 2 ? 'question' : 'questions'}.</small>}
      </article>
      {busy && !job && <p className="virtual-chat-event"><LoaderCircle size={14} className="spin" />Sending your request…</p>}
      {job?.events.map((event, i) => <p className="virtual-chat-event" key={`${job.id}-${i}`}><Check size={14} /><span>{event.text}</span></p>)}
      {active(job) && !paused && <div className="virtual-bubble virtual-wait"><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span><span>{job.state === 'queued' ? 'In line. It will be sent when it’s your turn.' : 'The centre is replying…'}</span></div>}
      {job?.result && <Reply key={job.id} name={centreName(t)} result={job.result} animate={!shown.current.has(job.id)} onComplete={() => shown.current.add(job.id)} steps={steps} onStep={minimise}
        scroll={() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }} />}
      {ended && <div className="virtual-bubble virtual-unresolved"><Clock3 size={18} /><div><strong>{job.state === 'timed_out' ? 'No reply yet' : job.state === 'cancelled' ? 'Enquiry stopped' : 'Could not send the request'}</strong><p>No place has been confirmed.</p></div></div>}
      {error && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>{error}</p></div>}
    </div>
    <footer className="enquiry-chat-footer">
      <p>{active(job) ? 'You can keep browsing. We’ll let you know when the centre replies.' : job?.result ? 'This demo doesn’t make a booking.' : ' '}</p>
      {active(job) && <button className="secondary" disabled={busy} onClick={cancel}><Square size={13} />Stop</button>}
      {paused && <button className="secondary" onClick={() => patch(t.key, x => ({ error: '', paused: false, retry: x.retry + 1 }))}>Reconnect</button>}
      {((!job && error && !busy) || ended) && <button className="secondary" disabled={busy} onClick={() => start(t.key, payload)}>Try again</button>}
    </footer>
  </section>;
}

function Reply({ name, result, scroll, animate, onComplete, steps, onStep }) {
  const [count, setCount] = useState(() => !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches ? result.rawReply.length : 0);
  const onScroll = useRef(scroll); onScroll.current = scroll;
  useEffect(() => {
    if (count >= result.rawReply.length) return;
    const timer = setTimeout(() => setCount(n => Math.min(result.rawReply.length, n + 24)), 35);
    return () => clearTimeout(timer);
  }, [result.rawReply, count]);
  useEffect(() => { onScroll.current(); }, [count]);
  const done = count >= result.rawReply.length;
  useEffect(() => { if (done) onComplete(); }, [done, onComplete]);
  return <>
    <article className="virtual-bubble virtual-bubble-reply" aria-busy={!done}><strong>{name}</strong>
      <p className="virtual-reply-text" aria-hidden={!done}>{result.rawReply.slice(0, count)}{!done && <span className="virtual-caret" aria-hidden="true">▍</span>}</p>
    </article>
    {done && <section className={`virtual-chat-result ${summary(result).good ? 'good' : 'warn'}`} aria-label="Reply summary">
      <h3>{summary(result).good ? <Check size={18} /> : <TriangleAlert size={18} />}{summary(result).title}</h3>
      {summary(result).note && <p className="virtual-result-note">{summary(result).note}</p>}
      {result.children.map(c => <div key={c.label} className="virtual-child-result"><strong>{result.children.length > 1 ? `${c.label} · ` : ''}{CHILD_STATES[c.state]}</strong><p>{c.reason}</p>{c.estimatedFee !== null && <small>Listed estimate: MYR {c.estimatedFee.toFixed(2)}</small>}</div>)}
      {steps.length > 0 && <div className="virtual-next">
        <p>Next step</p>
        {steps.map((s, i) => <button key={s.label} className={i === 0 ? 'primary' : 'secondary'} onClick={() => { onStep?.(); s.run(); }}><s.icon size={16} aria-hidden="true" />{s.label}{i === 0 && <ArrowRight size={15} aria-hidden="true" />}</button>)}
      </div>}
      <details><summary>What still needs checking</summary><ul>{result.limitations.map(x => <li key={x}>{x}</li>)}</ul><p>These hours use your search start and end. Travel time is not included.</p></details>
    </section>}
  </>;
}
