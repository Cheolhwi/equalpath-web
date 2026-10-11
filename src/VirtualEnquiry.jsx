import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarDays, Check, ChevronDown, ClipboardList, Clock3, Info, List, LoaderCircle, MessageCircle, Square, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { displayName } from '../shared/display.mjs';
import { contactQuestions } from '../shared/contact-message.mjs';
import { enquiryStatus, openEnquiryReferences, restoredEnquiryPayload } from '../shared/enquiry-session.mjs';
import './virtual-enquiry.css';
import cloudConfig from './enquiry-config.json';
import Dialog from './Dialog.jsx';

const cloud = cloudConfig.enabled && /^https:\/\/[a-z0-9.-]+\.appwrite\.(run|network)$/.test(cloudConfig.endpoint);
export const virtualEnquiryEnabled = cloud || (import.meta.env.DEV && import.meta.env.VITE_VIRTUAL_ENQUIRY === '1');
const OUTCOMES = { available: 'A place is available', unavailable: 'This request cannot be accepted', partial: 'Only one child can be accepted', conditional: 'The centre suggests a change', more_info: 'Some details still need checking' };
const CHILD_STATES = { available: 'Place available', unavailable: 'Cannot accept', conditional: 'Offered with a change', more_info: 'Needs checking' };
const ENDED = ['failed', 'timed_out', 'cancelled'];
// A place for every child is the news, even when other questions are still open.
const summary = r => r.outcome !== 'available' && r.children?.length && r.children.every(c => c.state === 'available')
  ? { good: true, title: OUTCOMES.available, note: 'Your other questions still need an answer from the centre.' }
  : { good: r.outcome === 'available', title: OUTCOMES[r.outcome] };
const active = j => j && ['queued', 'waiting'].includes(j.state);
// Still something to wait for: the reply, or the centre's answer to the parent's decision.
const following = j => active(j) || j?.confirmation?.state === 'sending';
const sessionKey = 'equalpath:virtual-enquiry:session', jobsKey = 'equalpath:virtual-enquiry:jobs', openKey = 'equalpath:virtual-enquiry:open';
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
  if (!r.ok) { const error = new Error(value.error || 'The enquiry service is unavailable.'); error.status = r.status; throw error; }
  return value.job;
}
const visitDay = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }); } catch { return date; } };
const centreName = (t) => displayName(t.centre?.name || t.job?.branch?.listedName || t.job?.branch?.name || 'The centre');

/* Ask for me (10 Oct 2026): the enquiry runs at page level, so it keeps going
   after the Contact window closes. Its chat is a small window at the bottom
   right (a sheet on phones), and a reply that arrives while the chat is tucked
   away, or while another window is open, raises a notice with the next step. */
const EnquiryContext = createContext(null);
const soundKey = 'equalpath:enquiry-sound';
const readSound = () => { try { return localStorage.getItem(soundKey) !== 'off'; } catch { return true; } };
// A short, soft two-note chime made in the browser (no audio file to load).
let audio;
function chime() {
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const t = audio.currentTime;
    [[659.25, 0], [880, .14]].forEach(([freq, delay]) => {
      const osc = audio.createOscillator(), gain = audio.createGain();
      osc.type = 'sine'; osc.frequency.value = freq;
      gain.gain.setValueAtTime(0, t + delay); gain.gain.linearRampToValueAtTime(.18, t + delay + .02); gain.gain.exponentialRampToValueAtTime(.001, t + delay + .45);
      osc.connect(gain).connect(audio.destination); osc.start(t + delay); osc.stop(t + delay + .5);
    });
  } catch { /* Sound is optional. */ }
}
// Unlock audio and ask once for system notifications while the parent is
// pressing Ask for me (browsers only allow both after a user action).
function prepareAlerts() {
  void languageModel({ allowDownload: true });
  try { audio ??= new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch { /* optional */ }
  try { if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => {}); } catch { /* optional */ }
}
/* Natural wording (10 Oct 2026): where Chrome's built-in AI (Prompt API) is
   available on this device, the virtual centre's reply is reworded to sound
   like a receptionist. The rules still decide everything; the model only
   rewords the facts, and its text is shown only if every time, date, price
   and the yes/no survive. Otherwise the template reply is shown unchanged. */
const LM_OPTIONS = { expectedInputs: [{ type: 'text', languages: ['en'] }], expectedOutputs: [{ type: 'text', languages: ['en'] }] };
const SYSTEM = {
  centre: 'You reword short messages from a childcare centre receptionist in Kuala Lumpur to a parent, as a friendly WhatsApp reply. Write as the centre itself; never mention a test, a simulation or a virtual centre. Use only the facts given. Never add facts, offers, names, prices, times or promises. Keep every time, date and amount exactly as written. Plain text, no emojis, no greeting placeholders, at most 90 words.',
  parent: 'You rewrite a parent\u2019s WhatsApp enquiry to a childcare centre in Kuala Lumpur so it reads naturally and politely, in the parent\u2019s own voice. Keep every question, and keep every date, time, age and amount exactly as written. Do not add questions, facts, names, requests or sign-offs with names. Plain text, no emojis, no placeholders, at most 110 words.',
};
const lmBases = {};
const wordingCache = new Map();
// Whatever a bubble shows first is final: a reply or message shown with the
// rules' wording never switches to a model's wording that finishes later
// (for example after reopening the chat).
const lock = (key, text) => { if (!wordingCache.has(key)) wordingCache.set(key, text ?? null); return wordingCache.get(key); };
async function languageModel({ allowDownload = false, voice = 'centre' } = {}) {
  const LM = globalThis.LanguageModel;
  if (!LM?.availability || !LM?.create) return null;
  try {
    const state = await LM.availability(LM_OPTIONS);
    if (state === 'unavailable' || (state !== 'available' && !allowDownload && !lmBases[voice])) return null;
    // A first download needs a click, so it only starts from Ask for me.
    lmBases[voice] ??= LM.create({ ...LM_OPTIONS, initialPrompts: [{ role: 'system', content: SYSTEM[voice] }] })
      .catch(() => { delete lmBases[voice]; return null; });
    return await lmBases[voice];
  } catch { return null; }
}
// Model output may not bring in a time, date or amount of its own, or a
// placeholder such as [Name].
// Facts are compared by meaning, not spelling (10 Oct 2026): "MYR 54.00",
// "MYR 54" and "RM54" are the same amount; "1:20 pm" is 13:20; "Monday,
// 12 October" is Mon 12 Oct. Wording that drops one, or adds one of its own,
// is not shown.
const DAY = '(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*', MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*';
const KEEP = new RegExp(`\\b\\d{1,2}:\\d{2}(?:\\s?[ap]\\.?m\\b\\.?)?|\\b\\d{1,2}\\s?[ap]\\.?m\\b\\.?|(?:MYR|RM)\\s?\\d[\\d,]*(?:\\.\\d+)?|\\b(?:${DAY},? )?\\d{1,2} ${MONTH}\\b|\\b(?:${DAY},? )?${MONTH} \\d{1,2}\\b`, 'gi');
const cap3 = w => w.slice(0, 1).toUpperCase() + w.slice(1, 3).toLowerCase();
function norm(token) {
  const t = token.replace(/\s+/g, ' ').trim();
  let m = t.match(/^(?:MYR|RM)\s?([\d,]+(?:\.\d+)?)$/i);
  if (m) return `MYR${Number(m[1].replace(/,/g, '')).toFixed(2)}`;
  m = t.match(/^(\d{1,2})(?::(\d{2}))?\s?([ap])?\.?m?\.?$/i);
  if (m && (m[2] || m[3])) { let h = +m[1]; if (m[3]) h = (h % 12) + (/p/i.test(m[3]) ? 12 : 0); return `${String(h).padStart(2, '0')}:${m[2] ?? '00'}`; }
  // Dates: the weekday is optional, "12 Oct" and "October 12" are the same day.
  m = t.match(/(\d{1,2}) ([A-Za-z]+)$/) || t.match(/([A-Za-z]+) (\d{1,2})$/);
  if (m) { const [n, mon] = /\d/.test(m[1]) ? [m[1], m[2]] : [m[2], m[1]]; return `${+n}${cap3(mon)}`; }
  return t;
}
const tokens = (text) => new Set((text.match(KEEP) ?? []).map(norm));
const missingFacts = (text, source) => { const have = tokens(text); return [...tokens(source)].filter(x => !have.has(x)); };
const newFacts = (text, source) => { const known = tokens(source); return [...tokens(text)].filter(x => !known.has(x)); };
// Older replies from the server still carry test wording and source tags; the
// parent never sees them, and the model is never shown them.
export const cleanReply = (raw) => raw.split('\n').map(l => l
  .replace(/^Test reply for (\d{4}-\d{2}-\d{2})$/, (_, d) => `Reply about ${visitDay(d).replace(',', '')}`)
  .replace(/\s*\((Listed|(?:Demo|Test|Made-up) answer|Listed \+ (?:demo|test|made-up) detail)\)\s*$/i, '')
  .replace(/a simulated place is available/gi, 'we have a place for this visit')
  .replace(/\b(?:simulated|test) (?=place|places|answer|details?)/gi, '')).join('\n');
const factLines = (result) => cleanReply(result.rawReply).split(/\n+/).slice(1).map(l => l.trim()).filter(Boolean);
const debug = (what, why) => { try { console.info(`[Ask for me] ${what} kept the rules' wording: ${why}`); } catch { /* optional */ } };
function replyProblem(text, result) {
  const facts = factLines(result).join('\n');
  const lost = missingFacts(text, facts); if (lost.length) return `left out ${lost.join(', ')}`;
  const added = newFacts(text, facts); if (added.length) return `added ${added.join(', ')}`;
  if (/[[\]{}<>]/.test(text)) return 'placeholder';
  if (/\b(simulat\w*|test|virtual)\b/i.test(text)) return 'mentioned the simulation';
  const no = /\b(sorry|unfortunately|unable|cannot|can’t|can't|fully booked|no place|not able)\b/i.test(text);
  if (summary(result).good && no) return 'sounded like a no';
  if (result.outcome === 'unavailable' && !no) return 'did not say no';
  if (text.length <= 20 || text.length >= 900) return 'length';
  return null;
}
// One wording per reply: started as soon as the reply arrives (even with the
// chat tucked away) and shared by whoever asks for it.
const inflight = new Map();
export function naturalReply(result, name, key, { allowDownload = false } = {}) {
  if (wordingCache.has(key)) return Promise.resolve(wordingCache.get(key));
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    const base = await languageModel({ allowDownload });
    if (!base) return null;
    let session;
    try {
      session = base.clone ? await base.clone() : base;
      const text = (await session.prompt(`Reply from ${name}. Facts:\n- ${factLines(result).join('\n- ')}`, { signal: AbortSignal.timeout(40000) })).trim();
      const why = replyProblem(text, result);
      if (why) debug('Reply', why);
      // A reply that was already shown with the template keeps it.
      if (!wordingCache.has(key)) wordingCache.set(key, why ? null : text);
      return wordingCache.get(key);
    } catch (e) { debug('Reply', e?.name === 'TimeoutError' ? 'the model took too long' : 'the model failed'); return null; }
    finally { if (session && session !== base) session.destroy?.(); inflight.delete(key); }
  })();
  inflight.set(key, job);
  return job;
}
/* The parent's side (10 Oct 2026): the chat shows the enquiry as a message
   with the questions the parent ticked. Rules write it; where Chrome's
   built-in AI is ready it is reworded, and kept only if every date, time, age
   and amount and every question survive. The request sent to the centre is
   the same structured payload either way. */
const childAge = (age) => age === '' || age == null ? 'my child' : age === '0' ? 'my child (under 1)' : `my ${age}‑year‑old`;
function askParts(t) {
  const { payload } = t, kids = payload.children, day = visitDay(payload.date);
  let extra = [], ages = false;
  if (kids.length === 1 && t.centre && t.request) {
    try {
      const all = contactQuestions(t.centre, t.request);
      extra = payload.questions.map(id => all.find(q => q.id === id)).filter(Boolean).filter(q => q.id !== 'visit').map(q => q.text);
      ages = /What ages do you accept\?/.test(all.find(q => q.id === 'visit')?.text ?? '');
    } catch { /* fall back to a count */ }
  }
  const missing = payload.questions.filter(id => id !== 'visit').length - extra.length;
  if (kids.length > 1 && payload.questions.includes('fees')) extra = ['How much will it cost for both children? Are there any extra charges?'];
  else if (missing > 0) extra.push(`I have ${missing === 1 ? 'one more question' : `${missing} more questions`} about the visit.`);
  const opening = kids.length === 1
    ? `Hello! Do you have a place for ${childAge(kids[0].age)} on ${day}, from ${kids[0].start} to ${kids[0].end}?${ages ? ' What ages do you accept?' : ''}`
    : `Hello! Do you have places for my ${kids.length === 2 ? 'two children' : 'children'} on ${day}?`;
  const lines = kids.length > 1 ? kids.map(c => `${c.label}${c.age === '' ? '' : c.age === '0' ? ', under 1' : `, ${c.age} years old`}: ${c.start}–${c.end}`) : [];
  return { opening, lines, extra };
}
function askText(t) {
  const { opening, lines, extra } = askParts(t);
  return [opening, ...lines.map(l => `• ${l}`), ...(extra.length ? [extra.length > 1 ? 'I’d also like to ask:' : '', ...extra.map(q => extra.length > 1 ? `• ${q}` : q)] : []), 'Thank you!'].filter(Boolean).join('\n');
}
function askProblem(text, t, template) {
  const lost = missingFacts(text, template); if (lost.length) return `left out ${lost.join(', ')}`;
  const added = newFacts(text, template); if (added.length) return `added ${added.join(', ')}`;
  if (/[[\]{}<>]/.test(text)) return 'placeholder';
  // Every child's age, as "3-year-old" or "3 years".
  if (!t.payload.children.every(c => c.age === '' || (c.age === '0' ? /under\s*(1|one)/i.test(text) : new RegExp(`\\b${c.age}[-\u2011 ]years?`, 'i').test(text)))) return 'left out an age';
  // Questions may be merged, but not dropped: at least one per asked topic.
  const asked = 1 + askParts(t).extra.length;
  if ((text.match(/\?/g) ?? []).length < asked) return 'dropped a question';
  if (/\b(booked|confirmed|thank you for (?:your|the) reply)\b/i.test(text)) return 'claimed a booking';
  if (text.length <= 30 || text.length >= 900) return 'length';
  return null;
}
export async function naturalAsk(t, template, key) {
  if (wordingCache.has(key)) return wordingCache.get(key);
  const base = await languageModel({ voice: 'parent' });
  if (!base) return null;
  let session;
  try {
    session = base.clone ? await base.clone() : base;
    const text = (await session.prompt(`Rewrite this enquiry to ${centreName(t)}:\n${template}`, { signal: AbortSignal.timeout(20000) })).trim();
    const why = askProblem(text, t, template);
    if (why) debug('Your message', why);
    if (!wordingCache.has(key)) wordingCache.set(key, why ? null : text);
    return wordingCache.get(key);
  } catch (e) { debug('Your message', e?.name === 'TimeoutError' ? 'the model took too long' : 'the model failed'); return null; }
  finally { if (session && session !== base) session.destroy?.(); }
}
function AskBubble({ thread: t, onReady }) {
  const template = askText(t), key = `ask:${t.key}`;
  // undefined while the on-device model is writing; null: the rules' wording.
  const [worded, setWorded] = useState(() => wordingCache.has(key) ? wordingCache.get(key) : undefined);
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    if (worded !== undefined) return;
    let live = true;
    const settle = text => { if (live) { const final = lock(key, text); setWorded(w => w === undefined ? final : w); } };
    // No model ready on this device: show the rules' wording straight away.
    (async () => {
      const LM = globalThis.LanguageModel;
      const ready = LM?.availability && await LM.availability(LM_OPTIONS).catch(() => 'unavailable') === 'available';
      if (!ready) { if (!wordingCache.has(key)) wordingCache.set(key, null); return settle(null); }
      naturalAsk(t, template, key).then(settle, () => settle(null));
    })();
    const fallback = setTimeout(() => { if (!wordingCache.has(key)) { wordingCache.set(key, null); debug('Your message', 'the model took longer than 12 s'); } settle(null); }, 12000);
    return () => { live = false; clearTimeout(fallback); };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  // The rest of the conversation waits for the parent's message.
  const waited = useRef(worded === undefined);
  useEffect(() => { if (worded !== undefined) onReady?.(waited.current); }, [worded]); // eslint-disable-line react-hooks/exhaustive-deps
  if (worded === undefined) return <article className="virtual-bubble virtual-bubble-you" aria-busy="true"><span className="virtual-wait-inline"><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span>Writing your message…</span></article>;
  const text = worded && !original ? worded : template;
  return <article className={`virtual-bubble virtual-bubble-you${waited.current ? ' enter' : ''}`}>
    <p className="virtual-ask-text">{text}</p>
    {worded && <small className="virtual-ask-note">{original ? 'Original wording.' : 'Worded on this device by Chrome’s built-in AI.'} <button className="text-link" onClick={() => setOriginal(x => !x)}>{original ? 'Show reworded' : 'Show original'}</button></small>}
  </article>;
}
const replyHeadline = (job) => job?.confirmation?.state === 'acknowledged' ? (job.confirmation.decision === 'accept' ? 'Your place is confirmed' : 'The centre knows you won’t need it')
  : job?.result ? summary(job.result).title : job?.state === 'cancelled' ? 'Enquiry stopped.' : 'No reply yet. No place has been confirmed.';

function useTopModal() {
  const [modal, setModal] = useState(null);
  useEffect(() => {
    const check = () => {
      const open = [...document.querySelectorAll('dialog[open]')].filter(d => { try { return d.matches(':modal'); } catch { return true; } });
      // The Contact panel sits where the chat sits, so it hosts the notice too.
      setModal(open.at(-1) || document.querySelector('.contact-panel') || null);
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
  // A page refresh keeps the conversations (11 Oct 2026): only the request IDs
  // (and the centre's public ID and name) stay in this tab's session; ages
  // and times are read back from the enquiry itself.
  const restoring = useRef(true);
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    let saved = []; try { saved = JSON.parse(sessionStorage.getItem(openKey) || '[]'); } catch { /* nothing saved */ }
    if (!virtualEnquiryEnabled || !Array.isArray(saved) || !saved.length) { restoring.current = false; return; }
    (async () => {
      const back = [];
      for (const s of saved.slice(-5)) {
        try {
          if (!/^[a-f0-9]{24}$/.test(s.id || '')) continue;
          const job = await query({ action: 'get', id: s.id });
          const payload = restoredEnquiryPayload(job, s);
          if (!payload) continue;
          const key = JSON.stringify(payload);
          // Already-read words stay as they were; nothing types out again.
          wordingCache.set(`ask:${key}`, null); shownReplies.add(job.id);
          back.push({ key, payload, centre: s.centre, request: null, family: !!s.family, job, error: '', busy: false, paused: false, retry: 0, unread: false, settled: !following(job), restored: true });
        } catch { /* expired: nothing to bring back */ }
      }
      restoring.current = false;
      if (!back.length) { try { sessionStorage.removeItem(openKey); } catch { /* optional */ } return; }
      setThreads(list => [...back.filter(b => !list.some(t => t.key === b.key)), ...list].slice(-5));
      setRestored(back.length);
    })();
  }, []);
  useEffect(() => {
    if (restoring.current) return;
    try { sessionStorage.setItem(openKey, JSON.stringify(openEnquiryReferences(threads))); } catch { /* optional */ }
  }, [threads]);
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
  const [sound, setSoundState] = useState(readSound);
  const soundRef = useRef(sound); soundRef.current = sound;
  const setSound = useCallback((on) => { setSoundState(on); try { localStorage.setItem(soundKey, on ? 'on' : 'off'); } catch { /* per-browser preference */ } }, []);
  const settle = useCallback((key, job) => {
    // Every reply rings (unless muted); a system notification appears when
    // the tab is in the background.
    if (job?.state !== 'cancelled') {
      if (soundRef.current) chime();
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const t = threadsRef.current.find(x => x.key === key);
          const note = new Notification(`${t ? centreName({ ...t, job }) : 'The centre'} replied`, { body: replyHeadline(job), tag: `equalpath-${job?.id ?? key}` });
          note.onclick = () => { window.focus(); showRef.current?.(key); note.close(); };
        }
      } catch { /* optional */ }
    }
    // A "no place" with no other time takes that plan off the options.
    const thread = threadsRef.current.find(x => x.key === key);
    if (job?.result && thread) try { actionsRef.current?.declined?.(thread, job.result); } catch { /* optional */ }
    if (job?.result) void naturalReply(job.result, thread ? centreName({ ...thread, job }) : 'The centre', job.id);
    const v = viewRef.current;
    if (v.open && v.key === key && !modalRef.current && !document.hidden) return;
    patch(key, { unread: true }); setNotice(key);
  }, [patch]);
  const ask = useCallback(({ payload, centre, request, family }) => {
    prepareAlerts();
    const key = JSON.stringify(payload);
    setThreads(list => list.some(t => t.key === key) ? list : [...list.slice(-4),
      { key, payload, centre, request, family, job: null, error: '', busy: false, paused: false, retry: 0, unread: false }]);
    setView({ key, open: true }); setNotice(n => n === key ? null : n);
    // The chat replaces the window it was started from, so the map stays usable.
    actionsRef.current?.closeDialogs?.();
    start(key, payload);
  }, [start]);
  const show = useCallback((key) => { actionsRef.current?.closeDialogs?.(); setView({ key, open: true }); setNotice(null); patch(key, { unread: false }); }, [patch]);
  const showRef = useRef(show); showRef.current = show;
  const minimise = useCallback(() => setView(v => ({ ...v, open: false })), []);
  const remove = useCallback((key) => { setThreads(list => list.filter(t => t.key !== key)); setView(v => v.key === key ? { key: null, open: false } : v); setNotice(n => n === key ? null : n); }, []);
  const chatShown = view.open && !modal && threads.some(t => t.key === view.key);
  useEffect(() => { onChatChange?.(chatShown); }, [chatShown, onChatChange]);
  // A waiting reply shows in the tab title while the parent is elsewhere.
  const unreadCount = threads.filter(t => t.unread).length;
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\) /, '');
    document.title = unreadCount ? `(${unreadCount}) ${base}` : base;
  }, [unreadCount]);
  // Reading the open chat clears its unread mark.
  useEffect(() => {
    if (!view.open || modal) return;
    const t = threads.find(x => x.key === view.key);
    if (t?.unread && !document.hidden) patch(t.key, { unread: false });
    if (notice === view.key) setNotice(null);
  }, [view, modal, threads, notice, patch]);
  useEffect(() => {
    const back = () => { if (!document.hidden && viewRef.current.open && !modalRef.current) { const k = viewRef.current.key; setThreads(list => list.map(t => t.key === k && t.unread ? { ...t, unread: false } : t)); } };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  // The parent keeps or lets go of an offered place; the centre answers it.
  const decide = useCallback(async (key, decision) => {
    const t = threadsRef.current.find(x => x.key === key);
    if (!t?.job?.id || t.job.confirmation || t.deciding) return;
    patch(key, { deciding: true, error: '' });
    try { const job = await query({ action: 'confirm', id: t.job.id, decision }); patch(key, x => ({ job, retry: x.retry + 1 })); }
    catch (e) { patch(key, { error: e.message }); }
    finally { patch(key, { deciding: false }); }
  }, [patch]);
  const value = { threads, view, notice, modal, ask, show, minimise, remove, start, patch, settle, decide, restored, dismissRestored: () => setRestored(0), sound, setSound, dismissNotice: () => setNotice(null), actions: actionsRef };
  return <EnquiryContext.Provider value={value}>{children}{threads.map(t => <ThreadFollower key={t.key} thread={t} />)}</EnquiryContext.Provider>;
}

// Follows one request's durable events without holding anything open on the server.
function ThreadFollower({ thread }) {
  const { patch, settle } = useContext(EnquiryContext);
  const { key, job, paused, retry } = thread;
  useEffect(() => {
    if (!job?.id || !following(job) || paused) return;
    const controller = new AbortController();
    const update = (next) => {
      if (controller.signal.aborted) return false;
      // The reply is known before it is shown: word it during the staff
      // member's simulated response time.
      if (next?.draft && !next.result) void naturalReply(next.draft, centreName({ ...thread, job: next }), next.id);
      const done = !following(next); patch(key, { job: next, settled: done }); if (done) settle(key, next); return done;
    };
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
  }, [job?.id, paused, retry, following(job)]); // eslint-disable-line react-hooks/exhaustive-deps
  return null;
}

// Where an enquiry stands for these children's exact visit, for the Checklist:
// confirmed, offered (waiting for the parent's decision), replied, asked, or none.
export function useEnquiryStatus() {
  const ctx = useContext(EnquiryContext);
  return (id, requests) => enquiryStatus(ctx?.threads ?? [], id, requests);
}

/* The button beside Copy message. It only starts (or reopens) the chat. */
export default function VirtualEnquiry(props) {
  const ctx = useContext(EnquiryContext);
  if (!virtualEnquiryEnabled || !ctx) return null;
  // Different request details can never inherit an earlier acceptance.
  const children = (props.requests || []).map((r, i) => ({ label: r.label || `Child ${i + 1}`, age: String(r.age ?? ''), start: r.deadline, end: r.end }));
  const payload = { branchId: props.providerId, date: props.requests?.[0]?.date, children,
    questions: [...(props.questionIds ?? ['visit', 'fees'])].sort(), scenario: props.scenario || 'rules' };
  const thread = ctx.threads.find(t => t.key === JSON.stringify(payload));
  const disabled = !payload.date || !children.length || children.some(c => !c.start || !c.end) || !payload.questions.length;
  const label = thread?.job?.state === 'replied' ? 'View reply' : active(thread?.job) ? 'View chat' : 'Ask for me';
  return <button className="secondary virtual-enquiry-toggle" disabled={disabled}
    onClick={() => thread?.job && !ENDED.includes(thread.job.state) ? ctx.show(thread.key) : ctx.ask({ payload, centre: props.centre, request: props.requests?.[0], family: children.length > 1 || !!props.family })}>
    {active(thread?.job) ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageCircle size={17} aria-hidden="true" />}
    {label}
  </button>;
}

// A chat brought back after a page refresh has no search behind it, so it
// can't open the checklist or the Contact panel for that search.
function nextSteps(t, act, ask, decide) {
  const steps = stepsFor(t, act, ask, decide);
  return t.request ? steps : steps.filter(s => !s.needsSearch);
}
function stepsFor(t, act, ask, decide) {
  const r = t.job?.result;
  // A "no place" took that plan off the list, so the way back is to the others.
  const declined = t.job?.result?.children?.some(c => c.state === 'unavailable' && !c.offer);
  const options = { label: t.family ? (declined ? 'See other plans' : 'Back to your plan') : 'See other options', icon: List, run: () => act.current?.options?.(t.family) };
  const prepare = { label: 'Get ready for childcare', icon: ClipboardList, run: () => act.current?.prepare?.(t.centre, t.request), needsSearch: true };
  const contact = { label: 'Contact the centre', icon: MessageCircle, run: () => act.current?.contact?.(t.centre, t.request), needsSearch: true };
  if (!r) return [];
  // A place for every child: the parent decides first, and the centre is told.
  if (summary(r).good) {
    const c = t.job.confirmation;
    if (!c && decide) return [
      { label: 'Yes, keep the place', icon: Check, run: () => decide(t.key, 'accept'), stay: true },
      { label: 'No, thanks', icon: X, run: () => decide(t.key, 'decline'), stay: true }];
    if (c?.state === 'acknowledged') return c.decision === 'accept' ? [t.family || !t.centre ? options : prepare] : [options];
    if (c?.state === 'failed') return [contact];
    if (c) return [];
  }
  if (t.family || !t.centre) return [options];
  // The centre offered another time or day: one tap asks for it.
  const offer = r.children.length === 1 && r.children[0].offer;
  if (offer && ask) {
    const date = offer.date ?? t.payload.date, child = { ...t.payload.children[0], ...(offer.start ? { start: offer.start } : {}) };
    const retry = { label: offer.date ? `Ask for ${visitDay(offer.date)}` : `Ask for ${offer.start} instead`, icon: offer.date ? CalendarDays : Clock3,
      run: () => ask({ payload: { ...t.payload, date, children: [child] }, centre: t.centre, request: { ...t.request, date, deadline: child.start }, family: t.family }) };
    return [retry, options];
  }
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
    {!modal && view.open && current && <ChatWindow key={current.key} thread={current} />}
    {!modal && !(view.open && current) && <ChatPill />}
    <ReplyNotice />
    {!modal && !ctx.notice && ctx.restored > 0 && <RestoredNotice />}
  </>;
}

// After a refresh: the conversations are back, said in the same notice style.
function RestoredNotice() {
  const ctx = useContext(EnquiryContext);
  const n = ctx.restored, latest = ctx.threads.at(-1);
  useEffect(() => { const t = setTimeout(ctx.dismissRestored, 9000); return () => clearTimeout(t); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return <div className="enquiry-notice" role="status" aria-live="polite">
    <span className="enquiry-notice-icon good" aria-hidden="true"><Check size={18} /></span>
    <div className="enquiry-notice-main">
      <strong>Your {n === 1 ? 'enquiry is' : 'enquiries are'} still here</strong>
      <p>The page was refreshed. We’re still following {n === 1 ? 'your enquiry' : `your ${n} enquiries`} with the {n === 1 ? 'centre' : 'centres'}. Search again to see your plan.</p>
      {latest && <div className="enquiry-notice-actions"><button className="primary" onClick={() => { ctx.dismissRestored(); ctx.show(latest.key); }}>View chat<ArrowRight size={15} aria-hidden="true" /></button></div>}
    </div>
    <button className="enquiry-notice-close" aria-label="Dismiss" onClick={ctx.dismissRestored}><X size={17} /></button>
  </div>;
}

/* Refreshing (11 Oct 2026): the keyboard refresh asks first, in the app's own
   window, when there is something on screen that a refresh would clear. The
   browser's own refresh button can't show a custom window, so nothing is lost
   there either: the conversations come back by themselves. */
export function RefreshGuard({ hasWork, checklists = 0 }) {
  const ctx = useContext(EnquiryContext);
  const [open, setOpen] = useState(false);
  const chats = ctx?.threads.length ?? 0;
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
      {checklists > 0 && <p>Your Checklist and its ticks will be cleared too. Download a plan first if you want to keep it.</p>}
      {chats > 0 && <p>Your {chats === 1 ? 'enquiry carries' : 'enquiries carry'} on and will be back after the refresh.</p>}
      <div className="refresh-actions">
        <button className="primary" autoFocus onClick={() => setOpen(false)}>Stay on this page</button>
        <button className="secondary" onClick={() => window.location.reload()}>Refresh anyway</button>
      </div>
    </div>
  </Dialog>;
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
  const steps = nextSteps(t, ctx.actions, ctx.ask, ctx.decide).slice(0, 1);
  const body = <div className={`enquiry-notice${ctx.modal ? ' in-window' : ''}`} role="status" aria-live="polite">
    <span className={`enquiry-notice-icon ${r && summary(r).good ? 'good' : 'warn'}`} aria-hidden="true">{r && summary(r).good ? <Check size={18} /> : failed ? <Clock3 size={18} /> : <TriangleAlert size={18} />}</span>
    <div className="enquiry-notice-main">
      <strong>{failed ? `No reply from ${centreName(t)}` : `${centreName(t)} replied`}</strong>
      <p>{failed ? 'No place has been confirmed. You can try again from the chat.' : replyHeadline(t.job)}</p>
      <div className="enquiry-notice-actions">
        {steps.map(s => <button key={s.label} className="primary" onClick={() => { ctx.dismissNotice(); ctx.patch(t.key, { unread: false }); if (s.stay) ctx.show(t.key); s.run(); }}>{s.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
        <button className="text-link enquiry-notice-view" onClick={() => ctx.show(t.key)}>View chat</button>
      </div>
    </div>
    <button className="enquiry-notice-close" aria-label="Dismiss" onClick={ctx.dismissNotice}><X size={17} /></button>
  </div>;
  // Inside an open window the rest of the page can't be reached, so the
  // notice joins that window.
  return ctx.modal ? createPortal(body, ctx.modal) : body;
}

// Replies already typed out once are shown whole when the chat is reopened.
const shownReplies = new Set();
function ChatWindow({ thread: t }) {
  const ctx = useContext(EnquiryContext);
  const { threads, show, minimise, remove, start, patch, actions, ask, sound, setSound, decide } = ctx;
  const [picking, setPicking] = useState(false);
  const log = useRef(null), nearEnd = useRef(true);
  // Steps after the parent's message appear once it is written, one by one.
  const [ready, setReady] = useState(() => wordingCache.has(`ask:${t.key}`));
  const [fresh, setFresh] = useState(false);
  const batch = useRef(0);
  const enter = (i, base) => fresh ? { className: `${base} enter`, style: { animationDelay: `${i <= batch.current ? 120 + i * 140 : 0}ms` } } : { className: base };
  const { payload, job, busy, error, paused } = t;
  const ended = job && ENDED.includes(job.state);
  useEffect(() => { nearEnd.current = true; }, [t.key]);
  useEffect(() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }, [t.key, job?.events?.length, job?.state, busy, ready]);
  const cancel = async () => { patch(t.key, { busy: true }); try { const j = await query({ action: 'cancel', id: job.id }); patch(t.key, { job: j }); } catch (e) { patch(t.key, { error: e.message }); } finally { patch(t.key, { busy: false }); } };
  const steps = nextSteps(t, actions, ask, decide);
  const decided = job?.confirmation;
  return <section className="enquiry-chat" role="dialog" aria-modal="false" aria-label={`Ask for me: ${centreName(t)}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); minimise(); } }}>
    <header className="enquiry-chat-top">
      <div><p className="enquiry-chat-kicker">Ask for me</p><h2>{centreName(t)}</h2></div>
      <button className="enquiry-chat-icon" onClick={() => setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute reply sound' : 'Turn on reply sound'} title={sound ? 'Sound on' : 'Sound off'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      <button className="enquiry-chat-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><ChevronDown size={19} /></button>
      {!active(job) && !busy && <button className="enquiry-chat-icon" onClick={() => remove(t.key)} aria-label="Close chat" title="Close"><X size={18} /></button>}
    </header>
    {threads.length > 1 && <div className="enquiry-chat-switch">
      <button className="enquiry-chat-switch-toggle" aria-expanded={picking} onClick={() => setPicking(x => !x)}>
        <List size={15} aria-hidden="true" />Your enquiries · {threads.length}{threads.some(x => x.unread && x.key !== t.key) && <i aria-label="New reply" />}<ChevronDown size={15} aria-hidden="true" />
      </button>
      {picking && <ul className="enquiry-chat-switch-list" aria-label="Your enquiries">{[...threads].reverse().map(x => <li key={x.key}><button aria-current={x.key === t.key ? 'true' : undefined} onClick={() => { setPicking(false); show(x.key); }}>
        <span className="enquiry-switch-icon" aria-hidden="true">{active(x.job) || x.busy ? <LoaderCircle size={14} className="spin" /> : x.job?.result && summary(x.job.result).good ? <Check size={14} /> : x.job?.result ? <TriangleAlert size={14} /> : <MessageCircle size={14} />}</span>
        <span className="enquiry-switch-text"><strong>{centreName(x)}</strong><small>{visitDay(x.payload.date)} · {x.payload.children[0].start}–{x.payload.children[0].end} · {active(x.job) || x.busy ? 'Waiting for reply' : x.job?.result ? replyHeadline(x.job) : ENDED.includes(x.job?.state) ? 'No reply' : 'Sending'}</small></span>
        {x.unread && <i aria-label="New reply" />}
      </button></li>)}</ul>}
    </div>}
    <p className="enquiry-chat-note">Simulated reply. Uses the centre’s listed ages and hours; no real centre is contacted.</p>
    <div className="enquiry-chat-log" ref={log} role="log" aria-label="Enquiry messages" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = log.current; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      <AskBubble key={t.key} thread={t} onReady={waited => { batch.current = t.job?.events.length ?? 0; setReady(true); setFresh(waited); }} />
      {ready && <>
      {busy && !job && <p className="virtual-chat-event"><LoaderCircle size={14} className="spin" />Sending your request…</p>}
      {job?.events.map((event, i) => <p key={`${job.id}-${i}`} {...enter(i, 'virtual-chat-event')}><Check size={14} /><span>{event.text}</span></p>)}
      {active(job) && !paused && <div {...enter(job?.events.length ?? 0, 'virtual-bubble virtual-wait')}><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span><span>{job.state === 'queued' ? 'In line. It will be sent when it’s your turn.' : 'The centre is replying… Replies usually take under a minute.'}</span></div>}
      {job?.result && <Reply key={job.id} id={job.id} name={centreName(t)} result={job.result} animate={!shownReplies.has(job.id)} onComplete={() => shownReplies.add(job.id)} steps={decided ? [] : steps} onStep={minimise}
        scroll={() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }} />}
      {decided && <Decision c={decided} name={centreName(t)} steps={steps} onStep={minimise} scroll={() => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; }} />}
      {ended && <div className="virtual-bubble virtual-unresolved"><Clock3 size={18} /><div><strong>{job.state === 'timed_out' ? 'No reply yet' : job.state === 'cancelled' ? 'Enquiry stopped' : 'Could not send the request'}</strong><p>No place has been confirmed.</p></div></div>}
      {error && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>{error}</p></div>}
      </>}
    </div>
    <footer className="enquiry-chat-footer">
      <p>{following(job) ? 'You can keep browsing. We’ll let you know when the centre replies.' : job?.result ? 'This doesn’t make a real booking.' : ' '}</p>
      {active(job) && <button className="secondary" disabled={busy} onClick={cancel}><Square size={13} />Stop</button>}
      {paused && <button className="secondary" onClick={() => patch(t.key, x => ({ error: '', paused: false, retry: x.retry + 1 }))}>Reconnect</button>}
      {((!job && error && !busy) || ended) && <button className="secondary" disabled={busy} onClick={() => start(t.key, payload)}>Try again</button>}
    </footer>
  </section>;
}

// The parent's decision and the centre's answer, after the first reply.
function Decision({ c, name, steps, onStep, scroll }) {
  useEffect(() => { scroll?.(); }, [c.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const yes = c.decision === 'accept';
  return <>
    <article className="virtual-bubble virtual-bubble-you enter"><p className="virtual-ask-text">{c.message}</p></article>
    {c.state === 'sending' && <div className="virtual-bubble virtual-wait enter" style={{ animationDelay: '160ms' }}><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span><span>The centre is replying…</span></div>}
    {c.state === 'failed' && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>Your answer couldn’t be sent. Please call or message the centre yourself.</p></div>}
    {c.state === 'acknowledged' && <>
      <article className="virtual-bubble virtual-bubble-reply enter"><strong>{name}</strong><p className="virtual-reply-text">{c.reply}</p></article>
      <section className={`virtual-chat-result ${yes ? 'good' : 'warn'} enter`} style={{ animationDelay: '140ms' }} aria-label="Your decision">
        <h3>{yes ? <Check size={18} /> : <Info size={18} />}{yes ? 'Your place is confirmed' : 'You let this place go'}</h3>
        <p className="virtual-result-note">{yes ? 'The centre has noted your visit.' : 'The centre knows you won’t need it.'}</p>
        {steps.length > 0 && <div className="virtual-next"><p>Next step</p>
          {steps.map((s, i) => <button key={s.label} className={i === 0 ? 'primary' : 'secondary'} onClick={() => { if (!s.stay) onStep?.(); s.run(); }}><s.icon size={16} aria-hidden="true" />{s.label}{i === 0 && <ArrowRight size={15} aria-hidden="true" />}</button>)}
        </div>}
      </section>
    </>}
  </>;
}

function Reply({ id, name, result, scroll, animate, onComplete, steps, onStep }) {
  const still = !animate || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // undefined: still asking the on-device model; null: use the template.
  const [worded, setWorded] = useState(() => wordingCache.has(id) ? wordingCache.get(id) : animate ? undefined : lock(id, null));
  const [original, setOriginal] = useState(false);
  useEffect(() => {
    if (worded !== undefined) return;
    let live = true;
    // The receptionist "types" for up to 25 s while the on-device model works.
    const fallback = setTimeout(() => { if (!wordingCache.has(id)) { wordingCache.set(id, null); debug('Reply', 'the model took longer than 25 s'); } if (live) setWorded(w => w === undefined ? null : w); }, 25000);
    naturalReply(result, name, id).then(text => { if (live) { const final = lock(id, text); setWorded(w => w === undefined ? final : w); } }, () => { if (live) { const final = lock(id, null); setWorded(w => w === undefined ? final : w); } });
    return () => { live = false; clearTimeout(fallback); };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = worded && !original ? worded : cleanReply(result.rawReply);
  const [count, setCount] = useState(() => still ? Infinity : 0);
  const onScroll = useRef(scroll); onScroll.current = scroll;
  useEffect(() => {
    if (worded === undefined || count >= text.length) return;
    const timer = setTimeout(() => setCount(n => Math.min(text.length, n + 24)), 35);
    return () => clearTimeout(timer);
  }, [text, count, worded]);
  useEffect(() => { onScroll.current(); }, [count, worded]);
  const done = worded !== undefined && count >= text.length;
  useEffect(() => { if (done) onComplete(); }, [done, onComplete]);
  return <>
    <article className="virtual-bubble virtual-bubble-reply" aria-busy={!done}><strong>{name}</strong>
      {worded === undefined
        ? <span className="virtual-wait-inline"><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span>Typing…</span>
        : <p className="virtual-reply-text" aria-hidden={!done}>{text.slice(0, count)}{!done && <span className="virtual-caret" aria-hidden="true">▍</span>}</p>}
      {done && worded && <p className="virtual-ai-note">{original ? 'Original reply.' : 'Worded on this device by Chrome’s built-in AI.'} <button className="text-link" onClick={() => setOriginal(x => !x)}>{original ? 'Show reworded' : 'Show original'}</button></p>}
    </article>
    {done && <section className={`virtual-chat-result ${summary(result).good ? 'good' : 'warn'}`} aria-label="Reply summary">
      <h3>{summary(result).good ? <Check size={18} /> : <TriangleAlert size={18} />}{summary(result).title}</h3>
      {summary(result).note && <p className="virtual-result-note">{summary(result).note}</p>}
      {result.children.map(c => <div key={c.label} className="virtual-child-result"><strong>{result.children.length > 1 ? `${c.label} · ` : ''}{CHILD_STATES[c.state]}</strong><p>{c.reason}</p>{c.estimatedFee !== null && <small>Listed estimate: MYR {c.estimatedFee.toFixed(2)}</small>}</div>)}
      {steps.length > 0 && <div className="virtual-next">
        <p>Next step</p>
        {steps.map((s, i) => <button key={s.label} className={i === 0 ? 'primary' : 'secondary'} onClick={() => { if (!s.stay) onStep?.(); s.run(); }}><s.icon size={16} aria-hidden="true" />{s.label}{i === 0 && !s.stay && <ArrowRight size={15} aria-hidden="true" />}</button>)}
      </div>}
      <details><summary>What still needs checking</summary><ul>{result.limitations.map(x => <li key={x}>{x}</li>)}</ul><p>These hours use your search start and end. Travel time is not included.</p></details>
    </section>}
  </>;
}
