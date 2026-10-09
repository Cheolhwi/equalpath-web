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
    facts: structuredClone(Object.fromEntries(['age', 'businessHours', 'careWindows', 'dateExceptions', 'lateRule', 'admission', 'fees', 'feeRule'].filter(k => p[k] !== undefined).map(k => [k, p[k]]))),
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
  if (!Array.isArray(questions) || !questions.length || questions.length > 20 || questions.some(q => typeof q !== 'string' || !/^[a-z][a-z0-9:-]{0,63}$/.test(q))) throw new EnquiryError('Choose at least one question.');
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

export function decide(request, branch) {
  if (request.scenario === 'no_reply') return null;
  const capacity = request.scenario === 'available' ? { places: 2, olderPlaces: 2 }
    : request.scenario === 'full' ? { places: 0, olderPlaces: 0 } : branch.capacity;
  const reserved = [];
  const children = request.children.map(c => {
    const { checks, fee } = listedChecks(branch, request.date, c);
    const conflict = checks.find(x => x.state === 'conflict'), unknown = checks.find(x => x.state !== 'supported');
    let state = 'available', reason = 'The listed ages and hours fit, and a simulated place is available.';
    if (conflict) { state = 'unavailable'; reason = conflict.reason; }
    else if (capacity.places === 0) { state = 'unavailable'; reason = 'There are no simulated places left.'; }
    else if (unknown) { state = 'more_info'; reason = unknown.reason; }
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
  const unanswered = request.questions.filter(q => !['visit', 'fees'].includes(q));
  // A capacity response is not a complete answer to unanswered pickup,
  // booking or review questions. Never turn those into blanket acceptance.
  if (outcome === 'available' && unanswered.length) outcome = 'more_info';
  const answers = request.questions.map(id => ({ id, text: id === 'visit' ? 'See the separate reply for each child.'
    : id === 'fees' ? 'Fees below are listed estimates. Extra charges still need checking.'
      : 'This selected question is not answered by the simulation and still needs checking.' }));
  const limitations = ['Simulated spaces and replies only. No real place has been reserved.'];
  if (unanswered.length) limitations.push('Some selected questions remain unanswered.');
  const rawReply = [`Demo reply for ${request.date}`, ...children.map(c => `${c.label} (${c.start}–${c.end}): ${c.reason}`),
    ...(request.questions.includes('fees') ? children.map(c => c.estimatedFee === null ? `${c.label}: the fee needs checking.` : `${c.label}: MYR ${c.estimatedFee.toFixed(2)} estimated total, before any extra charges.`) : []),
    ...(unanswered.length ? ['Your other selected questions still need an answer.'] : [])].join('\n\n');
  return { outcome, children, answers, unanswered, limitations, rawReply, basis: 'listed-facts-with-simulated-capacity', scenario: request.scenario };
}
