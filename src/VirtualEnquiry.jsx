import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, CalendarDays, Check, ChevronDown, ClipboardList, Clock3, Info, List, LoaderCircle, MessageCircle, Square, TriangleAlert, Volume2, VolumeX, X } from 'lucide-react';
import { displayName } from '../shared/display.mjs';
import { contactQuestions } from '../shared/contact-message.mjs';
import { enquiryStatus, openEnquiryReferences, restoredEnquiryPayload, keepEnquiryConversations, pendingGroupDecisions, enquiryGroupFor, addEnquiryGroup, enquiryChildDeclined } from '../shared/enquiry-session.mjs';
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
// A dropped connection ("Failed to fetch") is tried again a couple of times.
// Asking two centres at once can reach the cloud function while it is still
// starting; creating is safe to repeat (same nonce), and so is reading.
async function query(body, signal) {
  let r;
  for (let attempt = 0; ; attempt++) {
    try { r = await call(body, signal || AbortSignal.timeout(cloud ? 30000 : 8000)); break; }
    catch (e) {
      if (signal?.aborted || e?.name === 'AbortError' || e?.name === 'TimeoutError' || attempt >= 2 || !['create', 'get'].includes(body.action)) throw e.name === 'TypeError' ? new Error('Couldn’t reach the enquiry service. Check your connection and try again.') : e;
      await new Promise(done => setTimeout(done, 1200 * (attempt + 1)));
    }
  }
  const value = await r.json();
  if (!r.ok) { const error = new Error(value.error || 'The enquiry service is unavailable.'); error.status = r.status; throw error; }
  return value.job;
}
const visitDay = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kuala_Lumpur' }); } catch { return date; } };
const centreName = (t) => displayName(t.centre?.name || t.job?.branch?.listedName || t.job?.branch?.name || 'The centre');
/* Two children at two centres (11 Oct 2026, user request "ask for me应该合并一起问两个"):
   one Ask for me sends one request to each centre and shows both in one chat
   (a "group"). Each request is still its own job on the server. */
// A group's key is a random ID, never the visit details, so it can be kept
// with the request IDs for a refresh.
const isGroup = (key) => typeof key === 'string' && /^group:[a-f0-9]{16}$/.test(key);
const newGroup = () => `group:${[...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join('')}`;
// The group that already holds exactly these requests, if any.
const groupFor = (threads, keys) => enquiryGroupFor(threads, keys.map(k => JSON.parse(k)));
const inView = (t, key) => t.key === key || (!!t.group && t.group === key);
const groupName = (ts) => ts.map(centreName).join(' + ');
const finished = (t) => !!t.job && !following(t.job) && (!!t.job.result || ENDED.includes(t.job.state));
// A centre's suggested change (a later start, another day): the parent can take
// it to keep the plan, or turn it down — then the plan leaves the options
// (11 Oct 2026, user: "用户是可以选择是否接受机构说的晚点，然后来让这个计划变得可行的").
const offersIn = (t) => (t.job?.result?.children ?? []).filter(c => c.offer && (c.offer.start || c.offer.date));
// Ask the same centre again with the later start for that child.
function withStart(t, label, start) {
  const payload = { ...t.payload, children: t.payload.children.map(c => c.label === label ? { ...c, start } : c) };
  const request = t.request && (t.payload.children[0]?.label === label ? { ...t.request, deadline: start } : t.request);
  return { payload, centre: t.centre, request };
}
const withDate = (t, date) => ({ payload: { ...t.payload, date }, centre: t.centre, request: t.request && { ...t.request, date } });
// Steps for a reply that suggests a change — one child, two children at one
// centre, or two centres: take it (the search's time or day changes and the
// centre is asked again) or turn it down (the plan leaves the options).
function changeSteps(bad, act, decide, again, family) {
  const steps = [], seen = new Set();
  for (const t of bad) for (const c of offersIn(t)) {
    if (c.offer.start) steps.push({ label: family ? `Accept ${c.offer.start} for ${c.label}` : `Accept ${c.offer.start} instead`, icon: Clock3, stay: true,
      run: () => { act.current?.acceptStart?.(c.label, c.offer.start); again.start(t, withStart(t, c.label, c.offer.start)); } });
    else if (!seen.has(c.offer.date)) { seen.add(c.offer.date); steps.push({ label: `Accept ${visitDay(c.offer.date)} instead`, icon: CalendarDays, stay: true,
      run: () => { act.current?.tryDate?.(c.offer.date); again.date(c.offer.date); } }); }
  }
  steps.push({ label: family ? 'No, see other plans' : 'No, see other options', icon: List, run: () => { bad.forEach(t => decide(t.key, 'pass')); act.current?.options?.(family); } });
  return steps;
}
// When a chat has made it clear a plan won't go ahead, it leaves this search's
// options (11 Oct 2026, user: "显示明确这个plan won't work了…就应该从左侧的本次option里移除").
// Worked out from the chat itself, so older and restored chats count too:
// the centre can't take a child at the asked times (two children), has no
// place (one child), or the parent turned the place or the offered change down.
// "Tell … you won't need it" only answers the centre (released).
export function planOff(t) {
  const r = t.job?.result, c = t.job?.confirmation;
  if (!r || !t.payload?.children?.length) return null;
  if (!t.released && (t.letGo || c?.decision === 'decline')) return { labels: t.payload.children.map(x => x.label), why: 'you' };
  const labels = (r.children ?? []).filter(x => x.state === 'unavailable' && !x.offer).map(x => x.label);
  return labels.length ? { labels, why: 'centre' } : null;
}

export function unitsOf(threads) {
  const seen = new Set(), out = [];
  for (const t of threads) {
    if (!t.group) { out.push({ key: t.key, threads: [t], name: centreName(t) }); continue; }
    if (seen.has(t.group)) continue;
    seen.add(t.group);
    // Child 1's centre first, whatever order the requests were (re)sent in.
    const ts = threads.filter(x => x.group === t.group).sort((a, b) => (a.payload.children[0]?.label ?? '').localeCompare(b.payload.children[0]?.label ?? ''));
    out.push({ key: t.group, threads: ts, name: groupName(ts), group: true });
  }
  return out;
}

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

export function EnquiryProvider({ children, actions, onChatChange, syncKey = null }) {
  const [threads, setThreads] = useState([]);
  const [view, setView] = useState({ key: null, open: false });
  const [notice, setNotice] = useState(null);
  const modal = useTopModal();
  const threadsRef = useRef(threads), viewRef = useRef(view), modalRef = useRef(modal), actionsRef = useRef(actions), locks = useRef(new Set());
  threadsRef.current = threads; viewRef.current = view; modalRef.current = modal; actionsRef.current = actions;
  const patch = useCallback((key, change) => setThreads(list => {
    const target = list.find(t => t.key === key);
    if (!target) return list;
    const delta = typeof change === 'function' ? change(target) : change;
    return list.map(t => t.key === key ? { ...t, ...delta } : delta.job && t.job?.id === delta.job.id ? { ...t, job: delta.job } : t);
  }), []);
  // A page refresh keeps the conversations (11 Oct 2026): only the request IDs
  // (and the centre's public ID and name) stay in this tab's session; ages
  // and times are read back from the enquiry itself.
  const restoring = useRef(true);
  const [restored, setRestored] = useState(0);
  useEffect(() => {
    let saved = []; try { saved = JSON.parse(sessionStorage.getItem(openKey) || '[]'); } catch { /* nothing saved */ }
    if (!virtualEnquiryEnabled || !Array.isArray(saved) || !saved.length) { restoring.current = false; return; }
    (async () => {
      const back = [], jobs = new Map();
      for (const s of keepEnquiryConversations(saved).slice(-10)) {
        try {
          if (!/^[a-f0-9]{24}$/.test(s.id || '')) continue;
          if (!jobs.has(s.id)) jobs.set(s.id, query({ action: 'get', id: s.id }));
          const job = await jobs.get(s.id);
          const payload = restoredEnquiryPayload(job, s);
          if (!payload) continue;
          const key = isGroup(s.group) ? `${s.group}:${s.id}` : JSON.stringify(payload);
          // Already-read words stay as they were; nothing types out again.
          wordingCache.set(`ask:${key}`, null); shownReplies.add(job.id);
          back.push({ key, payload, centre: s.centre, request: null, family: !!s.family, group: isGroup(s.group) ? s.group : undefined, job, error: '', busy: false, paused: false, retry: 0, unread: false, settled: !following(job), restored: true });
        } catch { /* expired: nothing to bring back */ }
      }
      restoring.current = false;
      if (!back.length) { try { sessionStorage.removeItem(openKey); } catch { /* optional */ } return; }
      setThreads(list => keepEnquiryConversations([...back.filter(b => !list.some(t => t.key === b.key)), ...list]));
      setRestored(unitsOf(back).length);
    })();
  }, []);
  useEffect(() => {
    if (restoring.current) return;
    try { sessionStorage.setItem(openKey, JSON.stringify(openEnquiryReferences(threads))); } catch { /* optional */ }
  }, [threads]);
  const start = useCallback(async (key, payload) => {
    const current = threadsRef.current.find(t => t.key === key);
    if (locks.current.has(key) || (current?.job && !ENDED.includes(current.job.state))) return;
    locks.current.add(key); settledRef.current.delete(key); patch(key, { busy: true, error: '' });
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
  const settledRef = useRef(new Set());
  const settle = useCallback((key, job) => {
    const related = threadsRef.current.filter(x => x.key === key || x.job?.id === job?.id);
    related.forEach(t => settledRef.current.add(t.key));
    const me = related.find(x => inView(x, viewRef.current.key)) ?? related.at(-1);
    // In a group, the notice waits until every centre has answered.
    const group = me?.group, members = group ? threadsRef.current.filter(x => x.group === group) : [];
    const groupDone = !group || members.every(x => x.key === key || settledRef.current.has(x.key) || finished(x));
    if (job?.state !== 'cancelled' && groupDone) {
      if (soundRef.current) chime();
      try {
        if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
          const t = threadsRef.current.find(x => x.key === key);
          const note = new Notification(group ? 'Both centres replied' : `${t ? centreName({ ...t, job }) : 'The centre'} replied`, { body: group ? 'Open the chat to see both replies.' : replyHeadline(job), tag: `equalpath-${group ?? job?.id ?? key}` });
          note.onclick = () => { window.focus(); showRef.current?.(group ?? key); note.close(); };
        }
      } catch { /* optional */ }
    }
    // A "no place" with no other time takes that plan off the options.
    const thread = threadsRef.current.find(x => x.key === key);
    if (job?.result) void naturalReply(job.result, thread ? centreName({ ...thread, job }) : 'The centre', job.id);
    const v = viewRef.current;
    if (v.open && (v.key === key || (group && v.key === group)) && !modalRef.current && !document.hidden) return;
    related.forEach(t => patch(t.key, { unread: true }));
    if (groupDone) setNotice(group ?? key);
  }, [patch]);
  const ask = useCallback(({ payload, centre, request, family }) => {
    prepareAlerts();
    const key = JSON.stringify(payload);
    setThreads(list => list.some(t => t.key === key) ? list : keepEnquiryConversations([...list,
      { key, payload, centre, request, family, job: null, error: '', busy: false, paused: false, retry: 0, unread: false }]));
    const target = threadsRef.current.find(t => t.key === key)?.group ?? key;
    setView({ key: target, open: true }); setNotice(n => n === target ? null : n);
    // The chat replaces the window it was started from, so the map stays usable.
    actionsRef.current?.closeDialogs?.();
    start(key, payload);
  }, [start]);
  const askGroup = useCallback((items) => {
    prepareAlerts();
    const keys = items.map(x => JSON.stringify(x.payload));
    const group = groupFor(threadsRef.current, keys) ?? newGroup();
    const next = addEnquiryGroup(threadsRef.current, items, group);
    setThreads(list => addEnquiryGroup(list, items, group));
    setView({ key: group, open: true }); setNotice(n => n === group ? null : n);
    actionsRef.current?.closeDialogs?.();
    // One after the other: the second request waits until the first is in.
    (async () => { for (const t of next.filter(t => t.group === group && (!t.job || ENDED.includes(t.job.state)))) { settledRef.current.delete(t.key); await start(t.key, t.payload); } })();
    return group;
  }, [start]);
  const show = useCallback((target) => { const key = threadsRef.current.find(x => x.key === target)?.group ?? target; actionsRef.current?.closeDialogs?.(); setView({ key, open: true }); setNotice(null); setThreads(list => list.map(t => inView(t, key) && t.unread ? { ...t, unread: false } : t)); }, []);
  const showRef = useRef(show); showRef.current = show;
  const minimise = useCallback(() => setView(v => ({ ...v, open: false })), []);
  const remove = useCallback((key) => { setThreads(list => list.filter(t => !inView(t, key))); setView(v => v.key === key ? { key: null, open: false } : v); setNotice(n => n === key ? null : n); }, []);
  const chatShown = view.open && !modal && threads.some(t => inView(t, view.key));
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
    for (const t of threads) if (inView(t, view.key) && t.unread && !document.hidden) patch(t.key, { unread: false });
    if (notice === view.key) setNotice(null);
  }, [view, modal, threads, notice, patch]);
  useEffect(() => {
    const back = () => { if (!document.hidden && viewRef.current.open && !modalRef.current) { const k = viewRef.current.key; setThreads(list => list.map(t => inView(t, k) && t.unread ? { ...t, unread: false } : t)); } };
    document.addEventListener('visibilitychange', back);
    return () => document.removeEventListener('visibilitychange', back);
  }, []);
  // The parent keeps or lets go of an offered place; the centre answers it.
  const decide = useCallback(async (key, decision, { release = false } = {}) => {
    // Turning down the centre's other time: nothing to send, the plan just goes.
    if (decision === 'pass') { patch(key, { letGo: true }); return; }
    // The parent took the suggested change: this reply is kept as history,
    // outside the plan's chat, and never removes anything.
    if (decision === 'detach') { patch(key, { group: undefined, released: true, superseded: true }); return; }
    // A two-centre chat replaced by a new pair (a change was accepted).
    if (decision === 'retire') { const g = threadsRef.current.find(x => x.key === key)?.group; if (g) setThreads(list => list.filter(t => t.group !== g)); return; }
    if (release) patch(key, { released: true });
    const t = threadsRef.current.find(x => x.key === key);
    if (!t?.job?.id || t.job.confirmation || t.deciding) return;
    patch(key, { deciding: true, error: '' }); settledRef.current.delete(key);
    try { const job = await query({ action: 'confirm', id: t.job.id, decision }); patch(key, x => ({ job, retry: x.retry + 1 })); }
    catch (e) { patch(key, { error: e.message }); }
    finally { patch(key, { deciding: false }); }
  }, [patch]);
  // Keep the options in step with every chat's conclusion (see planOff).
  useEffect(() => {
    for (const t of threads) { const off = planOff(t); if (off) try { actionsRef.current?.declined?.(t, off); } catch { /* optional */ } }
  }, [threads, syncKey]);
  // Both centres at once: keep (or let go of) every place that was offered.
  const decideGroup = useCallback((group, decision) => {
    for (const t of threadsRef.current.filter(x => x.group === group)) if (t.job?.result && summary(t.job.result).good && !t.job.confirmation) decide(t.key, decision);
  }, [decide]);
  const value = { threads, view, notice, modal, ask, askGroup, decideGroup, show, minimise, remove, start, patch, settle, decide, restored, dismissRestored: () => setRestored(0), sound, setSound, dismissNotice: () => setNotice(null), actions: actionsRef };
  // A reused request can appear in two plans, but needs only one status poll.
  const followers = threads.filter((t, i) => !t.job?.id || threads.findIndex(x => x.job?.id === t.job.id) === i);
  return <EnquiryContext.Provider value={value}>{children}{followers.map(t => <ThreadFollower key={t.key} thread={t} />)}</EnquiryContext.Provider>;
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
  const thread = ctx.threads.findLast(t => JSON.stringify(t.payload) === JSON.stringify(payload));
  const disabled = !payload.date || !children.length || children.some(c => !c.start || !c.end) || !payload.questions.length;
  const label = thread?.job?.state === 'replied' ? 'View reply' : active(thread?.job) ? 'View chat' : 'Ask for me';
  return <button className="secondary virtual-enquiry-toggle" disabled={disabled}
    onClick={() => thread?.job && !ENDED.includes(thread.job.state) ? ctx.show(thread.key) : ctx.ask({ payload, centre: props.centre, request: props.requests?.[0], family: children.length > 1 || !!props.family })}>
    {active(thread?.job) ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageCircle size={17} aria-hidden="true" />}
    {label}
  </button>;
}

// One button for two centres: asks both, then reopens their shared chat.
export function VirtualEnquiryGroup({ items }) {
  const ctx = useContext(EnquiryContext);
  if (!virtualEnquiryEnabled || !ctx) return null;
  const built = items.map(x => {
    const children = (x.requests || []).map((r, i) => ({ label: r.label || `Child ${i + 1}`, age: String(r.age ?? ''), start: r.deadline, end: r.end }));
    return { payload: { branchId: x.providerId, date: x.requests?.[0]?.date, children, questions: [...(x.questionIds ?? ['visit', 'fees'])].sort(), scenario: x.scenario || 'rules' }, centre: x.centre, request: x.requests?.[0] };
  });
  const keys = built.map(x => JSON.stringify(x.payload)), group = groupFor(ctx.threads, keys);
  const ts = group ? ctx.threads.filter(t => t.group === group) : [];
  const disabled = built.some(x => !x.payload.date || !x.payload.children.length || x.payload.children.some(c => !c.start || !c.end) || !x.payload.questions.length);
  const open = ts.length === built.length && ts.every(t => t.job && !ENDED.includes(t.job.state));
  const waiting = ts.some(t => active(t.job) || t.busy);
  const label = !open ? 'Ask both centres' : waiting ? 'View chat' : 'View replies';
  return <button className="secondary virtual-enquiry-toggle virtual-enquiry-group" disabled={disabled}
    onClick={() => open ? ctx.show(group) : ctx.askGroup(built, true)}>
    {waiting ? <LoaderCircle size={17} className="spin" aria-hidden="true" /> : <MessageCircle size={17} aria-hidden="true" />}
    {label}
  </button>;
}

// What happens next for a group: keep both places, or — when one centre has
// no place — back to the other plans (that plan is already off the list).
function groupSteps(ts, act, decide, decideGroup, askGroup) {
  if (!ts.length || !ts.every(finished)) return [];
  const group = ts[0].group, good = ts.filter(t => t.job.result && summary(t.job.result).good);
  const removed = ts.some(t => planOff(t));
  const options = { label: removed ? 'See other plans' : 'Back to your plan', icon: List, run: () => act.current?.options?.(true) };
  if (ts.length !== 2) return [options];
  if (good.length === ts.length) {
    if (good.some(t => t.deciding)) return [];
    if (good.every(t => !t.job.confirmation) && decideGroup) return [
      { label: 'Yes, keep both places', icon: Check, run: () => decideGroup(group, 'accept'), stay: true },
      { label: 'No, thanks', icon: X, run: () => decideGroup(group, 'decline'), stay: true }];
    const pending = pendingGroupDecisions(good);
    if (pending.length && pending.every(t => t.decision)) return pending.map(t => ({ label: `Send your answer to ${centreName(good.find(x => x.key === t.key))}`, icon: MessageCircle, run: () => decide(t.key, t.decision), stay: true }));
    if (good.some(t => t.job.confirmation?.state === 'sending')) return [];
    if (good.every(t => t.job.confirmation?.decision === 'accept' && t.job.confirmation.state === 'acknowledged') && ts.every(t => t.request))
      return [{ label: 'Get ready for childcare', icon: ClipboardList, run: () => act.current?.prepareFamily?.(ts.map(t => t.payload)) }, options];
    return [options];
  }
  // One centre said yes but the plan can't work: let that centre know.
  const waitingOnYou = good.filter(t => !t.job.confirmation);
  const tell = waitingOnYou.map(t => ({ label: `Tell ${centreName(t)} you won’t need it`, icon: X, run: () => decide(t.key, 'decline', { release: true }), stay: true }));
  if (removed) return [options, ...tell];
  // A suggested change: take it (the plan's time changes and that centre is
  // asked again, in the same chat) or turn it down (the plan goes).
  const bad = ts.filter(t => !good.includes(t));
  if (bad.some(t => offersIn(t).length) && askGroup) return changeSteps(bad, act, decide, {
    // The new pair replaces this chat; the other centre's reply carries over.
    start: (old, next) => { askGroup(ts.map(x => x.key === old.key ? next : { payload: x.payload, centre: x.centre, request: x.request })); decide(old.key, 'retire'); },
    // Another day moves the whole plan: both centres are asked for it.
    date: (date) => { askGroup(ts.map(x => withDate(x, date))); decide(ts[0].key, 'retire'); },
  }, true);
  return [{ ...options, label: 'Back to your plan' }];
}
function groupSummary(ts) {
  if (!ts.length || !ts.every(finished)) return null;
  if (ts.length !== 2) return { good: false, title: 'One enquiry is missing', note: 'We could not restore both centres. Check the missing reply before making plans.' };
  const good = ts.filter(t => t.job.result && summary(t.job.result).good), bad = ts.filter(t => !(t.job.result && summary(t.job.result).good));
  if (!bad.length) {
    const c = good.map(t => t.job.confirmation);
    if (c.every(x => x?.state === 'acknowledged' && x.decision === 'accept')) return { good: true, title: 'Both places are confirmed', note: 'Both centres have noted your visit.' };
    if (c.every(x => x?.state === 'acknowledged' && x.decision === 'decline')) return { good: false, title: 'You let both places go', note: 'Both centres know you won’t need them, and this plan is off your options for this search.' };
    if (c.some(x => x?.state === 'failed')) return { good: false, title: 'Your answer couldn’t reach a centre', note: 'Please call or message that centre yourself.' };
    if (c.some(x => x) && c.some(x => !x)) return { good: false, title: 'One answer still needs sending', note: 'Your answer reached one centre. Send it to the other centre to finish.' };
    if (c.some(x => x)) return { good: false, title: 'The centres have different answers', note: 'Check both replies before making plans.' };
    return { good: true, title: 'Both centres have a place', note: 'Keep both places to tell the centres. Your other questions still need an answer.' };
  }
  const names = bad.map(centreName).join(' and ');
  const off = ts.filter(t => planOff(t));
  if (off.length) return { good: false, title: 'This plan won’t work',
    note: `${off.map(t => planOff(t).why === 'you' ? `You turned down ${centreName(t)}’s offer` : `${centreName(t)} has no place for ${planOff(t).labels.join(' and ')}`).join(', and ')}, so this plan is off your options for this search.` };
  const offers = bad.flatMap(t => offersIn(t).map(c => `${centreName(t)} can take ${c.label} ${c.offer.start ? `from ${c.offer.start}` : `on ${visitDay(c.offer.date)}`}`));
  if (offers.length) return { good: false, title: offers.length > 1 ? 'The centres suggested changes' : `${names} suggested a change`,
    note: `${offers.join('. ')}. Take it to keep this plan, or see other plans — this one then comes off your options.` };
  if (ENDED.includes(bad[0].job.state)) return { good: false, title: 'No reply yet', note: `No reply from ${names}. No place has been confirmed.` };
  return { good: false, title: `${names} needs more details`, note: `Answer ${names} before keeping either place. Your plan is still on the list.` };
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
  const declined = !!planOff(t);
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
    // Two children get the family Checklist, the same kind as one child's.
    const prepareFamily = { label: 'Get ready for childcare', icon: ClipboardList, run: () => act.current?.prepareFamily?.([t.payload]), needsSearch: true };
    if (c?.state === 'acknowledged') return c.decision === 'accept' ? (t.family ? [prepareFamily, { ...options, label: 'Back to your plan' }] : !t.centre ? [options] : [prepare]) : [options];
    if (c?.state === 'failed') return [contact];
    if (c) return [];
  }
  // The centre suggested another time or day: take it, or turn it down.
  if (!declined && offersIn(t).length && ask && (t.family || t.centre)) return changeSteps([t], act, decide, {
    start: (old, next) => { decide(old.key, 'detach'); ask({ ...next, family: !!t.family }); },
    date: (date) => { decide(t.key, 'detach'); ask({ ...withDate(t, date), family: !!t.family }); },
  }, !!t.family);
  if (t.family || !t.centre) return [options];
  if (r.outcome === 'unavailable') return [options, contact];
  return [contact, options];
}

/* Rendered inside the app, beside the map: the chat window, its tucked-away
   pill, and the reply notice. */
export function EnquiryDock() {
  const ctx = useContext(EnquiryContext);
  if (!ctx || !ctx.threads.length) return <ReplyNotice />;
  const { threads, view, modal } = ctx;
  const current = unitsOf(threads).find(u => u.key === view.key);
  return <>
    {!modal && view.open && current && (current.group ? <GroupChat key={current.key} group={current.key} ts={current.threads} /> : <ChatWindow key={current.key} thread={current.threads[0]} />)}
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
  const units = unitsOf(threads);
  const busyU = u => u.threads.some(t => active(t.job) || t.busy), unreadU = u => u.threads.some(t => t.unread);
  const u = units.find(unreadU) || [...units].reverse().find(busyU) || units.at(-1);
  if (!u) return null;
  const waiting = units.filter(x => x.threads.some(t => active(t.job))).length;
  const text = unreadU(u) ? `${u.name} replied` : busyU(u) ? `Asking ${u.name}…` : u.threads.every(t => t.job?.state === 'replied') ? `Reply from ${u.name}` : u.name;
  return <button className={`enquiry-pill${unreadU(u) ? ' has-unread' : ''}`} onClick={() => show(u.key)} aria-label={`Open chat: ${text}`}>
    <span className="enquiry-pill-icon" aria-hidden="true">{busyU(u) ? <LoaderCircle size={17} className="spin" /> : <MessageCircle size={17} />}{unreadU(u) && <i />}</span>
    <span className="enquiry-pill-text">{text}</span>
    {waiting > 1 && <small>{waiting} waiting</small>}
  </button>;
}

function ReplyNotice() {
  const ctx = useContext(EnquiryContext);
  if (!ctx?.notice) return null;
  let n;
  if (isGroup(ctx.notice)) {
    const ts = ctx.threads.filter(x => x.group === ctx.notice), sum = groupSummary(ts);
    if (!ts.length) return null;
    n = { key: ctx.notice, keys: ts.map(t => t.key), good: !!sum?.good, failed: false, title: sum?.title ?? 'Both centres replied', text: sum?.note ?? 'Open the chat to see both replies.',
      steps: groupSteps(ts, ctx.actions, ctx.decide, ctx.decideGroup, ctx.askGroup).slice(0, 1) };
  } else {
    const t = ctx.threads.find(x => x.key === ctx.notice);
    if (!t) return null;
    const r = t.job?.result;
    n = { key: t.key, keys: [t.key], good: !!r && summary(r).good, failed: !r, title: !r ? `No reply from ${centreName(t)}` : `${centreName(t)} replied`,
      text: !r ? 'No place has been confirmed. You can try again from the chat.' : replyHeadline(t.job), steps: nextSteps(t, ctx.actions, ctx.ask, ctx.decide).slice(0, 1) };
  }
  const body = <div className={`enquiry-notice${ctx.modal ? ' in-window' : ''}`} role="status" aria-live="polite">
    <span className={`enquiry-notice-icon ${n.good ? 'good' : 'warn'}`} aria-hidden="true">{n.good ? <Check size={18} /> : n.failed ? <Clock3 size={18} /> : <TriangleAlert size={18} />}</span>
    <div className="enquiry-notice-main">
      <strong>{n.title}</strong>
      <p>{n.text}</p>
      <div className="enquiry-notice-actions">
        {n.steps.map(s => <button key={s.label} className="primary" onClick={() => { ctx.dismissNotice(); n.keys.forEach(k => ctx.patch(k, { unread: false })); if (s.stay) ctx.show(n.key); s.run(); }}>{s.label}<ArrowRight size={15} aria-hidden="true" /></button>)}
        <button className="text-link enquiry-notice-view" onClick={() => ctx.show(n.key)}>View chat</button>
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
// The list of conversations at the top of a chat (a group counts once).
function Switcher({ current }) {
  const { threads, show } = useContext(EnquiryContext);
  const [picking, setPicking] = useState(false);
  const units = unitsOf(threads);
  if (units.length < 2) return null;
  return <div className="enquiry-chat-switch">
    <button className="enquiry-chat-switch-toggle" aria-expanded={picking} onClick={() => setPicking(x => !x)}>
      <List size={15} aria-hidden="true" />Your enquiries · {units.length}{units.some(u => u.key !== current && u.threads.some(x => x.unread)) && <i aria-label="New reply" />}<ChevronDown size={15} aria-hidden="true" />
    </button>
    {picking && <ul className="enquiry-chat-switch-list" aria-label="Your enquiries">{[...units].reverse().map(u => {
      const x = u.threads[0], waiting = u.threads.some(t => active(t.job) || t.busy), sum = u.group ? groupSummary(u.threads) : null;
      const good = u.group ? sum?.good : x.job?.result && summary(x.job.result).good, replied = u.threads.every(t => t.job?.result);
      const status = waiting ? 'Waiting for reply' : u.group ? (sum?.title ?? 'Replied') : x.job?.result ? replyHeadline(x.job) : ENDED.includes(x.job?.state) ? 'No reply' : 'Sending';
      return <li key={u.key}><button aria-current={u.key === current ? 'true' : undefined} onClick={() => { setPicking(false); show(u.key); }}>
        <span className="enquiry-switch-icon" aria-hidden="true">{waiting ? <LoaderCircle size={14} className="spin" /> : good ? <Check size={14} /> : replied ? <TriangleAlert size={14} /> : <MessageCircle size={14} />}</span>
        <span className="enquiry-switch-text"><strong>{u.name}</strong><small>{visitDay(x.payload.date)} · {u.group ? `${u.threads.length} centres` : `${x.payload.children[0].start}–${x.payload.children[0].end}`} · {status}</small></span>
        {u.threads.some(t => t.unread) && <i aria-label="New reply" />}
      </button></li>;
    })}</ul>}
  </div>;
}

// One request's messages: the parent's message, the steps, the reply and the
// parent's decision.
function ThreadLog({ t, steps, onStep, scroll, brief = false }) {
  // Steps after the parent's message appear once it is written, one by one.
  const [ready, setReady] = useState(() => wordingCache.has(`ask:${t.key}`));
  const [fresh, setFresh] = useState(false);
  const batch = useRef(0);
  const enter = (i, base) => fresh ? { className: `${base} enter`, style: { animationDelay: `${i <= batch.current ? 120 + i * 140 : 0}ms` } } : { className: base };
  const { job, busy, error, paused } = t;
  const ended = job && ENDED.includes(job.state), decided = job?.confirmation;
  useEffect(() => { scroll?.(); }, [job?.events?.length, job?.state, busy, ready, decided?.state]); // eslint-disable-line react-hooks/exhaustive-deps
  return <>
    <AskBubble key={t.key} thread={t} onReady={waited => { batch.current = t.job?.events.length ?? 0; setReady(true); setFresh(waited); }} />
    {ready && <>
    {busy && !job && <p className="virtual-chat-event"><LoaderCircle size={14} className="spin" />Sending your request…</p>}
    {job?.events.map((event, i) => <p key={`${job.id}-${i}`} {...enter(i, 'virtual-chat-event')}><Check size={14} /><span>{event.text}</span></p>)}
    {active(job) && !paused && <div {...enter(job?.events.length ?? 0, 'virtual-bubble virtual-wait')}><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span><span>{job.state === 'queued' ? 'In line. It will be sent when it’s your turn.' : 'The centre is replying… Replies usually take under a minute.'}</span></div>}
    {job?.result && <Reply key={job.id} id={job.id} name={centreName(t)} result={job.result} animate={!shownReplies.has(job.id)} onComplete={() => shownReplies.add(job.id)} steps={decided ? [] : steps} onStep={onStep} scroll={scroll} />}
    {decided && <Decision c={decided} name={centreName(t)} steps={steps} onStep={onStep} scroll={scroll} brief={brief} />}
    {ended && <div className="virtual-bubble virtual-unresolved"><Clock3 size={18} /><div><strong>{job.state === 'timed_out' ? 'No reply yet' : job.state === 'cancelled' ? 'Enquiry stopped' : 'Could not send the request'}</strong><p>No place has been confirmed.</p></div></div>}
    {error && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>{error}</p></div>}
    </>}
  </>;
}

function ChatWindow({ thread: t }) {
  const ctx = useContext(EnquiryContext);
  const { minimise, remove, start, patch, actions, ask, sound, setSound, decide } = ctx;
  const log = useRef(null), nearEnd = useRef(true);
  const { payload, job, busy, paused } = t;
  const ended = job && ENDED.includes(job.state);
  const scrollEnd = () => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; };
  useEffect(() => { nearEnd.current = true; }, [t.key]);
  const cancel = async () => { patch(t.key, { busy: true }); try { const j = await query({ action: 'cancel', id: job.id }); patch(t.key, { job: j }); } catch (e) { patch(t.key, { error: e.message }); } finally { patch(t.key, { busy: false }); } };
  const steps = nextSteps(t, actions, ask, decide);
  return <section className="enquiry-chat" role="dialog" aria-modal="false" aria-label={`Ask for me: ${centreName(t)}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); minimise(); } }}>
    <header className="enquiry-chat-top">
      <div><p className="enquiry-chat-kicker">Ask for me</p><h2>{centreName(t)}</h2></div>
      <button className="enquiry-chat-icon" onClick={() => setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute reply sound' : 'Turn on reply sound'} title={sound ? 'Sound on' : 'Sound off'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      <button className="enquiry-chat-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><ChevronDown size={19} /></button>
      {!active(job) && !busy && <button className="enquiry-chat-icon" onClick={() => remove(t.key)} aria-label="Close chat" title="Close"><X size={18} /></button>}
    </header>
    <Switcher current={t.key} />
    <p className="enquiry-chat-note">Simulated reply. Uses the centre’s listed ages and hours; no real centre is contacted.</p>
    <div className="enquiry-chat-log" ref={log} role="log" aria-label="Enquiry messages" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = log.current; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      <ThreadLog t={t} steps={steps} onStep={minimise} scroll={scrollEnd} />
    </div>
    <footer className="enquiry-chat-footer">
      <p>{following(job) ? 'You can keep browsing. We’ll let you know when the centre replies.' : job?.result ? 'This doesn’t make a real booking.' : ' '}</p>
      {active(job) && <button className="secondary" disabled={busy} onClick={cancel}><Square size={13} />Stop</button>}
      {paused && <button className="secondary" onClick={() => patch(t.key, x => ({ error: '', paused: false, retry: x.retry + 1 }))}>Reconnect</button>}
      {((!job && t.error && !busy) || ended) && <button className="secondary" disabled={busy} onClick={() => start(t.key, payload)}>Try again</button>}
    </footer>
  </section>;
}

// Two centres in one chat: each centre's messages in turn, then one answer
// for the plan as a whole.
function GroupChat({ group, ts }) {
  const ctx = useContext(EnquiryContext);
  const { minimise, remove, start, patch, actions, decide, decideGroup, sound, setSound } = ctx;
  const log = useRef(null), nearEnd = useRef(true);
  const scrollEnd = () => { if (nearEnd.current && log.current) log.current.scrollTop = log.current.scrollHeight; };
  const sum = groupSummary(ts), steps = groupSteps(ts, actions, decide, decideGroup, ctx.askGroup);
  const anyActive = ts.some(t => active(t.job)), anyBusy = ts.some(t => t.busy), anyFollowing = ts.some(t => following(t.job) || t.busy || (!t.job && !t.error));
  const retry = ts.filter(t => (t.job && ENDED.includes(t.job.state)) || (!t.job && t.error && !t.busy));
  useEffect(() => { scrollEnd(); }, [sum?.title, steps.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const cancel = async () => {
    for (const t of ts.filter(x => active(x.job))) {
      patch(t.key, { busy: true });
      try { const j = await query({ action: 'cancel', id: t.job.id }); patch(t.key, { job: j }); } catch (e) { patch(t.key, { error: e.message }); } finally { patch(t.key, { busy: false }); }
    }
  };
  return <section className="enquiry-chat enquiry-chat-group" role="dialog" aria-modal="false" aria-label={`Ask for me: ${groupName(ts)}`} onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); minimise(); } }}>
    <header className="enquiry-chat-top">
      <div><p className="enquiry-chat-kicker">Ask for me · {ts.length} centres</p><h2>{groupName(ts)}</h2></div>
      <button className="enquiry-chat-icon" onClick={() => setSound(!sound)} aria-pressed={sound} aria-label={sound ? 'Mute reply sound' : 'Turn on reply sound'} title={sound ? 'Sound on' : 'Sound off'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      <button className="enquiry-chat-icon" onClick={minimise} aria-label="Minimise chat" title="Minimise"><ChevronDown size={19} /></button>
      {!anyActive && !anyBusy && <button className="enquiry-chat-icon" onClick={() => remove(group)} aria-label="Close chat" title="Close"><X size={18} /></button>}
    </header>
    <Switcher current={group} />
    <p className="enquiry-chat-note">Simulated replies. Uses each centre’s listed ages and hours; no real centre is contacted.</p>
    <div className="enquiry-chat-log" ref={log} role="log" aria-label="Enquiry messages" aria-live="polite" aria-relevant="additions" onScroll={() => { const el = log.current; nearEnd.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60; }}>
      {ts.map((t, i) => <div key={t.key} className="virtual-group-part">
        <p className="virtual-group-head"><span>{i + 1}</span>{centreName(t)} · {t.payload.children.map(c => c.label).join(' and ')}</p>
        <ThreadLog t={t} steps={[]} brief onStep={minimise} scroll={scrollEnd} />
      </div>)}
      {sum && <section className={`virtual-chat-result virtual-group-result ${sum.good ? 'good' : 'warn'} enter`} aria-label="Both replies">
        <h3>{sum.good ? <Check size={18} /> : <TriangleAlert size={18} />}{sum.title}</h3>
        <p className="virtual-result-note">{sum.note}</p>
        {steps.length > 0 && <div className="virtual-next"><p>Next step</p>
          {steps.map((s, i) => <button key={s.label} className={i === 0 ? 'primary' : 'secondary'} onClick={() => { if (!s.stay) minimise(); s.run(); }}><s.icon size={16} aria-hidden="true" />{s.label}{i === 0 && !s.stay && <ArrowRight size={15} aria-hidden="true" />}</button>)}
        </div>}
      </section>}
    </div>
    <footer className="enquiry-chat-footer">
      <p>{anyFollowing ? 'You can keep browsing. We’ll let you know when both centres reply.' : 'This doesn’t make a real booking.'}</p>
      {anyActive && <button className="secondary" disabled={anyBusy} onClick={cancel}><Square size={13} />Stop</button>}
      {ts.some(t => t.paused) && <button className="secondary" onClick={() => ts.filter(t => t.paused).forEach(t => patch(t.key, x => ({ error: '', paused: false, retry: x.retry + 1 })))}>Reconnect</button>}
      {retry.length > 0 && !anyActive && <button className="secondary" disabled={anyBusy} onClick={() => retry.forEach(t => start(t.key, t.payload))}>Try again</button>}
    </footer>
  </section>;
}

// The parent's decision and the centre's answer, after the first reply.
function Decision({ c, name, steps, onStep, scroll, brief = false }) {
  useEffect(() => { scroll?.(); }, [c.state]); // eslint-disable-line react-hooks/exhaustive-deps
  const yes = c.decision === 'accept';
  return <>
    <article className="virtual-bubble virtual-bubble-you enter"><p className="virtual-ask-text">{c.message}</p></article>
    {c.state === 'sending' && <div className="virtual-bubble virtual-wait enter" style={{ animationDelay: '160ms' }}><span className="virtual-dots" aria-hidden="true"><i /><i /><i /></span><span>The centre is replying…</span></div>}
    {c.state === 'failed' && <div className="virtual-chat-error" role="alert"><TriangleAlert size={17} /><p>Your answer couldn’t be sent. Please call or message the centre yourself.</p></div>}
    {c.state === 'acknowledged' && <>
      <article className="virtual-bubble virtual-bubble-reply enter"><strong>{name}</strong><p className="virtual-reply-text">{c.reply}</p></article>
      {!brief && <section className={`virtual-chat-result ${yes ? 'good' : 'warn'} enter`} style={{ animationDelay: '140ms' }} aria-label="Your decision">
        <h3>{yes ? <Check size={18} /> : <Info size={18} />}{yes ? 'Your place is confirmed' : 'You let this place go'}</h3>
        <p className="virtual-result-note">{yes ? 'The centre has noted your visit.' : 'The centre knows you won’t need it.'}</p>
        {steps.length > 0 && <div className="virtual-next"><p>Next step</p>
          {steps.map((s, i) => <button key={s.label} className={i === 0 ? 'primary' : 'secondary'} onClick={() => { if (!s.stay) onStep?.(); s.run(); }}><s.icon size={16} aria-hidden="true" />{s.label}{i === 0 && <ArrowRight size={15} aria-hidden="true" />}</button>)}
        </div>}
      </section>}
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
