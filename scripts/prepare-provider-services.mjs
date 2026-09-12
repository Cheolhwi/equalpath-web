import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assessMatch,normalise} from '../../webapp-data/scripts/google-crawler/core.mjs';
import {whatsappLink} from '../shared/whatsapp.mjs';
import {parsePublishedHours} from '../shared/published-hours.mjs';
import {applyHoursEvidence} from '../server/hours-overlay.mjs';
import {applyServicesEvidence} from '../server/services-overlay.mjs';
import {buildCatalog} from '../server/providers.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'webapp-data/source/services-20260913');
const load=p=>JSON.parse(readFileSync(resolve(root,p)));
const old=load('webapp-data/hours-coverage-20260913/prepared-hours.json'),baseRelease=old.summary.baseRelease;
const raw=applyHoursEvidence(load('webapp-data/prepared/catalog.json').map(r=>JSON.parse(r.payload)),old.records,baseRelease,old.summary.hash);
const baseline=buildCatalog(raw,baseRelease),usable=new Set(baseline.items.map(p=>p.id));
const byId=new Map(raw.filter(p=>usable.has(p.id)).map(p=>[p.id,p]));
const crawl=load('webapp-data/source/services-20260913/crawl.json');
const records=[],held=[],seen=new Set();
const units=s=>[...String(s??'').toLowerCase().matchAll(/\b([a-z]{1,3}\d?)-(\d+[a-z]?)(?:-(\d+))?\b/g)].map(m=>[m[1],m[2].replace(/^0+(?=\d)/,''),m[3]?.replace(/^0+(?=\d)/,'')].filter(Boolean).join('-'));
for(const row of crawl.rows.filter(r=>r.kind==='listing'&&r.status==='observed')){
 const inArea=/\b(Selangor|Kuala Lumpur)\b/i.test(row.address??'');
 const ranked=(row.candidate_ids??[]).map(id=>byId.get(id)).filter(Boolean).map(p=>{
   const location=row.latitude>=2.5&&row.longitude>=100.6?{latitude:row.latitude,longitude:row.longitude}:{};
   const names=[row.name,row.name.replace(/\s*\([^)]*\)/g,'').trim(),...[...row.name.matchAll(/\(([^)]+)\)/g)].map(m=>m[1].replace(/^formerly\s*/i,''))];
   const m=names.map(name=>assessMatch(p,{...row,name,latitude:location.latitude,longitude:location.longitude,country:'MY'})).sort((a,b)=>b.name_score-a.name_score)[0];
   const au=units(p.address),bu=units(row.address);m.unit_conflict=au.length>0&&bu.length>0&&!au.some(u=>bu.includes(u));
   // Public directory pages often omit valid coordinates; corroborating street/phone evidence is still required.
   const accepted=inArea&&m.name_score>=0.8&&!m.house_number_conflict&&!m.unit_conflict&&(m.address_score>=0.64||(m.phone_match&&m.address_score>=0.35)||(m.address_score>=0.4&&m.distance_m!==null&&m.distance_m<130));
   return {p,match:{...m,status:accepted?'matched':'needs_branch_review',basis:'Compatible institution name with matching branch address or branch phone; public listing only'}};
 }).sort((a,b)=>b.match.score-a.match.score);
 const viable=ranked.filter(x=>x.match.status==='matched');
 if(!viable.length||(viable.length>1&&viable[0].match.score-viable[1].match.score<12)){held.push({source_url:row.source_url,name:row.name,reason:viable.length?'ambiguous_branch':'unresolved_branch',candidates:ranked.slice(0,3).map(x=>({id:x.p.id,name:x.p.display_name,address:x.p.address,...x.match}))});continue;}
 const {p,match}=viable[0];if(seen.has(p.id)){held.push({provider_id:p.id,source_url:row.source_url,reason:'multiple_listing_observations'});continue;}
 if(/tuition|enrichment|primary school/i.test(row.fields?.["Centre's Category"]??row.name)&&!/taska|tadika|kindergarten|preschool|infant|childcare|nursery/i.test(row.fields?.["Centre's Category"]??'')){held.push({provider_id:p.id,source_url:row.source_url,reason:'service_category_differs'});continue;}
 const t=row.fields?.['Transportation Service'],published=/^(yes|ya)\b/i.test(t??'')?true:/^(no|tidak)(?:[\s.,;]|$)/i.test(t??'')?false:null;
 const h=parsePublishedHours(row.fields?.['Operating Hours']);
 const windows=h.windows.flatMap(w=>w.days.map(weekday=>({weekday,start_minute:w.start,end_minute:w.end})));
 const wa=[...new Set((row.whatsapp??[]).map(w=>whatsappLink(w)?.href).filter(Boolean))];
 if(!wa.length&&!t&&!windows.length&&!row.phone)continue;
 const record={provider_id:p.id,base_release:baseRelease,provider_name:p.display_name,match,source_url:row.source_url,source_kind:'kiddy123_directory',observed_on:row.retrieved_at,sha256:row.sha256,whatsapp:wa,phone:row.phone||null,
   transport:t?{published,wording:`Directory states: ${t}. ${published===false?'Confirm alternatives if you need institutional pickup.':'Route, collection time and a place on the vehicle need confirmation.'}`} : null,
   hours:windows.length?{weekly_windows:windows,closed_weekdays:h.closedDays,notes:row.fields['Operating Hours']}:null};
 if(row.fields?.['Operating Hours']&&!windows.length)held.push({provider_id:p.id,source_url:row.source_url,reason:'hours_days_missing_or_invalid',text:row.fields['Operating Hours']});
 records.push(record);seen.add(p.id);
}
const websites=existsSync(resolve(out,'websites.json'))?load('webapp-data/source/services-20260913/websites.json'):{rows:[]};
const common=new Set(['taska','tadika','pusat','childcare','child','care','centre','center','kindergarten','preschool','nursery','sdn','bhd','playschool','the','and','malaysia','taman','home','school','at','for']);
const titleTokens=s=>normalise(s).split(' ').filter(t=>t.length>1&&!common.has(t));
for(const row of websites.rows.filter(r=>r.status==='observed'&&r.same_host&&r.whatsapp?.length&&r.whatsapp.length<=3)){
 for(const id of row.provider_ids){
  const p=byId.get(id);if(!p)continue;
  const title=new Set(titleTokens(row.title));
  const compatible=[p.display_name,p.official_name].some(name=>{const tokens=titleTokens(name);const hits=tokens.filter(t=>title.has(t));return hits.length>=Math.min(2,tokens.length)&&hits.length>0;});
  if(!compatible){held.push({provider_id:id,source_url:row.source_url,reason:'website_brand_unresolved',title:row.title});continue;}
  let record=records.find(r=>r.provider_id===id);
  if(record?.whatsapp.length||record?.website_contact)continue;
  if(!record){record={provider_id:id,base_release:baseRelease,provider_name:p.display_name,match:{status:'matched',scope:'catalogue_linked_website',basis:'Existing catalogue website; same-host response and compatible brand title. Contact is not asserted to be branch-specific.'},source_url:row.source_url,source_kind:'provider_website',observed_on:row.retrieved_at,sha256:row.sha256,whatsapp:[],phone:null,transport:null,hours:null};records.push(record);}
  record.website_contact={links:row.whatsapp,source_url:row.source_url,retrieved_at:row.retrieved_at,scope:'website'};
 }
}
if(existsSync(resolve(out,'reviewed-services.json'))){
 for(const reviewed of load('webapp-data/source/services-20260913/reviewed-services.json')){
  if(!byId.has(reviewed.provider_id))throw Error('Reviewed service outside usable catalogue');
  const i=records.findIndex(r=>r.provider_id===reviewed.provider_id),record={...reviewed,provider_name:byId.get(reviewed.provider_id).display_name};
  if(i>=0)records[i]=record;else records.push(record);
 }
}
records.sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const hash=createHash('sha256').update(JSON.stringify(records)).digest('hex'),release='services_'+hash.slice(0,24);
const after=buildCatalog(applyServicesEvidence(raw,records,baseRelease,hash),baseRelease);
const coverage=c=>({providers:c.items.length,whatsapp:c.items.filter(p=>p.whatsapp?.length).length,phone:c.items.filter(p=>p.phone).length,transportYes:c.items.filter(p=>p.transport.exists===true).length,transportNo:c.items.filter(p=>p.transport.exists===false).length,transportEnquiry:c.items.filter(p=>p.transport.source&&p.transport.exists===null).length,withHours:c.items.filter(p=>p.businessHours.windows.length).length});
const summary={prepared_at:new Date().toISOString(),baseRelease,release,hash,records:records.length,crawl:crawl.summary,website_pages:websites.rows.length,branch_whatsapp:after.items.filter(p=>p.whatsapp?.some(w=>w.scope==='branch')).length,website_whatsapp:after.items.filter(p=>p.whatsapp?.some(w=>w.scope==='website')).length,before:coverage(baseline),after:coverage(after),held:held.length};
writeFileSync(resolve(out,'prepared-services.json'),JSON.stringify({summary,records},null,2));
writeFileSync(resolve(out,'held-services.json'),JSON.stringify(held,null,2));
console.log(JSON.stringify(summary,null,2));
