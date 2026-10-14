import test from 'node:test';
import assert from 'node:assert/strict';
import { familyCompareOrder } from '../shared/family-comparison.mjs';
const kid = (states, total) => ({ cost: total === null ? { available: false } : { available: true, currency: 'MYR', total }, fit: { conditions: ['age', 'admission', 'care'].map((id, i) => ({ id, state: states[i] })) } });
const ok = ['supported', 'supported', 'supported'], ask = ['unknown', 'supported', 'supported'], off = ['conflict', 'supported', 'supported'];
const centre = (id, minutes, close, a, b) => ({ id, driving: minutes === null ? { state: 'unavailable' } : { state: 'available', minutes }, careEndTimeLabel: close, children: { a, b } });
const A = centre('A', 9, '18:00', kid(ok, 100), kid(ask, 100));
const B = centre('B', 4, '17:00', kid(ask, 150), kid(ask, 150));
const C = centre('C', 2, '22:00', kid(off, 20), kid(ok, 20));

test('sorts by the chosen priority; a centre that doesn\'t fit a child is last and never "best"', () => {
  assert.deepEqual(familyCompareOrder([A, B, C], 'distance').items.map(p => p.id), ['B', 'A', 'C']);
  assert.deepEqual(familyCompareOrder([A, B, C], 'distance').best.ids, ['B']);
  assert.deepEqual(familyCompareOrder([A, B, C], 'price').items.map(p => p.id), ['A', 'B', 'C']);
  assert.deepEqual(familyCompareOrder([A, B, C], 'closing').items.map(p => p.id), ['A', 'B', 'C']);
  // "Fewest questions" is no longer offered: asking for it falls back to Nearest first.
  assert.equal(familyCompareOrder([A, B, C], 'fit').sort, 'distance');
});

test('unknown values go after known ones; ties and a single known value are marked like one child; missing data disables a priority', () => {
  const D = centre('D', null, null, kid(ok, null), kid(ok, null));
  const r = familyCompareOrder([D, A], 'distance');
  assert.deepEqual(r.items.map(p => p.id), ['A', 'D']);
  assert.deepEqual(r.best.ids, ['A']);
  // The reported case: two centres 13 min away and a nearer one that doesn't fit a child.
  const L = centre('L', 13, '19:00', kid(ok, 60), kid(ok, 60)), P = centre('P', 13, '18:00', kid(ok, 40), kid(ok, 40)), T = centre('T', 11, '18:00', kid(off, 42), kid(ok, 42));
  const tie = familyCompareOrder([L, P, T], 'distance');
  assert.deepEqual(tie.best.ids, ['L', 'P']);
  assert.equal(tie.items.at(-1).id, 'T');
  const none = familyCompareOrder([D, { ...D, id: 'E' }], 'price');
  assert.equal(none.available.price, false);
  assert.equal(none.sort, 'distance');
  assert.equal(none.available.distance, false);
});
