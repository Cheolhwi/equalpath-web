// Display copy only. Fit states, evidence and ranking remain server-owned.
export function comparisonFact(p, id, request) {
  const c = p.fit.conditions.find(item => item.id === id);
  const state = c?.state ?? 'reference';
  const known = state === 'supported';
  const conflict = state === 'conflict';
  let value = '', note = '';
  switch (id) {
    case 'age':
      value = (p.age?.rangeLabel ?? p.age?.wording ?? 'Ask the centre').replace(/\s*\(controlled example\)/i, '').replace(/(\d+) years? to under (\d+) years?/i, '$1–under $2 years');
      note = conflict ? 'Outside this age range' : known ? 'Your child’s age fits' : 'Check your child’s exact age';
      if (p.age?.basis === 'type_reference') note = conflict ? 'Outside the age guide' : 'Age guide · ask this centre';
      break;
    case 'admission':
      value = known ? 'Offered' : conflict ? 'Not offered' : 'Ask the centre';
      break;
    case 'care':
      value = p.careEndTimeLabel ?? p.businessHoursLabel ?? 'Hours not listed';
      note = known ? `Still open at ${request.end}` : conflict ? `Not open at ${request.end}` : `Ask about ${request.end}`;
      break;
    case 'transport':
      value = request.transport === 'self' ? 'You’ll bring your child' : p.transport?.exists === true ? 'Pickup service listed' : p.transport?.exists === false ? 'No pickup service listed' : 'Ask the centre';
      break;
    case 'coverage':
      value = request.transport === 'self' ? 'You’ll bring your child' : known ? 'Covers your starting point' : conflict ? 'Doesn’t cover your starting point' : 'Ask about your starting point';
      break;
    case 'pickup':
      value = request.transport === 'self' ? `You’ll leave by ${request.deadline}` : known ? `By ${request.deadline}` : conflict ? `Later than ${request.deadline}` : `Ask about ${request.deadline}`;
      break;
    case 'transfer': value = 'Ask when to arrive'; break;
    default: value = c?.label ?? 'Not needed';
  }
  return { value, note, state, condition: c };
}

export const comparisonPriorityLabel = label => ({
  'Nearest option': 'Nearest',
  'Latest care end': 'Open latest',
  'Offers pickup': 'Pickup listed',
}[label] ?? label);
