import test from 'node:test';
import assert from 'node:assert/strict';
import {parsePublishedHours,translateMalayHours} from '../shared/published-hours.mjs';
import {assess,businessHoursFor} from '../shared/conditions.mjs';
import {fixtureProviders,demoPickup} from '../server/fixtures.mjs';
const p={...fixtureProviders[0],careWindows:[],lateRule:null};
const r={pickup:demoPickup,date:'2026-09-14',deadline:'16:00',end:'19:00',age:'4',transport:'self'};
const care=(provider,request=r)=>assess(provider,request).conditions.find(c=>c.id==='care');
test('opening-hour closing boundary, closed day and missing day are distinct',()=>{
 assert.equal(care(p).state,'supported');
 assert.equal(care(p,{...r,end:'19:01'}).state,'conflict');
 assert.equal(care({...p,businessHours:{windows:[],closedDays:['MON']}}).state,'conflict');
 assert.equal(care({...p,businessHours:{windows:[]}}).state,'unknown');
});
test('specific care schedule and unresolved exceptions override general opening hours',()=>{
 assert.equal(care({...p,careWindows:[{days:['MON'],start:480,end:1080}]}).state,'conflict');
 assert.equal(care({...p,careWindows:[{days:['TUE'],start:480,end:1140}]}).state,'unknown');
 assert.equal(care({...p,dateExceptions:[{date:r.date,label:'Holiday hours unresolved'}]}).state,'unknown');
 assert.equal(care({...p,lateRule:{latestEnd:1080}}).state,'conflict');
});
test('Malay weekday and AM/PM phrases translate into the right day and clock',()=>{
 const h=parsePublishedHours('Isnin - Jumaat: 6.45 pagi hingga 6.00 petang | Sabtu: 8.00 pagi - 12.00 tengah hari | Ahad: Tutup');
 assert.deepEqual(h.windows[0],{days:['MON','TUE','WED','THU','FRI'],start:405,end:1080});
 assert.deepEqual(h.windows[1],{days:['SAT'],start:480,end:720});
 assert.deepEqual(h.closedDays,['SUN']);
 assert.match(translateMalayHours('sehingga 3 petang'),/until 3 PM/);
});
test('no day or ambiguous overnight range is not converted into invented service dates',()=>{
 assert.equal(parsePublishedHours('7 pagi - 6 petang').windows.length,0);
 assert.equal(parsePublishedHours('Isnin: 7 pagi - 6').windows.length,0);
 assert.equal(parsePublishedHours('Isnin: 8 malam - 6 pagi').windows.length,0);
});
test('closed-day notes do not close weekdays and conflicting claims remain unresolved',()=>{
 const h=parsePublishedHours('Monday-Friday 08:00-18:00 (Closed Saturday & Sunday)');
 assert.deepEqual(h.windows[0].days,['MON','TUE','WED','THU','FRI']);
 assert.deepEqual(h.closedDays,['SAT','SUN']);
 assert.deepEqual(parsePublishedHours('Monday 08:00-18:00; Monday closed').windows,[]);
 assert.deepEqual(parsePublishedHours('Monday 08:00-18:00; Monday closed').closedDays,[]);
 assert.deepEqual(parsePublishedHours('Monday-Friday 08:00-18:00 Saturday closed').windows,[]);
});

test('missing selected-day hours are distinguished from an entirely empty weekly schedule',()=>{
 const weekday={...p,businessHours:{windows:[{days:['MON'],start:420,end:1110}],closedDays:['SAT']}};
 assert.equal(businessHoursFor(weekday,'2026-09-14'),'07:00–18:30');
 assert.equal(businessHoursFor(weekday,'2026-09-13'),'Not listed for this day');
 assert.equal(businessHoursFor(weekday,'2026-09-12'),'Listed closed');
});
