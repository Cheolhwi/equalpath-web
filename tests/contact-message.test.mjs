import test from 'node:test';
import assert from 'node:assert/strict';
import { assess, costFor, enquiries } from '../shared/conditions.mjs';
import { contactQuestions, contactIntro, contactMessage } from '../shared/contact-message.mjs';
import { fixtureProviders, demoPickup } from '../server/fixtures.mjs';
const request = { pickup: demoPickup, date: '2026-09-14', deadline: '13:00', end: '18:00', age: '4', transport: 'institution' };
function hydrate(base, r = request) {
  const p = structuredClone(base), fit = assess(p, r);
  return { ...p, fit, enquiries: enquiries(p, r, fit), cost: costFor(p, r) };
}
test('merge overlapping questions without dropping any source checks or known conflicts', () => {
  for (const transport of ['institution', 'self', '']) {
    const r = { ...request, transport };
    for (const base of fixtureProviders) {
      const p = hydrate(base, r), groups = contactQuestions(p, r);
      assert.ok(groups.length <= 4);
      assert.deepEqual(groups.flatMap(q => q.checks.map(c => c.id)).sort(), p.enquiries.map(q => q.id).sort());
      assert.deepEqual(groups.flatMap(q => q.conflicts.map(c => c.id)).sort(), p.fit.conditions.filter(c => c.state === 'conflict' && c.question).map(c => c.id).sort());
      if (groups.some(q => q.conflicts.length)) assert.ok(groups[0].conflicts.length);
      assert.equal(groups.some(q => q.id === 'pickup'), transport !== 'self' && p.enquiries.some(q => ['transport', 'coverage', 'pickup', 'transfer'].includes(q.id)));
    }
  }
});
test('the short message copies only checked questions and preserves actual departure and pickup times', () => {
  const p = hydrate(fixtureProviders[1]), groups = contactQuestions(p, request);
  const selected = groups.filter(q => q.id !== 'fees'), message = contactMessage(p, request, selected);
  assert.ok(message.startsWith(contactIntro(p, request)));
  assert.match(message, /Leave at: 13:00 · Pick up child at: 18:00/);
  assert.match(message, /4 years old/);
  assert.ok(!message.includes(groups.find(q => q.id === 'fees').text));
  assert.ok(!message.includes('Published care hours'));
  selected.forEach((q, i) => assert.ok(message.includes(`${i + 1}. ${q.text}`)));
});
test('specific booking, supervision and toilet requirements stay in their own visible question', () => {
  const cases = [
    ['Can you accept this short-term visit with the required notice, and which session and daily price apply?', /How early.*hours/],
    ['Can I book supervised drop-off for my child’s age and these hours, and what is the total price?', /staff member.*while I leave/],
    ['Can you supervise my child for this 1–3-hour visit, with the required notice and toilet-training requirements?', /1–3-hour.*early.*toilet without help/],
  ];
  for (const [question, expected] of cases) {
    const base = structuredClone(fixtureProviders[0]);
    base.admission = { value: true, question, requirements: ['Keep the published booking requirement.'] };
    const p = hydrate(base), groups = contactQuestions(p, request), booking = groups.find(q => q.id === 'booking');
    assert.match(booking.text, expected);
    assert.ok(booking.checks[0].why.includes(base.admission.requirements[0]));
    assert.ok(contactMessage(p, request, groups).includes(booking.text));
  }
});
test('long-term requests do not acquire a visit date or short-stay price, and estimates remain questions', () => {
  const r = { ...request, careType: 'regular', date: '', deadline: '', end: '', age: '' };
  const p = hydrate(fixtureProviders[0], r), groups = contactQuestions(p, r), message = contactMessage(p, r, groups);
  assert.match(message, /long-term childcare/);
  assert.doesNotMatch(message, /Leave at|Pick up child at|Date:|Age not chosen/);
  assert.match(groups.find(q => q.id === 'fees').text, /registration, meals/);
  const short = hydrate(fixtureProviders[0]);
  assert.match(contactQuestions(short, request).find(q => q.id === 'fees').text, /estimated MYR 90.*correct.*extra/);
});
