import test from 'node:test';
import assert from 'node:assert/strict';
import { createAPI } from '../server/api.mjs';
import { personaliseSearchItems, emptyInterests, recordInterest } from '../shared/recommendations.mjs';
import { emptyLibrary } from '../shared/saved.mjs';
import { mergeSearchRoutes } from '../shared/search-routes.mjs';
import { drivingLabel } from '../shared/result-summary.mjs';

const request = {careType:'short_term',pickup:{label:'KL Sentral',address:'Jalan Thambipillay',lat:3.1331,lng:101.6861,region:'Kuala Lumpur'},date:'2026-09-30',deadline:'10:00',end:'12:00',age:'1-3',transport:'self',radius:10,sort:'recommended',includeUnknown:true,includeConflicts:false};
const features = ['area-fees-v1','search-summary-v1','defer-driving-v1'];
const noRoutes = async (_, rows) => rows.map(p=>({...p,driving:{state:'unavailable'}}));
const body = {action:'search',mode:'live',request};

test('search results do not wait for routing or reverse-geocoding services', async () => {
  let routeCalls=0, addressCalls=0;
  const api=createAPI({drivingRoutes:()=>{routeCalls++;return new Promise(()=>{});},reverseGeocode:()=>{addressCalls++;return new Promise(()=>{});}});
  const response=await api({...body,request:{...request,pickup:{...request.pickup,label:'Selected location',address:undefined}},features});
  assert.equal(response.items.length,10);
  assert.equal(response.drivingDeferred,true);
  assert.ok(response.items.every(p=>p.driving.state==='loading'));
  assert.equal(routeCalls,0);
  assert.equal(addressCalls,0);
});

test('compact search preserves all ten candidates, conditions, fees and personalised scores', async () => {
  const api=createAPI({drivingRoutes:noRoutes,reverseGeocode:null});
  const full=await api({...body,features:['area-fees-v1']});
  const short=await api({...body,features});
  assert.equal(full.drivingDeferred,false);
  assert.deepEqual(short.items.map(p=>p.id),full.items.map(p=>p.id));
  assert.equal(short.total,full.total);
  assert.equal(short.explicitMatchCount,full.explicitMatchCount);
  for(let i=0;i<10;i++){
    for(const key of ['fit','fees','cost','enquiries','weeklyCareEndTimes'])assert.deepEqual(short.items[i][key],full.items[i][key]);
    assert.deepEqual(short.items[i].reviewProfile.topics,full.items[i].reviewProfile.topics);
    assert.ok(full.items[i].reviewProfile.excerpts.length>0);
    assert.deepEqual(short.items[i].reviewProfile.excerpts,[]);
    assert.equal(short.items[i].reviewProfile.deferred,true);
  }
  const now=Date.parse('2026-09-30T04:00:00Z');
  const warm=recordInterest({...emptyInterests(),preferences:['caring_teachers','predictable_fees'],preferenceSetup:'complete'},full.items.slice(0,3),'compare',new Date(now).toISOString());
  for(const history of [emptyInterests(),warm]){
    const rank=r=>personaliseSearchItems({items:r.items,seeds:r.items,request:r.request,library:emptyLibrary(),history,now});
    const scores=r=>rank(r).map(p=>[p.id,p.rerankScore,p.personalisedRank,p.personalisedReason]);
    assert.deepEqual(scores(short),scores(full));
    assert.equal(rank(short).filter(p=>Number.isFinite(p.rerankScore)).length,10);
  }
  assert.ok(Buffer.byteLength(JSON.stringify(short))<Buffer.byteLength(JSON.stringify(full))*.5);
});

test('review text is fetched separately by public centre ID and catalog version', async () => {
  const api=createAPI({drivingRoutes:noRoutes,reverseGeocode:null});
  const full=await api(body), p=full.items[0];
  const result=await api({action:'reviews',careType:'short_term',id:p.id,version:full.version});
  assert.deepEqual(result.reviewProfile,p.reviewProfile);
  await assert.rejects(api({action:'reviews',careType:'short_term',id:p.id,version:'stale'}),e=>e.code==='FACTS_CHANGED');
  await assert.rejects(api({action:'reviews',careType:'short_term',id:'missing'}),e=>e.code==='PLACE_UNAVAILABLE');
  await assert.rejects(api({action:'reviews',careType:'regular',id:p.id}),e=>e.code==='PLACE_UNAVAILABLE');
});

test('route enrichment accepts only bounded public selections within the search radius', async () => {
  const api=createAPI({drivingRoutes:noRoutes,reverseGeocode:null});
  const search=await api({...body,features});
  const routes={action:'routes',request,ids:search.items.map(p=>p.id),version:search.version};
  const response=await api(routes);
  assert.deepEqual(response.items.map(p=>p.id),routes.ids);
  assert.ok(response.items.every(p=>Object.keys(p).sort().join(',')==='driving,id'));
  for(const ids of [[],[routes.ids[0],routes.ids[0]],Array.from({length:11},(_,i)=>'id'+i)])
    await assert.rejects(api({...routes,ids}),e=>e.code==='INVALID_SELECTION');
  await assert.rejects(api({...routes,ids:['missing']}),e=>e.code==='PLACE_UNAVAILABLE');
  await assert.rejects(api({...routes,request:{...request,pickup:{label:'Shah Alam',lat:3.0738,lng:101.5183}}}),e=>e.code==='PLACE_UNAVAILABLE');
  await assert.rejects(api({...routes,version:'stale'}),e=>e.code==='FACTS_CHANGED');
});

test('late or unavailable route data never changes result membership, ranking or assessed facts', () => {
  const items=[{id:'b',personalisedRank:1,rerankScore:20,fit:{counts:{conflict:0}},driving:{state:'loading'}},{id:'a',personalisedRank:2,rerankScore:10,driving:{state:'loading'}}];
  const response={items:[{id:'a',driving:{state:'available',minutes:9}},{id:'other',driving:{state:'available',minutes:2}}]};
  const merged=mergeSearchRoutes(items,response);
  assert.deepEqual(merged.map(({driving,...p})=>p),items.map(({driving,...p})=>p));
  assert.equal(merged[0].driving.state,'unavailable');
  assert.equal(merged[1].driving.minutes,9);
  assert.ok(mergeSearchRoutes(items,null).every(p=>p.driving.state==='unavailable'));
  assert.equal(drivingLabel(items[0].driving),'Checking drive time…');
});
