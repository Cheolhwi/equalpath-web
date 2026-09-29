// Stable, readable names for corpus topics. Assignment and scores are computed
// from reviews, never from admission, prices, opening hours or contact fields.
export const REVIEW_TOPIC_GROUPS = [
  { id: 'care', label: 'Care', preferences: [
    { id: 'caring_teachers', label: 'Kind teachers', description: 'Patient, caring staff', sourceTopics: ['staff'], question: 'How do you help a child settle in and get individual attention?' },
    { id: 'secure_pickup', label: 'Safe pickup', description: 'Careful checks when children leave', sourceTopics: ['safety', 'transport'], question: 'How do you check who is allowed to collect my child?' },
  ] },
  { id: 'environment', label: 'Daily care', preferences: [
    { id: 'clean_environment', label: 'Clean spaces', description: 'Clean rooms and toys', sourceTopics: ['cleanliness'], question: 'How often do you clean the rooms, toilets and toys?' },
    { id: 'healthy_meals', label: 'Good meals', description: 'Healthy food and care with allergies', sourceTopics: ['food'], question: 'What meals do you provide, and how do you handle food allergies?' },
  ] },
  { id: 'learning', label: 'Play and learning', preferences: [
    { id: 'engaging_activities', label: 'Fun activities', description: 'Time to play, learn and explore', sourceTopics: ['activities'], question: 'What activities will my child do, and how much screen time is there?' },
  ] },
  { id: 'communication', label: 'Communication', preferences: [
    { id: 'responsive_team', label: 'Helpful updates', description: 'Clear replies and news about your child', sourceTopics: ['communication'], question: 'How will you update me about my child during the day?' },
  ] },
  { id: 'flexibility', label: 'Visits and pickup', preferences: [
    { id: 'flexible_short_care', label: 'Flexible visits', description: 'Easy to arrange an occasional visit', sourceTopics: ['flexibility'], question: 'How early must I book, and can I change or cancel a visit?' },
    { id: 'convenient_hours', label: 'Flexible hours', description: 'Hours that work for busy families', sourceTopics: ['hours'], question: 'Can you confirm the hours and any changes for my visit?' },
    { id: 'smooth_pickup', label: 'Easy drop-off', description: 'A calm, organised handover', sourceTopics: [], question: 'How does drop-off and collection work at busy times?' },
    { id: 'clear_late_rules', label: 'Clear late fees', description: 'Know what happens if you are late', sourceTopics: [], question: 'What happens if I am late to collect my child?' },
  ] },
  { id: 'fees', label: 'Costs', preferences: [
    { id: 'predictable_fees', label: 'Clear prices', description: 'Costs explained before you pay', sourceTopics: [], question: 'What is the total cost, including any extra charges?', mergesWith: 'fees' },
    { id: 'value_for_money', label: 'Good value', description: 'Care that parents feel is worth the cost', sourceTopics: ['price'], question: 'What is included in the price?', mergesWith: 'fees' },
  ] },
];
export const DISCOVERY_PREFERENCES = REVIEW_TOPIC_GROUPS.flatMap(g => g.preferences.map(p => ({ ...p, topic: g.id })));
export const preferenceById = new Map(DISCOVERY_PREFERENCES.map(p => [p.id, p]));
export const FIRST_PREFERENCES = ['caring_teachers', 'clean_environment', 'engaging_activities', 'secure_pickup', 'responsive_team', 'value_for_money'];
const aliases = { flexible_booking: 'flexible_short_care' };
export const normalisePreferenceTopics = topics => [...new Set((Array.isArray(topics) ? topics : []).map(id => aliases[id] ?? id).filter(id => preferenceById.has(id)))].slice(0, 3);
export const DAY = 86400000;

// Clause-level subject matching prevents an unrelated complaint from changing
// every topic in a mixed review. Stars are retained as context, not sentiment.
const patterns = {
  caring_teachers: /staff|teacher|carer|patient|kind|attention|settle|comfort|caring|老师|耐心/i,
  secure_pickup: /id check|\bic\b|identity|fingerprint|authoris|authoriz|security|gate|cctv|pickup check|driver|\bvan\b|seat.?belt|安全/i,
  clean_environment: /clean|hygiene|dirty|toilet|smell|saniti|washed|环境|干净/i,
  healthy_meals: /food|meal|snack|allerg|sugar|nut[ -]|fruit|vegetable|biscuit|milo|餐|饮食/i,
  engaging_activities: /activit|play|learn|craft|screen|cartoon|\btv\b|\bbooks?\b|colour|color|游戏|活动/i,
  responsive_team: /reply|replied|replies|respond|response|message|communicat|report|update|progress|whatsapp|沟通|回复/i,
  flexible_short_care: /booking|booked|cancel|drop.in|occasional|minimum|notice|short visit|ad.hoc|same.day|短时|临时/i,
  convenient_hours: /open|hours|closing|weekend|saturday|sunday|shift|6:30|18:30|时间/i,
  smooth_pickup: /handover|drop.off|pick.up|pickup|collection|parking|交接|接送/i,
  clear_late_rules: /late|after.hours|cutoff|lewat|迟到|迟接/i,
  predictable_fees: /upfront|extra|includ|explain.{0,20}(?:fee|price)|stated|hidden|unexpected|refund|deposit|clear.{0,20}(?:cost|price|fee)|收费|费用/i,
  value_for_money: /\bfees?\b|price|cost|charge|paid|worth|value|\brates?\b|expensive|cheap|贵|划算/i,
};
const negative = /not (?:clean|clear|helpful|responsive|safe|patient)|no (?:reply|response|update|id check)|never (?:repl|respond|really settled)|unlatched|slow|rude|dirty|unsafe|worr|unclear|unexpected|hidden|expensive|rigid|stretched|crowded|tight|name only|would feel better|too much screen|\btv was on|biscuits and milo|no vegetables|not worth|hard to|difficult|poor|问题|不干净|不耐心|不回复/i;
const positive = /kind|patient|caring|helpful|experienced|ratio felt good|clear(?:ly)?|quick|prompt|clean(?:ed)?|wiped down|fresh|healthy|fruit|vegetable|respected|labelled|careful|check(?:ed)? (?:my |our |the )?id|fingerprint lock|secure|locked|safe|fair|worth|reasonable|flexible|easy|smooth|organised|organized|enjoy|loved|happy|engag|craft|sensory play|updates|exact|same.day booking works|accepted|saved me|under \d+ minutes|无糖|耐心|干净|清楚/i;
export function reviewSentences(text) {
  return String(text ?? '').split(/(?<=[.!?])\s+/).map(s => s.trim()).filter(s => s && !/^Tip:/i.test(s));
}
export function classifyReview(review) {
  const text = typeof review === 'string' ? review : [review?.text, review?.excerpt, review?.content, review?.body, review?.quote, review?.reviewText].filter(Boolean).join(' ');
  const supplied = Array.isArray(review?.topics) ? review.topics : Object.entries(review?.topics ?? {}).filter(([, v]) => v === true || v?.state === 'supported').map(([id]) => id);
  const level2 = DISCOVERY_PREFERENCES.filter(p => supplied.includes(p.id) || p.sourceTopics.some(t => supplied.includes(t)) || patterns[p.id].test(text)).map(p => p.id);
  return { level1: [...new Set(level2.map(id => preferenceById.get(id).topic))], level2 };
}
export function aspectSentiment(text, id) {
  const sentences = reviewSentences(text).filter(s => patterns[id]?.test(s));
  let good = 0, bad = 0;
  for (const sentence of sentences) {
    // Preserve both sides of a mixed sentence instead of treating its star as
    // approval of all mentioned subjects.
    for (const clause of sentence.split(/\s+but\s+|\s+however\s+/i)) {
      if (!patterns[id]?.test(clause)) continue;
      if (negative.test(clause)) bad++;
      else if (positive.test(clause)) good++;
    }
  }
  return { sentiment: good && bad ? 'mixed' : bad ? 'negative' : good ? 'positive' : 'neutral', sentences };
}
export function scoreReviewTopic(topic, now = Date.now()) {
  if (!topic) return { state: 'unknown', score: .5, confidence: 0, reviewCount: 0, recentCount: 0, positiveCount: 0, negativeCount: 0 };
  const cutoff = now - 365 * DAY;
  let positiveCount = 0, negativeCount = 0, recentCount = 0, recentPositive = 0, recentNegative = 0, weightedPositive = 0, weightedNegative = 0;
  for (const item of topic.observations ?? []) {
    const date = Date.parse(item.date);
    const valid = Number.isFinite(date) && date <= now;
    const recent = valid && date >= cutoff;
    const weight = valid ? 2 ** (-Math.max(0, now - date) / (180 * DAY)) : 0;
    positiveCount += item.positive; negativeCount += item.negative;
    recentCount += recent ? item.count : 0; recentPositive += recent ? item.positive : 0;
    recentNegative += recent ? item.negative : 0;
    weightedPositive += item.positive * weight; weightedNegative += item.negative * weight;
  }
  const n = weightedPositive + weightedNegative;
  const confidence = n / (n + 8);
  const posterior = (weightedPositive + 2) / (n + 4);
  const supported = recentCount >= 2 && recentPositive >= 2;
  const concerns = recentNegative >= 2;
  return { state: supported ? 'supported' : concerns ? 'concern' : 'unknown',
    score: supported || concerns ? .5 + (posterior - .5) * confidence : .5,
    confidence, reviewCount: topic.count, recentCount, positiveCount, negativeCount,
    recentPositive, recentNegative, undatedCount: topic.undatedCount ?? 0, source: 'review' };
}
export function reviewTopicEvidence(provider, id, now = Date.now()) {
  return scoreReviewTopic(provider.reviewProfile?.topics?.[id], now);
}
export function reviewConcerns(provider, now = Date.now()) {
  return DISCOVERY_PREFERENCES.flatMap(p => {
    const evidence = reviewTopicEvidence(provider, p.id, now);
    return evidence.recentNegative >= 2
      ? [{ ...p, ...evidence, excerpts: (provider.reviewProfile?.excerpts ?? []).filter(e => e.topics.includes(p.id) && ['negative', 'mixed'].includes(e.sentiments[p.id]) && Date.parse(e.date) >= now - 365 * DAY && Date.parse(e.date) <= now).sort((a,b)=>(b.date??'').localeCompare(a.date??'')).slice(0, 2) }] : [];
  }).filter(p => p.excerpts.length >= 2);
}
