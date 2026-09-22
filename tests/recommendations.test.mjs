import test from 'node:test';
import assert from 'node:assert/strict';
import { DISCOVERY_PREFERENCES, emptyInterests, recordInterest, interestSeeds, readInterests, updateInterests, interestKey, hideRecommendation, centreSimilarity, classifyReview, preferenceEvidence, recommendCentres, personaliseSearchItems } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { createAPI } from '../server/api.mjs';
import { applyReviewEvidence } from '../server/review-evidence.mjs';
import { fixtureCatalog, demoPickup } from '../server/fixtures.mjs';
const now = '2026-09-17T04:00:00.000Z';
const request = { careType:'short_term', pickup:demoPickup, date:'2026-09-22', deadline:'16:00', end:'18:00', age:'4', transport:'', radius:5, sort:'distance', includeUnknown:true, includeConflicts:true, query:'' };
const provider = (id, extra = {}) => ({ id, name:id, careType:'short_term', location:{lat:3.14,lng:101.68}, distanceKm:1, phone:{display:'123'}, category:'CHILDCARE', district:'A', admission:{value:true}, transport:{exists:true}, fees:[{amount:20,basis:'hour',currency:'MYR'}], fit:{counts:{conflict:0},conditions:[{id:'care',state:'supported'},{id:'admission',state:'supported'}]}, ...extra });
const rank = (candidates, extras={}) => recommendCentres({candidates, seeds:[], request, library:emptyLibrary(), history:emptyInterests(), now:Date.parse(now), ...extras});
test('history captures only IDs, care type and activity; same-day repeats do not inflate interest', () => {
  const p = {...provider('a'), childName:'private', request};
  let h = recordInterest(emptyInterests(),[p],'compare',now);
  h = recordInterest(h,[p],'compare',now);
  assert.equal(h.visits[0].compareCount,1);
  assert.deepEqual(Object.keys(h.visits[0]).sort(),['id','careType','compareAt','compareCount'].sort());
  h=recordInterest(h,[p],'view',now);
  assert.equal(h.visits[0].viewCount,1);
  assert.deepEqual(recordInterest({...h,enabled:false},[provider('b')],'view',now).visits,h.visits);
  for(let i=0;i<120;i++)h=recordInterest(h,[provider(`x${i}`)],'view',now);
  assert.equal(h.visits.length,100);
});
test('storage separates modes, strips unknown fields and preserves malformed data on failure', () => {
  const data = new Map(), storage = {getItem:k=>data.get(k),setItem:(k,v)=>data.set(k,v)};
  updateInterests(storage,'live',h=>recordInterest(h,[provider('a')],'compare',now));
  assert.equal(readInterests(storage,'demo').visits.length,0);
  const dirty=JSON.parse(data.get(interestKey('live')));dirty.visits[0].request=request;
  data.set(interestKey('live'),JSON.stringify(dirty));
  assert.equal(readInterests(storage,'live').visits[0].request,undefined);
  data.set(interestKey('live'),'{bad');
  assert.throws(()=>updateInterests(storage,'live',h=>h));
  assert.equal(data.get(interestKey('live')),'{bad');
});
test('preference choices are capped, mode-local and do not retain arbitrary text', () => {
  const data = new Map(), storage = { getItem:k=>data.get(k), setItem:(k,v)=>data.set(k,v) };
  const ids = DISCOVERY_PREFERENCES.map(p => p.id);
  const saved = updateInterests(storage, 'live', h => ({ ...h, preferences: [...ids, 'made-up'], preferenceSetup: 'complete', note: 'private' }));
  assert.deepEqual(saved.preferences, ids.slice(0, 3));
  assert.equal(saved.note, undefined);
  assert.equal(readInterests(storage, 'demo').preferences.length, 0);
  assert.equal(readInterests(storage, 'live').preferenceSetup, 'complete');
});
test('saves outweigh comparisons, comparisons outweigh views, older history fades and care types stay separate', () => {
  let h=recordInterest(emptyInterests(),[provider('compared')],'compare',now);
  h=recordInterest(h,[provider('viewed')],'view',now);
  h=recordInterest(h,[provider('old')],'compare','2026-04-01T00:00:00Z');
  h=recordInterest(h,[provider('regular',{careType:'regular'})],'compare',now);
  const seeds=interestSeeds({favourites:[{id:'saved',careType:'short_term'}]},h,'short_term',Date.parse(now));
  assert.deepEqual(seeds.map(s=>s.id),['saved','compared','viewed']);
});
test('unknown facts and incomparable or estimated fees never imply matching preferences', () => {
  const a=provider('a',{category:null,district:null,admission:null,transport:null});
  assert.equal(centreSimilarity(a,{...a,fees:[{amount:20,basis:'day'}]}).value,0);
  assert.equal(centreSimilarity(a,{...a,fees:[{amount:20,basis:'hour',verification:'area_estimate'}]}).value,0);
  assert.equal(centreSimilarity({...a,fees:[]},{...a,fees:[]}).meaningful,false);
});
test('conflicts, saved items, hidden items and other care types cannot fill recommendation slots', () => {
  const ps=[provider('conflict',{fit:{counts:{conflict:1},conditions:[]}}),provider('saved'),provider('hidden'),provider('regular',{careType:'regular'}),provider('good')];
  const ranked=rank(ps,{library:{favourites:[{id:'saved',careType:'short_term'}]},history:hideRecommendation(emptyInterests(),ps[2])});
  assert.deepEqual(ranked.map(x=>x.p.id),['good']);
  assert.equal(interestSeeds(emptyLibrary(), hideRecommendation(recordInterest(emptyInterests(), [ps[2]], 'compare', now), ps[2]), 'short_term', Date.parse(now)).length, 0);
});
test('fresh seed facts drive similarity, unknown stays unknown, and a previous comparison has a readable reason', () => {
  const a=provider('a'), b=provider('b');
  const h=recordInterest(emptyInterests(),[a],'compare',now);
  const ranked=rank([a,b],{seeds:[a],history:h});
  assert.equal(ranked.find(x=>x.p.id==='a').reason,'You compared this centre before');
  assert.ok(ranked.find(x=>x.p.id==='b').reason.includes('Similar'));
  assert.ok(!rank([b],{seeds:[],history:h})[0].reason.includes('Similar'));
});
test('explicit review preferences gently promote supported evidence and leave unknown evidence neutral', () => {
  const responsive = provider('responsive', { reviewTopics: { communication: { state: 'supported', reviewCount: 2, recentCount: 2, positiveCount: 2 } } });
  const unknown = provider('unknown', { fees: [] });
  const ranked = rank([unknown, responsive], { preferences: ['responsive_team'] });
  assert.equal(ranked[0].p.id, 'responsive');
  assert.equal(ranked[0].reason, 'Matches what you value: Responsive team');
  assert.equal(preferenceEvidence(unknown, 'responsive_team', request).state, 'unknown');
  assert.equal(preferenceEvidence(responsive, 'responsive_team', request).state, 'supported');
});
test('review topics are used only when explicitly supplied by the provider evidence', () => {
  const p = provider('reviewed', { admission: null, reviewTopics: { temporary_care: { state: 'supported', reviewCount: 2, positiveCount: 2 } } });
  assert.equal(preferenceEvidence(p, 'flexible_short_care', request).source, 'review');
  assert.equal(preferenceEvidence(provider('without-review', { admission: null }), 'flexible_short_care', request).state, 'unknown');
});
test('review text maps a level-one concern to a level-two preference', () => {
  const classified = classifyReview({ rating: 5, text: 'Parents say staff reply quickly, share progress updates and explain fees before the visit.' });
  assert.deepEqual(classified.level1, ['fees', 'communication']);
  assert.deepEqual(classified.level2, ['predictable_fees', 'responsive_team']);
});
test('short-care crawl merges only derived review evidence into a matched branch', () => {
  const catalog = applyReviewEvidence({ items: [{ id: 'provider_1bdfa3d76b9a23c6c4306edb6f4' }, { id: 'not-crawled' }] });
  assert.equal(catalog.items[0].reviewTopics.communication.state, 'supported');
  assert.equal(catalog.items[0].reviewEvidence.identityVerified, true);
  assert.equal(catalog.items[1].reviewEvidence, undefined);
});
test('explicit fee priority wins over history; same brands do not fill an otherwise equivalent shortlist', () => {
  const expensive=provider('expensive',{fees:[{amount:100,basis:'hour'}]}), cheap=provider('cheap');
  assert.equal(rank([expensive,cheap],{request:{...request,sort:'price'},seeds:[expensive],history:recordInterest(emptyInterests(),[expensive],'compare',now)})[0].p.id,'cheap');
  const selected=rank([provider('a',{name:'Branch — A'}),provider('b',{name:'Branch — B'}),provider('c',{name:'Other'}),provider('d',{name:'Another'})]);
  assert.deepEqual(selected.map(x=>x.p.id),['a','c','d']);
});
test('contact preference and deterministic top-three limits remain intact', () => {
  const ps=[provider('a',{phone:null}),provider('b')];
  assert.deepEqual(rank(ps).map(x=>x.p.id),['b']);
  assert.equal(rank([ps[0]]).length,1);
  assert.equal(rank(['a','b','c','d'].map(id=>provider(id))).length,3);
});
test('normal search gently surfaces preference matches without changing explicit sorts', () => {
  const clear = provider('clear', { reviewTopics: { fees: { state: 'supported', reviewCount: 2, positiveCount: 2 } } });
  const unknown = provider('unknown', { fees: [], distanceKm: .2 });
  const items = personaliseSearchItems({
    items: [unknown, clear], request, library: emptyLibrary(),
    history: { ...emptyInterests(), preferences: ['predictable_fees'], preferenceSetup: 'complete' },
  });
  assert.deepEqual(items.map(p => p.id), ['clear', 'unknown']);
  assert.equal(items[0].personalised, true);
  assert.match(items[0].personalisedReason, /Predictable fees/);
  const byPrice = personaliseSearchItems({
    items: [clear, unknown], request: { ...request, sort: 'price' }, library: emptyLibrary(),
    history: { ...emptyInterests(), preferences: ['predictable_fees'], preferenceSetup: 'complete' },
  });
  assert.deepEqual(byPrice.map(p => p.id), ['clear', 'unknown']);
  assert.equal(byPrice[0].personalised, true);
});
test('listed fees, pickup and contact details do not create review preferences', () => {
  const listed = provider('listed', { fees: [{ amount: 20, basis: 'hour' }], transport: { exists: true }, reviewTopics: undefined });
  for (const id of ['predictable_fees', 'smooth_pickup', 'responsive_team'])
    assert.equal(preferenceEvidence(listed, id, request).state, 'unknown');
});
test('normal search history is safe when a previous centre is off the current page', () => {
  const viewed = provider('viewed', { distanceKm: 30 });
  const current = provider('current');
  const history = recordInterest(emptyInterests(), [viewed], 'compare', now);
  const items = personaliseSearchItems({ items: [current], request, library: emptyLibrary(), history });
  assert.equal(items[0].id, 'current');
  assert.equal(items[0].personalised, false);
});
test('read-only recommendation API refreshes public seeds, checks current request and leaves search pages unchanged', async () => {
  const api=createAPI(), body={action:'recommendations',mode:'demo',request,seedIds:['demo-garden','removed-id']};
  const before=await api({action:'search',mode:'demo',request});
  const r=await api(body);
  assert.deepEqual(r.seeds.map(p=>p.id),['demo-garden']);
  assert.ok(r.items.length>0 && r.items.every(p=>p.fit.counts.conflict===0 && p.distanceKm<=5));
  assert.ok(!r.items.some(p=>p.id==='demo-river'));
  assert.deepEqual((await api({action:'search',mode:'demo',request})).items,before.items);
  const later=await api({...body,request:{...request,end:'23:59'}});
  assert.equal(later.items.length,0);
  await assert.rejects(api({...body,seedIds:Array(101).fill('a')}));
  await assert.rejects(api({...body,request:{...request,pickup:null}}));
});
test('catalogue care-type membership applies to both fresh seeds and recommendations', async () => {
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,shortCareReady:true,shortCareIds:['demo-garden']})},drivingRoutes:async(_,ps)=>ps});
  const r=await api({action:'recommendations',mode:'live',request,seedIds:['demo-garden','demo-meadow']});
  assert.deepEqual(r.seeds.map(p=>p.id),['demo-garden']);
  assert.ok(r.items.every(p=>p.id==='demo-garden'));
});
