import { hasContact, priorityValue } from './conditions.mjs';
import { shortFeeFrom, monthlyFeeFrom, feePriorityGroup } from './result-summary.mjs';

// Only public centre IDs and capped activity counts are remembered. Requests,
// addresses, child ages, notes and provider snapshots never enter this store.
export const interestKey = mode => `equalpath:interests:v1:${mode}`;
// Review evidence is deliberately kept separate from search constraints. The
// first level is the concern area found in a review; the second level is the
// human preference that can gently rerank an already eligible result.
export const REVIEW_TOPIC_GROUPS = [
  {
    id: 'temporary_care',
    label: 'Temporary care',
    preferences: [{ id: 'flexible_short_care', label: 'Flexible short care', description: 'Parents mention one-off or short visits' }],
  },
  {
    id: 'pickup',
    label: 'Pickup',
    preferences: [{ id: 'smooth_pickup', label: 'Smooth pickup', description: 'Parents mention easy handovers' }],
  },
  {
    id: 'late_collection',
    label: 'Late collection',
    preferences: [{ id: 'clear_late_rules', label: 'Clear late pickup', description: 'Parents mention clear plans when pickup changes' }],
  },
  {
    id: 'fees',
    label: 'Fees',
    preferences: [{ id: 'predictable_fees', label: 'Predictable fees', description: 'Parents mention costs were clear' }],
  },
  {
    id: 'communication',
    label: 'Communication',
    preferences: [{ id: 'responsive_team', label: 'Responsive team', description: 'Parents mention quick, helpful replies' }],
  },
];
export const DISCOVERY_PREFERENCES = [
  ...REVIEW_TOPIC_GROUPS.flatMap(group => group.preferences.map(preference => ({ ...preference, topic: group.id }))),
];
const preferenceIds = new Set(DISCOVERY_PREFERENCES.map(p => p.id));
const preferenceTopic = new Map(DISCOVERY_PREFERENCES.map(preference => [preference.id, preference.topic]));
export const emptyInterests = () => ({ version: 1, enabled: true, visits: [], hidden: [], preferences: [], preferenceSetup: 'new' });
const DAY = 86400000;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 160;
const validType = type => ['short_term', 'regular'].includes(type);
const same = (a, b) => a.id === b.id && a.careType === b.careType;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validPreferenceSetup = value => ['new', 'skipped', 'complete'].includes(value);
export function normalisePreferenceTopics(topics) {
  return [...new Set(Array.isArray(topics) ? topics.filter(id => preferenceIds.has(id)) : [])].slice(0, 3);
}
export function readInterests(storage, mode) {
  const raw = storage.getItem(interestKey(mode));
  if (!raw) return emptyInterests();
  const data = JSON.parse(raw);
  if (data.version !== 1 || typeof data.enabled !== 'boolean' || !Array.isArray(data.visits) || !Array.isArray(data.hidden)) throw Error('Invalid history');
  return { version: 1, enabled: data.enabled,
    visits: data.visits.filter(v => validId(v?.id) && validType(v.careType)).slice(-100).map(v => ({ id: v.id, careType: v.careType,
      ...Object.fromEntries(['view', 'compare'].flatMap(kind => validDate(v[`${kind}At`]) ? [[`${kind}At`, v[`${kind}At`]], [`${kind}Count`, Math.min(6, Math.max(1, Number(v[`${kind}Count`]) || 1))]] : [])) })),
    hidden: data.hidden.filter(v => validId(v?.id) && validType(v.careType)).slice(-100).map(v => ({ id: v.id, careType: v.careType })),
    preferences: normalisePreferenceTopics(data.preferences),
    preferenceSetup: validPreferenceSetup(data.preferenceSetup) ? data.preferenceSetup : (data.preferences?.length ? 'complete' : 'new'),
  };
}
export function updateInterests(storage, mode, change) {
  const next = change(readInterests(storage, mode));
  const safe = readInterests({ getItem: () => JSON.stringify({ ...emptyInterests(), ...next }) }, mode);
  storage.setItem(interestKey(mode), JSON.stringify(safe));
  return safe;
}
export function recordInterest(data, providers, kind, now = new Date().toISOString()) {
  if (!data.enabled || !['view', 'compare'].includes(kind)) return data;
  const visits = [...data.visits];
  for (const p of providers) {
    if (!validId(p?.id) || !validType(p.careType)) continue;
    const index = visits.findIndex(v => same(v, p));
    const prior = index < 0 ? { id: p.id, careType: p.careType } : visits[index];
    // One signal per centre, kind and KL calendar day; opening/sorting repeatedly
    // (including across tabs) must not manufacture a strong preference.
    const day = time => Math.floor((Date.parse(time) + 8 * 3600000) / DAY);
    if (day(prior[`${kind}At`]) === day(now)) continue;
    if (index >= 0) visits.splice(index, 1);
    visits.push({ ...prior, [`${kind}At`]: now, [`${kind}Count`]: Math.min(6, (prior[`${kind}Count`] || 0) + 1) });
  }
  return { ...data, visits: visits.slice(-100) };
}
export function hideRecommendation(data, p) {
  return { ...data, hidden: [...data.hidden.filter(v => !same(v, p)), { id: p.id, careType: p.careType }].slice(-100) };
}
export function interestSeeds(library, history, careType, now = Date.now()) {
  const seeds = new Map();
  for (const v of history.enabled ? history.visits : []) {
    if (v.careType !== careType) continue;
    const decay = at => validDate(at) ? 2 ** (-Math.max(0, now - Date.parse(at)) / (30 * DAY)) : 0;
    const weight = 2 * Math.min(2, 1 + Math.log2(v.compareCount || 1) / 3) * decay(v.compareAt)
      + .5 * Math.min(2, 1 + Math.log2(v.viewCount || 1) / 3) * decay(v.viewAt);
    if (weight >= .1) seeds.set(v.id, { id: v.id, weight, compared: !!v.compareAt, saved: false });
  }
  for (const f of library.favourites) {
    if ((f.careType ?? 'short_term') === careType) seeds.set(f.id, { ...seeds.get(f.id), id: f.id, weight: 4, saved: true });
  }
  const hidden = new Set(history.hidden.filter(v => v.careType === careType).map(v => v.id));
  return [...seeds.values()].filter(s => !hidden.has(s.id)).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id)).slice(0, 100);
}
function publishedFee(p) {
  const clean = { ...p, cost: null, fees: (p.fees ?? []).filter(f => !String(f.verification ?? '').includes('estimate')) };
  return p.careType === 'short_term' ? shortFeeFrom(clean) : (monthlyFeeFrom(clean) == null ? null : { basis: 'month', amount: monthlyFeeFrom(clean) });
}
export function centreSimilarity(a, b) {
  // Missing facts are not matches. Shared area/type alone cannot imply similar care.
  if (!a || !b) return { value: 0, meaningful: false };
  const parts = [];
  if (a.admission?.value === true && b.admission?.value === true) parts.push({ value: 1, weight: .3, reason: 'service' });
  if (a.transport?.exists === true && b.transport?.exists === true) parts.push({ value: 1, weight: .25, reason: 'pickup' });
  const af = publishedFee(a), bf = publishedFee(b);
  if (af && bf && af.basis === bf.basis) parts.push({ value: Math.max(0, 1 - Math.abs(af.amount - bf.amount) / Math.max(af.amount, bf.amount, 1)), weight: .35, reason: 'fee' });
  if (a.category && a.category === b.category) parts.push({ value: 1, weight: .05, reason: 'type' });
  if (a.district && a.district === b.district) parts.push({ value: 1, weight: .05, reason: 'area' });
  return { value: parts.reduce((s, x) => s + x.value * x.weight, 0), meaningful: parts.some(x => ['service', 'pickup', 'fee'].includes(x.reason) && x.value >= .6) };
}
const reviewText = review => typeof review === 'string'
  ? review
  : [review?.text, review?.excerpt, review?.content, review?.body, review?.quote, review?.reviewText]
    .filter(value => typeof value === 'string').join(' ');

const REVIEW_PATTERNS = {
  temporary_care: { flexible_short_care: [/short[- ]?(term|visit|stay|care)/i, /drop[- ]?in/i, /hourly/i, /one[- ]?off/i, /ad[- ]?hoc/i, /part[- ]?time/i, /短时|临时|按小时|灵活照护/i] },
  pickup: { smooth_pickup: [/pickup|pick-up|pick up|handover|collection/i, /jemput|ambil anak/i, /接送|交接/i] },
  late_collection: { clear_late_rules: [/late|after hours|延迟|迟到|迟接|lewat/i] },
  fees: { predictable_fees: [/fee|fees|price|pricing|cost|costs|payment|tuition|yuran|bayaran|费用|收费|学费/i] },
  communication: { responsive_team: [/reply|repl(y|ied|ies)|respond|response|responsive|helpful|contact|message|communication|update|progress|balas|respon|沟通|回复|联络/i] },
};

const unique = values => [...new Set(values)];
const explicitReviewTopics = review => {
  const topics = review?.topics;
  if (Array.isArray(topics)) return topics;
  if (topics && typeof topics === 'object') return Object.entries(topics).flatMap(([key, value]) => value === true || value?.state === 'supported' ? [key] : []);
  return [];
};

/**
 * Classify one permitted review excerpt into level-1 concerns and level-2
 * preferences. This is a deterministic fallback for a published D5 review
 * record; it never turns a provider description or a listed fact into review
 * evidence.
 */
export function classifyReview(review) {
  const explicit = explicitReviewTopics(review);
  const text = `${reviewText(review)} ${explicit.join(' ')}`;
  const level2 = [];
  const level1 = [];
  for (const group of REVIEW_TOPIC_GROUPS) {
    for (const preference of group.preferences) {
      const hasExplicit = explicit.includes(group.id) || explicit.includes(preference.id);
      const matched = hasExplicit || REVIEW_PATTERNS[group.id]?.[preference.id]?.some(pattern => pattern.test(text));
      if (matched) {
        level1.push(group.id);
        level2.push(preference.id);
      }
    }
  }
  return { level1: unique(level1), level2: unique(level2) };
}

const topicEvidenceValue = (value) => {
  if (!value || typeof value !== 'object') return null;
  const reviewCount = Number(value.reviewCount ?? value.count ?? value.collected);
  const recentCount = Number(value.recentCount ?? value.recentReviewCount);
  const positiveCount = Number(value.positiveCount ?? value.supportingCount);
  const supported = value.state === 'supported' && Number.isFinite(reviewCount) && reviewCount >= 2
    && (!Number.isFinite(recentCount) || recentCount >= 2)
    && (!Number.isFinite(positiveCount) || positiveCount >= 2);
  return { supported, reviewCount: Number.isFinite(reviewCount) ? reviewCount : 0, recentCount: Number.isFinite(recentCount) ? recentCount : null, positiveCount: Number.isFinite(positiveCount) ? positiveCount : null, limited: !supported };
};

const explicitEvidence = (provider, preferenceId) => {
  const groupId = preferenceTopic.get(preferenceId);
  const sources = [provider?.reviewTopics, provider?.reviews?.topics, provider?.reviews?.topicEvidence].filter(value => value && typeof value === 'object');
  for (const source of sources) {
    const value = source[preferenceId] ?? source[groupId];
    const parsed = topicEvidenceValue(value);
    if (parsed) return parsed;
  }
  return null;
};

const classifiedEvidence = (provider, preferenceId) => {
  const reviews = provider?.reviews?.items ?? provider?.reviews?.excerpts ?? provider?.reviews?.records;
  if (!Array.isArray(reviews)) return null;
  const matching = reviews.filter(review => {
    const classification = classifyReview(review);
    const positive = review?.sentiment === 'positive' || Number(review?.rating) >= 4 || review?.support === true;
    return positive && classification.level2.includes(preferenceId);
  });
  if (!matching.length) return null;
  return { supported: matching.length >= 2, reviewCount: matching.length, recentCount: null, positiveCount: matching.length, limited: matching.length < 2 };
};

function reviewEvidence(p, id) {
  const evidence = explicitEvidence(p, id) ?? classifiedEvidence(p, id);
  if (!evidence?.supported) return { state: 'unknown', source: 'review', reviewCount: evidence?.reviewCount ?? 0, limited: !!evidence };
  return { state: 'supported', source: 'review', reviewCount: evidence.reviewCount, recentCount: evidence.recentCount, positiveCount: evidence.positiveCount };
}
export function preferenceEvidence(p, id, request) {
  // request is intentionally unused: preferences personalise the current
  // eligible result set, while date/time/pickup remain hard search gates.
  void request;
  return reviewEvidence(p, id);
}
export function preferenceMatches(p, preferences, request) {
  return normalisePreferenceTopics(preferences).map(id => ({ id, ...preferenceEvidence(p, id, request) }));
}
export function recommendCentres({ candidates, seeds: currentSeeds, request, library, history, preferences = history.preferences, now = Date.now() }) {
  const interests = interestSeeds(library, history, request.careType, now);
  const fresh = new Map(currentSeeds.map(p => [p.id, p]));
  const seeds = interests.filter(s => fresh.has(s.id));
  const saved = new Set(library.favourites.filter(f => (f.careType ?? 'short_term') === request.careType).map(f => f.id));
  const hidden = new Set(history.hidden.filter(v => v.careType === request.careType).map(v => v.id));
  let pool = candidates.filter(p => p.careType === request.careType && p.location && p.fit && p.fit.counts.conflict === 0 && !saved.has(p.id) && !hidden.has(p.id));
  if (pool.some(hasContact)) pool = pool.filter(hasContact);
  const relevant = new Set(['admission', 'care', ...(request.age ? ['age'] : []), ...(request.transport === 'institution' ? ['transport', 'coverage', 'pickup'] : [])]);
  const confidence = Math.min(.35, seeds.length / (seeds.length + 3) * .35);
  const scored = pool.map(p => {
    const checks = p.fit.conditions.filter(c => relevant.has(c.id));
    const known = checks.filter(c => c.state === 'supported').length / Math.max(1, checks.length);
    const near = 1 - Math.min(1, Math.max(0, p.distanceKm) / request.radius);
    const own = seeds.find(s => s.id === p.id);
    const similarities = seeds.map(s => ({ ...s, ...centreSimilarity(p, fresh.get(s.id)) }));
    const totalWeight = seeds.reduce((sum, s) => sum + s.weight, 0);
    const similarity = similarities.reduce((sum, s) => sum + s.value * s.weight, 0) / (totalWeight || 1);
    const familiar = own ? Math.min(1, own.weight / 3) : 0;
    const matches = preferenceMatches(p, preferences, request);
    const supportedPreferences = matches.filter(m => m.state === 'supported');
    const knownPreferences = matches.filter(m => m.state !== 'unknown');
    // Explicit choices are a gentle nudge, capped below the current request
    // and history signals. Unknown evidence stays neutral and is never called
    // a match in the interface.
    const preferenceWeight = matches.length ? .22 : 0;
    const preferenceScore = knownPreferences.length
      ? supportedPreferences.length / knownPreferences.length
      : .5;
    const baseScore = (1 - confidence) * (.6 * near + .4 * known) + confidence * (.8 * similarity + .2 * familiar);
    const score = (1 - preferenceWeight) * baseScore + preferenceWeight * preferenceScore;
    const anchor = similarities.filter(s => s.meaningful && s.id !== p.id).sort((a, b) => b.value * b.weight - a.value * a.weight)[0];
    const preferenceReason = supportedPreferences[0]?.id && DISCOVERY_PREFERENCES.find(x => x.id === supportedPreferences[0].id)?.label;
    const reason = preferenceReason ? `Matches what you value: ${preferenceReason}` : own?.compared ? 'You compared this centre before' : anchor ? `Similar to ${anchor.saved ? 'a centre you saved' : 'a centre you viewed'}` : own ? 'You viewed this centre before' : 'Near your chosen location';
    return { p, score, reason, basedOn: anchor ? fresh.get(anchor.id).name : null, preferenceMatches: matches };
  });
  const chosen = [];
  const brand = p => p.name?.split(/\s[—–]\s/)[0].toLowerCase();
  const priority = (a, b) => {
    // A deliberately chosen fee/hours/pickup priority precedes inferred taste.
    // Distance remains part of the For you score; ordinary search order is untouched.
    if (!['price', 'closing', 'pickup'].includes(request.sort)) return 0;
    const x = priorityValue(a.p, request.sort, request.date), y = priorityValue(b.p, request.sort, request.date);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return Number(!Number.isFinite(x)) - Number(!Number.isFinite(y));
    if (request.sort === 'price') return feePriorityGroup(a.p) - feePriorityGroup(b.p) || x - y;
    return y - x;
  };
  while (scored.length && chosen.length < 3) {
    const adjusted = item => item.score - (chosen.some(c => brand(c.p) === brand(item.p)) ? .12 : 0);
    scored.sort((a, b) => priority(a, b) || adjusted(b) - adjusted(a) || a.p.distanceKm - b.p.distanceKm || a.p.id.localeCompare(b.p.id));
    chosen.push(scored.shift());
  }
  return chosen;
}

// Apply the same evidence-backed score to the current result page. History and
// choices stay local; the server still decides which page belongs in the search.
export function personaliseSearchItems({ items, request, library, history, now = Date.now() }) {
  if (!Array.isArray(items) || !items.length || !request || !library || !history) return items ?? [];
  const hasSignals = history.preferences?.length || interestSeeds(library, history, request.careType, now).length;
  if (!hasSignals) return items;
  const ranked = recommendCentres({ candidates: items, seeds: items, request, library, history, now });
  if (!ranked.length) return items;
  const rankById = new Map(ranked.map((entry, index) => [entry.p.id, { ...entry, index }]));
  const annotated = items.map((p, index) => {
    const match = rankById.get(p.id);
    const personal = match && match.reason !== 'Near your chosen location';
    return personal
      ? { ...p, personalised: true, personalisedReason: match.reason, personalisedRank: match.index + 1 }
      : { ...p, personalised: false, personalisedReason: null, personalisedRank: null, _searchIndex: index };
  });
  // Keep explicit price, care-end and pickup sorts untouched. The default
  // nearest view may gently surface a top match inside the current page.
  if (request.sort !== 'distance') return annotated.map(({ _searchIndex, ...p }) => p);
  return annotated
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      const aConflict = a.p.fit?.counts?.conflict > 0 ? 1 : 0;
      const bConflict = b.p.fit?.counts?.conflict > 0 ? 1 : 0;
      if (aConflict !== bConflict) return aConflict - bConflict;
      const aRank = a.p.personalisedRank ?? Infinity;
      const bRank = b.p.personalisedRank ?? Infinity;
      return aRank - bRank || a.index - b.index;
    })
    .map(({ p }) => {
      const { _searchIndex, ...clean } = p;
      return clean;
    });
}
