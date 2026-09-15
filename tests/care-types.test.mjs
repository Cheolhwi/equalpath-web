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
    const radius=careType==='short_term'?5:10,pageSize=careType==='short_term'?10:20;
    assert.equal(nearby.radius,radius);assert.equal(nearby.pageSize,pageSize);
    assert.ok(nearby.items.every(p=>p.distanceKm<=radius));assert.ok(nearby.items.length<=pageSize);
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
test('short care clamps forged and legacy requests to 5 km and ten per page before routing',async()=>{
  const north=km=>({lat:demoPickup.lat+km/6371*180/Math.PI,lng:demoPickup.lng});
  const make=(id,km)=>({...structuredClone(fixtureCatalog.items[0]),id,location:km===null?null:north(km)});
  const short=[...Array.from({length:22},(_,i)=>make(`short-${i}`,1+i*.1)),make('inside-5',4.999),make('outside-5',5.001),make('unlocated',null)];
  const regular=Array.from({length:21},(_,i)=>make(`regular-${i}`,6+i*.1));
  const a=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[...short,...regular],shortCareReady:true,shortCareIds:short.map(p=>p.id)})},drivingRoutes:async(_,rows)=>{
    assert.ok(rows.length<=(rows[0]?.id.startsWith('regular')?20:10));return rows;
  }});
  for(const careType of ['short_term',undefined])for(const radius of [undefined,10,999]){
    const r={...dated,careType,radius};
    const pages=[];
    for(let page=0;page<4;page++){
      const result=await a({action:'search',request:r,page,pageSize:999});
      assert.equal(result.request.radius,5);assert.equal(result.pageSize,10);assert.equal(result.total,23);
      assert.equal(result.items.length,[10,10,3,0][page]);assert.equal(result.ordering.pageSize,10);
      assert.ok(result.items.every(p=>p.distanceKm<=5&&!p.id.startsWith('regular')));pages.push(...result.items);
    }
    assert.equal(new Set(pages.map(p=>p.id)).size,23);assert.ok(pages.some(p=>p.id==='inside-5'));
    const nearby=await a({action:'nearby',careType,center:demoPickup,radius,pageSize:999});
    assert.equal(nearby.radius,5);assert.equal(nearby.total,23);assert.equal(nearby.items.length,10);
    assert.ok(nearby.items.every(p=>p.distanceKm<=5));
  }
  const regularResult=await a({action:'search',request});
  assert.equal(regularResult.request.radius,10);assert.equal(regularResult.total,21);assert.equal(regularResult.items.length,20);
  assert.ok(regularResult.items.every(p=>p.id.startsWith('regular')));
  assert.equal(nearbyCacheKey({center:demoPickup,careType:'short_term',radius:10}),nearbyCacheKey({center:demoPickup,careType:'short_term',radius:5}));
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
