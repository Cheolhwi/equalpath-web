import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiryStatus, openEnquiryReferences, restoredEnquiryPayload, keepEnquiryConversations, enquiryVisitsMatch, pendingGroupDecisions, enquiryGroupFor, addEnquiryGroup, enquiryChildDeclined } from '../shared/enquiry-session.mjs';

const request = { date: '2026-10-12', age: '2', deadline: '09:00', end: '15:00' };
const child = { label: 'Child 1', age: '2', start: '09:00', end: '15:00' };
const thread = () => ({ payload: { branchId: 'branch-a', date: request.date, children: [child] },
  job: { id: 'a'.repeat(24), state: 'replied', result: { outcome: 'available' } } });

test('a single-child offer cannot be inherited by a different age, time, date, branch or two-child visit', () => {
  const t = thread();
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'available');
  for (const patch of [{ age: '4' }, { deadline: '10:00' }, { end: '16:00' }, { date: '2026-10-13' }])
    assert.equal(enquiryStatus([t], 'branch-a', [{ ...request, ...patch }]), null);
  assert.equal(enquiryStatus([t], 'branch-b', [request]), null);
  assert.equal(enquiryStatus([t], 'branch-a', [request, request]), null);
  assert.equal(enquiryStatus([t], 'branch-a'), null);
});

test('two-child replies match the full visit regardless of display order, without dropping identical children', () => {
  const t = thread(); t.payload.children.push({ ...child, label: 'Child 2', age: '4', end: '16:00' });
  const second = { ...request, age: '4', end: '16:00' };
  assert.equal(enquiryStatus([t], 'branch-a', [second, request]), 'available');
  assert.equal(enquiryStatus([t], 'branch-a', [request]), null);
  assert.equal(enquiryStatus([t], 'branch-a', [request, request]), null);
  assert.equal(enquiryStatus([t], 'branch-a', [request, { ...second, date: '2026-10-13' }]), null);
});

test('only the matching visit can be confirmed and cancelled or failed enquiries do not show an offer', () => {
  const t = thread(); t.job.confirmation = { state: 'acknowledged', decision: 'accept' };
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'confirmed');
  assert.equal(enquiryStatus([t], 'branch-a', [request, request]), null);
  t.job.confirmation.decision = 'decline';
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'replied');
  for (const state of ['failed', 'timed_out', 'cancelled']) {
    t.job.state = state; assert.equal(enquiryStatus([t], 'branch-a', [request]), null);
  }
});

test('waiting and unresolved replies retain their status without suggesting an offer', () => {
  const t = thread(); t.job.result = null; t.job.state = 'waiting';
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'asked');
  t.job.state = 'replied'; t.job.result = { outcome: 'more_info', children: [{ state: 'more_info' }] };
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'replied');
  t.job.result.children = [{ state: 'available' }];
  assert.equal(enquiryStatus([t], 'branch-a', [request]), 'available');
  delete t.job;
  assert.equal(enquiryStatus([t], 'branch-a', [request]), null);
});

test('refresh references keep public branch metadata but never the visit or JSON payload key', () => {
  const t = thread(); t.key = JSON.stringify(t.payload); t.centre = { id: 'branch-a', name: 'Public branch', address: 'not needed' };
  const references = openEnquiryReferences([t]);
  assert.deepEqual(references, [{ id: t.job.id, family: false, centre: { id: 'branch-a', name: 'Public branch' } }]);
  assert.equal(openEnquiryReferences(Array.from({ length: 7 }, () => t)).length, 5);
  assert.deepEqual(openEnquiryReferences([{ ...t, job: null }]), []);
});

test('refresh restores the visit from the authenticated job, not stale browser payloads', () => {
  const job = { request: { branchId: 'virtual-a', date: request.date, children: [child], questions: ['visit', 'fees'] } };
  const payload = restoredEnquiryPayload(job, { key: 'stale browser payload', centre: { id: 'branch-a' } });
  assert.deepEqual(payload, { branchId: 'branch-a', date: request.date, children: [child], questions: ['fees', 'visit'], scenario: 'rules' });
  assert.equal(restoredEnquiryPayload({}, {}), null);
});

test('two centres asked together keep only their random group ID for a refresh', () => {
  const t = thread(); t.centre = { id: 'branch-a', name: 'Public branch' };
  assert.deepEqual(openEnquiryReferences([{ ...t, group: 'group:0123456789abcdef' }])[0].group, 'group:0123456789abcdef');
  assert.equal(openEnquiryReferences([{ ...t, group: `group:${JSON.stringify(t.payload)}` }])[0].group, undefined);
});

test('five conversations retain both centres across persistence, refresh and new single enquiries', () => {
  const pair = n => [0, 1].map(i => ({ ...thread(), key: `${n}:${i}`, group: `group:${String(n).padStart(16, '0')}`, job: { id: `${n}:${i}` } }));
  const groups = Array.from({ length: 5 }, (_, n) => pair(n)).flat();
  assert.equal(openEnquiryReferences(groups).length, 10);
  assert.equal(keepEnquiryConversations(openEnquiryReferences(groups)).length, 10);
  const kept = keepEnquiryConversations([...groups, { ...thread(), key: 'single' }]);
  assert.equal(kept.length, 9);
  assert.equal(kept.filter(t => t.group === groups[0].group).length, 0);
  assert.equal(kept.filter(t => t.group === groups[2].group).length, 2);
});

test('confirmed family plan requires both branch assignments and the exact child visits', () => {
  const first = { ...thread().payload };
  const second = { ...first, branchId: 'branch-b', children: [{ ...child, label: 'Child 2', age: '4' }] };
  assert.equal(enquiryVisitsMatch([first, second], [second, first]), true);
  assert.equal(enquiryVisitsMatch([first, second], [first, { ...second, children: [{ ...second.children[0], start: '10:00' }] }]), false);
  assert.equal(enquiryVisitsMatch([first, second], [first, { ...second, branchId: 'branch-a' }]), false);
  assert.equal(enquiryVisitsMatch([first], [first, first]), false);
  assert.equal(enquiryVisitsMatch([{ ...first, children: [child, child] }], [first, first]), true);
});

test('a partially delivered group decision can continue without re-confirming the other centre', () => {
  const pair = [0, 1].map(n => ({ ...thread(), key: String(n) }));
  assert.equal(pendingGroupDecisions(pair).length, 2);
  for (const decision of ['accept', 'decline']) {
    pair[0].job.confirmation = { decision, state: 'acknowledged' };
    assert.deepEqual(pendingGroupDecisions(pair), [{ key: '1', decision }]);
    pair[1].deciding = true;
    assert.deepEqual(pendingGroupDecisions(pair), []);
    pair[1].deciding = false;
  }
  pair[0].job.confirmation.state = 'sending';
  assert.deepEqual(pendingGroupDecisions(pair), []);
  pair[0].job.confirmation.state = 'failed';
  assert.deepEqual(pendingGroupDecisions(pair), []);
  assert.deepEqual(pendingGroupDecisions([pair[1]]), []);
});

test('a new plan can reuse one enquiry without moving it out of the previous group', () => {
  const first = { payload: thread().payload }, second = { payload: { ...thread().payload, branchId: 'branch-b' } };
  const oldId = 'group:0123456789abcdef', newId = 'group:1123456789abcdef';
  const old = addEnquiryGroup([], [first, second], oldId);
  old[1].job = { id: 'b'.repeat(24), state: 'replied', confirmation: { state: 'acknowledged', decision: 'accept' } };
  const changed = { payload: { ...first.payload, children: [{ ...child, start: '11:00', end: '12:00' }] } };
  const next = addEnquiryGroup(old, [changed, second], newId);
  assert.equal(next.length, 4);
  assert.equal(next.filter(t => t.group === oldId).length, 2);
  assert.equal(next.filter(t => t.group === newId).length, 2);
  assert.equal(next[3].job, old[1].job);
  assert.notEqual(next[3].key, old[1].key);
  assert.equal(enquiryGroupFor(next, [second.payload, first.payload]), oldId);
  assert.equal(enquiryGroupFor(next, [changed.payload, second.payload]), newId);
  assert.equal(addEnquiryGroup(next, [changed, second], newId), next);
  const refs = openEnquiryReferences(next);
  assert.equal(refs.length, 2);
  assert.notEqual(refs[0].group, refs[1].group);
});


test('a different-day or later-time offer excludes only the original family plan', () => {
  for (const child of [{ state: 'unavailable', offer: { date: '2026-10-16' } },
    { state: 'conditional', offer: { start: '16:00' } }]) {
    assert.equal(enquiryChildDeclined(child, true), true);
    assert.equal(enquiryChildDeclined(child, false), false);
  }
  assert.equal(enquiryChildDeclined({ state: 'unavailable' }), true);
  for (const state of ['available', 'more_info']) assert.equal(enquiryChildDeclined({ state }, true), false);
});
