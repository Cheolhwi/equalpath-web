import test from 'node:test';
import assert from 'node:assert/strict';
import { comparisonFact } from '../shared/comparison-view.mjs';
const request = { end: '15:00', deadline: '09:00', transport: 'institution' };
const provider = (id, state, fields = {}) => ({ fit: { conditions: [{ id, state, reason: 'Source detail', source: { url: 'https://example.com' } }] }, ...fields });

test('comparison keeps unknown ages and type guidance distinct from acceptance', () => {
  const reference = comparisonFact(provider('age', 'supported', { age: { basis: 'type_reference', wording: 'Under 4 years' } }), 'age', request);
  assert.equal(reference.value, 'Under 4 years');
  assert.equal(reference.note, 'Age guide · ask this centre');
  assert.equal(comparisonFact(provider('age', 'unknown'), 'age', request).value, 'Ask the centre');
  assert.equal(comparisonFact(provider('age', 'conflict'), 'age', request).note, 'Outside this age range');
});
test('comparison uses the assessed state for short visits and hours, never inferred acceptance', () => {
  assert.equal(comparisonFact(provider('admission', 'unknown', { admission: { value: true } }), 'admission', request).value, 'Ask the centre');
  assert.equal(comparisonFact(provider('admission', 'supported'), 'admission', request).value, 'Short visits listed');
  assert.equal(comparisonFact(provider('admission', 'conflict'), 'admission', request).value, 'Not offered');
  for (const [state, note] of [['supported', 'Open at 15:00'], ['unknown', 'Ask about 15:00'], ['conflict', 'Outside listed care hours']]) {
    const fact = comparisonFact(provider('care', state, { careEndTimeLabel: '18:00' }), 'care', request);
    assert.equal(fact.note, note); assert.equal(fact.state, state); assert.equal(fact.condition.reason, 'Source detail');
  }
});
test('self pickup does not present a centre pickup service as confirmed', () => {
  assert.equal(comparisonFact(provider('transport', 'supported'), 'transport', { ...request, transport: 'self' }).value, 'You will take your child');
});
