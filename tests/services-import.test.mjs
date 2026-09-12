import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {whatsappLink} from '../shared/whatsapp.mjs';
import {parsePublishedHours} from '../shared/published-hours.mjs';
import {applyServicesEvidence} from '../server/services-overlay.mjs';
import {normalizeProvider} from '../server/providers.mjs';
import {createStore} from '../server/appwrite-store.mjs';
import {assess,businessHoursFor,sortProviders} from '../shared/conditions.mjs';
import {demoPickup} from '../server/fixtures.mjs';
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const raw={id:'test',display_name:'Test branch',official_name:'Test',state:'Selangor',district:'Petaling',registration:{authority:'KPM',source_url:'https://example.com'},operating_hours:{},fees:[]};
const record={provider_id:'test',base_release:'test-release',match:{status:'matched'},source_url:'https://www.kiddy123.com/listing/test/',source_kind:'kiddy123_directory',observed_on:'2026-09-13T00:00:00Z',whatsapp:['https://wa.me/60123456789?text=should-not-send'],phone:'012-3456789',transport:{published:true,wording:'Directory states: Yes. Route needs confirmation.'},hours:{weekly_windows:[{weekday:'MON',start_minute:450,end_minute:1140}],closed_weekdays:[],notes:'Monday 7:30 am–7 pm'}};
const payload={provider_count:1,services_release:'services_'+hash([record]).slice(0,24),services_hash:hash([record]),services_count:1};
const manifest={status:'ready',release_id:'test-release',payload:JSON.stringify(payload)};
const envelope={provider_id:'test',release_id:'test-release',payload:JSON.stringify(raw)};
const evidence={provider_id:'test',release_id:payload.services_release,payload:JSON.stringify(record)};
const response=x=>({ok:true,json:async()=>x});
test('WhatsApp requires an explicit approved public link and strips text, tracking and executable URLs',()=>{
 assert.deepEqual(whatsappLink('https://api.whatsapp.com/send?phone=60123456789&text=secret'),{display:'+60123456789',href:'https://wa.me/60123456789'});
 for(const url of ['0123456789','tel:+60123456789','javascript:alert(1)','https://wa.me.evil.com/60123456789','https://user@wa.me/60123456789','https://wa.me/44123456789','http://wa.me/60123456789'])assert.equal(whatsappLink(url),null);
});
test('Malay compact clocks, weekday abbreviations and adjacent day headings preserve the published days',()=>{
 assert.deepEqual(parsePublishedHours('Isnin hingga Jumaat: 6.45pagi - 6petang').windows[0],{days:['MON','TUE','WED','THU','FRI'],start:405,end:1080});
 assert.equal(parsePublishedHours('Mon-Fri\n7:30 am - 6:30 pm\nSat & Sun: Close').windows[0].end,1110);
 assert.equal(parsePublishedHours('Monday to Friday: 7:45 pm - 6:30 pm').windows.length,0);
 assert.equal(parsePublishedHours('8 am - 6 pm').windows.length,0);
});
test('service overlay preserves sourced hours and phone; invalid branch, dates, links and duplicates are rejected',()=>{
 const known={...raw,public_phone:'03-12345678',operating_hours:{weekly_windows:[{weekday:'MON',start_minute:480,end_minute:1020}]}};
 const p=applyServicesEvidence([known],[record],'test-release',hash([record]))[0];
 assert.equal(p.public_phone,known.public_phone);assert.equal(p.operating_hours,known.operating_hours);
 for(const records of [[record,record],[{...record,match:{status:'needs_branch_review'}}],[{...record,whatsapp:['tel:60123456789']}],[{...record,observed_on:'invalid'}],[{...record,hours:{weekly_windows:[{weekday:'MON',start_minute:900,end_minute:800}],closed_weekdays:[]}}]])assert.throws(()=>applyServicesEvidence([raw],records,'test-release',hash(records)));
});
test('published transport passes the service check but does not invent route coverage, collection or admission',async()=>{
 const s=createStore({fetcher:async url=>response(url.includes('/current')?manifest:url.includes('web_provider_evidence')?{rows:[evidence]}:{rows:[envelope]})});
 const catalog=await s.catalog(),p=catalog.items[0];
 assert.match(catalog.version,new RegExp(payload.services_release));assert.equal(p.version,catalog.version);
 assert.equal(p.whatsapp[0].href,'https://wa.me/60123456789');assert.equal(p.whatsapp[0].source.url,record.source_url);
 const fit=assess(p,{pickup:demoPickup,date:'2026-09-14',deadline:'16:00',end:'19:00',age:'4',transport:'institution'});
 for(const [id,state] of [['transport','supported'],['coverage','unknown'],['pickup','unknown'],['admission','unknown'],['care','supported']])assert.equal(fit.conditions.find(c=>c.id===id).state,state);
});
test('service-only manifest changes invalidate cache; missing or modified snapshot evidence fails closed',async()=>{
 let time=100000,active={...manifest,payload:JSON.stringify({provider_count:1})},missing=false,tampered=false;
 const s=createStore({now:()=>time,fetcher:async url=>response(url.includes('/current')?active:url.includes('web_provider_evidence')?{rows:missing?[]:[tampered?{...evidence,payload:JSON.stringify({...record,phone:'03-99999999'})}:evidence]}:{rows:[envelope]})});
 assert.equal((await s.catalog()).items[0].whatsapp.length,0);
 active=manifest;time+=61000;missing=true;await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INCOMPLETE');
 missing=false;tampered=true;await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INVALID');
 tampered=false;assert.equal((await s.catalog()).items[0].whatsapp.length,1);
});
test('website contact provenance and scope remain separate from a branch service source',async()=>{
 const r={...record,whatsapp:[],website_contact:{source_url:'https://example.com/contact',retrieved_at:record.observed_on,links:['https://wa.me/60111111111']}};
 const v=applyServicesEvidence([raw],[r],'test-release',hash([r]))[0];
 assert.equal(v.whatsapp_contacts[0].source_url,r.website_contact.source_url);
 assert.equal(v.whatsapp_contacts[0].scope,'website');
 assert.equal(v.transport.source_url,record.source_url);
 const branch=applyServicesEvidence([raw],[{...r,whatsapp:record.whatsapp}],'test-release',hash([{...r,whatsapp:record.whatsapp}]))[0];
 assert.equal(branch.whatsapp_contacts.length,1);assert.equal(branch.whatsapp_contacts[0].scope,'branch');
});
test('conflicting hours remain visible; shared times pass, disputed times need confirmation, and both closed times conflict',()=>{
 const known={...raw,operating_hours:{weekly_windows:[{weekday:'MON',start_minute:480,end_minute:1080}],source_url:'https://example.com/original'}};
 const p=normalizeProvider(applyServicesEvidence([known],[record],'test-release',hash([record]))[0],'test-release').provider;
 assert.equal(p.businessHours.windows[0].end,1080);assert.equal(p.businessHours.alternative.windows[0].end,1140);
 assert.equal(businessHoursFor(p,'2026-09-14'),'Sources differ · check details');
 for(const [end,state] of [['17:00','supported'],['18:30','unknown'],['19:30','conflict']])assert.equal(assess(p,{pickup:demoPickup,date:'2026-09-14',deadline:'16:00',end,age:'4',transport:'self'}).conditions.find(c=>c.id==='care').state,state);
 const certain={...p,id:'certain',businessHours:{...p.businessHours,alternative:null}};
 assert.equal(sortProviders([p,certain],'closing','2026-09-14')[0].id,'certain');
});
test('newly sourced weekdays fill unknown days with their own source; explicit care schedules still take precedence',()=>{
 const known={...raw,operating_hours:{weekly_windows:[{weekday:'TUE',start_minute:480,end_minute:1080}],source_url:'https://example.com/original'}};
 const p=normalizeProvider(applyServicesEvidence([known],[record],'test-release',hash([record]))[0],'test-release').provider;
 assert.equal(p.businessHours.windows.find(w=>w.days.includes('MON')).source.url,record.source_url);
 assert.equal(businessHoursFor(p,'2026-09-14'),'07:30–19:00');
 const care={...p,careWindows:[{days:['MON'],start:480,end:1080}]};
 assert.equal(assess(care,{pickup:demoPickup,date:'2026-09-14',deadline:'16:00',end:'18:30',age:'4',transport:'self'}).conditions.find(c=>c.id==='care').state,'conflict');
});
