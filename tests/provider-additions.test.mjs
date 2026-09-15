import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyProviderAdditions,additionsHash} from '../server/provider-additions.mjs';
import {buildCatalog} from '../server/providers.mjs';
import {createStore} from '../server/appwrite-store.mjs';
import {createAPI} from '../server/api.mjs';
import {assess,enquiries} from '../shared/conditions.mjs';
import {registrationBadge} from '../shared/registration.mjs';
import {monthlyFeeFrom,feeSummary} from '../shared/result-summary.mjs';
const {summary,records}=JSON.parse(readFileSync(new URL('../data/prepared-short-care-additions-20260915.json',import.meta.url)));
const base=[{id:'existing',official_name:'Existing branch',state:'Selangor',district:'Petaling',registration:{authority:'KPM',record_number:'TEST',source_url:'https://example.com'},operating_hours:{},fees:[]}];
const catalogue=()=>buildCatalog(applyProviderAdditions(base,records,summary.baseRelease,summary.hash),summary.baseRelease);
const request=p=>({pickup:{label:p.address,lat:p.location.lat,lng:p.location.lng},date:'2026-09-15',deadline:'13:00',end:'16:00',age:'',transport:'self',radius:10});

test('seven new physical branches keep published sources, contact, and no invented registration or age',()=>{
 const before=structuredClone(base),raw=applyProviderAdditions(base,records,summary.baseRelease,summary.hash),cat=catalogue();
 assert.deepEqual(base,before);assert.strictEqual(raw[0],base[0]);assert.equal(cat.items.length,8);assert.equal(cat.held.length,0);
 for(const p of cat.items.slice(1)){
  assert.ok(p.phone?.href.startsWith('tel:+60'));assert.ok(p.location);assert.equal(p.category,'CHILDCARE');assert.equal(registrationBadge(p,'2026-09-15'),null);
  assert.equal(p.admission.value,true);assert.equal(p.admission.placesAvailable,'unknown');
  const questions=enquiries(p,request(p),assess(p,request(p)));assert.ok(questions.some(q=>q.id==='capacity'));assert.ok(!questions.some(q=>q.id==='admission'));
 }
 const fresh=cat.items.find(p=>p.name.includes('Mont Kiara'));assert.equal(fresh.age,null);
 assert.equal(cat.items.find(p=>p.name.includes('Kinder Mindz')).age.min,12);
});

test('short-care rates stay hourly or explicitly unspecified and evening schedules are branch-specific',()=>{
 const cat=catalogue(),mont=cat.items.find(p=>p.name.includes('Mont Kiara')),dam=cat.items.find(p=>p.name.includes('Damansara Heights')),lull=cat.items.find(p=>p.name.includes('Lullabee'));
 assert.match(feeSummary(mont).label,/MYR 40–60 \/ hour/);assert.equal(monthlyFeeFrom(mont),null);
 assert.equal(lull.fees[0].basis,'unspecified');assert.match(lull.fees[0].conditions,/not a verified hourly rate/);
 const state=(p,end,date='2026-09-15')=>assess(p,{...request(p),end,date}).conditions.find(c=>c.id==='care').state;
 assert.equal(state(mont,'21:00'),'supported');assert.equal(state(mont,'23:00'),'conflict');assert.equal(state(dam,'21:00'),'conflict');
 assert.equal(state(mont,'20:00','2026-09-20'),'supported');assert.equal(state(dam,'16:00','2026-09-20'),'unknown');
});

test('added branches participate in nearby and dated searches inside the short-care 5 km cap',async()=>{
 const cat=catalogue(),api=createAPI({store:{catalog:async()=>cat},drivingRoutes:async(_pickup,ps)=>ps,reverseGeocode:null});
 for(const p of cat.items.slice(1)){
  const near=await api({action:'nearby',center:p.location,radius:999});assert.equal(near.radius,5);assert.ok(near.items.some(x=>x.id===p.id));
  const found=await api({action:'search',request:request(p)});assert.ok(found.items.some(x=>x.id===p.id));assert.ok(found.items.length<=10);
 }
});

test('tampered snapshots, identity collisions, wrong-region coordinates and fake registration fail closed',()=>{
 for(const change of [
  r=>{r.base_release='wrong'},r=>{r.provider.registration={authority:'KPM',record_number:'FAKE'}},
  r=>{r.provider.location={latitude:37.0902,longitude:-95.7129,source_url:r.provider.location.source_url}},
  r=>{r.provider.public_phone='bad'},r=>{r.provider.admission_review.scope='brand'},r=>{r.provider.age_min_months=10},
  r=>{r.provider.profile_sources[0].snapshotHash='bad'},r=>{r.provider.fees[0]={amount:120,basis:'hour',kind:'care',currency:'MYR',source_url:'https://unreviewed.example',conditions:'Unknown'}},
 ]){const altered=structuredClone(records);change(altered[0]);assert.throws(()=>applyProviderAdditions(base,altered,summary.baseRelease,additionsHash(altered)));}
 assert.throws(()=>applyProviderAdditions(base,[...records,records[0]],summary.baseRelease,additionsHash([...records,records[0]])));
 assert.throws(()=>applyProviderAdditions([records[0].provider],records,summary.baseRelease,summary.hash));
 assert.throws(()=>applyProviderAdditions(base,records,summary.baseRelease,'a'.repeat(64)));
});

test('new additions invalidate cached catalogues and incomplete publication never yields partial results',async()=>{
 let now=100000,active=false,missing=false;
 const manifest=()=>({release_id:summary.baseRelease,status:'ready',payload:JSON.stringify({provider_count:1,...active?{additions_release:summary.release,additions_hash:summary.hash,additions_count:records.length}:{}})});
 const store=createStore({now:()=>now,fetcher:async url=>({ok:true,json:async()=>url.includes('/current')?manifest():url.includes('web_provider_evidence')?{rows:(missing?records.slice(1):records).map(r=>({provider_id:r.provider_id,release_id:summary.release,payload:JSON.stringify(r)}))}:{rows:base.map(p=>({provider_id:p.id,release_id:summary.baseRelease,payload:JSON.stringify(p)}))}})});
 assert.equal((await store.catalog()).items.length,1);active=true;missing=true;now+=61000;
 await assert.rejects(()=>store.catalog(),e=>e.code==='SOURCE_INCOMPLETE');missing=false;
 const cat=await store.catalog();assert.equal(cat.items.length,8);assert.ok(cat.version.endsWith(summary.release));assert.ok(cat.items.every(p=>p.version===cat.version));
});
