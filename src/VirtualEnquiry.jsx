import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ArrowUp, ChevronDown, Cpu, Info, List, LoaderCircle, MessageCircle, Phone, Sparkles, X } from 'lucide-react';
import { displayName } from '../shared/display.mjs';
import { answerFromListing, guardQuestion, guardReply, listingFacts, suggestedQuestions } from '../shared/centre-answers.mjs';
import { aiState, askLocalAi, enableChromeAi, enableWebModel, firstModel, forgetAiChat, forgetAllAiChats, onAiState, prepareAiForChat } from './local-ai.js';
import './virtual-enquiry.css';
import Dialog from './Dialog.jsx';

/* Ask for me (13 Oct 2026, user: "把ask for me改成本地网页ai模型去基于我们的childcare信息去回答用户的问题",
   then "改成纯chatbot吧，不要有confirm按钮啥的了"): a plain chat about the centre(s)
   in a plan. Answers come only from what EqualPath lists, worked out on this
   device (local-ai.js: Chrome's built-in AI, then a WebLLM model, then the
   listing rules). Nothing is sent to a centre or a server, nothing is marked
   or booked, and the plan is never changed by the chat. Chats live in memory
   only, like the plan. */
export const virtualEnquiryEnabled = true;
const centreName = (t) => displayName(t.centre?.name || 'The centre');
const isGroup = (key) => typeof key === 'string' && /^group:[a-f0-9]{16}$/.test(key);
const randomHex = (n) => [...crypto.getRandomValues(new Uint8Array(n))].map(x => x.toString(16).padStart(2, '0')).join('');
const inView = (t, key) => t.key === key || (!!t.group && t.group === key);
const groupName = (ts) => ts.map(centreName).join(' + ');
// The group that already holds exactly these centres' requests.
const groupOf = (threads, items) => {
  const want = items.map(x => JSON.stringify(x.payload)).sort().join('|');
  return [...new Set(threads.map(t => t.group).filter(Boolean))].find(g => threads.filter(x => x.group === g).map(x => JSON.stringify(x.payload)).sort().join('|') === want) ?? null;
};
const visitDay = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }); } catch { return date; } };


export function unitsOf(threads) {
  const seen = new Set(), out = [];
  for (const t of threads) {
    if (!t.group) { out.push({ key: t.key, threads: [t], name: centreName(t) }); continue; }
    if (seen.has(t.group)) continue;
    seen.add(t.group);
    const ts = threads.filter(x => x.group === t.group).sort((a, b) => (a.payload.children[0]?.label ?? '').localeCompare(b.payload.children[0]?.label ?? ''));
    out.push({ key: t.group, threads: ts, name: groupName(ts), group: true });
  }
  return out;
}

// One request per centre, from the plan's own requests (one or two children).
function build({ providerId, centre, requests = [], family, onContact }) {
  const children = requests.map((r, i) => ({ label: r.label || `Child ${i + 1}`, age: String(r.age ?? ''), start: r.deadline, end: r.end }));
  const payload = { branchId: providerId, date: requests[0]?.date, children };
  return { key: JSON.stringify(payload), payload, centre, request: requests[0], requests, family: children.length > 1 || !!family, onContact };
}
const usable = (x) => !!x.payload.date && x.payload.children.length > 0 && x.payload.children.every(c => c.start && c.end) && !!x.centre;

// Facts for the chat: one centre, or both centres of a plan (each line named).
function unitFacts(ts) {
  return ts.flatMap(t => listingFacts(t.centre, t.requests).map(f => ts.length > 1 ? { ...f, text: `${centreName(t)}: ${f.text}` } : f));
}
function rulesAnswer(ts, question) {
  if (ts.length === 1) return answerFromListing(question, ts[0].centre, ts[0].requests).text;
  return ts.map(t => `${centreName(t)}${/[\u4e00-\u9fff]/.test(question) ? '：' : ': '}${answerFromListing(question, t.centre, t.requests).text}`).join('\n\n');
}

function useTopModal() {
  const [modal, setModal] = useState(null);
  useEffect(() => {
    const check = () => {
      const open = [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch { return true; } });
      setModal(open.at(-1) || document.querySelector('.contact-panel') || null);
    };
    check();
    const watcher = new MutationObserver(check);
    watcher.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['open'] });
    return () => watcher.disconnect();
  }, []);
  return modal;
}

function useAi() {
  const [s, setS] = useState(aiState);
  useEffect(() => onAiState(setS), []);
  return s;
}

const EnquiryContext = createContext(null);

export function EnquiryProvider({ children, actions, onChatChange }) {
  const [threads, setThreads] = useState([]);
  const [chats, setChats] = useState({});
  const [view, setView] = useState({ key: null, open: false });
  const modal = useTopModal();
  const threadsRef = useRef(threads), actionsRef = useRef(actions), chatsRef = useRef(chats);
  threadsRef.current = threads; actionsRef.current = actions; chatsRef.current = chats;
  const open = useCallback((key) => { actionsRef.current?.closeDialogs?.(); setView({ key, open: true }); void prepareAiForChat(); }, []);
  const ask = useCallback((item) => {
    setThreads(list => list.some(t => t.key === item.key) ? list : [...list, item].slice(-8));
    open(threadsRef.current.find(t => t.key === item.key)?.group ?? item.key);
  }, [open]);
  const askGroup = useCallback((items) => {
    const old = groupOf(threadsRef.current, items);
    const group = old ?? `group:${randomHex(8)}`;
    if (!old) setThreads(list => [...list.filter(t => !items.some(x => x.key === t.key && !t.group)),
      ...items.map((x, i) => ({ ...x, key: `${group}:${i}`, group, family: true }))].slice(-8));
    open(group);
    return group;
  }, [open]);
  const show = useCallback((key) => open(threadsRef.current.find(x => x.key === key)?.group ?? key), [open]);
  const minimise = useCallback(() => setView(v => ({ ...v, open: false })), []);
  const remove = useCallback((key) => {
    forgetAiChat(key);
    setThreads(list => list.filter(t => !inView(t, key)));
    setChats(c => { const { [key]: _, ...rest } = c; return rest; }); // eslint-disable-line no-unused-vars
    setView(v => v.key === key ? { key: null, open: false } : v);
  }, []);
  // A question: the on-device layers first, the listing rules always last.
  const send = useCallback(async (unitKey, ts, question) => {
    const q = question.trim();
    if (!q) return;
    const id = randomHex(6);
    const history = (chatsRef.current[unitKey]?.messages ?? []).filter(m => !m.pending).slice(-6).map(m => ({ role: m.who === 'you' ? 'user' : 'assistant', content: m.text }));
    setChats(c => ({ ...c, [unitKey]: { messages: [...(c[unitKey]?.messages ?? []), { id: `${id}q`, who: 'you', text: q }, { id, who: 'answer', pending: true }] } }));
    // The guard first: only questions about these centres reach a model.
    const previous = (chatsRef.current[unitKey]?.messages ?? []).filter(m => m.who === 'you').at(-1)?.text ?? '';
    const gate = guardQuestion(q, { previous });
    if (!gate.ok) {
      const text = guardReply(gate.kind, ts.map(centreName), q);
      setChats(c => ({ ...c, [unitKey]: { messages: (c[unitKey]?.messages ?? []).map(m => m.id === id ? { id, who: 'answer', text, via: 'guard' } : m) } }));
      return;
    }
    const asked = gate.followUp ? `${previous} ${q}` : q;
    const facts = unitFacts(ts), rules = rulesAnswer(ts, asked);
    const ai = await askLocalAi(unitKey, facts, asked, history);
    setChats(c => ({ ...c, [unitKey]: { messages: (c[unitKey]?.messages ?? []).map(m => m.id === id ? { id, who: 'answer', text: ai?.text ?? rules, rules, via: ai?.via ?? 'rules' } : m) } }));
  }, []);
  useEffect(() => {
    const clear = () => { forgetAllAiChats(); setThreads([]); setChats({}); setView({ key: null, open: false }); };
    window.addEventListener('equalpath-clear-enquiries', clear);
    return () => window.removeEventListener('equalpath-clear-enquiries', clear);
  }, []);
  const chatShown = view.open && !modal && threads.some(t => inView(t, view.key));
  useEffect(() => { onChatChange?.(chatShown); }, [chatShown, onChatChange]);
  const value = { threads, chats, view, modal, ask, askGroup, show, minimise, remove, send, actions: actionsRef };
  return <EnquiryContext.Provider value={value}>{children}</EnquiryContext.Provider>;
}

// The Checklist and plan cards ask where an enquiry stands. The chat doesn't
// confirm anything, so there is never a status to show.
export function useEnquiryStatus() {
  return () => null;
}

/* The plan's button. It opens (or reopens) the chat about this centre. */
export default function VirtualEnquiry(props) {
  const ctx = useContext(EnquiryContext);
  if (!ctx) return null;
  const item = build(props);
  const thread = ctx.threads.findLast(t => t.key === item.key);
  return <button className="secondary virtual-enquiry-toggle" disabled={!usable(item)} onClick={() => thread ? ctx.show(thread.key) : ctx.ask(item)}>
    <MessageCircle size={17} aria-hidden="true" />{thread ? 'View chat' : 'Ask for me'}
  </button>;
}

/* Beside the map: the chat window, or its pill when tucked away. */
export function EnquiryDock() {
  const ctx = useContext(EnquiryContext);
  if (!ctx || !ctx.threads.length) return null;
  const { threads, view, modal } = ctx;
  const current = unitsOf(threads).find(u => u.key === view.key);
  return <>
    {!modal && view.open && current && <ChatWindow key={current.key} unit={current} />}
    {!modal && !(view.open && current) && <ChatPill />}
  </>;
}

/* Refreshing: the keyboard refresh asks first, in the app's own window. */
export function RefreshGuard({ hasWork, checklists = 0 }) {
  const ctx = useContext(EnquiryContext);
  const [open, setOpen] = useState(false);
  const chats = unitsOf(ctx?.threads ?? []).length;
  const workRef = useRef(false); workRef.current = hasWork || checklists > 0 || chats > 0;
  useEffect(() => {
    const key = (e) => {
      const reload = e.key === 'F5' || ((e.metaKey || e.ctrlKey) && !e.altKey && e.key.toLowerCase() === 'r');
      if (!reload || !workRef.current || document.querySelector('dialog.refresh-dialog[open]')) return;
      e.preventDefault(); setOpen(true);
    };
    window.addEventListener('keydown', key, true);
    return () => window.removeEventListener('keydown', key, true);
  }, []);
  if (!open) return null;
  return <Dialog title="Refresh the page?" kicker="" className="refresh-dialog" onClose={() => setOpen(false)}>
    <div className="refresh-body">
      {hasWork && <p>Your search and plan will be cleared, so you’ll need to search again.</p>}
      {checklists > 0 && <p>Your Checklist and its ticks will be cleared too. Share or print it first if you want to keep it.</p>}
      {chats > 0 && <p>Your Ask for me {chats === 1 ? 'chat' : 'chats'} will be cleared too.</p>}
      <div className="refresh-actions">
        <button className="primary" autoFocus onClick={() => setOpen(false)}>Stay on this page</button>
        <button className="secondary" onClick={() => window.location.reload()}>Refresh anyway</button>
      </div>
    </div>
  </Dialog>;
}

function ChatPill() {
  const { threads, show } = useContext(EnquiryContext);
  const u = unitsOf(threads).at(-1);
  if (!u) return null;
  return <button className="enquiry-pill" onClick={() => show(u.key)} aria-label={`Open chat: ${u.name}`}>
    <span className="enquiry-pill-icon" aria-hidden="true"><MessageCircle size={17} /></span>
    <span className="enquiry-pill-text">Ask for me · {u.name}</span>
  </button>;
}

function Switcher({ current }) {
  const { threads, show } = useContext(EnquiryContext);
  const [picking, setPicking] = useState(false);
  const units = unitsOf(threads);
  if (units.length < 2) return null;
  return <div className="enquiry-chat-switch">
    <button className="enquiry-chat-switch-toggle" aria-expanded={picking} onClick={() => setPicking(x => !x)}>
      <List size={15} aria-hidden="true" />Your chats · {units.length}<ChevronDown size={15} aria-hidden="true" />
    </button>
    {picking && <ul className="enquiry-chat-switch-list" aria-label="Your chats">{[...units].reverse().map(u => {
      const x = u.threads[0];
      return <li key={u.key}><button aria-current={u.key === current ? 'true' : undefined} onClick={() => { setPicking(false); show(u.key); }}>
        <span className="enquiry-switch-icon" aria-hidden="true"><MessageCircle size={14} /></span>
        <span className="enquiry-switch-text"><strong>{u.name}</strong><small>{visitDay(x.payload.date)} · {u.group ? `${u.threads.length} centres` : `${x.payload.children[0].start}–${x.payload.children[0].end}`}</small></span>
      </button></li>;
    })}</ul>}
  </div>;
}

// Which on-device AI is answering, and the offer to turn one on.
function AiLine() {
  const ai = useAi();
  const [busy, setBusy] = useState(false);
  const run = async (fn) => { setBusy(true); try { await fn(); } finally { setBusy(false); } };
  if (ai.chrome === 'available') return <p className="ask-ai-line"><Sparkles size={14} aria-hidden="true" />Answers worded on this device by Chrome’s built-in AI, from the listing.</p>;
  if (ai.web === 'ready') return <p className="ask-ai-line"><Cpu size={14} aria-hidden="true" />Answers worded on this device by an open AI model ({ai.model?.id.split('-q4')[0].replace('-', ' ') ?? 'Qwen'}), from the listing.</p>;
  const loading = ai.chrome === 'downloading' || ai.web === 'loading';
  if (loading) return <p className="ask-ai-line"><LoaderCircle size={14} className="spin" aria-hidden="true" />Getting the on-device AI ready{Number.isFinite(ai.progress) ? ` · ${ai.progress}%` : ''}. Answers come from the listing meanwhile.</p>;
  if (ai.chrome === 'checking' || ai.web === 'checking' || ai.chrome === 'unknown') return null;
  const chrome = ai.chrome === 'downloadable', web = ['available', 'cached'].includes(ai.web);
  if (!chrome && !web) return <p className="ask-ai-line">{ai.note || 'Answers come straight from the listing. This browser can’t run an on-device AI.'}</p>;
  return <div className="ask-ai-offer">
    <p>{ai.note ? `${ai.note} ` : ''}For answers in plain sentences, turn on an AI that runs on this device. Your questions stay on it.</p>
    <button className="secondary" disabled={busy} onClick={() => run(chrome ? enableChromeAi : enableWebModel)}>
      {chrome ? 'Use Chrome’s built-in AI' : `Download an AI model (${smallModelSize()})`}
    </button>
  </div>;
}
const smallModelSize = () => (aiState().model ?? firstModel()).size;

function Answer({ m }) {
  const [rules, setRules] = useState(false);
  if (m.pending) return <article className="virtual-bubble virtual-bubble-reply ask-answer" aria-busy="true"><span className="virtual-wait-inline"><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span>Reading the listing…</span></article>;
  const ai = !['rules', 'guard'].includes(m.via);
  return <article className="virtual-bubble virtual-bubble-reply ask-answer enter">
    <p className="virtual-reply-text">{ai && rules ? m.rules : m.text}</p>
    <p className="virtual-ai-note">{m.via === 'guard' ? 'Ask for me only answers questions about this plan’s centres.' : !ai ? 'From the centre’s listing on EqualPath.' : rules ? 'Straight from the listing.' : m.via === 'chrome' ? 'Worded by Chrome’s built-in AI from the listing.' : 'Worded by an on-device AI model from the listing.'}
      {ai && <> <button className="text-link" onClick={() => setRules(x => !x)}>{rules ? 'Show the AI’s wording' : 'Show the listing facts'}</button></>}</p>
  </article>;
}

function ChatWindow({ unit }) {
  const ctx = useContext(EnquiryContext);
  const { minimise, remove, send, actions, chats } = ctx;
  const ts = unit.threads, messages = chats[unit.key]?.messages ?? [];
  const [text, setText] = useState('');
  const log = useRef(null), input = useRef(null);
  const asking = messages.some(m => m.pending);
  useEffect(() => { if (log.current) log.current.scrollTop = log.current.scrollHeight; }, [messages.length, asking]);
  // Phones would raise the keyboard over the answers; computers start typing.
  useEffect(() => { if (matchMedia('(pointer: fine)').matches) input.current?.focus({ preventScroll: true }); }, [unit.key]);
  const submit = (q) => { if (!q.trim() || asking) return; send(unit.key, ts, q); setText(''); };
  const ideas = suggestedQuestions(ts[0].centre, ts[0].requests).filter(q => !messages.some(m => m.text === q));
  // Contact from the chat: two children reopen their plan's Contact panel (so
  // Get ready saves the family Checklist), one child the ordinary one.
  const contact = ts.length !== 1 ? null : ts[0].onContact
    ?? (!ts[0].family && ts[0].request ? () => actions.current?.contact?.(ts[0].centre, ts[0].request) : null);
  return <section className={`enquiry-chat ask-chat${unit.group ? ' enquiry-chat-group' : ''}`} role="dialog" aria-modal="false" aria-label={`Ask for me: ${unit.name}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); minimise(); } }}>
    <header className="enquiry-chat-top">
      <div><p className="enquiry-chat-kicker">Ask for me{unit.group ? ` · ${ts.length} centres` : ''}</p><h2>{unit.name}</h2></div>
      <button className="enquiry-chat-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><ChevronDown size={19} /></button>
      <button className="enquiry-chat-icon" onClick={() => remove(unit.key)} aria-label="Close chat" title="Close"><X size={18} /></button>
    </header>
    <Switcher current={unit.key} />
    <p className="enquiry-chat-note"><Info size={13} aria-hidden="true" />Answers come only from what {ts.length > 1 ? 'these centres list' : 'this centre lists'} on EqualPath. Nothing is sent to the centre, and EqualPath can’t see live places.</p>
    <div className="enquiry-chat-log" ref={log} role="log" aria-label="Questions and answers" aria-live="polite" aria-relevant="additions">
      <AiLine />
      {!messages.length && <article className="virtual-bubble virtual-bubble-reply ask-answer"><p className="virtual-reply-text">Ask me about {ts.length > 1 ? 'these centres' : 'this centre'} — fees, hours on your date, ages, pickup, what parents say or how to contact {ts.length > 1 ? 'them' : 'it'}.</p></article>}
      {messages.map(m => m.who === 'you' ? <article key={m.id} className="virtual-bubble virtual-bubble-you enter"><p className="virtual-ask-text">{m.text}</p></article> : <Answer key={m.id} m={m} />)}
      {ideas.length > 0 && messages.length < 6 && <div className="ask-chips" aria-label="Suggested questions">{ideas.slice(0, messages.length ? 3 : 6).map(q => <button key={q} disabled={asking} onClick={() => submit(q)}>{q}</button>)}</div>}
    </div>
    <form className="ask-input" onSubmit={e => { e.preventDefault(); submit(text); }}>
      <div className="ask-field">
        <input ref={input} value={text} onChange={e => setText(e.target.value)} placeholder="Ask about fees, hours, ages, pickup…" aria-label="Your question" maxLength={300} enterKeyHint="send" />
        <button type="submit" disabled={!text.trim() || asking} aria-label="Ask" title="Ask"><ArrowUp size={17} aria-hidden="true" /></button>
      </div>
    </form>
    {contact && <footer className="enquiry-chat-footer"><p>To book, contact the centre yourself.</p><button className="secondary" onClick={() => { minimise(); contact(); }}><Phone size={14} aria-hidden="true" />Contact</button></footer>}
  </section>;
}
