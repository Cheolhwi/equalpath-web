import { isShortCare } from './request.mjs';
import { childAge, enquiryView, visitDate } from './enquiry-view.mjs';

// Ask once per parent decision. Keep every underlying check available as evidence.
const bookingQuestions = new Map([
  ['Do you still accept children who are not enrolled for an ad-hoc visit, and is there a place for my child at these times?', 'Do you still offer care for a short visit?'],
  ['Is there an hourly-care slot for my child’s age and these hours, and what is the minimum stay and price?', 'What is the shortest visit I can book?'],
  ['Can you accept this short-term visit with the required notice, and which session and daily price apply?', 'How early must I book? What hours can I book?'],
  ['Is your holiday programme running on this date, and can my child join for these hours? What age range and daily fee apply?', 'Is your holiday programme running on this date? What ages can join?'],
  ['Do you still offer hourly or daily care, and can you take my child for this visit? What are the hours and total fee?', 'Do you still offer care by the hour or day?'],
  ['Can I book supervised drop-off for my child’s age and these hours, and what is the total price?', 'Can I book a staff member to look after my child while I leave?'],
  ['Is there space in Art Drop for my child’s age and a visit of up to three hours?', 'Can my child join Art Drop for up to three hours?'],
  ['Can you supervise my child for this 1–3-hour visit, with the required notice and toilet-training requirements?', 'Can I book a 1–3-hour visit? How early must I book? Does my child need to use the toilet without help?'],
]);

export function contactQuestions(p, request) {
  const short = isShortCare(request), rows = enquiryView(p, request);
  const specialAdmission = short && p.admission?.requirements?.length && rows.some(q => q.id === 'admission');
  const groups = [];
  const add = (id, sourceIds, text) => {
    const checks = rows.filter(q => sourceIds.includes(q.id));
    if (checks.length) groups.push({ id, text, checks, conflicts: checks.filter(q => q.state === 'conflict') });
  };
  let care = short ? `Can you care for my child on this date until ${request.end}?` : 'Can my child join? When could they start?';
  if (rows.some(q => q.id === 'age') && (request.age === '' || p.age?.alternative)) care += ' What ages do you accept?';
  add('visit', ['capacity', 'age', 'care', ...(!specialAdmission ? ['admission'] : [])], care);
  if (specialAdmission) add('booking', ['admission'], bookingQuestions.get(p.admission.question) || rows.find(q => q.id === 'admission').text || 'How early must I book? What else do I need to know?');
  add('fees', ['fees'], short
    ? p.cost?.available
      ? `Is the estimated ${p.cost.currency || 'MYR'} ${Number(p.cost.total).toLocaleString('en-MY')} total correct? Are there extra charges?`
      : 'What is the total cost, including any extra charges?'
    : 'What are the fees, including registration, meals and any pickup charges?');
  if (request.transport === 'self') {
    add('arrival', ['transfer'], 'What time should we arrive? How long does drop-off take?');
  } else {
    const pickupIds = ['transport', 'coverage', 'pickup', 'transfer'];
    const hasPickupQuestion = rows.some(q => pickupIds.slice(0, 3).includes(q.id));
    add('pickup', pickupIds, hasPickupQuestion
      ? `Can you pick up my child from ${request.pickup.label}${short ? ` by ${request.deadline}` : ''}?${short ? ' When would they arrive?' : ''}`
      : 'When would my child arrive at the centre?');
  }
  // Unknown future question types remain visible instead of being silently lost.
  const covered = new Set(groups.flatMap(q => q.checks.map(c => c.id)));
  for (const row of rows.filter(q => !covered.has(q.id))) add(row.id, [row.id], row.text);
  return groups.sort((a, b) => Number(b.conflicts.length > 0) - Number(a.conflicts.length > 0));
}

export function contactIntro(p, request) {
  const age = request.age === '' ? '' : `\nMy child is ${childAge(request.age).toLowerCase()}${request.age === '0' ? ' old' : ''}.`;
  return isShortCare(request)
    ? `Hello, I need childcare for a short time.${age}\nDate: ${visitDate(request.date)}\nLeaving from: ${request.pickup.label}\nLeave at: ${request.deadline} · Pick up child at: ${request.end}`
    : `Hello, I’m looking for long-term childcare.${age}\nLocation: ${request.pickup.label}`;
}
export function contactMessage(p, request, selected) {
  return [contactIntro(p, request), ...selected.map((q, i) => `${i + 1}. ${q.text}`), 'Thank you!'].join('\n\n');
}
