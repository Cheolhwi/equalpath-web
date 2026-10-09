// Sends only synthetic visits to the two configured virtual bots. Never a real
// provider contact. Session bearer secrets remain in memory and out of receipts.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {createSearchStore} from '../server/search-catalog.mjs';
import {virtualBranches,canonicalEnquiry,decide} from '../experiments/virtual-enquiry/model.mjs';
const endpoint='https://equalpath-enquiry-demo-6a916a6c.appwrite.network';
const health=await (await fetch(endpoint+'/health')).json();
assert.equal(health.enabled,true);assert.equal(health.queue.concurrency,1);
assert.equal(health.queue.recoveryMinutes,5);assert.equal(health.readBudget.version,2);
assert.equal(health.readBudget.statusScansQueue,false);assert.equal(health.readBudget.queueHeadLimit,1);
const branches=virtualBranches((await createSearchStore().catalog('short_term')).items);
let request;
for(const b of branches){
 const r=canonicalEnquiry({branchId:b.id,date:'2026-10-12',children:[{age:'2',start:'09:00',end:'11:00'}],questions:['visit','fees']},branches);
 if(decide(r,b).outcome==='available'){request=r;break;}
}
assert(request,'Need one published branch whose facts fit the synthetic visit.');
async function call(owner,body){
 const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${owner}`},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
 return {status:r.status,...await r.json()};
}
const start=Date.now();
const clients=Array.from({length:4},()=>({owner:randomBytes(32).toString('hex'),nonce:randomBytes(16).toString('hex')}));
await Promise.all(clients.map(async c=>{const r=await call(c.owner,{action:'create',nonce:c.nonce,request});assert.equal(r.status,200,JSON.stringify(r));c.job=r.job;c.initial=r.job.state;}));
console.log(JSON.stringify({phase:'created',states:clients.map(c=>c.initial)}));
assert.equal(new Set(clients.map(c=>c.job.sessionId)).size,4);
const repeat=await call(clients[0].owner,{action:'create',nonce:clients[0].nonce,request});assert.equal(repeat.job.id,clients[0].job.id);
assert.equal((await call(clients[1].owner,{action:'get',id:clients[0].job.id})).status,404);
const webhook=await fetch(endpoint+'/telegram/assistant',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'});assert.equal(webhook.status,403);
for(let n=0;n<65;n++){
 await Promise.all(clients.filter(c=>['queued','waiting'].includes(c.job.state)).map(async c=>{const r=await call(c.owner,{action:'get',id:c.job.id});assert.equal(r.status,200);c.job=r.job;}));
 if(clients.every(c=>!['queued','waiting'].includes(c.job.state)))break;
 await new Promise(r=>setTimeout(r,2000));
}
const receipt={checkedAt:new Date().toISOString(),endpoint,health,durationMs:Date.now()-start,request,duplicateReused:true,crossSessionDenied:true,invalidWebhookDenied:true,
 requests:clients.map(c=>({id:c.job.id,sessionId:c.job.sessionId,initialState:c.initial,state:c.job.state,outcome:c.job.result?.outcome,events:c.job.events}))};
writeFileSync(new URL('../evidence/telegram-cloud-20261010/roundtrip.json',import.meta.url),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify({phase:'completed',durationMs:receipt.durationMs,states:clients.map(c=>c.job.state)}));
for(const c of clients){assert.equal(c.job.state,'replied');assert.equal(c.job.result.outcome,'available');assert(c.job.events.some(e=>e.text==='The virtual centre received your request on Telegram.'));assert(c.job.events.some(e=>e.text==='The virtual centre replied through Telegram.'));}
