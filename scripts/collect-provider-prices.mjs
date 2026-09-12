// Public provider pages only. Candidates require branch review before publication.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { lookup } from 'node:dns/promises';
const root = resolve(import.meta.dirname, '..');
const out = resolve(root, '../webapp-data/source/fees-hours-20260913');
mkdirSync(out, { recursive: true });
const providers = JSON.parse(readFileSync(resolve(root, '../webapp-data/prepared/catalog.json'))).map(r => JSON.parse(r.payload));
const seeds = [
  'https://mindme.my/service-fee/',
  'https://imtiyazeducare.edu.my/struktur-yuran-2025/',
  'https://pinktowerchildcarecentre.com/daycare-fees-malaysia/',
  'https://www.lullabee.com.my/showproducts/productid/6370391/hourly-drop-in/',
  'https://kidzcabin.com/enroll-now/',
  'https://www.edwethink.com/book-a-trial-session',
];
const limit = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1] ?? 120);
const grouped = new Map();
for (const p of providers) {
  try {
    const u = new URL(p.website);
    if (!['http:', 'https:'].includes(u.protocol) || /facebook|instagram|wa\.me|google|youtube|linktr\.ee/i.test(u.hostname)) continue;
    const key = u.href;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(p.id);
  } catch {}
}
const queue = [...new Set([...seeds, ...grouped.keys()])].slice(0, limit);
const file = resolve(out, 'crawl.json');
const rows = existsSync(file) ? JSON.parse(readFileSync(file)).rows : [];
const completed = new Set(rows.map(r => r.requested_url));
const textOf = html => html.replace(/<(script|style|svg)\b[^>]*>[\s\S]*?<\/\1>/gi, ' ').replace(/<\/(?:p|div|li|tr|h\d|section)>|<br\s*\/?\s*>/gi, '\n').replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/&amp;/g, '&').replace(/&#8211;|&ndash;/g, '–').replace(/[ \t]+/g, ' ').replace(/\n\s*\n/g, '\n').trim();
async function publicURL(value) {
  const u = new URL(value);
  if (!['http:', 'https:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw Error('unsupported_destination');
  const addresses = await lookup(u.hostname, { all: true });
  if (!addresses.length || addresses.some(({address:a}) => /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.|::|fc|fd|fe80)/i.test(a))) throw Error('nonpublic_destination');
  return u;
}
async function get(url) {
  let u = await publicURL(url);
  for (let hop = 0; hop < 4; hop++) {
    const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(7000), headers: { 'User-Agent': 'EqualPathCoursework/1.0 public-provider-fee-review' } });
    if (r.status >= 300 && r.status < 400 && r.headers.get('location')) { u = await publicURL(new URL(r.headers.get('location'), u).href); continue; }
    if (!r.ok) throw Error('http_' + r.status);
    if (!/text\/html/i.test(r.headers.get('content-type') ?? '')) throw Error('not_html');
    let size = 0, chunks = [];
    for await (const chunk of r.body) { size += chunk.length; if (size > 1800000) { await r.body.cancel?.().catch(()=>{}); throw Error('page_too_large'); } chunks.push(chunk); }
    return { url: u.href, html: Buffer.concat(chunks).toString('utf8') };
  }
  throw Error('redirect_limit');
}
function save() {
  writeFileSync(file, JSON.stringify({ collected_at: new Date().toISOString(), scope: 'Public provider websites; candidates only; no automatic branch-price assignments', queued: queue.length, completed: rows.length, candidate_pages: rows.filter(r=>r.price_context?.length).length, rows }, null, 2));
}
async function inspect(requested_url, parent = null) {
  if (completed.has(requested_url)) return;
  completed.add(requested_url);
  const row = { requested_url, discovered_from: parent, provider_ids: grouped.get(parent ?? requested_url) ?? [], retrieved_at: new Date().toISOString() };
  try {
    const {url, html} = await get(requested_url);
    const text = textOf(html), sha = createHash('sha256').update(html).digest('hex');
    Object.assign(row, {status:'fetched', source_url:url, sha256:sha, price_context:[...text.matchAll(/\b(?:RM|MYR)\s*[\d,]+(?:\.\d+)?/gi)].slice(0,30).map(m=>text.slice(Math.max(0,m.index-140),m.index+240)), hours_context:text.split('\n').filter(s=>/waktu|operasi|Isnin|Jumaat|petang|pagi|opening hours|operating hours|Monday|Friday/i.test(s)).slice(0,20) });
    writeFileSync(resolve(out, sha.slice(0,20)+'.txt'), text);
    row.text_file = sha.slice(0,20)+'.txt';
    if (!parent) {
      const links = [...html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)].map(m=>({href:m[1],label:textOf(m[2])})).filter(a=>/fee|yuran|price|pricing|rates|enrol|admission|contact|hubungi/i.test(a.href+' '+a.label));
      const urls=[];
      for(const link of links) { try { const u=new URL(link.href,url); u.hash=''; if(u.hostname===new URL(url).hostname && u.href!==url && !urls.includes(u.href)) urls.push(u.href); } catch {} }
      for(const link of urls.slice(0,2)) { await new Promise(r=>setTimeout(r,500)); await inspect(link,requested_url); }
    }
  } catch (e) { row.status='unavailable'; row.reason=String(e.message).slice(0,100); }
  rows.push(row); save();
}
let cursor=0;
await Promise.all(Array.from({length:4},async()=>{ while(cursor<queue.length) await inspect(queue[cursor++]); }));
save();
console.log(JSON.stringify({queued:queue.length,fetched:rows.filter(r=>r.status==='fetched').length,candidate_pages:rows.filter(r=>r.price_context?.length).length,failed:rows.filter(r=>r.status==='unavailable').length,output:file}));
