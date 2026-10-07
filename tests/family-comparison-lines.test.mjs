import test from 'node:test';
import assert from 'node:assert/strict';
import { childFitLine, childFeeShort } from '../shared/family-comparison.mjs';
const p = (states, cost) => ({ cost, fit: { conditions: ['age', 'admission', 'care'].map((id, i) => ({ id, state: states[i], label: id })) } });

test('each child gets one plain line: fits, what to ask, or what does not fit', () => {
  assert.deepEqual(childFitLine(p(['supported', 'supported', 'supported'])), { state: 'supported', text: 'Fits' });
  assert.deepEqual(childFitLine(p(['unknown', 'supported', 'unknown'])), { state: 'unknown', text: 'Ask: age, care hours' });
  assert.deepEqual(childFitLine(p(['supported', 'conflict', 'unknown'])), { state: 'conflict', text: 'Doesn’t fit: short care' });
  assert.deepEqual(childFitLine({ fit: { conditions: [] } }), { state: 'unknown', text: 'Ask: age, short care, care hours' });
});

test('a child fee is shown only from a usable estimate', () => {
  assert.equal(childFeeShort(p([], { available: true, total: 120, currency: 'MYR' })), 'MYR 120');
  assert.equal(childFeeShort(p([], { available: false })), 'ask the centre');
  assert.equal(childFeeShort({}), 'ask the centre');
});
