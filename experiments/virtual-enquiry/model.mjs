import { createHash } from 'node:crypto';
import { applicableWindows, assess, careEndScheduleFor, costFor } from '../../shared/conditions.mjs';

export const SCENARIOS = ['rules', 'available', 'full', 'conditional', 'more_info', 'no_reply'];
export const QUESTION_TEXT = {
  visit: 'Can you take the children for this visit?',
  fees: 'What is the total fee, including extras?',
  booking: 'What do I need to do before the visit?',
  arrival: 'How should we arrange drop-off?',
  pickup: 'Can the centre collect the children?',
};
export const hash = value => createHash('sha256').update(value).digest('hex');
export class EnquiryError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
const minute = t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t ?? '') ? +t.slice(0, 2) * 60 + +t.slice(3) : null;
export const clock = n => `${String(Math.floor(n / 60)).padStart(2, '0')}:${String(n % 60).padStart(2, '0')}`;

// Retain published age/hours/admission/fee evidence, including unknowns and
// source conflicts. Contacts and precise locations never enter this subsystem.
// Only capacity and the response process are simulated.
export function virtualBranches(providers) {
  return [...providers].sort((a, b) => a.id.localeCompare(b.id)).map((p, i) => ({
    sourceId: p.id, id: `virtual-${hash(p.id).slice(0, 16)}`,
    name: `Virtual Centre ${String(i + 1).padStart(3, '0')}`, listedName: p.name,
    facts: structuredClone({ ...Object.fromEntries(['age', 'businessHours', 'careWindows', 'dateExceptions', 'lateRule', 'admission', 'fees', 'feeRule'].filter(k => p[k] !== undefined).map(k => [k, p[k]])),
      // Whether a pickup service is listed, without its coverage places.
      ...(p.transport ? { transport: { exists: p.transport.exists ?? null, wording: p.transport.wording ?? null } } : {}) }),
    capacity: { places: [2, 1, 0, 2, 2, 1][i % 6], olderPlaces: i % 4 === 1 ? 0 : 2 },
  }));
}

export function listedChecks(branch, date, child) {
  const request = { careType: 'short_term', date, age: child.age, deadline: child.start, end: child.end, transport: 'self', pickup: { label: 'Test starting point' } };
  const checks = assess(branch.facts, request).conditions.filter(c => ['age', 'care', 'admission'].includes(c.id));
  const schedule = careEndScheduleFor(branch.facts, date);
  // The existing search checks collection time. An enquiry also checks the
  // whole requested interval, including opening time and any midday gap.
  if (schedule.end !== null) {
    const ws = applicableWindows(branch.facts.careWindows?.length ? branch.facts.careWindows : branch.facts.businessHours?.windows, date).sort((a,b) => a.start-b.start);
    let until = minute(child.start);
    for (const w of ws) if (w.start <= until && w.end > until) until = Math.min(w.end, schedule.end);
    if (until < minute(child.end)) checks.push({ id: 'visit_hours', state: 'conflict', reason: 'The listed hours do not cover the full start-to-end visit.', source: schedule.source });
  }
  return { checks, fee: costFor(branch.facts, request) };
}

export function canonicalEnquiry(input, branches) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new EnquiryError('Check your request.');
  // Reject routing/identity fields instead of accepting client-chosen recipients.
  const allowed = ['branchId', 'date', 'children', 'questions', 'scenario'];
  if (Object.keys(input).some(k => !allowed.includes(k))) throw new EnquiryError('Only test visit details are accepted.');
  const branch = branches.find(b => b.id === input.branchId || b.sourceId === input.branchId);
  if (!branch) throw new EnquiryError('This centre has no virtual test identity.');
  const date = input.date;
  const parsed = typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(`${date}T12:00:00Z`) : null;
  if (!parsed || !Number.isFinite(+parsed) || parsed.toISOString().slice(0, 10) !== date) throw new EnquiryError('Choose a valid date.');
  if (!Array.isArray(input.children) || ![1, 2].includes(input.children.length)) throw new EnquiryError('Choose one or two children.');
  const children = input.children.map((child, i) => {
    if (!child || Object.keys(child).some(k => !['age', 'start', 'end', 'label'].includes(k))) throw new EnquiryError('Use ages and times only.');
    const age = String(child.age ?? '');
    if (!/^(?:[0-6]|1-3|4-6)?$/.test(age)) throw new EnquiryError('Choose an age from 0 to 6.');
    const start = minute(child.start), end = minute(child.end);
    if (start === null || end === null || end <= start) throw new EnquiryError('Choose a start and a later end time for each child.');
    const label = ['Child 1', 'Child 2'].includes(child.label) ? child.label : `Child ${i + 1}`;
    return { label, age, start: child.start, end: child.end };
  });
  if (new Set(children.map(c => c.label)).size !== children.length) throw new EnquiryError('Each child needs a different label.');
  const questions = input.questions ?? ['visit', 'fees'];
  if (!Array.isArray(questions) || !questions.length || questions.length > 20 || questions.some(q => typeof q !== 'string' || !/^[a-z][a-z0-9:_-]{0,63}$/.test(q))) throw new EnquiryError('Choose at least one question.');
  const scenario = input.scenario ?? 'rules';
  if (!SCENARIOS.includes(scenario)) throw new EnquiryError('Choose a test scenario.');
  return { branchId: branch.id, date, children, questions: [...new Set(questions)].sort(), scenario };
}

export function messageFor(request, branch) {
  return [`SIMULATION ONLY — ${branch.name}`, `Date: ${request.date} (Malaysia time)`,
    ...request.children.map(c => `${c.label}: ${c.age === '' ? 'age not given' : c.age === '0' ? 'under 1 year' : `${c.age} years`}, ${c.start}–${c.end}`),
    ...request.questions.map(q => QUESTION_TEXT[q] || `Please clarify: ${q.replace(/^review:/, '').replaceAll('-', ' ')}.`),
    'These are test details. No real childcare booking is being made.'].join('\n');
}

// Every selected question gets an answer (10 Oct 2026). Listed facts are used
// where the catalogue has them; otherwise the virtual staff member gives a
// clearly marked demo answer, like the simulated places themselves.
const LISTED = 'Listed', DEMO = 'Demo answer', MIXED = 'Listed + demo detail';
const DEMO_ANSWERS = {
  'review:caring_teachers': ['Settling in', 'A teacher stays with a new child for the first half hour and checks in with them through the visit.'],
  'review:secure_pickup': ['Collection', 'Only the adult you name at drop-off can collect your child. We check their IC at the door.'],
  'review:clean_environment': ['Cleaning', 'Rooms and toilets are cleaned every day, and toys are wiped after each session.'],
  'review:healthy_meals': ['Meals', 'We give a snack and water. Tell us about allergies at drop-off and we keep your child’s food separate.'],
  'review:engaging_activities': ['Activities', 'Free play, story time and an art activity. There is no screen time for children under five.'],
  'review:responsive_team': ['Updates', 'We send you a WhatsApp photo and a short update once your child has settled in.'],
  'review:smooth_pickup': ['Drop-off and collection', 'Hand your child over at reception; it takes a few minutes. At busy times a staff member meets you at the door.'],
};
const DAY_WORDS = { SUN: 'Sundays', MON: 'Mondays', TUE: 'Tuesdays', WED: 'Wednesdays', THU: 'Thursdays', FRI: 'Fridays', SAT: 'Saturdays' };
export function answerQuestions(request, branch) {
  const f = branch.facts, windows = applicableWindows(f.careWindows?.length ? f.careWindows : f.businessHours?.windows, request.date).sort((a, b) => a.start - b.start);
  const opens = windows.length ? clock(windows[0].start) : null, earliest = request.children.map(c => c.start).sort()[0];
  const day = DAY_WORDS[['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][new Date(`${request.date}T12:00:00Z`).getUTCDay()]];
  const hoursLine = windows.length ? `On ${day} we’re open ${windows.map(w => `${clock(w.start)}–${clock(w.end)}`).join(' and ')}.` : null;
  const answer = (id) => {
    if (id === 'booking' || id === 'review:flexible_short_care') {
      const listed = f.admission?.sameDayAcceptance === 'yes' ? 'Same-day visits are listed. Send us a message before you come.'
        : f.admission?.sameDayAcceptance === 'call_first' ? 'Please call us before the visit so we can hold the place.' : null;
      return listed ? ['Booking', `${listed} You can change or cancel up to the day before.`, MIXED]
        : ['Booking', 'Book by message the day before. You can change or cancel up to the day before.', DEMO];
    }
    if (id === 'arrival') return ['Drop-off', `${opens ? `We open at ${opens}, so you can drop off from ${opens > earliest ? opens : earliest}. ` : ''}Drop-off takes about 10 minutes.`, opens ? MIXED : DEMO];
    if (id === 'pickup') {
      if (f.transport?.exists === true) return ['Pickup', `${f.transport.wording ?? 'A pickup service is listed.'} For this visit we can collect your child at ${earliest}; we’ll confirm the route by phone.`, MIXED];
      if (f.transport?.exists === false) return ['Pickup', `We don’t run a pickup service, so please bring your child${opens ? `. We open at ${opens}` : ''}.`, LISTED];
      return ['Pickup', 'Pickup isn’t offered for short visits. Please bring your child.', DEMO];
    }
    if (id === 'review:convenient_hours' && hoursLine) return ['Hours', `${hoursLine} No changes are planned for your visit.`, MIXED];
    if (id === 'review:clear_late_rules') return f.lateRule?.wording ? ['Late collection', `Late fee: ${f.lateRule.wording}.`, LISTED] : ['Late collection', 'Call us if you’re running late. A late fee applies after closing time.', DEMO];
    if (DEMO_ANSWERS[id]) return [...DEMO_ANSWERS[id], DEMO];
    return [id.replace(/^review:/, '').replaceAll(/[-_]/g, ' ').replace(/^./, c => c.toUpperCase()), 'Our staff will go through this with you at drop-off.', DEMO];
  };
  return request.questions.filter(q => !['visit', 'fees'].includes(q)).map(id => { const [topic, text, basis] = answer(id); return { id, topic, text, basis }; });
}
export function decide(request, branch) {
  if (request.scenario === 'no_reply') return null;
  const capacity = request.scenario === 'available' ? { places: 2, olderPlaces: 2 }
    : request.scenario === 'full' ? { places: 0, olderPlaces: 0 } : branch.capacity;
  const reserved = [];
  const children = request.children.map(c => {
    const { checks, fee } = listedChecks(branch, request.date, c);
    const conflict = checks.find(x => x.state === 'conflict'), unknown = checks.find(x => x.state !== 'supported');
    let state = 'available', reason = 'The listed ages and hours fit, and a simulated place is available.';
    if (conflict) { state = 'unavailable'; reason = conflict.reason.replace(/\.\.(\s|$)/g, '.$1'); }
    else if (capacity.places === 0) { state = 'unavailable'; reason = 'There are no simulated places left.'; }
    else if (unknown) { state = 'more_info'; reason = unknown.reason.replace(/\.\.(\s|$)/g, '.$1'); }
    else {
      const overlapping = reserved.filter(x => minute(x.start) < minute(c.end) && minute(c.start) < minute(x.end));
      if (overlapping.length >= capacity.places || (+c.age >= 4 && overlapping.filter(x => +x.age >= 4).length >= capacity.olderPlaces)) {
        state = 'unavailable'; reason = 'There is no simulated place left for this age and time.';
      } else if (request.scenario === 'conditional') {
        state = 'conditional'; reason = 'The simulated staff member asks you to confirm drop-off arrangements before accepting.';
      } else if (request.scenario === 'more_info') {
        state = 'more_info'; reason = 'The simulated staff member asks for the child’s exact age and arrival time.';
      }
    }
    if (state === 'available' || state === 'conditional') reserved.push(c);
    return { ...c, state, reason, checks, estimatedFee: fee.available ? fee.total : null, feeSource: fee.source ?? null };
  });
  const states = children.map(c => c.state);
  let outcome = states.every(s => s === 'available') ? 'available' : states.every(s => s === 'unavailable') ? 'unavailable'
    : states.includes('more_info') ? 'more_info' : states.includes('conditional') ? 'conditional' : 'partial';
  // Partial acceptance requires an actual available child. A rejected child
  // plus an unresolved sibling must not become "one child can be accepted".
  // Every other selected question is answered, from listed facts or as a
  // marked demo answer, so it no longer holds back an acceptance.
  const unanswered = [];
  const extra = answerQuestions(request, branch);
  const answers = [
    ...(request.questions.includes('visit') ? [{ id: 'visit', topic: 'Place', text: 'See the reply for each child.', basis: 'simulated' }] : []),
    ...(request.questions.includes('fees') ? [{ id: 'fees', topic: 'Fee', text: 'Listed estimates, before any extra charges.', basis: LISTED }] : []),
    ...extra];
  const limitations = ['Simulated spaces and replies only. No real place has been reserved.'];
  if (extra.some(a => a.basis !== LISTED)) limitations.push('“Demo answer” and “demo detail” parts are simulated, not taken from the centre’s listing.');
  const rawReply = [`Demo reply for ${request.date}`, ...children.map(c => `${c.label} (${c.start}–${c.end}): ${c.reason}`),
    ...(request.questions.includes('fees') ? children.map(c => c.estimatedFee === null ? `${c.label}: the fee needs checking.` : `${c.label}: MYR ${c.estimatedFee.toFixed(2)} estimated total, before any extra charges.`) : []),
    ...extra.map(a => `${a.topic}: ${a.text} (${a.basis})`)].join('\n\n');
  return { outcome, children, answers, unanswered, limitations, rawReply, basis: 'listed-facts-with-simulated-capacity', scenario: request.scenario };
}
