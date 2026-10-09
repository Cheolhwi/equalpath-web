import { useEffect, useRef, useState } from 'react';
import { Check, Clock3, LoaderCircle, MessageCircle, Square, TriangleAlert } from 'lucide-react';
import Dialog from './Dialog.jsx';
import './virtual-enquiry.css';
import cloudConfig from './enquiry-config.json';

const cloud = cloudConfig.enabled && /^https:\/\/[a-z0-9.-]+\.appwrite\.(run|network)$/.test(cloudConfig.endpoint);
export const virtualEnquiryEnabled = cloud || (import.meta.env.DEV && import.meta.env.VITE_VIRTUAL_ENQUIRY === '1');
const OUTCOMES = { available: 'A place is available in this demo', unavailable: 'This request cannot be accepted', partial: 'Only one child can be accepted', conditional: 'One more step is needed', more_info: 'Some details still need checking' };
const CHILD_STATES = { available: 'Demo place available', unavailable: 'Cannot accept', conditional: 'A condition applies', more_info: 'Needs checking' };
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
export default function VirtualEnquiry(props) {
  if (!virtualEnquiryEnabled) return null;
  // Different request details can never inherit an earlier acceptance.
  const payload = { branchId: props.providerId, date: props.requests?.[0]?.date,
    children: (props.requests || []).map((r, i) => ({ label: r.label || `Child ${i + 1}`, age: String(r.age ?? ''), start: r.deadline, end: r.end })),
    questions: props.questionIds ?? ['visit', 'fees'], scenario: props.scenario || 'rules' };
  return <VirtualEnquiryPanel key={JSON.stringify(payload)} payload={payload} />;
}
function VirtualEnquiryPanel({ payload }) {
  const [open, setOpen] = useState(false), [job, setJob] = useState(null);
  const [error, setError] = useState(''), [busy, setBusy] = useState(false), [paused, setPaused] = useState(false), [retry, setRetry] = useState(0);
  const live = useRef(true), lock = useRef(false), log = useRef(null), nearEnd = useRef(true), shownReplies = useRef(new Set());
  useEffect(() => { live.current = true; return () => { live.current = false; }; }, []);
  // Keep the reply updated even if the chat is closed. Only opening/pressing the
  // button can create a request; mounting this component never sends anything.
  useEffect(() => {
    if (!job?.id || !active(job) || paused) return;
    const controller = new AbortController();
    (async () => {
      try {
        if (cloud) {
          // Appwrite executions are short-lived. Follow durable Telegram events,
          // without holding a server process open or polling after completion.
          const until = Date.now() + 13 * 60000;
          for (let attempt = 0; Date.now() < until; attempt++) {
            await new Promise((resolve, reject) => {
              const stop = () => { clearTimeout(timer); reject(new DOMException('Stopped', 'AbortError')); };
              const timer = setTimeout(() => { controller.signal.removeEventListener('abort', stop); resolve(); }, attempt < 4 ? 2500 : 5000);
              controller.signal.addEventListener('abort', stop, { once: true });
              if (controller.signal.aborted) stop();
            });
            const next = await query({ action: 'get', id: job.id }, AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]));
            if (!controller.signal.aborted) setJob(next);
            if (!active(next)) return;
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
            const next = JSON.parse(line).job;
            if (!controller.signal.aborted) { setJob(next); terminal = !active(next); }
          }
        }
        if (!terminal && !controller.signal.aborted) throw new Error('Live updates paused. Reconnect to check the reply.');
      } catch (e) { if (!controller.signal.aborted && live.current) { setError(e.message); setPaused(true); } }
    })();
    return () => controller.abort();
  }, [job?.id, paused, retry]);
  useEffect(() => {
    if (open && nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [open, job?.events.length, job?.state, busy]);
  const start = async () => {
    setOpen(true); nearEnd.current = true;
    if (lock.current) return;
    if (job && !['failed', 'timed_out', 'cancelled'].includes(job.state)) return;
    lock.current = true; setBusy(true); setError('');
    try {
      const key = await signature(payload);
      let cached; try { cached = JSON.parse(sessionStorage.getItem(jobsKey) || '{}')[key]; } catch { /* No saved request. */ }
      let next, expired = false;
      if (cached) {
        try { next = await query({ action: 'get', id: cached }); }
        catch (e) { if (e.status !== 404) throw e; expired = true; }
      }
      if (!next || ['failed', 'timed_out', 'cancelled'].includes(next.state)) {
        const nonceKey = `equalpath:virtual-enquiry:nonce:${key}`;
        let nonce = sessionStorage.getItem(nonceKey);
        // Preserve the same idempotency key after a lost network response.
        // Only an explicit retry of a known terminal failure creates a new one.
        if (!/^[a-f0-9]{32}$/.test(nonce || '') || next || expired) {
          nonce = [...crypto.getRandomValues(new Uint8Array(16))].map(x => x.toString(16).padStart(2, '0')).join('');
          sessionStorage.setItem(nonceKey, nonce);
        }
        next = await query({ action: 'create', request: payload, ...(cloud ? { nonce } : {}) });
      }
      if (!live.current) return;
      setJob(next); setPaused(false); setRetry(x => x + 1);
      try {
        const cachedJobs = JSON.parse(sessionStorage.getItem(jobsKey) || '{}'); cachedJobs[key] = next.id;
        sessionStorage.setItem(jobsKey, JSON.stringify(Object.fromEntries(Object.entries(cachedJobs).slice(-30))));
      } catch { setError('The request is running, but this browser could not remember it for a refresh.'); }
    } catch (e) { if (live.current) setError(e.message); }
    finally { lock.current = false; if (live.current) setBusy(false); }
  };
  const cancel = async () => { setBusy(true); try { const j = await query({ action: 'cancel', id: job.id }); if (live.current) setJob(j); } catch (e) { if (live.current) setError(e.message); } finally { if (live.current) setBusy(false); } };
  const disabled = !payload.date || !payload.children.length || payload.children.some(c => !c.start || !c.end) || !payload.questions.length;
  const reconnect = () => { setError(''); setPaused(false); setRetry(x => x + 1); };
  return <>
    <button className="secondary virtual-enquiry-toggle" disabled={disabled} aria-haspopup="dialog" onClick={start}>
      {active(job) ? <LoaderCircle size={17} className="spin" /> : <MessageCircle size={17} />}
      {job?.state === 'replied' ? 'View reply' : active(job) ? 'View chat' : 'Ask for me'}<span className="virtual-badge">Demo</span>
    </button>
    {open && <Dialog title="Ask about a place" kicker="AUTOMATIC ENQUIRY · DEMO" className="virtual-chat" onClose={() => setOpen(false)}>
      <div className="virtual-chat-notice"><span className="virtual-badge">Simulation</span><p>Real listed ages and hours. Simulated places and replies. No real centre is contacted.</p></div>
      {job && <div className="virtual-chat-branch"><strong>{job.branch.listedName || job.branch.name}</strong><small>{job.transport === 'telegram-cloud' ? 'Telegram · Virtual centre' : job.transport === 'telegram-test-chat' ? 'Connected to your private Telegram test chat' : 'Local demo · Telegram not connected'}</small></div>}
      <div className="virtual-chat-log" ref={log} role="log" aria-label="Enquiry messages" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = log.current; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
        <article className="virtual-bubble virtual-bubble-you"><strong>Your request</strong><p>{payload.date} · Malaysia time</p>
          {payload.children.map((c, i) => <p key={i}>{c.label} · {c.age === '' ? 'Age not set' : c.age === '0' ? 'Under 1 year' : `Age ${c.age}`} · {c.start}–{c.end}</p>)}
          <p>Can you accept {payload.children.length === 2 ? 'both children' : 'my child'} for this visit?</p>
          {payload.questions.length > 1 && <small>Includes {payload.questions.length} selected questions.</small>}
        </article>
        {busy && !job && <p className="virtual-chat-event"><LoaderCircle size={15} className="spin" />Preparing your demo request…</p>}
        {job?.events.map((event, i) => <p className="virtual-chat-event" key={`${job.id}-${i}`}><Check size={14} /><span>{event.text}</span></p>)}
        {active(job) && !paused && <div className="virtual-bubble virtual-wait"><LoaderCircle size={17} className="spin" /><span>{job.state==='queued'?'Your request is in line. We will send it when it is your turn.':'Waiting for the virtual centre…'}</span></div>}
        {job?.result && <Reply key={job.id} result={job.result} animate={!shownReplies.current.has(job.id)} onComplete={() => shownReplies.current.add(job.id)} scroll={() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }} />}
        {job && ['failed', 'timed_out', 'cancelled'].includes(job.state) && <div className="virtual-bubble virtual-unresolved"><Clock3 size={18} /><div><strong>{job.state === 'timed_out' ? 'No reply yet' : job.state === 'cancelled' ? 'Enquiry stopped' : 'Could not send the request'}</strong><p>No place has been confirmed.</p></div></div>}
        {error && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>{error}</p></div>}
      </div>
      <div className="virtual-chat-footer">
        <p>{active(job) ? 'You can close this window and check the reply here.' : 'This demo does not make a booking.'}</p>
        {active(job) && <button className="secondary" disabled={busy} onClick={cancel}><Square size={13} />Stop</button>}
        {paused && <button className="secondary" onClick={reconnect}>Reconnect</button>}
        {(!job && error || ['failed', 'timed_out', 'cancelled'].includes(job?.state)) && <button className="secondary" disabled={busy} onClick={start}>Try again</button>}
      </div>
    </Dialog>}
  </>;
}
function Reply({ result, scroll, animate, onComplete }) {
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
    <article className="virtual-bubble virtual-bubble-reply" aria-busy={!done}><strong>Virtual centre <span className="virtual-badge">Demo reply</span></strong>
      <p className="virtual-reply-text" aria-hidden={!done}>{result.rawReply.slice(0, count)}{!done && <span className="virtual-caret" aria-hidden="true">▍</span>}</p>
    </article>
    {done && <section className="virtual-chat-result" aria-label="Reply summary">
      <h3>{result.outcome === 'available' ? <Check size={19} /> : <TriangleAlert size={19} />}{OUTCOMES[result.outcome]}</h3>
      {result.children.map(c => <div key={c.label} className="virtual-child-result"><strong>{c.label} · {CHILD_STATES[c.state]}</strong><p>{c.reason}</p>{c.estimatedFee !== null && <small>Listed estimate: MYR {c.estimatedFee.toFixed(2)}</small>}</div>)}
      <details><summary>What still needs checking</summary><ul>{result.limitations.map(x => <li key={x}>{x}</li>)}</ul><p>These hours use your search start and end. Travel time is not included.</p></details>
    </section>}
  </>;
}
