import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as wait } from 'node:timers/promises';
import { virtualBranches, canonicalEnquiry, decide } from '../experiments/virtual-enquiry/model.mjs';
import { createEnquiryService } from '../experiments/virtual-enquiry/service.mjs';
import { telegramTransport } from '../experiments/virtual-enquiry/telegram.mjs';
import { createSearchStore } from '../server/search-catalog.mjs';

const source = { label: 'Unit-test fixture, not a real source', current: true };
const provider = { id: 'test-provider', name: 'Test centre', age: { min: 12, max: 84, endpointKnown: true, maxInclusive: false, wording: '1–6 years', source },
  admission: { value: true, source }, businessHours: { windows: [{ days: ['MON','TUE','WED','THU','FRI'], start: 480, end: 1080, source }], closedDays: [], source },
  phone: { display: 'DO NOT COPY' }, whatsapp: [{ href: 'DO NOT COPY' }], location: { lat: 3, lng: 101 } };
const branch = () => ({ ...virtualBranches([provider])[0], capacity: { places: 2, olderPlaces: 2 } });
const input = (extra = {}) => ({ branchId: provider.id, date: '2026-10-09', children: [{ age: '2', start: '14:00', end: '16:00' }], questions: ['visit', 'fees'], ...extra });
const run = (extra = {}, b = branch()) => decide(canonicalEnquiry(input(extra), [b]), b);
const owner = 'a'.repeat(64), otherOwner = 'b'.repeat(64);

test('all 101 branches retain exact listed age and hours, but no contact or location fields', async () => {
  const catalogue = await createSearchStore().catalog('short_term'), branches = virtualBranches(catalogue.items);
  assert.equal(branches.length, 101); assert.equal(new Set(branches.map(b => b.id)).size, 101);
  for (const b of branches) {
    const p = catalogue.items.find(p => p.id === b.sourceId);
    assert.deepEqual(b.facts.age, p.age); assert.deepEqual(b.facts.businessHours, p.businessHours);
    for (const k of ['phone', 'whatsapp', 'location', 'address', 'website']) assert.equal(b.facts[k], undefined);
    for (const date of ['2026-10-09', '2026-10-10', '2026-10-11']) {
      const result = run({ branchId: b.id, date, scenario: 'available' }, b);
      for (const c of result.children) if (c.checks.some(x => x.state === 'conflict')) assert.equal(c.state, 'unavailable');
    }
  }
});
test('simulated spaces cannot override real age or full-interval hours conflicts', () => {
  assert.equal(run({ scenario: 'available', children: [{ age: '0', start: '14:00', end: '16:00' }] }).outcome, 'unavailable');
  for (const [start,end] of [['07:00','09:00'], ['17:00','19:00']]) assert.equal(run({ scenario: 'available', children: [{ age:'2', start,end }] }).outcome, 'unavailable');
  assert.equal(run({ scenario: 'available', date: '2026-10-11' }).outcome, 'unavailable');
});
test('month age limits and partially covered ages retain the existing evidence semantics', () => {
  const b = branch(); b.facts.age = { ...b.facts.age, min: 3, max: 48, wording: '3 months–under 4 years' };
  assert.equal(run({ scenario:'available' }, b).outcome, 'available');
  assert.equal(run({ children: [{ age:'4', start:'14:00', end:'16:00' }], scenario:'available' }, b).outcome, 'unavailable');
  assert.equal(run({ children: [{ age:'0', start:'14:00', end:'16:00' }], scenario:'available' }, b).outcome, 'more_info');
});
test('missing facts, date exceptions and competing hours never become accepted', () => {
  const b = branch(); delete b.facts.age;
  assert.equal(run({ scenario:'available' }, b).outcome, 'more_info');
  b.facts.age = provider.age; b.facts.businessHours = {};
  assert.equal(run({ scenario:'available' }, b).outcome, 'more_info');
  b.facts.businessHours = { ...provider.businessHours, source: { label:'A' }, alternative: { windows: [{ days:['FRI'], start:480,end:720 }], closedDays:[], source:{label:'B'} } };
  assert.equal(run({ scenario:'available' }, b).outcome, 'more_info');
  b.facts.dateExceptions = [{ date: '2026-10-09', status:'unknown', source }];
  assert.notEqual(run({ scenario:'available' }, b).outcome, 'available');
});
test('two children share simulated capacity only when their intervals overlap', () => {
  const b = branch(); b.capacity.places = 1;
  const children = [{ age:'2', start:'14:00', end:'16:00' }, { age:'5', start:'14:00', end:'16:00' }];
  const result = run({ children }, b); assert.equal(result.outcome, 'partial');
  assert.deepEqual(result.children.map(c => c.state), ['available','unavailable']);
  children[1] = { ...children[1], start:'16:00', end:'18:00' };
  assert.equal(run({ children }, b).outcome, 'available');
});
test('every selected question is answered, listed facts first, and simulated replies stay marked', () => {
  assert.equal(run({ scenario:'conditional' }).outcome, 'conditional');
  assert.equal(run({ scenario:'more_info' }).outcome, 'more_info');
  const b = branch(); b.facts.lateRule = { latestEnd: 1080, wording: 'RM10 per 15 min after 18:00', source };
  const r = run({ scenario:'available', questions:['visit','pickup','arrival','booking','review:clear_late_rules','review:healthy_meals','review:safety'] }, b);
  assert.equal(r.outcome, 'available'); assert.equal(r.unanswered.length, 0);
  const by = id => r.answers.find(a => a.id === id);
  assert.equal(by('review:clear_late_rules').basis, 'Listed'); assert.match(by('review:clear_late_rules').text, /RM10 per 15 min after 18:00/);
  assert.match(by('arrival').text, /We open at 08:00/);
  assert.equal(by('review:healthy_meals').basis, 'Demo answer');
  assert.equal(by('review:safety').basis, 'Demo answer');
  assert.ok(!r.rawReply.includes('still need an answer'));
  assert.match(r.rawReply, /\(Demo answer\)/);
  assert.ok(r.limitations.some(l => /simulated/.test(l)));
  assert.equal(run({ scenario:'no_reply' }), null);
});
test('one rejected child and one unresolved child is never partial acceptance', () => {
  const b = branch();
  b.facts.age = { ...b.facts.age, min: 3, max: 48, wording: '3 months–under 4 years' };
  for (const reverse of [false, true]) {
    const children = [{ age:'5', start:'14:00', end:'16:00' }, { age:'0', start:'14:00', end:'16:00' }];
    if (reverse) children.reverse();
    const unresolved = run({ children, scenario:'available' }, b);
    assert.equal(unresolved.outcome, 'more_info');
    assert(!unresolved.children.some(c => c.state === 'available'));
    const conditional = run({ children: children.map(c => ({ ...c, age: c.age === '0' ? '2' : c.age })), scenario:'conditional' }, b);
    assert.equal(conditional.outcome, 'conditional');
    assert(!conditional.children.some(c => c.state === 'available'));
  }
});
test('payload cannot add contacts, URLs, identities, invalid dates or arbitrary targets', () => {
  for (const x of [{ chat_id:'123' },{ url:'https://example.com' },{ branchId:'unknown' },{ date:'2026-02-30' },{ children:[{ age:'2',start:'14:00',end:'16:00',name:'Private child' }] }]) assert.throws(() => canonicalEnquiry(input(x),[branch()]));
});
test('duplicate clicks reuse one job; ownership and changed requests are isolated', async t => {
  const service = createEnquiryService({ branches:[branch()], delayMs:5, timeoutMs:500 }); t.after(() => service.close());
  const first = await service.handle(owner,{ action:'create',request:input() });
  const again = await service.handle(owner,{ action:'create',request:input() }); assert.equal(first.job.id,again.job.id);
  assert.equal(first.job.owner,undefined); assert.equal(first.job.fingerprint,undefined);
  await assert.rejects(service.handle(otherOwner,{ action:'get',id:first.job.id }), /expired/);
  const changed = await service.handle(owner,{ action:'create',request:input({ date:'2026-10-12' }) }); assert.notEqual(changed.job.id,first.job.id);
  await wait(60); const done = await service.handle(owner,{ action:'get',id:first.job.id }); assert.equal(done.job.state,'replied'); assert.equal(done.job.result.outcome,'available');
});
test('cancel, timeout and expiry cannot turn into a late acceptance', async t => {
  const service = createEnquiryService({ branches:[branch()], delayMs:60, timeoutMs:100, ttlMs:200 }); t.after(() => service.close());
  const a = await service.handle(owner,{ action:'create',request:input() });
  await service.handle(owner,{ action:'cancel',id:a.job.id }); await wait(110);
  assert.equal((await service.handle(owner,{ action:'get',id:a.job.id })).job.state,'cancelled');
  const b = await service.handle(owner,{ action:'create',request:input({ scenario:'no_reply' }) }); await wait(120);
  assert.equal((await service.handle(owner,{ action:'get',id:b.job.id })).job.state,'timed_out'); assert.equal(await service.reply(b.job.id), false);
  await assert.rejects(service.handle(owner,{ action:'get',id:a.job.id }), /expired/);
});
test('failed Telegram sends remain failed, with no fake result or local fallback', async t => {
  const transport = { name:'telegram-test-chat', sendRequest: async () => { throw Error('private token should not be exposed'); } };
  const service = createEnquiryService({ branches:[branch()], transport, timeoutMs:100 }); t.after(() => service.close());
  const a = await service.handle(owner,{ action:'create',request:input() }); await wait(40);
  const j = (await service.handle(owner,{ action:'get',id:a.job.id })).job;
  assert.equal(j.state,'failed'); assert.equal(j.result,null); assert(!JSON.stringify(j).includes('private token'));
});
test('Telegram is off by default and only a fixed private test chat can be sent to', async () => {
  let calls = [];
  const fetcher = async (url,args) => { calls.push({ url, body:JSON.parse(args.body) }); return { ok:true, json:async()=>({ok:true,result:{message_id:1}}) }; };
  assert.equal(telegramTransport({},fetcher),null); assert.equal(calls.length,0);
  assert.throws(() => telegramTransport({ TELEGRAM_TEST_ENABLED:'1' },fetcher));
  assert.throws(() => telegramTransport({ TELEGRAM_TEST_ENABLED:'1',TELEGRAM_BOT_TOKEN:'123:fake',TELEGRAM_TEST_CHAT_ID:'-100' },fetcher));
  const tr = telegramTransport({ TELEGRAM_TEST_ENABLED:'1',TELEGRAM_BOT_TOKEN:'123:fake',TELEGRAM_TEST_CHAT_ID:'987' },fetcher);
  await tr.sendRequest({ id:'a'.repeat(24),message:'simulation',chat_id:'456' }); await tr.sendReply('simulation result');
  assert(calls.every(c => c.body.chat_id === '987')); assert.equal(calls.length,2);
});

test('chat subscriptions stream actual state changes, isolate owners, and reconnect without resending', async t => {
  const service = createEnquiryService({ branches:[branch()], delayMs:30, timeoutMs:500 }); t.after(() => service.close());
  const { job } = await service.handle(owner, { action:'create', request:input() });
  assert.throws(() => service.subscribe(otherOwner, job.id, () => {}), /expired/);
  const updates = [];
  const off = service.subscribe(owner, job.id, j => updates.push(j));
  await wait(80); off();
  assert.deepEqual(updates.map(j => j.state), ['queued','waiting','replied']);
  assert.ok(updates.every(j => j.owner === undefined && j.fingerprint === undefined));
  const resumed = []; service.subscribe(owner, job.id, j => resumed.push(j))();
  assert.equal(resumed.length, 1); assert.equal(resumed[0].state, 'replied');
  assert.deepEqual(resumed[0].result, updates.at(-1).result);
  const again = await service.handle(owner, { action:'create', request:input() });
  assert.equal(again.job.id, job.id);
});
test('stopping a streamed enquiry emits cancellation and no later reply', async t => {
  const service = createEnquiryService({ branches:[branch()], delayMs:60, timeoutMs:500 }); t.after(() => service.close());
  const { job } = await service.handle(owner, { action:'create', request:input() });
  const states = [], off = service.subscribe(owner, job.id, j => states.push(j.state));
  await wait(30); await service.handle(owner, { action:'cancel', id:job.id }); await wait(80); off();
  assert.deepEqual(states, ['queued','waiting','cancelled']);
});
