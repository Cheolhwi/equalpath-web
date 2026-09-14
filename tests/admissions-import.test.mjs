import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { applyAdmissionsEvidence } from '../server/admissions-overlay.mjs';
import { normalizeProvider } from '../server/providers.mjs';
import { createStore } from '../server/appwrite-store.mjs';
import { assess, enquiries } from '../shared/conditions.mjs';
import { demoPickup } from '../server/fixtures.mjs';

const hash = rows => createHash('sha256').update(JSON.stringify([...rows].sort((a,b)=>a.provider_id.localeCompare(b.provider_id)))).digest('hex');
const raw = {id:'test', official_name:'Test', display_name:'Test branch', state:'Selangor', district:'Petaling', registration:{authority:'KPM',source_url:'https://example.com'}, operating_hours:{}, fees:[]};
const record = {provider_id:'test', base_release:'test-release', match:{status:'matched',catalogue_name:'Test',basis:'Same branch name and street address'}, status:'published',scope:'branch',service_types:['hourly','drop_in'],wording:'Hourly drop-in care is advertised. Ask about notice and the minimum stay.',question:'Can a new child attend for two hours on this date?',sources:[{url:'https://example.com/short-care',label:'Branch care options',kind:'provider_website',retrievedAt:'2026-09-15T00:00:00Z',sourceDate:null,snapshotHash:'a'.repeat(64)}]};
const request = {pickup:demoPickup,date:'2026-09-15',deadline:'12:00',end:'14:00',age:'4',transport:'self'};
const normalize = r => normalizeProvider(applyAdmissionsEvidence([raw],[r],'test-release',hash([r]))[0],'test-release').provider;

test('published short-care evidence reaches conditions and keeps capacity unresolved', () => {
  const p=normalize(record),fit=assess(p,request);
  assert.equal(fit.conditions.find(c=>c.id==='admission').state,'supported');
  assert.equal(fit.conditions.find(c=>c.id==='admission').source.url,record.sources[0].url);
  assert.equal(p.admission.placesAvailable,'unknown');
  assert.equal(p.admission.sameDayAcceptance,'unknown');
  assert.ok(p.sources.some(s=>s.url===record.sources[0].url));
  const questions=enquiries(p,request,fit);
  assert.ok(questions.some(q=>q.id==='capacity' && q.reason==='availability'));
  assert.ok(!questions.some(q=>q.id==='admission'));
  assert.equal(raw.admission_review,undefined);
});

test('brand-only programmes and admissions pauses remain questions with the exact reason and source', () => {
  for (const [status,scope] of [['programme_only','brand'],['paused','branch']]) {
    const p=normalize({...record,status,scope}),fit=assess(p,request);
    const c=fit.conditions.find(c=>c.id==='admission');
    assert.equal(c.state,'unknown');
    assert.equal(c.reason,record.wording);
    assert.equal(c.question,record.question);
    assert.ok(enquiries(p,request,fit).some(q=>q.text===record.question));
  }
});

test('unmatched branches, brand claims marked as confirmed, unsafe sources and changed snapshots fail closed', () => {
  for(const changed of [
    {...record,provider_id:'other'}, {...record,base_release:'other'},
    {...record,match:{...record.match,catalogue_name:'Different branch'}},
    {...record,match:{...record.match,status:'unresolved'}},
    {...record,scope:'brand'}, {...record,sources:[]},
    {...record,sources:[{...record.sources[0],url:'javascript:alert(1)'}]},
    {...record,sources:[{...record.sources[0],retrievedAt:'invalid'}]},
  ]) assert.throws(()=>applyAdmissionsEvidence([raw],[changed],'test-release',hash([changed])));
  assert.throws(()=>applyAdmissionsEvidence([raw],[record,record],'test-release',hash([record,record])));
  assert.throws(()=>applyAdmissionsEvidence([raw],[{...record,status:'not_offered'}],'test-release',hash([record])));
});

test('admission snapshot publication refreshes existing cache and rejects missing/tampered evidence', async () => {
  const digest=hash([record]),release='admissions_'+digest.slice(0,24);
  const summary={provider_count:1,admissions_release:release,admissions_hash:digest,admissions_count:1};
  const manifest={status:'ready',release_id:'test-release',payload:JSON.stringify(summary)};
  const envelope={provider_id:'test',release_id:'test-release',payload:JSON.stringify(raw)};
  const evidence={provider_id:'test',release_id:release,payload:JSON.stringify(record)};
  let active={...manifest,payload:JSON.stringify({provider_count:1})},time=100000,missing=false,tampered=false;
  const store=createStore({now:()=>time,fetcher:async url=>({ok:true,json:async()=>url.includes('/current')?active:url.includes('web_provider_evidence')?{rows:missing?[]:[tampered?{...evidence,provider_id:'other'}:evidence]}:{rows:[envelope]}})});
  const before=await store.catalog();assert.equal(before.items[0].admission.value,null);
  active=manifest;time+=61000;missing=true;
  await assert.rejects(()=>store.catalog(),e=>e.code==='SOURCE_INCOMPLETE');
  missing=false;tampered=true;
  await assert.rejects(()=>store.catalog(),e=>e.code==='SOURCE_INVALID');
  tampered=false;const after=await store.catalog();
  assert.equal(after.items[0].admission.value,true);
  assert.ok(after.version.endsWith(release));assert.notEqual(after.hash,before.hash);
  assert.equal(after.items[0].version,after.version);
});
