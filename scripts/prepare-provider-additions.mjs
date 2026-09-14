import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {applyProviderAdditions,additionsHash} from '../server/provider-additions.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'webapp-data/source/temporary-care-expansion-20260915');
const raw=JSON.parse(readFileSync(resolve(out,'raw-before.json'))),manifest=JSON.parse(readFileSync(resolve(out,'manifest-before.json')));
const review=JSON.parse(readFileSync(resolve(root,'webapp/data/short-care-additions-20260915.json')));
const captures=['crawl.json','crawl-extra.json','crawl-maps.json'].flatMap(f=>JSON.parse(readFileSync(resolve(out,f))));
const hash=value=>createHash('sha256').update(value).digest('hex');
const source=key=>{
 const c=captures.find(c=>c.key===key && c.status===200),s=review.sources[key];
 if(!c||!s||hash(readFileSync(resolve(out,key+'.html')))!==c.sha256)throw Error('Missing/changed reviewed source '+key);
 return {...s,url:c.url,retrievedAt:c.retrievedAt,sourceDate:s.sourceDate??null,snapshotHash:c.sha256};
};
const records=review.providers.map(r=>{
 const id='provider_'+hash('short-care-branch:'+r.key).slice(0,27);
 const keys=[r.profileSource,r.contactSource,r.locationSource,...r.admissionSources,r.age?.source,r.hoursSource,...r.fees.map(f=>f.source)].filter(Boolean);
 const sources=[...new Set(keys)].map(source),contact=source(r.contactSource),hours=r.hoursSource?source(r.hoursSource):null;
 const admission={provider_id:id,base_release:manifest.release_id,match:{status:'matched',catalogue_name:r.name,basis:r.identityReview},status:'published',scope:'branch',service_types:r.serviceTypes,wording:r.wording,question:r.question,sources:r.admissionSources.map(source)};
 const provider={id,official_name:r.name,display_name:r.name,address:r.address,state:r.state,district:r.district,registration:null,public_profile:source(r.profileSource),profile_sources:sources,public_profile_notes:r.notes,
  location:{latitude:r.latitude,longitude:r.longitude,source_url:source(r.locationSource).url},website:r.website,public_phone:r.phone,contact_source:{source_url:contact.url,retrieved_at:contact.retrievedAt},
  admission_review:admission,age_min_months:r.age?.min??null,age_max_months:r.age?.max??null,age_source:r.age?{raw:r.age.raw,source_url:source(r.age.source).url,retrieved_at:source(r.age.source).retrievedAt}:null,
  care_windows:r.careWindows.map(w=>({...w,source:hours})),
  operating_hours:{source_url:hours?.url??null,source_kind:hours?.kind??null,source_retrieved_at:hours?.retrievedAt??null,weekly_windows:r.hours.flatMap(w=>w.days.map(weekday=>({weekday,start_minute:w.start,end_minute:w.end}))),closed_weekdays:r.closedDays,notes:r.hoursNote},
  fees:r.fees.map(f=>({amount:f.amount,currency:'MYR',basis:f.basis,kind:'care',programme:f.programme,conditions:f.conditions,source_url:source(f.source).url,source_kind:source(f.source).kind,source_retrieved_at:source(f.source).retrievedAt,verification:'provider_published'}))};
 return {provider_id:id,base_release:manifest.release_id,identity_review:r.identityReview,provider};
}).sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const digest=additionsHash(records);
applyProviderAdditions(raw,records,manifest.release_id,digest);
const summary={baseRelease:manifest.release_id,release:'additions_'+digest.slice(0,24),hash:digest,count:records.length,published:records.length,withPhone:records.filter(r=>r.provider.public_phone).length,withFees:records.filter(r=>r.provider.fees.length).length,withHours:records.filter(r=>r.provider.care_windows.length||r.provider.operating_hours.weekly_windows.length).length,preparedAt:new Date().toISOString(),unmergedLeads:review.unmergedLeads};
writeFileSync(resolve(out,'prepared-additions.json'),JSON.stringify({summary,records},null,2));
// Exact, source-attributed public records are reviewable and reproduce the import offline.
writeFileSync(resolve(root,'webapp/data/prepared-short-care-additions-20260915.json'),JSON.stringify({summary,records},null,2));
console.log(JSON.stringify({...summary,unmergedLeads:summary.unmergedLeads.length}));
