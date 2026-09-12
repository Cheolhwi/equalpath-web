const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const dayKeys = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'];
export function translateMalayHours(raw) {
  if (typeof raw !== 'string') return '';
  let text = raw.normalize('NFKC');
  const words = { 'Isnin':'Monday', 'Selasa':'Tuesday', 'Rabu':'Wednesday', 'Khamis':'Thursday', 'Jumaat':'Friday', 'Sabtu':'Saturday', 'Ahad':'Sunday', 'tengah hari':'PM', 'tghari':'PM', 'pagi':'AM', 'petang':'PM', 'malam':'PM', 'hingga':'–', 'sehingga':'until', 'tutup':'Closed', 'setiap hari':'Every day', 'waktu operasi':'Opening hours', 'cuti umum':'Public holidays' };
  for (const [ms,en] of Object.entries(words)) text=text.replace(new RegExp('\\b'+ms+'\\b','gi'),en);
  return text;
}
export function parsePublishedHours(raw) {
  const translated = translateMalayHours(raw), windows=[], closedDays=[];
  const clock = '(\\d{1,2})(?:[:.](\\d{2}))?\\s*(AM|PM)?';
  const range = new RegExp(clock+'\\s*[-–—]\\s*'+clock,'i');
  const minute = (h,m,ap) => { h=Number(h); m=Number(m??0); if(m>59||h>23||(ap&&(h<1||h>12)))return null; return (ap ? h%12+(/pm/i.test(ap)?12:0) : h)*60+m; };
  // Without a named weekday / Every day, retain the text but do not invent days.
  // Parentheses commonly separate a closed-day note from the opening range.
  for (const part of translated.split(/[|;\n()]/)) {
    const found = [...part.matchAll(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/gi)].map(m=>dayNames.findIndex(d=>d.toLowerCase()===m[0].toLowerCase()));
    let days=[];
    if (/Every day/i.test(part)) days=[...dayKeys];
    else if(found.length===2 && new RegExp(dayNames[found[0]]+'\\s*[-–—]\\s*'+dayNames[found[1]],'i').test(part)) {
      for(let d=found[0],n=0;n<7;n++,d=(d+1)%7){days.push(dayKeys[d]);if(d===found[1])break;}
    } else days=[...new Set(found.map(i=>dayKeys[i]))];
    if(!days.length)continue;
    if (/\bClosed\b/i.test(part)) {
      // A mixed open/closed sentence has no reliable day-to-status association.
      if (!range.test(part)) closedDays.push(...days);
      continue;
    }
    const match=part.match(range);if(!match)continue;
    const start=minute(match[1],match[2],match[3]), end=minute(match[4],match[5],match[6]);
    // A missing meridiem paired with a 12-hour clock is ambiguous.
    if(Boolean(match[3])!==Boolean(match[6]) || start==null || end==null || end<=start)continue;
    windows.push({days,start,end});
  }
  const contradictory = new Set(closedDays.filter(d=>windows.some(w=>w.days.includes(d))));
  return {
    windows: windows.map(w=>({...w,days:w.days.filter(d=>!contradictory.has(d))})).filter(w=>w.days.length),
    closedDays:[...new Set(closedDays)].filter(d=>!contradictory.has(d)),
    translated,
  };
}
