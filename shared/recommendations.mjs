import { hasContact, priorityValue } from './conditions.mjs';
import { shortFeeFrom, monthlyFeeFrom, feePriorityGroup } from './result-summary.mjs';
import { cleanSlates, recordRankingFeedback, createMLScorer } from './recommendation-learning.mjs';

// Only public centre IDs and capped activity counts are remembered. Requests,
// addresses, child ages, notes and provider snapshots never enter this store.
export const interestKey = mode => `equalpath:interests:v1:${mode}`;
import { DISCOVERY_PREFERENCES, REVIEW_TOPIC_GROUPS, normalisePreferenceTopics, classifyReview, reviewTopicEvidence, aspectSentiment } from './review-profile.mjs';
export { DISCOVERY_PREFERENCES, REVIEW_TOPIC_GROUPS, normalisePreferenceTopics, classifyReview } from './review-profile.mjs';
const preferenceTopic = new Map(DISCOVERY_PREFERENCES.map(p => [p.id, p.topic]));
export const emptyInterests = () => ({ version: 1, enabled: true, visits: [], hidden: [], preferences: [], preferenceSetup: 'new' });
const DAY = 86400000;
const validId = id => typeof id === 'string' && id.length > 0 && id.length <= 160;
const validType = type => ['short_term', 'regular'].includes(type);
const same = (a, b) => a.id === b.id && a.careType === b.careType;
const validDate = value => typeof value === 'string' && Number.isFinite(Date.parse(value));
const validPreferenceSetup = value => ['new', 'skipped', 'complete'].includes(value);
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
    ...(data.ranking ? { ranking: cleanSlates(data.ranking) } : {}),
    ...(data.rankingProvenance === 'synthetic-test' ? { rankingProvenance: 'synthetic-test' } : {}),
    ...(/^u_[A-Za-z0-9_-]{8,100}$/.test(data.rankingActor ?? '') ? { rankingActor: data.rankingActor } : {}),
  };
}
export function updateInterests(storage, mode, change) {
  const next = change(readInterests(storage, mode));
  const safe = readInterests({ getItem: () => JSON.stringify({ ...emptyInterests(), ...next }) }, mode);
  storage.setItem(interestKey(mode), JSON.stringify(safe));
  return safe;
}
export function recordInterest(data, providers, kind, now = new Date().toISOString(), slateId) {
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
  return recordRankingFeedback({ ...data, visits: visits.slice(-100) }, providers, kind, Date.parse(now), slateId);
}
export function hideRecommendation(data, p, slateId) {
  return recordRankingFeedback({ ...data, hidden: [...data.hidden.filter(v => !same(v, p)), { id: p.id, careType: p.careType }].slice(-100) }, [p], 'hide', Date.now(), slateId);
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
  const groupId = ({flexible_short_care:'temporary_care',smooth_pickup:'pickup',clear_late_rules:'late_collection',predictable_fees:'fees',responsive_team:'communication'})[preferenceId] ?? preferenceTopic.get(preferenceId);
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
    const positive = review?.sentiment === 'positive' || review?.support === true || aspectSentiment(review?.text ?? review?.excerpt, preferenceId).sentiment === 'positive';
    return positive && classification.level2.includes(preferenceId);
  });
  if (!matching.length) return null;
  return { supported: matching.length >= 2, reviewCount: matching.length, recentCount: null, positiveCount: matching.length, limited: matching.length < 2 };
};

function reviewEvidence(p, id, now = Date.now()) {
  if (p.reviewProfile) return reviewTopicEvidence(p, id, now);
  const evidence = explicitEvidence(p, id) ?? classifiedEvidence(p, id);
  if (!evidence?.supported) return { state: 'unknown', score: .5, confidence: 0, source: 'review', reviewCount: evidence?.reviewCount ?? 0, limited: !!evidence };
  return { state: 'supported', score: .5 + .4 * (evidence.positiveCount ?? evidence.reviewCount) / (evidence.reviewCount + 4), confidence: evidence.reviewCount / (evidence.reviewCount + 8), source: 'review', reviewCount: evidence.reviewCount, recentCount: evidence.recentCount, positiveCount: evidence.positiveCount };
}
export function preferenceEvidence(p, id, request, now = Date.now()) {
  // request is intentionally unused: preferences personalise the current
  // eligible result set, while date/time/pickup remain hard search gates.
  void request;
  return reviewEvidence(p, id, now);
}
export function preferenceMatches(p, preferences, request, now = Date.now()) {
  return normalisePreferenceTopics(preferences).map(id => ({ id, ...preferenceEvidence(p, id, request, now) }));
}
const strongestReviewTopics = topics => topics
  .filter(t => t.evidence.state === 'supported' && t.evidence.score >= .6 && t.evidence.confidence >= .25)
  .sort((a,b) => b.evidence.score-a.evidence.score || a.id.localeCompare(b.id)).slice(0,2);
// Describe this branch, independently of a visitor's choices or saved history.
// Do not fill empty slots with sparse, stale or negative review evidence.
export function centreHighlights(provider, now = Date.now()) {
  return strongestReviewTopics(DISCOVERY_PREFERENCES.map(t => ({ ...t, evidence: reviewEvidence(provider, t.id, now) })))
    .map(({ id, label }) => ({ id, label }));
}
// Rebuild the interest vector from fresh branch facts. Nothing about a child or
// a search is written into history; hidden branches contribute a bounded dislike.
export function learnedPreferenceWeights({ seeds, library, history, careType, now = Date.now() }) {
  const fresh = new Map(seeds.map(p => [p.id, p]));
  const weighted = interestSeeds(library, history, careType, now).filter(s => fresh.has(s.id));
  const weights = Object.fromEntries(DISCOVERY_PREFERENCES.map(p => [p.id, 0]));
  let total = 0;
  for (const seed of weighted) {
    total += seed.weight;
    for (const id of Object.keys(weights)) {
      const e = reviewEvidence(fresh.get(seed.id), id, now);
      weights[id] += seed.weight * (e.score - .5) * 2 * (e.confidence ?? 0);
    }
  }
  for (const hidden of history.enabled ? history.hidden.filter(h => h.careType === careType) : []) {
    const p = fresh.get(hidden.id); if (!p) continue;
    total += .5;
    for (const id of Object.keys(weights)) {
      const e = reviewEvidence(p, id, now);
      weights[id] -= Math.max(0, e.score - .5) * (e.confidence ?? 0);
    }
  }
  return { weights: Object.fromEntries(Object.entries(weights).map(([id,w]) => [id, w / Math.max(1,total)])), confidence: Math.min(1,total/8) };
}
export function rankCentres({ candidates, seeds: currentSeeds = [], request, library, history, preferences = history.preferences, now = Date.now(), excludeSaved = false, excludeHidden = true, model, bootstrapModel }) {
  const interests = interestSeeds(library, history, request.careType, now);
  const fresh = new Map([...currentSeeds, ...candidates].map(p => [p.id, p]));
  const seeds = interests.filter(s => fresh.has(s.id));
  const saved = new Set(library.favourites.filter(f => (f.careType ?? 'short_term') === request.careType).map(f => f.id));
  const hidden = new Set(history.hidden.filter(v => v.careType === request.careType).map(v => v.id));
  const pool = candidates.filter(p => p.careType === request.careType && p.location && p.fit && p.fit.counts.conflict === 0 && (!excludeSaved || !saved.has(p.id)) && (!excludeHidden || !hidden.has(p.id)));
  const learned = learnedPreferenceWeights({ seeds: [...fresh.values()], library, history, careType: request.careType, now });
  const scoreML = createMLScorer({ history, seeds, careType: request.careType, now, model, bootstrapModel });
  const preferencesToMatch = normalisePreferenceTopics(preferences);
  const relevant = new Set(['admission', 'care', ...(request.age ? ['age'] : []), ...(request.transport === 'institution' ? ['transport', 'coverage', 'pickup'] : [])]);
  const scored = pool.map(p => {
    const checks = p.fit.conditions.filter(c => relevant.has(c.id));
    const known = checks.filter(c => c.state === 'supported').length / Math.max(1, checks.length);
    const near = 1 - Math.min(1, Math.max(0, p.distanceKm) / request.radius);
    const own = seeds.find(s => s.id === p.id);
    const similarities = seeds.map(s => ({ ...s, ...centreSimilarity(p, fresh.get(s.id)) }));
    const totalWeight = seeds.reduce((sum,s) => sum+s.weight,0);
    const similarity = similarities.reduce((sum,s) => sum+s.value*s.weight,0)/(totalWeight||1);
    // Reuse each topic calculation for explicit fit, learned fit and diversity.
    const topics = DISCOVERY_PREFERENCES.map(t => ({ ...t, evidence: reviewEvidence(p, t.id, now) }));
    const evidenceById = new Map(topics.map(t => [t.id, t.evidence]));
    const matches = preferencesToMatch.map(id => ({ id, ...evidenceById.get(id) }));
    const explicit = matches.reduce((n,e) => n+(e.score-.5)*2,0)/Math.max(1,matches.length);
    const learnedTotal = Object.values(learned.weights).reduce((s,w)=>s+Math.abs(w),0);
    const learnedFit = topics.reduce((sum,t)=>sum+learned.weights[t.id]*(t.evidence.score-.5)*2,0)/Math.max(.01,learnedTotal);
    // Distance stays useful in cold start, but a few extra kilometres must not
    // drown out an explicit save. Learning other traits remains confidence-limited.
    // Current saves contribute .24; one fresh compare .12; one view only .03.
    const scoreParts = {
      distance: (.45 - .1 * learned.confidence) * near,
      known: .4 * known,
      preferences: .22 * explicit,
      learned: .2 * learned.confidence * learnedFit,
      similarity: .12 * learned.confidence * similarity,
      familiarity: own ? .24 * Math.min(1, own.weight / 4) : 0,
    };
    const ml = scoreML(p.id, scoreParts);
    const score = Object.values(scoreParts).reduce((sum, value) => sum + value, 0) + ml.delta;
    const supported = matches.filter(e => e.state==='supported' && e.score>.5).sort((a,b)=>b.score-a.score);
    const learnedTopic = topics.map(t=>({...t,value:learned.weights[t.id]*(t.evidence.score-.5)})).sort((a,b)=>b.value-a.value)[0];
    const anchor = similarities.filter(s=>s.meaningful&&s.id!==p.id).sort((a,b)=>b.value*b.weight-a.value*a.weight)[0];
    const label = DISCOVERY_PREFERENCES.find(t=>t.id===supported[0]?.id)?.label;
    const reason = own?.saved ? 'A centre you saved' : own?.compared ? 'You compared this centre before' : label ? `Matches your choices: ${label}` : learnedTopic?.value>.01 ? `Parents mention: ${learnedTopic.label}` : anchor ? `Similar to ${anchor.saved ? 'a centre you saved' : 'a centre you viewed'}` : own ? 'You viewed this centre before' : 'Near your chosen location';
    // Only well-supported positive review themes can add diversity. Missing or
    // stale reviews never manufacture a strength, and different branch IDs alone
    // do not imply different care. Keep the two strongest themes per centre.
    const strengths = strongestReviewTopics(topics).map(t => t.id);
    return { p, score, scoreParts, ml, strengths, reason, hidden: hidden.has(p.id), basedOn: anchor ? fresh.get(anchor.id).name : null, preferenceMatches: matches };
  });
  const priority = (a,b) => {
    const contact = Number(hasContact(b.p))-Number(hasContact(a.p)); if(contact) return contact;
    // Hidden suggestions remain ordinary search results, but are ranked after
    // the other candidates in their contact group and never highlighted.
    if(a.hidden!==b.hidden)return Number(a.hidden)-Number(b.hidden);
    if(!['price','closing','pickup'].includes(request.sort))return 0;
    const x=priorityValue(a.p,request.sort,request.date),y=priorityValue(b.p,request.sort,request.date);
    if(!Number.isFinite(x)||!Number.isFinite(y))return Number(!Number.isFinite(x))-Number(!Number.isFinite(y));
    return request.sort==='price' ? feePriorityGroup(a.p)-feePriorityGroup(b.p)||x-y : y-x;
  };
  const chosen=[]; const brand=p=>p.name?.split(/\s[—–]\s/)[0].toLowerCase();
  while(scored.length){
    // A small, deterministic novelty bonus in positions 2–5 lets comparable
    // options with different strengths be seen. It cannot cross fit/contact
    // groups, displace a clearly stronger candidate, or shuffle every search.
    const seenTopics = new Set(chosen.flatMap(c => c.strengths));
    const adjusted=x=>x.score-(chosen.slice(0,3).some(c=>brand(c.p)===brand(x.p))?.12:0)
      +(chosen.length>0 && chosen.length<5 && x.strengths.some(id=>!seenTopics.has(id)) ? .035 : 0);
    scored.sort((a,b)=>priority(a,b)||adjusted(b)-adjusted(a)||a.p.distanceKm-b.p.distanceKm||a.p.id.localeCompare(b.p.id));
    chosen.push(scored.shift());
  }
  return chosen;
}
export function recommendCentres(options) {
  const ranked=rankCentres({...options,excludeSaved:true});
  const pool=ranked.some(x=>hasContact(x.p))?ranked.filter(x=>hasContact(x.p)):ranked;
  return pool.slice(0,3);
}
// One page order and one suggestion set drive the list, pins and map cards.
export function personaliseSearchItems({ items, seeds = [], request, library, history, now = Date.now(), model, bootstrapModel }) {
  if(!Array.isArray(items)||!items.length||!request||!library||!history)return items??[];
  // Every eligible result goes through the same scoring pass, including a
  // visitor who skips preferences. Empty signals contribute zero; distance,
  // current condition fit and diversity provide the cold-start order.
  const ranked=rankCentres({candidates:items,seeds:[...seeds,...items],request,library,history,now,excludeHidden:false,model,bootstrapModel});
  const byId=new Map(ranked.map((r,index)=>[r.p.id,{...r,index}]));
  const recommended=request.sort==='recommended';
  const order=recommended ? [...items].sort((a,b)=>{
    const conflicts=Number(a.fit?.counts?.conflict>0)-Number(b.fit?.counts?.conflict>0);
    return conflicts||Number(hasContact(b))-Number(hasContact(a))||(byId.get(a.id)?.index??Infinity)-(byId.get(b.id)?.index??Infinity);
  }) : items;
  const eligible=order.filter(p=>byId.has(p.id)&&!byId.get(p.id).hidden);
  const contactable=eligible.some(hasContact)?eligible.filter(hasContact):eligible;
  const suggested=new Set(contactable.slice(0,3).map(p=>p.id));
  return order.map((p,index) => {
    const match = byId.get(p.id);
    const personal = recommended && match && !match.hidden && match.reason !== 'Near your chosen location';
    return { ...p, suggested: suggested.has(p.id), personalised: !!personal && suggested.has(p.id),
      personalisedReason: personal ? match.reason : null,
      personalisedRank: match ? (recommended ? match.index : index) + 1 : null,
      rerankScore: match?.score ?? null,
      learningFeatures: recommended ? match?.ml.features ?? null : null,
      rankingModel: recommended ? match?.ml.source ?? 'ineligible' : 'factual' };
  });
}

// Capture the ranking once when a search completes. Subsequent saves/views
// update the interest store, not this response's order or recommendation set.
export function rankSearchResponse(response, personal) {
  return { ...response, items: personaliseSearchItems({ ...personal,
    items: response.items ?? [], seeds: response.seeds ?? [], request: response.request }) };
}
