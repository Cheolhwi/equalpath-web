import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudEnquiry, requestText, replyText } from '../server/enquiry/service.mjs';
import { createTelegram } from '../server/enquiry/telegram.mjs';
import { createEntry } from '../server/enquiry/function.mjs';
import { createCloudStore } from '../server/enquiry/store.mjs';
import { virtualBranches } from '../experiments/virtual-enquiry/model.mjs';
const source={label:'Unit fixture',current:true};
const branches=virtualBranches([{id:'test',name:'Test branch',age:{min:12,max:84,endpointKnown:true,maxInclusive:false,source},admission:{value:true,source},businessHours:{windows:[{days:['FRI'],start:480,end:1080,source}],closedDays:[],source}}]);
const owner='a'.repeat(64),nonce='b'.repeat(32),secret='s'.repeat(48),env={ENQUIRY_ENABLED:'1',ENQUIRY_OWNER_SECRET:secret,TELEGRAM_ASSISTANT_ID:'111',TELEGRAM_MERCHANT_ID:'222',TELEGRAM_ASSISTANT_WEBHOOK_SECRET:secret,TELEGRAM_MERCHANT_WEBHOOK_SECRET:secret};
const input=()=>({branchId:'test',date:'2026-10-09',children:[{age:'2',start:'14:00',end:'16:00'}],questions:['visit','fees']});
function fixture() {
 let time=Date.parse('2026-10-09T10:00:00Z');const rows=new Map(),counts=new Map(),sent=[];
 const store={get:async id=>rows.get(id)||null,put:async(id,data,meta)=>{if(rows.has(id))return null;const row={...structuredClone(data),id:data.id||id,at:time,parent:meta?.parent||id,kind:meta?.kind||'event',sequence:rows.size};rows.set(id,row);return row;},events:async id=>[...rows.values()].filter(x=>x.parent===id&&x.kind==='event'),quota:async(id,max)=>{const n=counts.get(id)||0;if(n>=max)throw Object.assign(Error('Daily limit'),{status:429});counts.set(id,n+1);},queue:async()=>[...rows.values()].filter(x=>x.kind==='queued').sort((a,b)=>a.sequence-b.sequence).slice(0,1),setKind:async(id,kind)=>{const row=rows.get(`${id}_queue`);if(row)row.kind=kind;}};
 const telegram={send:async(role,text)=>{sent.push({role,text});return {message_id:sent.length};}};
 const create=()=>createCloudEnquiry({branches,store,telegram,env,now:()=>time});
 const update=(role,text,extra={})=>({message:{message_id:sent.length,from:{id:role==='merchant'?111:222,is_bot:true},chat:{id:role==='merchant'?111:222,type:'private'},text,...extra}});
 return {store,sent,telegram,create,update,advance:n=>time+=n};
}
test('durable bot roundtrip requires actual merchant reply; worker restart retains state',async()=>{
 const f=fixture(),a=await f.create().handle(owner,{action:'create',request:input(),nonce});
 assert.equal(a.job.state,'waiting');assert.equal(a.job.result,null);assert.equal(f.sent.length,1);
 assert(!JSON.stringify(a).includes(owner));
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text));
 assert.equal(f.sent.length,2);assert.equal(f.sent[1].role,'merchant');
 assert.equal((await f.create().handle(owner,{action:'get',id:a.job.id})).job.result,null);
 await f.create().webhook('assistant',secret,f.update('assistant',f.sent[1].text));
 // The virtual staff member's answer appears after a simulated 20–60 s.
 const early=(await f.create().handle(owner,{action:'get',id:a.job.id})).job;
 assert.equal(early.state,'waiting');assert.equal(early.result,null);
 f.advance(60000);
 const reply=(await f.create().handle(owner,{action:'get',id:a.job.id})).job;
 assert.equal(reply.state,'replied');assert.equal(reply.result.outcome,'available');assert.match(reply.events.at(-1).text,/Telegram/);
});
test('concurrent clicks and duplicated Telegram deliveries send exactly once per role',async()=>{
 const f=fixture();const r=await Promise.all(Array.from({length:4},()=>f.create().handle(owner,{action:'create',request:input(),nonce})));
 assert.equal(new Set(r.map(x=>x.job.id)).size,1);assert.equal(f.sent.length,1);
 await Promise.all(Array.from({length:4},()=>f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text))));
 assert.equal(f.sent.length,2);
 await Promise.all(Array.from({length:4},()=>f.create().webhook('assistant',secret,f.update('assistant',f.sent[1].text))));
 assert.equal(f.sent.length,2);
});
test('ownership, fixed peers, webhook secrets, forwards and wrong request text are enforced',async()=>{
 const f=fixture(),{job}=await f.create().handle(owner,{action:'create',request:input(),nonce});
 await assert.rejects(f.create().handle('d'.repeat(64),{action:'get',id:job.id}),e=>e.status===404);
 await assert.rejects(f.create().webhook('merchant','x'.repeat(48),f.update('merchant',f.sent[0].text)),e=>e.status===403);
 for(const extra of [{from:{id:777,is_bot:true}},{chat:{id:111,type:'group'}},{forward_origin:{}},{text:f.sent[0].text+'altered'}]) await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text,extra));
 assert.equal(f.sent.length,1);
 await assert.rejects(f.create().handle(owner,{action:'create',nonce,request:{...input(),date:'2026-10-16'}}),e=>e.status===409);
 await assert.rejects(f.create().handle(owner,{action:'create',nonce,request:{...input(),scenario:'available'}}));
});
test('concurrent reuse of a nonce with different requests rejects the losing request',async()=>{
 const f=fixture();
 const results=await Promise.allSettled([
  f.create().handle(owner,{action:'create',request:input(),nonce}),
  f.create().handle(owner,{action:'create',request:{...input(),date:'2026-10-16'},nonce}),
 ]);
 assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
 assert.equal(results.find(r=>r.status==='rejected').reason.status,409);
 assert.equal(f.sent.length,1);
});
test('cancel and timeout prevent late replies; unavailable transport never becomes a mock success',async()=>{
 for(const mode of ['cancel','timeout','failure']) {
  const f=fixture();if(mode==='failure')f.telegram.send=async()=>{throw Error('token-secret');};
  const {job}=await f.create().handle(owner,{action:'create',request:input(),nonce});
  if(mode==='cancel')await f.create().handle(owner,{action:'cancel',id:job.id});
  if(mode==='timeout')f.advance(120001);
  if(f.sent.length)await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text));
  const result=(await f.create().handle(owner,{action:'get',id:job.id})).job;
  assert.equal(result.state,{cancel:'cancelled',timeout:'timed_out',failure:'failed'}[mode]);assert.equal(result.result,null);assert(!JSON.stringify(result).includes('token-secret'));
 }
});
test('daily per-session send cap survives new service instances',async()=>{
 const f=fixture();for(let i=0;i<10;i++)await f.create().handle(owner,{action:'create',request:input(),nonce:i.toString(16).padStart(32,'0')});
 await assert.rejects(f.create().handle(owner,{action:'create',request:input(),nonce:'e'.repeat(32)}),e=>e.status===429);
 assert.equal(f.sent.length,1); // The other nine are durably queued, not sent concurrently.
});
test('different sessions share a FIFO queue, keep private ownership, and advance after the reply',async()=>{
 const f=fixture(),a=await f.create().handle(owner,{action:'create',request:input(),nonce});f.advance(1);
 const other='c'.repeat(64),b=await f.create().handle(other,{action:'create',request:input(),nonce});
 assert.equal(a.job.state,'waiting');assert.equal(b.job.state,'queued');assert.notEqual(a.job.sessionId,b.job.sessionId);
 assert.equal(f.sent.length,1);
 await Promise.all(Array.from({length:10},()=>f.create().pump()));assert.equal(f.sent.length,1);
 await assert.rejects(f.create().handle(owner,{action:'get',id:b.job.id}),e=>e.status===404);
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text));
 await f.create().webhook('assistant',secret,f.update('assistant',f.sent[1].text));
 assert.equal(f.sent.length,3);assert.match(f.sent[2].text,new RegExp(b.job.id));
 assert.equal((await f.create().handle(owner,{action:'get',id:a.job.id})).job.state,'waiting'); // Simulated delay does not block the next Telegram job.
 assert.equal((await f.create().handle(other,{action:'get',id:b.job.id})).job.state,'waiting');
});
test('cancelling while an actual reply is hidden never reveals a later acceptance',async()=>{
 const f=fixture(),{job}=await f.create().handle(owner,{action:'create',request:input(),nonce});
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text));
 await f.create().webhook('assistant',secret,f.update('assistant',f.sent[1].text));
 const stopped=await f.create().handle(owner,{action:'cancel',id:job.id});
 assert.equal(stopped.job.state,'cancelled');assert.equal(stopped.job.result,null);
 f.advance(60000);
 const later=await f.create().handle(owner,{action:'get',id:job.id});
 assert.equal(later.job.state,'cancelled');assert.equal(later.job.result,null);
});
test('reply timeout releases the queue after a worker restart; cancelled queued jobs never send',async()=>{
 const f=fixture(),a=await f.create().handle(owner,{action:'create',request:input(),nonce});f.advance(1);
 const b=await f.create().handle(owner,{action:'create',request:input(),nonce:'c'.repeat(32)});f.advance(1);
 const c=await f.create().handle(owner,{action:'create',request:input(),nonce:'d'.repeat(32)});
 await f.create().handle(owner,{action:'cancel',id:b.job.id});
 f.advance(120001);await Promise.all([f.create().pump(),f.create().pump()]);
 assert.equal(f.sent.length,2);assert.match(f.sent[1].text,new RegExp(c.job.id));
 assert.equal((await f.create().handle(owner,{action:'get',id:a.job.id})).job.state,'timed_out');
 assert.equal((await f.create().handle(owner,{action:'get',id:b.job.id})).job.state,'cancelled');
});
test('queued requests have their own wait deadline and never send once it expires',async()=>{
 const f=fixture();await f.create().handle(owner,{action:'create',request:input(),nonce});f.advance(1);
 const b=await f.create().handle(owner,{action:'create',request:input(),nonce:'c'.repeat(32)});
 f.advance(600001);await f.create().pump();
 assert.equal(f.sent.length,1);assert.equal((await f.create().handle(owner,{action:'get',id:b.job.id})).job.state,'timed_out');
});
test('Telegram only uses fixed bot usernames and redacts transport failures',async()=>{
 const c={TELEGRAM_ASSISTANT_TOKEN:'111:fixture',TELEGRAM_MERCHANT_TOKEN:'222:fixture',TELEGRAM_ASSISTANT_USERNAME:'AssistantTestBot',TELEGRAM_MERCHANT_USERNAME:'MerchantTestBot'};let target;
 const t=createTelegram(c,async(url,opt)=>{target=JSON.parse(opt.body).chat_id;return {ok:true,json:async()=>({ok:true,result:{}})};});
 await t.send('assistant','demo');assert.equal(target,'@MerchantTestBot');
 await t.send('merchant','demo');assert.equal(target,'@AssistantTestBot');
 await assert.rejects(createTelegram(c,async()=>{throw Error('111:fixture');}).send('assistant','demo'),e=>!e.message.includes('fixture'));
});
test('unconfigured cloud fails closed, never enables a local simulation',async()=>{
 const entry=createEntry({env:{},storeFactory:()=>({})});let out;
 const res={json:(data,status)=>out={data,status},text:()=>{}};
 await entry({req:{path:'/health',method:'GET',headers:{}},res});assert.equal(out.data.enabled,false);
 await entry({req:{path:'/',method:'POST',headers:{},bodyText:'{}',bodyJson:{}},res});assert.equal(out.status,503);
});
test('progress polling reads its own job/events once and never scans or writes the shared queue',async()=>{
 const f=fixture(),clients=[];
 for(let i=1;i<=20;i++){
  const token=i.toString(16).padStart(64,'0');
  const {job}=await f.create().handle(token,{action:'create',request:input(),nonce});
  clients.push({token,job});
 }
 let rowReads=0;
 for(const name of ['get','events']){const original=f.store[name];f.store[name]=async(...args)=>{
  const result=await original(...args);rowReads+=Math.max(1,Array.isArray(result)?result.length:1);return result;
 };}
 for(const name of ['queue','setKind','put'])f.store[name]=async()=>assert.fail(`Status must not call ${name}`);
 for(const c of clients)await f.create().handle(c.token,{action:'get',id:c.job.id});
 assert.equal(rowReads,41); // 3 reads for the waiting head, 2 per queued owner.
 f.advance(120001);
 assert.equal((await f.create().handle(clients[0].token,{action:'get',id:clients[0].job.id})).job.state,'timed_out');
});
test('recovery walks expired heads in bounded single-row reads after observers leave',async()=>{
 const f=fixture();
 for(let i=1;i<=25;i++)await f.create().handle(i.toString(16).padStart(64,'0'),{action:'create',request:input(),nonce});
 f.advance(600001);
 let heads=0;const original=f.store.queue;f.store.queue=async()=>{heads++;const result=await original();assert(result.length<=1);return result;};
 await f.create().pump();assert.equal(heads,20);
 heads=0;await f.create().pump();assert.equal(heads,6);assert.equal(f.sent.length,1);
});
test('cloud adapter excludes the job from event lists and reads only the FIFO head',async()=>{
 const requests=[];
 const store=createCloudStore({endpoint:'https://sgp.cloud.appwrite.io/v1',project:'fixture',key:'fixture',fetcher:async url=>{
  requests.push(new URL(url));return {ok:true,status:200,json:async()=>({rows:[]})};
 }});
 await store.events('a'.repeat(24));await store.queue();
 const events=requests[0].searchParams.getAll('queries[]').map(JSON.parse),queue=requests[1].searchParams.getAll('queries[]').map(JSON.parse);
 assert(events.some(q=>q.method==='equal'&&q.attribute==='parent'&&q.values[0]==='a'.repeat(24)));
 assert(events.some(q=>q.method==='equal'&&q.attribute==='kind'&&q.values[0]==='event'));
 assert(queue.some(q=>q.method==='limit'&&q.values[0]===1));
 assert(queue.some(q=>q.method==='orderAsc'&&q.attribute==='$sequence'));
});
test('after a place is offered, the parent decision and the centre answer make one exact Telegram round trip',async()=>{
 const f=fixture(),a=await f.create().handle(owner,{action:'create',request:input(),nonce});
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[0].text));
 await f.create().webhook('assistant',secret,f.update('assistant',f.sent[1].text));
 f.advance(60000);
 await assert.rejects(f.create().handle(owner,{action:'confirm',id:a.job.id,decision:'maybe'}));
 const asked=(await f.create().handle(owner,{action:'confirm',id:a.job.id,decision:'accept'})).job;
 assert.equal(asked.confirmation.state,'sending');assert.match(asked.confirmation.message,/^Yes, please keep the place for my child on Fri 9 Oct, 14:00–16:00/);
 assert.equal(f.sent.length,3);assert.match(f.sent[2].text,/^EPDEMO\/1 CONFIRM /);
 // A second click never sends again, and a changed decision is ignored.
 await f.create().handle(owner,{action:'confirm',id:a.job.id,decision:'decline'});assert.equal(f.sent.length,3);
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[2].text+'x'));assert.equal(f.sent.length,3);
 await f.create().webhook('merchant',secret,f.update('merchant',f.sent[2].text));
 assert.equal(f.sent.length,4);assert.match(f.sent[3].text,/^EPDEMO\/1 ACK /);
 await f.create().webhook('assistant',secret,f.update('assistant',f.sent[3].text));
 assert.equal((await f.create().handle(owner,{action:'get',id:a.job.id})).job.confirmation.state,'sending');
 f.advance(10000);
 const done=(await f.create().handle(owner,{action:'get',id:a.job.id})).job;
 assert.equal(done.confirmation.state,'acknowledged');assert.match(done.confirmation.reply,/^Thank you, that’s confirmed: your child on Fri 9 Oct, 14:00–16:00/);
 assert(!done.events.some(e=>/confirm|answer/i.test(e.text)));
});
