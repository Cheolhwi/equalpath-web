import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {applyProviderAdditions,additionsHash} from '../server/provider-additions.mjs';
import {applyAdmissionsEvidence} from '../server/admissions-overlay.mjs';
import {buildCatalog} from '../server/providers.mjs';
import {assess,enquiries} from '../shared/conditions.mjs';
import {enquiryView} from '../shared/enquiry-view.mjs';
import {monthlyFeeFrom,feeSummary} from '../shared/result-summary.mjs';
import {registrationBadge} from '../shared/registration.mjs';
const read=name=>JSON.parse(readFileSync(new URL('../data/'+name,import.meta.url)));
const prior=read('prepared-short-care-additions-20260915.json');
const additions=read('prepared-short-care-deeper-20260915.json');
const admissions=read('prepared-short-care-admissions-deeper-20260915.json');
const providers=buildCatalog(applyProviderAdditions([],additions.records,additions.summary.baseRelease,additions.summary.hash),additions.summary.baseRelease).items;
const newProviders=providers.filter(p=>!prior.records.some(r=>r.provider_id===p.id));
const request=p=>({pickup:{label:p.address,lat:p.location.lat,lng:p.location.lng},date:'2026-09-15',deadline:'13:00',end:'16:00',age:'5',transport:'self'});

test('cumulative expansion preserves all seven earlier additions and adds six distinct contactable locations',()=>{
 assert.equal(newProviders.length,6);
 for(const r of prior.records)assert.deepEqual(additions.records.find(x=>x.provider_id===r.provider_id),r);
 for(const p of newProviders){
  assert.equal(p.admission.value,true);assert.ok(p.phone?.href);assert.ok(p.location);
  assert.equal(registrationBadge(p,'2026-09-15'),null);
 }
 assert.equal(providers.filter(p=>p.name.includes('We Rock')).length,1);
 assert.equal(providers.filter(p=>p.name.includes('Limoncito')).length,1);
});

test('published restricted services retain their practical questions, even though the service itself exists',()=>{
 for(const p of newProviders){
  const r=request(p),fit=assess(p,r),condition=fit.conditions.find(c=>c.id==='admission');
  assert.equal(condition.state,'unknown');assert.equal(condition.reason,p.admission.wording);
  const qs=enquiries(p,r,fit);assert.ok(qs.some(q=>q.id==='admission'));assert.ok(qs.some(q=>q.id==='capacity'));
  const view=enquiryView({...p,fit,enquiries:qs},r).find(q=>q.id==='admission');
  // The readable question may be simplified; source wording and every service
  // restriction remain in the linked check and explanation.
  assert.equal(view.check.question,p.admission.question);
  assert.ok(view.text.endsWith('?'));assert.equal(view.why,p.admission.requirements.join(' '));
  assert.equal(p.admission.sameDayAcceptance,'unknown');
 }
});

test('daily and hourly fees are not monthly prices and programme hours are not extended to general venue opening times',()=>{
 const play=providers.find(p=>p.name.includes('Jalan Mesra'));
 assert.deepEqual(play.fees.map(f=>f.amount),[200,180,160]);
 assert.ok(play.fees.every(f=>f.basis==='day'));assert.equal(monthlyFeeFrom(play),null);assert.match(feeSummary(play).label,/160–200.*day/);
 const limon=providers.find(p=>p.name.includes('Limoncito'));
 assert.equal(limon.fees[0].amount,80);assert.equal(limon.fees[0].basis,'hour');
 assert.equal(assess(limon,{...request(limon),end:'17:00'}).conditions.find(c=>c.id==='care').state,'conflict');
 const toy=providers.find(p=>p.name.includes('TOY8'));
 assert.equal(toy.age,null);assert.deepEqual(toy.fees,[]);
 assert.equal(assess(toy,request(toy)).conditions.find(c=>c.id==='care').state,'unknown');
});

test('the existing KleverCape entry gets evidence rather than a duplicate; malformed requirements are rejected',()=>{
 const row=admissions.records.find(r=>r.provider_id==='provider_7617dd8dc6f837b9d9f170a9465');
 assert.ok(row);assert.equal(row.status,'published');
 assert.ok(!additions.records.some(r=>/klever/i.test(r.provider.official_name)));
 const raw=[{id:row.provider_id,official_name:row.match.catalogue_name}];
 assert.equal(applyAdmissionsEvidence(raw,[row],row.base_release,additionsHash([row]))[0].admission_review,row);
 for(const requirements of ['one day',[{}],[''],Array(7).fill('restriction')]){
  const bad={...row,requirements};
  assert.throws(()=>applyAdmissionsEvidence(raw,[bad],row.base_release,additionsHash([bad])));
 }
});
