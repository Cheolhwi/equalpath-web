// Read public websites already linked in the catalogue. Contact links only, never send a message.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {lookup} from 'node:dns/promises';
import {whatsappLink} from '../shared/whatsapp.mjs';
const out=resolve(import.meta.dirname,'../../webapp-data/source/services-20260913');
mkdirSync(resolve(out,'websites'),{recursive:true});
const file=resolve(out,'websites.json'),rows=existsSync(file)?JSON.parse(readFileSync(file)).rows:[],done=new Set(rows.map(r=>r.requested_url));
const raw=JSON.parse(readFileSync(resolve(out,'../../prepared/catalog.json'))).map(r=>JSON.parse(r.payload));
const grouped=new Map();
for(const p of raw){try{const u=new URL(p.website);if(!['http:','https:'].includes(u.protocol)||/facebook|instagram|kiddy123|linktr\.ee|tiktok|google|youtube|fb\.me|nak\.info|wa\.me|whatsapp/i.test(u.hostname))continue;u.hash='';const url=u.href;if(!grouped.has(url))grouped.set(url,[]);grouped.get(url).push(p.id);}catch{}}
const queue=[...grouped.keys()],hostNext=new Map(),blocked=new Set();
const decode=s=>s.replace(/&amp;/g,'&').replace(/&#0*38;/g,'&');
function save(){writeFileSync(file,JSON.stringify({updated_at:new Date().toISOString(),queued:queue.length,completed:rows.length,rows},null,2));}
async function get(value){
 let u=new URL(value);
 for(let hop=0;hop<4;hop++){
  if(!['https:','http:'].includes(u.protocol)||u.username||u.password||(u.port&&!['80','443'].includes(u.port)))throw Error('invalid_destination');
  const addresses=await lookup(u.hostname,{all:true});if(!addresses.length||addresses.some(({address:a})=>/^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|fc|fd|fe80)/i.test(a)))throw Error('nonpublic_destination');
  if(blocked.has(u.hostname))throw Error('host_paused');
  const slot=Math.max(Date.now(),hostNext.get(u.hostname)??0);hostNext.set(u.hostname,slot+1800);await new Promise(r=>setTimeout(r,Math.max(0,slot-Date.now())));
  const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(12000),headers:{'User-Agent':'EqualPathCoursework/1.0 public-provider-contact-review'}});
  if([403,429].includes(r.status)){blocked.add(u.hostname);throw Error('http_'+r.status);}
  if(r.status>=300&&r.status<400&&r.headers.get('location')){u=new URL(r.headers.get('location'),u);continue;}
  if(!r.ok)throw Error('http_'+r.status);
  if(!/text\/html/i.test(r.headers.get('content-type')??''))throw Error('not_html');
  const chunks=[];let size=0;for await(const chunk of r.body){size+=chunk.length;if(size>2000000)throw Error('page_too_large');chunks.push(chunk);}
  return {url:u.href,html:Buffer.concat(chunks).toString('utf8')};
 }
 throw Error('redirect_limit');
}
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{
 while(cursor<queue.length){const requested_url=queue[cursor++];if(done.has(requested_url))continue;done.add(requested_url);
  const row={requested_url,provider_ids:grouped.get(requested_url),retrieved_at:new Date().toISOString()};
  try{
   const page=await get(requested_url),sameHost=new URL(page.url).hostname.replace(/^www\./,'')===new URL(requested_url).hostname.replace(/^www\./,'');
   Object.assign(row,{status:'observed',source_url:page.url,same_host:sameHost,sha256:createHash('sha256').update(page.html).digest('hex')});
   row.whatsapp=[...new Set([...page.html.matchAll(/(?:href|data-href)=["']([^"']+)["']/gi)].map(m=>whatsappLink(decode(m[1]))?.href).filter(Boolean))];
   row.title=page.html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]??'';
   const text=page.html.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');
   row.hours_context=[...text.matchAll(/waktu operasi|operating hours|opening hours|Isnin|Monday/gi)].slice(0,10).map(m=>text.slice(Math.max(0,m.index-60),m.index+250));
   row.transport_context=[...text.matchAll(/transportation|transport service|pickup service|pick.up service|pengangkutan|接送/gi)].slice(0,10).map(m=>text.slice(Math.max(0,m.index-60),m.index+220));
   writeFileSync(resolve(out,'websites',row.sha256+'.html'),page.html);
  }catch(e){row.status='unavailable';row.reason=e.message;}
  rows.push(row);save();if(rows.length%40===0)console.log(JSON.stringify({completed:rows.length,queued:queue.length,with_whatsapp:rows.filter(r=>r.whatsapp?.length).length}));
 }
}));save();console.log(JSON.stringify({completed:rows.length,queued:queue.length,output:file}));
