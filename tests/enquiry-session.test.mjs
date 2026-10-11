import test from 'node:test';
import assert from 'node:assert/strict';
import { enquiryStatus, openEnquiryReferences, restoredEnquiryPayload } from '../shared/enquiry-session.mjs';

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
