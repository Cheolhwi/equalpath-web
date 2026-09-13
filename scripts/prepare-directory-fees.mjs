import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {directoryFeeFacts} from '../shared/directory-fees.mjs';
import {buildCatalog,safeURL} from '../server/providers.mjs';
import {applyFeesEvidence} from '../server/fees-overlay.mjs';
import {areaFeeReferences} from '../shared/area-fees.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'webapp-data/source/directory-fees-20260913');
const rows=JSON.parse(readFileSync(resolve(out,'rows.json'))),manifest=JSON.parse(readFileSync(resolve(out,'manifest.json')));
if(createHash('sha256').update(JSON.stringify(rows)).digest('hex')!==manifest.sha256)throw Error('Source hash mismatch');
const catalog=JSON.parse(readFileSync(resolve(root,'webapp-data/prepared/catalog.json'))),raw=catalog.map(r=>JSON.parse(r.payload));
const baseRelease=catalog[0].release_id;
if(catalog.some(r=>r.release_id!==baseRelease))throw Error('Mixed base releases');
const visible=new Set(buildCatalog(raw,baseRelease).items.map(p=>p.id));
const byURL=new Map();
for(const p of raw.filter(p=>visible.has(p.id))){
  for(const url of new Set([p.registration?.source_url,p.operating_hours?.source_url,p.contact_source?.source_url].filter(Boolean))){
    if(!byURL.has(url))byURL.set(url,[]);byURL.get(url).push(p);
  }
}
const clean=s=>String(s??'').normalize('NFKC').toUpperCase().replace(/[^A-Z0-9]/g,'');
const records=new Map(),held=[];
for(const row of rows){
  const url='https://www.carischools.com/school/'+row.slug;
  const fees=directoryFeeFacts(row,url,manifest.retrieved_at);
  if(!fees.length)continue;
  const matches=(byURL.get(url)??[]).filter(p=>{
    if(p.registration.authority==='KPM')return !!row.school_code&&clean(row.school_code)===clean(p.registration.record_number)&&clean(row.name)===clean(p.official_name);
    return (row.jkm_registration_no&&clean(row.jkm_registration_no)===clean(p.registration.record_number))||clean(row.name)===clean(p.official_name);
  });
  if(matches.length!==1){held.push({source_url:url,name:row.name,reason:matches.length?'ambiguous_match':'no_verified_catalog_match'});continue;}
  const p=matches[0];
  for(const f of fees){f.original_fee_source_url=safeURL(f.original_fee_source_url);f.fee_document_url=safeURL(f.fee_document_url);}
  records.set(p.id,{provider_id:p.id,base_release:baseRelease,match:{status:'matched',method:'exact_source_profile_and_registration_or_name',source_id:row.id,name:row.name,school_code:row.school_code,jkm_registration_no:row.jkm_registration_no},replaces_sources:[url],fees});
}
// Persist the three previously reviewed website tariffs that had only been bundled with the API.
const reviewed=JSON.parse(readFileSync(resolve(root,'webapp/server/data/reviewed-fees.json')));
for(const row of reviewed.records){
  if(!visible.has(row.id))continue;
  const record=records.get(row.id)??{provider_id:row.id,base_release:baseRelease,match:{status:'matched',method:'reviewed_provider_website_branch'},replaces_sources:[],fees:[]};
  for(const f of row.fees){
    const kind=/overtime/i.test(f.conditions)?'late_pickup':/registration/i.test(f.conditions)?'registration':f.basis==='deposit'?'deposit':'programme';
    record.fees.push({amount:f.amount??null,min:f.min??null,max:f.max??null,currency:'MYR',basis:f.basis,kind,conditions:f.conditions,source_url:f.source.url,source_retrieved_at:f.source.retrievedAt,source_updated_at:f.source.sourceDate??null,source_kind:'provider_website',verification:'provider_published',original_fee_source_url:null,fee_document_url:null});
    record.replaces_sources.push(f.source.url);
  }
  record.replaces_sources=[...new Set(record.replaces_sources)];records.set(row.id,record);
}
const namedFile=resolve(root,'webapp-data/source/named-fees-20260913/prepared-named-fees.json');
let namedSummary=null;
if(existsSync(namedFile)){
  const named=JSON.parse(readFileSync(namedFile));namedSummary=named.summary;
  if(named.summary.baseRelease!==baseRelease)throw Error('Named fee base release mismatch');
  for(const row of named.records){
    const old=records.get(row.provider_id);
    if(!old){records.set(row.provider_id,row);continue;}
    old.fees.push(...row.fees);old.replaces_sources=[...new Set([...old.replaces_sources,...row.replaces_sources])];
    old.match.additional_evidence=row.match.evidence;
  }
}
let sorted=[...records.values()].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const actualHash=createHash('sha256').update(JSON.stringify(sorted)).digest('hex');
const publishedCatalog=buildCatalog(applyFeesEvidence(raw,sorted,baseRelease,actualHash),baseRelease);
const evidenceAsOf=publishedCatalog.items.flatMap(p=>p.fees.map(f=>f.source?.retrievedAt)).filter(Boolean).sort().at(-1)??manifest.retrieved_at;
const references=areaFeeReferences(publishedCatalog.items,evidenceAsOf);
for(const {provider_id,fee} of references.references){
  records.set(provider_id,{provider_id,base_release:baseRelease,match:{status:'matched',method:'existing_provider_id_with_area_budget_reference'},replaces_sources:[],fees:[fee]});
}
sorted=[...records.values()].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const hash=createHash('sha256').update(JSON.stringify(sorted)).digest('hex'),release='fees_'+hash.slice(0,24);
const merged=applyFeesEvidence(raw,sorted,baseRelease,hash),before=buildCatalog(raw,baseRelease),after=buildCatalog(merged,baseRelease);
const summary={baseRelease,release,hash,sourceRows:rows.length,sourceWithFees:rows.filter(r=>directoryFeeFacts(r,'https://www.carischools.com/school/'+r.slug,manifest.retrieved_at).length).length,records:sorted.length,feeFacts:sorted.reduce((n,r)=>n+r.fees.length,0),newlyPriced:after.items.filter(p=>p.fees.length&&!before.items.find(x=>x.id===p.id)?.fees.length).length,pricedBefore:before.items.filter(p=>p.fees.length).length,pricedAfter:after.items.filter(p=>p.fees.length).length,held:held.length,collectedAt:manifest.retrieved_at};
summary.namedSources=namedSummary;
summary.publishedPricedProviders=publishedCatalog.items.filter(p=>p.fees.length).length;
summary.areaReferenceProviders=references.references.length;
summary.referenceSampleProviders=references.samples.length;
summary.storedProvidersWithFees=merged.filter(p=>p.fees?.length).length;
writeFileSync(resolve(out,'prepared-fees.json'),JSON.stringify({summary,records:sorted},null,2));writeFileSync(resolve(out,'unmatched.json'),JSON.stringify(held,null,2));console.log(JSON.stringify(summary));
