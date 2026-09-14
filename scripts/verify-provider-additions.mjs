import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createStore} from '../server/appwrite-store.mjs';
import {registrationBadge} from '../shared/registration.mjs';
const out=resolve(import.meta.dirname,'../../webapp-data/source/temporary-care-expansion-20260915');
const {summary,records}=JSON.parse(readFileSync(resolve(out,'prepared-additions.json')));
const before=JSON.parse(readFileSync(resolve(out,'live-before.json'))),after=await createStore().catalog();
const stable=p=>{const copy=structuredClone(p);delete copy.version;return JSON.parse(JSON.stringify(copy));};
for(const p of before.items)assert.deepEqual(stable(after.items.find(x=>x.id===p.id)),stable(p),'Existing provider changed: '+p.id);
assert.deepEqual(after.held,before.held);assert.equal(after.items.length,before.items.length+records.length);
assert.ok(after.version.endsWith(summary.release));
const endpoint='https://sgp.cloud.appwrite.io/v1/functions/web-provider-query/executions';
async function query(body){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Appwrite-Project':'6a916a6c0030a70a9d75',Origin:'https://equalpathcare.me'},body:JSON.stringify({body:JSON.stringify({mode:'live',...body}),async:false,method:'POST',path:'/'}),signal:AbortSignal.timeout(90000)});
 assert.ok(response.ok);const execution=await response.json();assert.equal(execution.responseStatusCode,200);return JSON.parse(execution.responseBody);
}
const health=await query({action:'health'});assert.equal(health.version,after.version);assert.equal(health.available,after.items.length);
const checked=[];
for(const r of records){
 const p=after.items.find(p=>p.id===r.provider_id);assert.equal(p.admission.value,true);assert.ok(p.phone);assert.equal(registrationBadge(p,'2026-09-15'),null);
 const request={pickup:{label:p.address,lat:p.location.lat,lng:p.location.lng},date:'2026-09-15',deadline:'13:00',end:'16:00',age:'',transport:'self',radius:10,includeConflicts:true,includeUnknown:true,sort:'distance'};
 const search=await query({action:'search',request}),entry=search.items.find(x=>x.id===p.id);
 assert.ok(entry,'New provider missing from nearby page');assert.equal(entry.fit.conditions.find(c=>c.id==='admission').state,'supported');assert.equal(entry.admission.placesAvailable,'unknown');assert.deepEqual(entry.fees,JSON.parse(JSON.stringify(p.fees)));assert.equal(search.pageSize,20);assert.ok(search.items.length<=20);
 checked.push({id:p.id,name:p.name,phone:p.phone.display,feeEntries:p.fees.length,admission:'supported',visibleOnNearbyPage:true,registrationBadge:false});
 console.log(JSON.stringify({checked:checked.length,total:records.length,name:p.name}));
}
writeFileSync(resolve(out,'live-after.json'),JSON.stringify(after,null,2));
const result={verifiedAt:new Date().toISOString(),release:summary.release,before:before.items.length,after:after.items.length,added:records.length,publishedTemporaryCareBefore:before.items.filter(p=>p.admission.value===true).length,publishedTemporaryCareAfter:after.items.filter(p=>p.admission.value===true).length,existingProvidersUnchanged:before.items.length,heldUnchanged:true,publicBackend:true,checked};
writeFileSync(resolve(out,'verification.json'),JSON.stringify(result,null,2));
writeFileSync(resolve(import.meta.dirname,'../evidence/provider-additions-publication.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checked:checked.length}));
