import test from 'node:test';
import assert from 'node:assert/strict';
import { loadFamilyComparison, childComparisonFit, familyComparisonFee } from '../shared/family-comparison.mjs';
import { emptyPlan, childRequest } from '../shared/two-child.mjs';
import { createAPI } from '../server/api.mjs';
import { demoPickup, fixtureCatalog } from '../server/fixtures.mjs';
const plan = emptyPlan({ pickup: demoPickup, date: '2026-10-09' });
plan.children = { a: { age: '1-3', start: '10:00', end: '12:00' }, b: { age: '4-6', start: '13:00', end: '17:00' } };
const p = (id, total, states = ['supported', 'supported', 'supported']) => ({ id, cost: { available: true, currency: 'MYR', total }, fit: { conditions: ['age', 'admission', 'care'].map((id, i) => ({ id, state: states[i] })) } });

test('family comparison checks every ID with each child request and joins by ID, not ranked position', async () => {
  const calls = [];
  const result = await loadFamilyComparison({ mode: 'demo', ids: ['B', 'A'], plan, version: 'v1', api: async body => {
    calls.push(body);
    return { version: 'v1', request: body.request, items: body.request.age === '1-3' ? [p('A', 20), p('B', 30)] : [p('B', 70, ['conflict', 'supported', 'supported']), p('A', 40)] };
  } });
  assert.equal(calls.length, 2);
  assert.deepEqual(calls.map(c => [c.request.age, c.request.deadline, c.request.end, c.request.transport]), [['1-3', '10:00', '12:00', 'self'], ['4-6', '13:00', '17:00', 'self']]);
  assert.deepEqual(calls.map(c => c.ids), [['B', 'A'], ['B', 'A']]);
  assert.equal(result.items[0].children.a.cost.total, 30);
  assert.equal(result.items[0].children.b.cost.total, 70);
  assert.equal(childComparisonFit(result.items[0].children.a).state, 'supported');
  assert.equal(childComparisonFit(result.items[0].children.b).state, 'conflict');
});

test('unknown or incomplete facts never become a family match; fees require two compatible totals', () => {
  assert.equal(childComparisonFit(p('A', 20, ['supported', 'unknown', 'supported'])).state, 'unknown');
  assert.equal(childComparisonFit({ fit: { conditions: [] } }).state, 'unknown');
  assert.equal(familyComparisonFee({ a: p('A', 20), b: p('A', 40) }), 'MYR 60 estimated total');
  assert.equal(familyComparisonFee({ a: p('A', 20), b: { cost: { available: false } } }), 'Ask the centre');
  assert.equal(familyComparisonFee({ a: p('A', 20), b: { cost: { available: true, total: 40, currency: 'SGD' } } }), 'Ask the centre');
  assert.equal(familyComparisonFee({ a: p('A', 0), b: p('A', 0) }), 'MYR 0 estimated total');
});

test('family comparison rejects partial replies, changed catalogues and request failures', async () => {
  for (const api of [async () => ({ version: 'v1', items: [] }), async () => ({ version: 'v2', items: [p('A', 20)] }), async () => { throw Error('offline'); }]) {
    await assert.rejects(loadFamilyComparison({ api, mode: 'demo', ids: ['A'], plan, version: 'v1' }));
  }
});

test('real compare API preserves each child assessment and time-based cost even when not in that child search', async () => {
  const api = createAPI({ drivingRoutes: async () => new Map() });
  const ids = fixtureCatalog.items.slice(0, 2).map(p => p.id);
  const actual = await loadFamilyComparison({ api, mode: 'demo', ids, plan, version: fixtureCatalog.version });
  for (const key of ['a', 'b']) {
    const expected = await api({ action: 'compare', mode: 'demo', ids, request: { ...childRequest(plan, key), sort: 'name' }, version: fixtureCatalog.version });
    for (const id of ids) {
      const item = actual.items.find(p => p.id === id).children[key];
      const direct = expected.items.find(p => p.id === id);
      assert.deepEqual(item.fit, direct.fit);
      assert.deepEqual(item.cost, direct.cost);
    }
  }
});

test('failure of the second child never returns a usable one-child comparison', async () => {
  let calls = 0;
  await assert.rejects(loadFamilyComparison({ mode: 'demo', ids: ['A', 'B', 'C'], plan, version: 'v1', api: async body => {
    if (++calls === 2) throw Error('second child unavailable');
    return { version: 'v1', request: body.request, items: body.ids.map(id => p(id, 20)) };
  } }), /second child unavailable/);
  assert.equal(calls, 2);
});
