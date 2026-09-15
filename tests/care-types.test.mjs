import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createAPI} from '../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../server/fixtures.mjs';
import {requestErrors,canonicalRequest} from '../shared/request.mjs';
import {assess} from '../shared/conditions.mjs';
import {enquiryView,enquiryMessage} from '../shared/enquiry-view.mjs';
import {preparationFor,preparationHTML} from '../shared/preparation.mjs';
import {template,reuseTemplate} from '../shared/saved.mjs';
import {nearbyCacheKey} from '../shared/map-search.mjs';
import {shortCareCollection} from '../server/profile-evidence.mjs';
const request=canonicalRequest({careType:'regular',pickup:demoPickup,age:'4',transport:'self'});
const dated={...request,careType:'short_term',date:'2026-09-21',deadline:'13:00',end:'17:00'};
const ids=fixtureCatalog.items.slice(0,2).map(p=>p.id);
const catalog={...fixtureCatalog,shortCareIds:ids,shortCareReady:true};
const api=createAPI({store:{catalog:async()=>catalog},drivingRoutes:async(_,rows)=>rows});
test('regular search accepts preferences alone, discards hidden dates and temporal sort; short care still validates times',()=>{
  assert.deepEqual(requestErrors(request),{});
  assert.ok(requestErrors({...request,pickup:null}).pickup);
  assert.ok(requestErrors({...request,careType:'other'}).careType);
  const regular=canonicalRequest({...dated,careType:'regular',sort:'closing'});
  assert.equal(regular.date,'');assert.equal(regular.deadline,'');assert.equal(regular.end,'');assert.equal(regular.sort,'distance');
  assert.deepEqual(Object.keys(requestErrors({...request,careType:'short_term'})),['date','deadline','end']);
  assert.ok(requestErrors({...dated,end:'12:00'}).end);
  assert.deepEqual(requestErrors(dated),{});
});
test('live search and map use disjoint memberships before radius, count and pagination; cross-pool lookups are rejected',async()=>{
  const regular=await api({action:'search',request});
  const short=await api({action:'search',request:dated});
  assert.equal(regular.collection.total,catalog.items.length-ids.length);
  assert.equal(short.collection.total,ids.length);
  assert.ok(regular.items.length&&short.items.length);
  assert.ok(regular.items.every(p=>!ids.includes(p.id)));
  assert.ok(short.items.every(p=>ids.includes(p.id)));
  for(const careType of ['regular','short_term']){
    const nearby=await api({action:'nearby',center:demoPickup,careType});
    assert.ok(nearby.items.every(p=>ids.includes(p.id)===(careType==='short_term')));
    assert.ok(nearby.items.every(p=>p.distanceKm<=10));assert.ok(nearby.items.length<=20);
  }
  await assert.rejects(api({action:'details',request,id:ids[0]}),e=>e.code==='PLACE_UNAVAILABLE');
  await assert.rejects(api({action:'compare',request:dated,ids:[ids[0],regular.items[0].id]}),e=>e.code==='PLACE_UNAVAILABLE');
  const far=await api({action:'search',request:{...dated,pickup:{label:'Far Selangor',lat:3.65,lng:101.56}}});
  assert.equal(far.total,0);
});
test('membership is not an admission claim and missing membership fails closed',async()=>{
  const unknown={...fixtureCatalog.items[0],admission:{value:null}};
  const a=createAPI({store:{catalog:async()=>({...catalog,items:[unknown],shortCareIds:[unknown.id]})},drivingRoutes:async(_,r)=>r});
  const result=await a({action:'search',request:dated});
  assert.equal(result.items[0].fit.conditions.find(c=>c.id==='admission').state,'unknown');
  const broken=createAPI({store:{catalog:async()=>({...catalog,shortCareReady:false})}});
  await assert.rejects(broken({action:'search',request}),e=>e.code==='SOURCE_INCOMPLETE');
});
test('regular detail, question copy and printable preparation do not require or fabricate a visit date',async()=>{
  const result=await api({action:'search',request});
  const p=(await api({action:'details',id:result.items[0].id,request})).items[0];
  assert.deepEqual(p.fit.conditions.map(c=>c.id),['age','transport']);
  assert.equal(p.businessHoursDay,null);assert.ok(p.weeklyCareEndTimes.length);
  assert.equal(p.cost.available,false);assert.equal(p.cost.total,undefined);
  assert.ok(!p.enquiries.some(q=>['admission','care','pickup','transfer'].includes(q.id)));
  const text=enquiryMessage(p,request,enquiryView(p,request));
  assert.match(text,/regular childcare/);assert.doesNotMatch(text,/one-off|Invalid Date|undefined|Collect by:|Date:/);
  const sheet=preparationFor(p,request),html=preparationHTML(sheet);
  assert.equal(sheet.date,null);assert.ok(sheet.sequence.every(s=>s.time===null));
  assert.match(html,/Regular childcare/);assert.doesNotMatch(html,/Invalid Date|undefined/);
  const unspecified=assess(p,{...request,age:'',transport:''});
  assert.equal(unspecified.counts.unknown,0);
  const pickup=assess({...p,transport:{exists:true,coverage:{exhaustive:true}}},{...request,transport:'institution'});
  assert.equal(pickup.conditions.find(c=>c.id==='coverage').state,'unknown');
});
test('templates and nearby caches retain care type without carrying hidden dates',()=>{
  for(const r of [request,dated]){
    const saved=template(r,'My search','template');
    const reused=reuseTemplate(saved,{});
    assert.equal(saved.careType,r.careType);assert.equal(reused.careType,r.careType);
    assert.equal(reused.date,'');assert.equal(saved.date,undefined);
    if(r.careType==='regular'){assert.equal(reused.deadline,'');assert.equal(reused.end,'');assert.deepEqual(requestErrors(reused),{});}
    else assert.ok(requestErrors(reused).date);
  }
  assert.notEqual(nearbyCacheKey({center:demoPickup,careType:'regular'}),nearbyCacheKey({center:demoPickup,careType:'short_term'}));
});
test('profile membership rejects tampering, duplicate IDs and absent catalogue branches without mutating provider facts',()=>{
  const records=ids.map(provider_id=>({provider_id,schema:'public-provider-profile-v1',short_care_published:null,sources:[{url:'https://example.com'}],programme_facts:['Published programme']}));
  const hash=rs=>createHash('sha256').update(JSON.stringify([...rs].sort((a,b)=>a.provider_id.localeCompare(b.provider_id)))).digest('hex');
  assert.deepEqual(shortCareCollection(records,{profile_evidence_hash:hash(records)},catalog.items),[...ids].sort());
  assert.throws(()=>shortCareCollection(records,{profile_evidence_hash:'0'.repeat(64)},catalog.items));
  for(const rows of [[...records,records[0]],[{...records[0],provider_id:'absent'}],[{...records[0],short_care_published:'confirmed'}]])
    assert.throws(()=>shortCareCollection(rows,{profile_evidence_hash:hash(rows)},catalog.items));
});
