import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createStore} from '../server/appwrite-store.mjs';
const release='test-release';
const raw=Array.from({length:102},(_,i)=>({id:`branch-${String(i).padStart(3,'0')}`,display_name:`Branch ${i}`,official_name:`Branch ${i}`,state:'Selangor',district:'Petaling',registration:{authority:'KPM',source_url:'https://example.com',match_status:'third_party_code_claim'},data_limits:{},operating_hours:{},fees:[]}));
const profiles=raw.slice(0,101).map(p=>({schema:'public-provider-profile-v1',provider_id:p.id,short_care_published:null,programme_facts:['Published regular programme'],sources:[{url:'https://example.com'}]}));
const hash=records=>createHash('sha256').update(JSON.stringify([...records].sort((a,b)=>a.provider_id.localeCompare(b.provider_id)))).digest('hex');
const summary=records=>({provider_count:raw.length,profile_evidence_release:`profiles_${hash(records).slice(0,24)}`,profile_evidence_hash:hash(records),profile_evidence_count:records.length});
function harness(){
  let data=structuredClone(profiles),payload=summary(data),time=100000,calls=[],missing=false,tamper=false;
  const store=createStore({now:()=>time,fetcher:async url=>{
    calls.push(url);let value;
    if(url.includes('/current'))value={status:'ready',release_id:release,payload:JSON.stringify(payload)};
    else{
      const queries=new URL(url).searchParams.getAll('queries[]').map(JSON.parse),offset=queries.find(q=>q.method==='offset')?.values[0]??0;
      const evidence=url.includes('/web_provider_evidence/');
      const values=evidence?(missing?data.slice(0,100):data):raw;
      value={rows:values.slice(offset,offset+100).map((p,i)=>({$id:`${offset+i}`,provider_id:evidence?p.provider_id:p.id,release_id:evidence?payload.profile_evidence_release:release,payload:JSON.stringify(tamper&&evidence?{...p,short_care_published:true}:p)}))};
    }
    return{ok:true,json:async()=>value};
  }});
  return{store,calls,advance(){time+=61000;},change(){data=data.slice(1);payload=summary(data);},missing(){missing=true;},tamper(){tamper=true;}};
}
test('store reads all 101 membership rows across pages and invalidates cache on membership-only changes',async()=>{
  const h=harness(),a=await h.store.catalog();
  assert.equal(a.items.length,102);assert.equal(a.shortCareIds.length,101);
  assert.equal(h.calls.filter(x=>x.includes('/web_provider_evidence/')).length,2);
  assert.ok(a.items.every(p=>p.admission.value!==true));
  const count=h.calls.length;assert.equal(await h.store.catalog(),a);assert.equal(h.calls.length,count);
  h.change();h.advance();const b=await h.store.catalog();
  assert.equal(b.shortCareIds.length,100);assert.notEqual(a.version,b.version);assert.ok(!b.shortCareIds.includes(profiles[0].provider_id));
});
test('partial or modified membership cannot silently broaden the short-care pool',async()=>{
  const partial=harness();partial.missing();await assert.rejects(partial.store.catalog(),e=>e.code==='SOURCE_INCOMPLETE');
  const changed=harness();changed.tamper();await assert.rejects(changed.store.catalog(),e=>e.code==='SOURCE_INVALID');
});
