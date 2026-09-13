export function registrationBadge(p, today) {
  const r = p.registration, number = String(r?.number ?? '').trim();
  if (p.mode === 'demo' || !number || !['JKM', 'KPM'].includes(r?.authority) || !r.source?.url) return null;
  const base = {authority:r.authority, number, source:r.source};
  if (r.until && r.until < today) return {...base,state:'attention',label:'Registration period ended',description:`The listed registration ended on ${r.until}. Check whether it has been renewed.`};
  if (r.from && r.from > today) return {...base,state:'attention',label:'Registration starts later',description:`The listed registration starts on ${r.from}.`};
  if (r.match === 'unresolved') return {...base,state:'attention',label:'Registration needs checking',description:'This number has not been matched to the branch.'};
  if (r.authority === 'JKM' && r.official) return {...base,state:'official',label:'Listed in JKM register',description:'This centre appears in the imported JKM government register. Registration does not confirm availability or care quality.'};
  return {...base,state:'listed',label:`${r.authority} code listed`,description:`The directory lists this ${r.authority} number. Its current government registration status has not been independently checked.`};
}
