import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {parsePublishedHours} from '../shared/published-hours.mjs';
import {applyHoursEvidence} from '../server/hours-overlay.mjs';
import {applyServicesEvidence} from '../server/services-overlay.mjs';
import {buildCatalog} from '../server/providers.mjs';
const root=resolve(import.meta.dirname,'../..'),data=resolve(root,'webapp-data'),dir=resolve(data,'hours-coverage-20260913');
const read=p=>JSON.parse(readFileSync(p)),file=resolve(dir,'prepared-hours.json');
const baselineFile=resolve(dir,'before-named-expansion.json');
if(!existsSync(baselineFile))writeFileSync(baselineFile,readFileSync(file));
const prepared=read(file),{baseRelease}=prepared.summary,original=read(baselineFile);
const raw=read(resolve(data,'prepared/catalog.json')).map(r=>JSON.parse(r.payload));
const services=read(resolve(data,'source/services-20260913/prepared-services.json'));
const catalogOf=(records,hash)=>buildCatalog(applyServicesEvidence(applyHoursEvidence(raw,records,baseRelease,hash),services.records,baseRelease,services.summary.hash),baseRelease);
const before=catalogOf(original.records,original.summary.hash);
const records=new Map(prepared.records.map(r=>[r.provider_id,r]));
const pages=read(resolve(data,'source/fees-hours-20260913/crawl.json')).rows;
const review=read(resolve(import.meta.dirname,'data/named-hours-review.json'));
const changes=[];
for(const r of review){
 const page=pages.find(p=>p.text_file===r.file&&p.status==='fetched');if(!page)throw Error('Missing source');
 const text=readFileSync(resolve(data,'source/fees-hours-20260913',r.file),'utf8').replaceAll('\r','');
 const compact=s=>s.replace(/\s+/g,' ').trim();
 for(const expected of [...r.address_terms,r.hours,r.closed_text].filter(Boolean))if(!compact(text).includes(compact(expected)))throw Error('Source changed: '+r.file+' / '+expected);
 const parsed=parsePublishedHours(r.hours+(r.closed_text?'\n'+r.closed_text:''));
 const weekly=parsed.windows.flatMap(w=>w.days.map(weekday=>({weekday,start_minute:w.start,end_minute:w.end})));
 if(!weekly.length)throw Error('Unparsed reviewed hours');
 for(const id of r.ids){
  const p=raw.find(p=>p.id===id);if(!p)throw Error('Unknown branch');
  const old=records.get(id);
  records.set(id,{provider_id:id,base_release:baseRelease,provider_name:p.official_name,weekly_windows:weekly,closed_weekdays:parsed.closedDays,source_url:page.source_url,source_kind:'provider_website',observed_on:page.retrieved_at,match:{status:'matched',basis:'Reviewed official website and compatible branch identity/address',address_terms:r.address_terms},notes:r.notes,evidence:[...(old?.evidence??[]),{source_url:page.source_url,sha256:page.sha256,original_hours:r.hours,closed_text:r.closed_text??null}],conflicting_weekdays:[]});changes.push(id);
 }
}
// Keep an official clock range even when the source does not name weekdays.
// It is visible evidence, but must not silently pass a selected-date care check.
const named=read(resolve(data,'source/named-fees-20260913/prepared-named-fees.json'));
for(const r of named.records){
 const evidence=r.match.evidence.find(e=>e.method==='official_2026_branch_name_and_reviewed_address');if(!evidence)continue;
 const old=records.get(r.provider_id),fact=r.fees.find(f=>f.source_kind==='official_operator_schedule');
 if(old)continue;
 records.set(r.provider_id,{provider_id:r.provider_id,base_release:baseRelease,provider_name:raw.find(p=>p.id===r.provider_id).official_name,weekly_windows:[],closed_weekdays:[],unscoped_windows:[{start_minute:450,end_minute:750}],source_url:fact.source_url,source_kind:'official_operator_schedule',observed_on:fact.source_retrieved_at,match:{status:'matched',...evidence},notes:'MAIWP 2026 preschool hours: 07:30–12:30. The timetable does not specify weekdays.',evidence:[evidence],conflicting_weekdays:[]});changes.push(r.provider_id);
}
const sorted=[...records.values()].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const hash=createHash('sha256').update(JSON.stringify(sorted)).digest('hex'),release='hours_'+hash.slice(0,24);
const after=catalogOf(sorted,hash);
const stats=c=>({providers:c.items.length,withWeeklyHours:c.items.filter(p=>p.businessHours.windows.length).length,withAnyPublishedHours:c.items.filter(p=>p.businessHours.windows.length||p.businessHours.publishedSchedule).length,knownOpenWeekdays:c.items.reduce((n,p)=>n+new Set(p.businessHours.windows.flatMap(w=>w.days)).size,0)});
const summary={...prepared.summary,preparedAt:new Date().toISOString(),release,hash,records:sorted.length,namedReviewed:changes.length,beforeExpansion:stats(before),afterExpansion:stats(after)};
writeFileSync(file,JSON.stringify({summary,records:sorted},null,2));console.log(JSON.stringify(summary));
