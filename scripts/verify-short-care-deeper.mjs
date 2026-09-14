import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createStore} from '../server/appwrite-store.mjs';
import {registrationBadge} from '../shared/registration.mjs';
const out=resolve(import.meta.dirname,'../../webapp-data/source/temporary-care-deeper-20260915');
const read=name=>JSON.parse(readFileSync(resolve(out,name)));
const additions=read('prepared-additions.json'),admissions=read('prepared-admissions.json');
const before=read('live-before.json'),after=await createStore().catalog();
const updatedId='provider_7617dd8dc6f837b9d9f170a9465';
const stable=p=>{const c=structuredClone(p);delete c.version;return JSON.parse(JSON.stringify(c));};
for(const p of before.items){
 const a=stable(after.items.find(x=>x.id===p.id)),b=stable(p);
 if(p.id===updatedId){delete a.admission;delete b.admission;delete a.sources;delete b.sources;}
 assert.deepEqual(a,b,'Unrelated facts changed: '+p.id);
}
assert.deepEqual(after.held,before.held);
assert.equal(after.items.length,before.items.length+additions.summary.added);
assert.ok(after.version.includes(admissions.summary.release));assert.ok(after.version.endsWith(additions.summary.release));
const targets=after.items.filter(p=>p.id===updatedId||!before.items.some(x=>x.id===p.id));
const endpoint='https://sgp.cloud.appwrite.io/v1/functions/web-provider-query/executions';
async function query(body){
 const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json','X-Appwrite-Project':'6a916a6c0030a70a9d75',Origin:'https://equalpathcare.me'},body:JSON.stringify({body:JSON.stringify({mode:'live',...body}),async:false,method:'POST',path:'/'}),signal:AbortSignal.timeout(90000)});
 assert.ok(response.ok);const execution=await response.json();assert.equal(execution.responseStatusCode,200);return JSON.parse(execution.responseBody);
}
const health=await query({action:'health'});assert.equal(health.version,after.version);assert.equal(health.available,after.items.length);
const checked=[];
for(const p of targets){
 assert.equal(p.admission.value,true);assert.ok(p.phone);assert.ok(p.admission.requirements.length);
 if(p.id!==updatedId)assert.equal(registrationBadge(p,'2026-09-15'),null);
 const request={pickup:{label:p.address,lat:p.location.lat,lng:p.location.lng},date:'2026-09-15',deadline:'13:00',end:'16:00',age:'',transport:'self',radius:10,includeConflicts:true,includeUnknown:true,sort:'distance'};
 const result=await query({action:'search',features:['area-fees-v1'],request}),entry=result.items.find(x=>x.id===p.id);
 assert.ok(entry,'Missing from nearby page: '+p.name);assert.equal(entry.admission.value,true);
 assert.equal(entry.fit.conditions.find(c=>c.id==='admission').state,'unknown');
 assert.equal(entry.fit.conditions.find(c=>c.id==='admission').question,p.admission.question);
 assert.equal(entry.admission.placesAvailable,'unknown');assert.deepEqual(entry.fees,JSON.parse(JSON.stringify(p.fees)));
 assert.equal(result.pageSize,20);assert.ok(result.items.length<=20);
 checked.push({id:p.id,name:p.name,phone:p.phone.display,feeEntries:p.fees.length,servicePublished:true,visitRequirementsRetained:true,visibleOnNearbyPage:true});
 console.log(JSON.stringify({checked:checked.length,total:targets.length,name:p.name}));
}
writeFileSync(resolve(out,'live-after.json'),JSON.stringify(after,null,2));
const result={verifiedAt:new Date().toISOString(),additionsRelease:additions.summary.release,admissionsRelease:admissions.summary.release,before:before.items.length,after:after.items.length,added:additions.summary.added,existingServiceUpdates:1,publishedTemporaryCareBefore:before.items.filter(p=>p.admission.value===true).length,publishedTemporaryCareAfter:after.items.filter(p=>p.admission.value===true).length,unchangedProviders:before.items.length-1,existingOtherFieldsPreserved:true,heldUnchanged:true,publicBackend:true,checked};
writeFileSync(resolve(out,'verification.json'),JSON.stringify(result,null,2));
writeFileSync(resolve(import.meta.dirname,'../evidence/short-care-deeper-publication.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify({...result,checked:checked.length}));
