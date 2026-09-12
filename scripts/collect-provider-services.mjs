// Public listing pages only; no accounts, messages, or inferred service facts.
// Resume from the cached index. A challenge / rate limit stops this run.
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {assessMatch} from '../../webapp-data/scripts/google-crawler/core.mjs';
const out=resolve(import.meta.dirname,'../../webapp-data/source/services-20260913');
mkdirSync(resolve(out,'pages'),{recursive:true});
const providers=JSON.parse(readFileSync(resolve(out,'../../prepared/catalog.json'))).map(r=>JSON.parse(r.payload));
const file=resolve(out,'crawl.json');
const prior=existsSync(file)?JSON.parse(readFileSync(file)):null;
const seeds=['nursery-kindergarten','infant-care','day-care-tuition-centre'].flatMap(c=>['kuala-lumpur-30','selangor-39'].map(s=>`https://www.kiddy123.com/listing/guide/${c}/state/${s}`));
const queue=prior?.queue??seeds.map(url=>({url,kind:'index'})), rows=prior?.rows??[];
const queued=new Set(queue.map(r=>r.url)),done=new Set(rows.map(r=>r.requested_url));
const decode=s=>s.replace(/&amp;/g,'&').replace(/&nbsp;|&#160;/g,' ').replace(/&quot;/g,'"').replace(/&#39;|&apos;/g,"'").replace(/&ndash;|&#8211;/g,'–').replace(/&mdash;|&#8212;/g,'—').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)));
export const textOf=s=>decode(s.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<br\s*\/?\s*>|<\/(p|div|li|address|h\d)>/gi,'\n').replace(/<[^>]+>/g,' ')).replace(/[ \t]+/g,' ').replace(/\n\s*\n/g,'\n').trim();
function save(){writeFileSync(file,JSON.stringify({updated_at:new Date().toISOString(),queue,rows,summary:{queued:queue.length,completed:rows.length,indexes:rows.filter(r=>r.kind==='index'&&r.status==='observed').length,listings:rows.filter(r=>r.kind==='listing'&&r.status==='observed').length}},null,2));}
function add(item){if(!queued.has(item.url)){queue.push(item);queued.add(item.url);}}
const nameCandidates=name=>providers.map(p=>({id:p.id,score:assessMatch(p,{name}).name_score})).filter(p=>p.score>=0.72);
const interval=Math.max(1200,Number(process.env.SERVICES_INTERVAL_MS??1500));
let last=0,stopped=false;
for(let cursor=0;cursor<queue.length&&!stopped;cursor++){
 const item=queue[cursor];if(done.has(item.url))continue;
 await new Promise(r=>setTimeout(r,Math.max(0,last+interval-Date.now())));last=Date.now();
 const row={requested_url:item.url,kind:item.kind,candidate_ids:item.candidate_ids,retrieved_at:new Date().toISOString()};
 try{
  const response=await fetch(item.url,{signal:AbortSignal.timeout(22000),headers:{'User-Agent':'EqualPathCoursework/1.0 public-provider-directory'}});
  if([403,429].includes(response.status)){stopped=true;throw Error('source_access_limit_'+response.status);}
  if(!response.ok)throw Error('http_'+response.status);
  const html=await response.text();if(html.length>3000000)throw Error('oversize_page');
  if(/<title>[^<]*(?:Access Denied|Just a moment|Security Check)/i.test(html)){stopped=true;throw Error('source_challenge');}
  row.source_url=response.url;row.sha256=createHash('sha256').update(html).digest('hex');row.status='observed';
  const links=[...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({url:decode(m[1]),text:textOf(m[2])}));
  if(item.kind==='index'){
   row.listing_urls=[];
   for(const a of links){let u;try{u=new URL(a.url,response.url);u.hash='';}catch{continue;}
    if(!/(^|\.)kiddy123\.com$/.test(u.hostname))continue;
    if(/^\/listing\/[^/]+\/?$/.test(u.pathname)&&!u.pathname.includes('.html')){
     if(!row.listing_urls.includes(u.href))row.listing_urls.push(u.href);
     const name=decodeURIComponent(u.pathname.split('/')[2]).replace(/-/g,' '),candidates=nameCandidates(name);
     if(candidates.length)add({url:u.href,kind:'listing',candidate_ids:candidates.map(p=>p.id)});
    }
   }
   const next=html.match(/<a\b[^>]*class=["'][^"']*next[^"']*page-numbers[^"']*["'][^>]*href=["']([^"']+)/i)??html.match(/<a\b[^>]*href=["']([^"']+)["'][^>]*class=["'][^"']*next[^"']*page-numbers/i);
   row.index_signature=createHash('sha256').update([...row.listing_urls].sort().join('\n')).digest('hex');
   row.duplicate_index=rows.some(r=>r.index_signature===row.index_signature);
   if(next&&!row.duplicate_index)add({url:new URL(decode(next[1]),response.url).href,kind:'index'});
  }else{
   row.name=textOf(html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i)?.[1]??html.match(/<title>([^<]+)/i)?.[1]??'').split('|')[0].trim();
   const address=html.match(/<address\b[^>]*itemprop=["']address["'][^>]*>([\s\S]*?)<\/address>/i)?.[1]??'';
   row.address=textOf(address.replace(/<b\b[^>]*>[\s\S]*?<\/b>/gi,''));
   row.phone=decode(html.match(/<meta\b[^>]*itemprop=["']telephone["'][^>]*content=["']([^"']+)/i)?.[1]??'');
   row.whatsapp=[...new Set(links.filter(a=>/^https?:\/\/(wa\.me|api\.whatsapp\.com)\//i.test(a.url)).map(a=>a.url))];
   row.fields={};
   for(const m of html.matchAll(/<p>\s*<span[^>]*>\s*<strong>([^<]+)<\/strong>\s*<\/span>\s*<span[^>]*>([\s\S]*?)<\/p>/gi))row.fields[textOf(m[1]).replace(/:$/,'')]=textOf(m[2]).split('Disclaimer:')[0].trim();
   const points=[...html.matchAll(/LatLng\(\s*([\d.]+)\s*,\s*([\d.]+)/gi)].find(m=>Number(m[1])>=2.5&&Number(m[1])<=3.9&&Number(m[2])>=100.6&&Number(m[2])<=102.1);if(points){row.latitude=Number(points[1]);row.longitude=Number(points[2]);}
   writeFileSync(resolve(out,'pages',row.sha256+'.html'),html);
  }
 }catch(e){row.status='unavailable';row.reason=e.message;}
 rows.push(row);done.add(item.url);save();
 if(rows.length%20===0||stopped)console.log(JSON.stringify({completed:rows.length,queued:queue.length,listings:rows.filter(r=>r.kind==='listing'&&r.status==='observed').length,stopped}));
}
save();console.log(JSON.stringify({done:!stopped,completed:rows.length,queued:queue.length,output:file}));
