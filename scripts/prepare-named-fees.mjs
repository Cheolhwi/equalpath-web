import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {listingFeeFacts} from '../shared/listing-fees.mjs';
const root=resolve(import.meta.dirname,'../..'),data=resolve(root,'webapp-data'),out=resolve(data,'source/named-fees-20260913');
const read=p=>JSON.parse(readFileSync(p));
const catalog=read(resolve(data,'prepared/catalog.json')),raw=catalog.map(x=>JSON.parse(x.payload)),base=catalog[0].release_id;
const byID=new Map(raw.map(p=>[p.id,p])),records=new Map(),held=[];
function add(id,fees,match){
  if(!byID.has(id))throw Error('Unknown reviewed provider '+id);
  const old=records.get(id)??{provider_id:id,base_release:base,match:{status:'matched',method:'reviewed_named_fee_sources',evidence:[]},replaces_sources:[],fees:[]};
  old.match.evidence.push(match);old.fees.push(...fees);old.replaces_sources=[...new Set([...old.replaces_sources,...fees.map(f=>f.source_url)])];records.set(id,old);
}
const crawl=read(resolve(data,'source/services-20260913/crawl.json'));
const services=read(resolve(data,'source/services-20260913/prepared-services.json'));
for(const page of crawl.rows){
  const text=page.fields?.['Admission & Fees'];
  const fees=listingFeeFacts(text,{source_url:page.source_url,source_retrieved_at:page.retrieved_at});
  if(!fees.length)continue;
  const matches=services.records.filter(r=>r.source_url===page.source_url&&r.match?.status==='matched');
  if(matches.length!==1){held.push({source_url:page.source_url,name:page.name,reason:'no_unique_reviewed_branch_match'});continue;}
  add(matches[0].provider_id,fees,{method:'previously_reviewed_branch_profile',source_url:page.source_url,sha256:page.sha256,source_name:page.name,source_fee_text:text});
}
// The official 2026 table uses one merged tariff column across its three pages.
// Review is by official branch name and street/address, not a Google display alias.
const pdfURL='https://www.maiwp.gov.my/assets/PDF/publication/tawaran/permatamaiwp.pdf';
const pdfHash=createHash('sha256').update(readFileSync(resolve(out,'maiwp-2026.pdf'))).digest('hex');
const normalized=s=>s.toUpperCase().replace(/^TADIKA PERMATA MAIWP\s*|^PM\s*/,'').replace(/[^A-Z0-9]/g,'');
// Different street/site details need further corroboration before branch publication.
const heldSerials=new Set([51,67,70]);
for(const row of read(resolve(out,'maiwp-tables.json'))){
  const [serial,zone,name,address]=row.cells;
  if(!/^\d+$/.test(serial)||/LABUAN|PUTRAJAYA/i.test(zone))continue;
  let key=normalized(name);if(key==='KGMALAYSIA')key='KGMALAYSIATAMBAHAN';if(key==='KGBTMUDA')key='KGBATUMUDA';
  const matches=raw.filter(p=>p.state==='Kuala Lumpur'&&/^TADIKA PERMATA MAIWP /i.test(p.official_name)&&normalized(p.official_name)===key);
  if(matches.length!==1||heldSerials.has(Number(serial))){held.push({source_url:pdfURL,name,serial,reason:heldSerials.has(Number(serial))?'branch_address_needs_review':'no_unique_official_name'});continue;}
  const fees=[
    {amount:20,basis:'month',kind:'programme',programme:'Asnaf',conditions:'2026 Permata MAIWP preschool monthly fee for eligible Asnaf families. Registration is separate.'},
    {amount:50,basis:'month',kind:'programme',programme:'Malaysian citizens',conditions:'2026 Permata MAIWP preschool monthly fee for Malaysian citizens. Registration is separate.'},
    {amount:80,basis:'month',kind:'programme',programme:'Non-citizens',conditions:'2026 Permata MAIWP preschool monthly fee for non-citizens. Registration is separate.'},
    {amount:50,basis:'one_off',kind:'registration',programme:'Registration',conditions:'2026 Permata MAIWP one-time registration fee; additional to the monthly fee.'},
  ].map(f=>({min:null,max:null,currency:'MYR',verification:'provider_published',source_kind:'official_operator_schedule',source_url:pdfURL,source_retrieved_at:statSync(resolve(out,'maiwp-2026.pdf')).mtime.toISOString(),source_updated_at:null,original_fee_source_url:null,fee_document_url:pdfURL,...f}));
  add(matches[0].id,fees,{method:'official_2026_branch_name_and_reviewed_address',source_url:pdfURL,sha256:pdfHash,page:row.page,serial,source_name:name,source_address:address,catalogue_address:matches[0].address});
}
const websites=read(resolve(data,'source/fees-hours-20260913/crawl.json'));
const review=read(resolve(import.meta.dirname,'data/named-fees-review.json'));
for(const entry of review){
  const page=websites.rows.find(r=>r.source_url===entry.source_url&&r.text_file===entry.text_file&&r.status==='fetched');
  if(!page)throw Error('Missing reviewed source '+entry.source_url);
  const text=readFileSync(resolve(data,'source/fees-hours-20260913',entry.text_file),'utf8');
  for(const excerpt of entry.required_text)if(!text.includes(excerpt))throw Error('Fee source changed '+entry.source_url);
  for(const id of entry.provider_ids){
    const fees=entry.fees.map(f=>({amount:null,min:null,max:null,currency:'MYR',kind:'programme',verification:'provider_published',source_kind:'provider_website',source_url:entry.source_url,source_retrieved_at:page.retrieved_at,source_updated_at:null,original_fee_source_url:null,fee_document_url:null,...f}));
    add(id,fees,{method:'reviewed_provider_programme_and_branch',source_url:entry.source_url,sha256:page.sha256,scope:entry.scope,review:entry.match_note});
  }
}
mkdirSync(out,{recursive:true});
const sorted=[...records.values()].sort((a,b)=>a.provider_id.localeCompare(b.provider_id));
const summary={baseRelease:base,records:sorted.length,feeFacts:sorted.reduce((n,r)=>n+r.fees.length,0),held:held.length};
writeFileSync(resolve(out,'prepared-named-fees.json'),JSON.stringify({summary,records:sorted},null,2));
writeFileSync(resolve(out,'held-fees.json'),JSON.stringify(held,null,2));console.log(JSON.stringify(summary));
