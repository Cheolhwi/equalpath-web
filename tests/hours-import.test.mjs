import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parseGoogleHours,parseSchemaHours} from '../shared/hours-observations.mjs';
import {parsePublishedHours} from '../shared/published-hours.mjs';
import {applyHoursEvidence} from '../server/hours-overlay.mjs';
import {createStore} from '../server/appwrite-store.mjs';
import {fixtureProviders,demoPickup} from '../server/fixtures.mjs';
import {assess} from '../shared/conditions.mjs';
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const record={provider_id:'test',base_release:'test-release',match:{status:'matched'},source_url:'https://www.waze.com/en-GB/live-map/directions/test',source_kind:'waze_public_place',observed_on:'2026-09-13T00:00:00Z',weekly_windows:[{weekday:'MON',start_minute:420,end_minute:1110}],closed_weekdays:['SUN']};
const raw={id:'test',display_name:'Test',official_name:'Test',state:'Selangor',district:'Petaling',registration:{authority:'KPM',source_url:'https://example.com'},operating_hours:{},fees:[]};
const payload={provider_count:1,hours_release:'hours_'+hash([record]).slice(0,24),hours_hash:hash([record]),hours_count:1};
const manifest={status:'ready',release_id:'test-release',payload:JSON.stringify(payload)};
const envelope={provider_id:'test',release_id:'test-release',payload:JSON.stringify(raw)};
const evidence={provider_id:'test',release_id:payload.hours_release,payload:JSON.stringify(record)};
const response=x=>({ok:true,json:async()=>x});
test('Google hours preserve closed and unknown days, Unicode clocks, split shifts and explicit 24 hours',()=>{
 const r=parseGoogleHours([{day:'Monday',displayed_windows:['8\u202fam–12\u202fpm','1–6\u202fpm']},{day:'Tuesday',displayed_windows:['Closed']},{day:'Saturday',displayed_windows:['Open 24 hours']}]);
 assert.deepEqual(r.weekly_windows,[{weekday:'MON',start_minute:480,end_minute:720},{weekday:'MON',start_minute:780,end_minute:1080},{weekday:'SAT',start_minute:0,end_minute:1440}]);
 assert.deepEqual(r.closed_weekdays,['TUE']);
 assert.equal(parseGoogleHours([{day:'Monday',displayed_windows:['7–6 pm']}]).weekly_windows.length,0);
});
test('schema midnight/overnight and contradictory day statements never become guessed hours',()=>{
 assert.deepEqual(parseSchemaHours([{dayOfWeek:'https://schema.org/Sunday',opens:'00:00:00',closes:'00:00:00'}]).closed_weekdays,['SUN']);
 assert.equal(parseSchemaHours([{dayOfWeek:'Monday',opens:'20:00:00',closes:'06:00:00'}]).weekly_windows.length,0);
 assert.equal(parseGoogleHours([{day:'Monday',displayed_windows:['Closed','8 am–6 pm']}]).weekly_windows.length,0);
 assert.deepEqual(parsePublishedHours('Isnin sehingga Jumaat: 7 pagi sehingga 6 petang').windows[0],{days:['MON','TUE','WED','THU','FRI'],start:420,end:1080});
});
test('evidence fills gaps but cannot override known hours or admit mismatched, duplicate or tampered facts',()=>{
 assert.equal(applyHoursEvidence([raw],[record],'test-release',hash([record]))[0].operating_hours.weekly_windows[0].end_minute,1110);
 const known={...raw,operating_hours:{weekly_windows:[{weekday:'MON',start_minute:480,end_minute:1020}]}};
 const updated=applyHoursEvidence([known],[record],'test-release',hash([record]))[0];
 assert.equal(updated.operating_hours,known.operating_hours);
 assert.equal(updated.additional_operating_hours.weekly_windows[0].end_minute,1110);
 for(const rows of [[{...record,match:{status:'needs_branch_review'}}],[record,record],[{...record,base_release:'other'}],[{...record,weekly_windows:[{weekday:'MON',start_minute:1000,end_minute:900}]}]])assert.throws(()=>applyHoursEvidence([raw],rows,'test-release',hash(rows)));
 assert.throws(()=>applyHoursEvidence([raw],[record],'test-release','bad'));
});
test('official clock ranges without weekdays remain visible evidence without passing a dated check',()=>{
 const fact={...record,source_kind:'official_operator_schedule',weekly_windows:[],closed_weekdays:[],unscoped_windows:[{start_minute:450,end_minute:750}],notes:'Preschool hours 07:30–12:30; weekdays not specified.'};
 const value=applyHoursEvidence([raw],[fact],'test-release',hash([fact]))[0];
 assert.equal(value.published_hours_schedule.windows[0].end_minute,750);
 assert.equal(value.operating_hours?.weekly_windows?.length??0,0);
 assert.throws(()=>applyHoursEvidence([raw],[{...fact,unscoped_windows:[{start_minute:800,end_minute:700}]}],'test-release',hash([{...fact,unscoped_windows:[{start_minute:800,end_minute:700}]}])));
});
test('Appwrite hours are hash-checked and contribute to the served version and care check',async()=>{
 const s=createStore({fetcher:async url=>response(url.includes('/current')?manifest:url.includes('web_provider_evidence')?{rows:[evidence]}:{rows:[envelope]})});
 const catalog=await s.catalog(),p=catalog.items[0];
 assert.match(catalog.version,new RegExp(payload.hours_release));assert.equal(p.version,catalog.version);
 assert.equal(p.businessHours.windows[0].end,1110);
 for(const [end,state] of [['18:30','supported'],['18:31','conflict']])assert.equal(assess(p,{pickup:demoPickup,date:'2026-09-14',deadline:'16:00',end,age:'4',transport:'self'}).conditions.find(c=>c.id==='care').state,state);
});
test('same catalogue release refreshes when hours change; incomplete or tampered snapshots are rejected',async()=>{
 let time=100000,active={...manifest,payload:JSON.stringify({provider_count:1})},missing=false,tampered=false;
 const s=createStore({now:()=>time,fetcher:async url=>response(url.includes('/current')?active:url.includes('web_provider_evidence')?{rows:missing?[]:[tampered?{...evidence,payload:JSON.stringify({...record,closed_weekdays:[]})}:evidence]}:{rows:[envelope]})});
 assert.equal((await s.catalog()).items[0].businessHours.windows.length,0);
 active=manifest;time+=61000;missing=true;await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INCOMPLETE');
 missing=false;tampered=true;await assert.rejects(()=>s.catalog(),e=>e.code==='SOURCE_INVALID');
 tampered=false;assert.equal((await s.catalog()).items[0].businessHours.windows.length,1);
});
test('evening scenarios are identifiable fictional entries and do not imply a national default',()=>{
 const evening=fixtureProviders.filter(p=>p.businessHours.windows.some(w=>w.end>1140));assert.equal(evening.length,2);
 assert.ok(evening.every(p=>p.mode==='demo'&&p.name.startsWith('Demo ·')&&p.sources.every(s=>s.kind==='demo')));
 assert.equal(fixtureProviders.filter(p=>p.businessHours.windows.length).length,9);
});
