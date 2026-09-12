// Strict import of displayed hours; no national defaults or guessed weekdays.
import {parsePublishedHours} from './published-hours.mjs';
export const weekdays = ['MON','TUE','WED','THU','FRI','SAT','SUN'];
const names = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
function finish(windows, closed, issues) {
 const conflicts = weekdays.filter(d => closed.includes(d) && windows.some(w=>w.weekday===d));
 return {weekly_windows:windows.filter(w=>!conflicts.includes(w.weekday)),closed_weekdays:[...new Set(closed)].filter(d=>!conflicts.includes(d)),issues:[...issues,...conflicts.map(d=>'conflicting_status_'+d)]};
}
export function parseGoogleHours(snapshot = []) {
 const windows=[],closed=[],issues=[];
 for (const entry of snapshot) {
  const index=names.findIndex(d=>d.toLowerCase()===String(entry.day).toLowerCase());if(index<0)continue;
  const day=weekdays[index];
  for (const displayed of entry.displayed_windows ?? []) {
   const text=String(displayed).normalize('NFKC').trim();
   if (/^Closed$/i.test(text)) {closed.push(day);continue;}
   if (/^Open 24 hours$/i.test(text)) {windows.push({weekday:day,start_minute:0,end_minute:1440});continue;}
   // Google elides the first meridiem only when both ends have the same one.
   // 1–6 pm is safe; 7–6 pm is ambiguous and is deliberately not expanded.
   const compressed=text.match(/^(\d{1,2})(?::(\d{2}))?\s*[–—-]\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i);
   let expanded=text;
   if (compressed) {
    const [,h1,m1='00',h2,m2='00',ap]=compressed;
    if(Number(h1)%12*60+Number(m1)<Number(h2)%12*60+Number(m2))expanded=`${h1}:${m1} ${ap}–${h2}:${m2} ${ap}`;
   }
   const parsed=parsePublishedHours(`${entry.day} ${expanded}`);
   if(parsed.windows.length)windows.push(...parsed.windows.map(w=>({weekday:day,start_minute:w.start,end_minute:w.end})));
   else issues.push(`${day}: ${text}`);
  }
 }
 return finish(windows,closed,issues);
}
export function parseSchemaHours(specifications = []) {
 const windows=[],closed=[],issues=[];
 const minute=s=>{const m=String(s??'').match(/^(\d{2}):(\d{2})(?::00)?$/);return m&&+m[1]<24&&+m[2]<60?+m[1]*60+ +m[2]:null;};
 for(const row of specifications){
  for(const value of [row.dayOfWeek].flat().filter(Boolean)){
   const day=weekdays[names.findIndex(n=>String(value).split('/').at(-1).toLowerCase()===n.toLowerCase())];if(!day)continue;
   const start=minute(row.opens),end=minute(row.closes);
   if(start===0&&end===0){closed.push(day);continue;}
   if(start===null||end===null||end<=start){issues.push(`${day}: unsupported interval ${row.opens}–${row.closes}`);continue;}
   windows.push({weekday:day,start_minute:start,end_minute:end});
  }
 }
 return finish(windows,closed,issues);
}
