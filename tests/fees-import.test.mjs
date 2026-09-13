import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {directoryFeeFacts} from '../shared/directory-fees.mjs';
import {feeSummary} from '../shared/result-summary.mjs';
import {applyFeesEvidence} from '../server/fees-overlay.mjs';
import {normalizeProvider} from '../server/providers.mjs';
import {createStore} from '../server/appwrite-store.mjs';
const url='https://www.carischools.com/school/test',at='2026-09-13T09:00:00Z';
const raw={id:'test',official_name:'Test',state:'Selangor',district:'Petaling',registration:{authority:'KPM',record_number:'B5A1234',source_url:url,source_retrieved_at:at},operating_hours:{},fees:[]};
const school={is_claimed:true,fee_min:80,fee_max:490,fee_programs:[{program:'Half day',amount:350},{program:'Full day',amount:490},{program:'Meal plan',amount:80}],registration_fee:100,annual_fee:300,fee_updated_at:'2026-09-01T00:00:00Z'};
const record={provider_id:'test',base_release:'base',match:{status:'matched'},replaces_sources:[url],fees:directoryFeeFacts(school,url,at)};
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
test('empty structured fees never pick up a price from an input placeholder or registration number',()=>{
  assert.deepEqual(directoryFeeFacts({school_code:'W5L0048',fee_min:null,fee_max:null,monthly_fee:null,html:'<input placeholder="450">'},url,at),[]);
});
test('programme prices, meals, registration and annual fees retain separate bases and provenance',()=>{
  assert.equal(record.fees.length,5);
  assert.equal(record.fees.find(f=>f.kind==='meal').amount,80);
  assert.equal(record.fees.find(f=>f.kind==='registration').basis,'one_off');
  assert.equal(record.fees.find(f=>f.kind==='annual').basis,'year');
  assert.equal(feeSummary({fees:record.fees}).label,'MYR 350–490 / month');
  const normal=normalizeProvider(applyFeesEvidence([raw],[record],'base',hash([record]))[0],'base').provider;
  assert.equal(normal.registration.official,false);assert.equal(normal.registration.number,'B5A1234');
  assert.equal(normal.fees[0].source.retrievedAt,at);assert.equal(normal.fees[0].source.sourceDate,school.fee_updated_at);
  assert.equal(normal.fees[0].source.label,'School-reported fees on CariSchool');
  assert.equal(normal.feeRule,null);
});
test('directory estimates retain their billing period and estimates label; zero registration is not free care',()=>{
  const fees=directoryFeeFacts({monthly_fee:1500,billing_period:'term'},url,at);
  assert.equal(fees[0].basis,'term');assert.equal(feeSummary({fees}).label,'Est. MYR 1,500 / term');
  const extra=directoryFeeFacts({registration_fee:0},url,at);
  assert.equal(extra[0].amount,0);assert.match(feeSummary({fees:extra}).label,/^Extras:/);
  assert.deepEqual(directoryFeeFacts({fee_min:500,fee_max:100},url,at),[]);
});
test('fee overlay refreshes only named sources and rejects changed identities, hashes, amounts and links',()=>{
  const other={source_url:'https://example.com/fees',amount:10};
  const p=applyFeesEvidence([{...raw,fees:[{source_url:url,amount:999},other]}],[record],'base',hash([record]))[0];
  assert.equal(p.fees[0],other);assert.equal(p.fees.some(f=>f.amount===999),false);
  assert.equal(raw.fees.length,0);
  assert.throws(()=>applyFeesEvidence([raw],[record],'base','0'.repeat(64)));
  for(const rows of [[record,record],[{...record,provider_id:'wrong'}],[{...record,base_release:'wrong'}],[{...record,fees:[{...record.fees[0],amount:-1}]}],[{...record,fees:[{...record.fees[0],source_url:'javascript:alert(1)'}]}],[{...record,fees:[{...record.fees[0],fee_document_url:'javascript:alert(1)'}]}]])assert.throws(()=>applyFeesEvidence([raw],rows,'base',hash(rows)));
});
test('a fee release refreshes the cached catalog; incomplete or tampered evidence never activates',async()=>{
  const release='fees_'+hash([record]).slice(0,24),summary={provider_count:1,fees_release:release,fees_hash:hash([record]),fees_count:1};
  let now=100000,manifest={status:'ready',release_id:'base',payload:JSON.stringify({provider_count:1})},missing=false,tampered=false;
  const s=createStore({now:()=>now,fetcher:async request=>({ok:true,json:async()=>request.includes('/current')?manifest:request.includes('web_provider_evidence')?{rows:missing?[]:[{provider_id:'test',release_id:release,payload:JSON.stringify(tampered?{...record,fees:[]}:record)}]}:{rows:[{provider_id:'test',release_id:'base',payload:JSON.stringify(raw)}]}})});
  assert.equal((await s.catalog()).items[0].fees.length,0);
  manifest={...manifest,payload:JSON.stringify(summary)};now+=61000;missing=true;
  await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INCOMPLETE');
  missing=false;tampered=true;await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INVALID');
  tampered=false;const c=await s.catalog();assert.equal(c.items[0].fees.length,5);assert.ok(c.version.endsWith(release));assert.equal(c.items[0].version,c.version);
});
