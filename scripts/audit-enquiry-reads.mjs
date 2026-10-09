// Offline count of row reads in the CURRENT cloud service. No network calls.
import { createCloudEnquiry } from '../server/enquiry/service.mjs';
import { virtualBranches } from '../experiments/virtual-enquiry/model.mjs';
const source={label:'Audit fixture',current:true};
const branches=virtualBranches([{id:'audit',name:'Virtual audit branch',age:{min:12,max:84,endpointKnown:true,maxInclusive:false,source},admission:{value:true,source},businessHours:{windows:[{days:['FRI'],start:480,end:1080,source}],closedDays:[],source}}]);
const secret='s'.repeat(48),env={ENQUIRY_ENABLED:'1',ENQUIRY_OWNER_SECRET:secret,TELEGRAM_ASSISTANT_ID:'111',TELEGRAM_MERCHANT_ID:'222',TELEGRAM_ASSISTANT_WEBHOOK_SECRET:secret,TELEGRAM_MERCHANT_WEBHOOK_SECRET:secret};
const request={branchId:'audit',date:'2026-10-09',children:[{age:'2',start:'14:00',end:'16:00'}],questions:['visit','fees']};
function fixture(){
 let time=Date.parse('2026-10-09T10:00:00Z'),reads=0,calls=0;const rows=new Map(),sent=[];
 const count=x=>{calls++;reads+=Math.max(1,x.length);return x;};
 const store={
  get:async id=>count(rows.has(id)?[rows.get(id)]:[])[0]||null,
  put:async(id,data,meta)=>{if(rows.has(id))return null;const row={...structuredClone(data),id:data.id||id,at:time,parent:meta?.parent||id,kind:meta?.kind||'event',sequence:rows.size};rows.set(id,row);return row;},
  events:async id=>count([...rows.values()].filter(x=>x.parent===id&&x.kind==='event').slice(0,30)),
  queue:async()=>count([...rows.values()].filter(x=>x.kind==='queued').sort((a,b)=>a.sequence-b.sequence).slice(0,1)),
  quota:async()=>{}, // Actual quota path writes only, no explicit reads.
  setKind:async(id,kind)=>{const row=rows.get(`${id}_queue`);if(row)row.kind=kind;}
 };
 const api=()=>createCloudEnquiry({branches,store,telegram:{send:async(role,text)=>{sent.push({role,text});return {message_id:sent.length};}},env,now:()=>time});
 return {api,sent,time:t=>time+=t,count:()=>({reads,calls}),reset:()=>{reads=0;calls=0;},update:(role,text)=>({message:{message_id:sent.length,from:{id:role==='merchant'?111:222,is_bot:true},chat:{id:role==='merchant'?111:222,type:'private'},text}})};
}
async function start(f,n){const c=[];for(let i=1;i<=n;i++){const owner=i.toString(16).padStart(64,'0');const {job}=await f.api().handle(owner,{action:'create',nonce:'b'.repeat(32),request});c.push({owner,job});}return c;}
const output={basis:'Offline replay of current service; returned rows counted, empty reads count one. Excludes metadata requests and provider implementation overhead.'};
for(const n of [1,4,10,20]){
 const f=fixture(),clients=await start(f,n);const creation=f.count();
 f.reset();for(const c of clients)await f.api().handle(c.owner,{action:'get',id:c.job.id});
 const poll=f.count();
 f.reset();await f.api().pump();const recovery=f.count();
 output[`pending_${n}_sessions`]={createBatch:creation,onePollPerSession:poll,oneRecovery:recovery};
}
{
 const f=fixture(),[c]=await start(f,1);const create=f.count();
 f.reset();await f.api().webhook('merchant',secret,f.update('merchant',f.sent[0].text));const merchant=f.count();
 f.reset();await f.api().webhook('assistant',secret,f.update('assistant',f.sent[1].text));const assistant=f.count();
 f.reset();await f.api().handle(c.owner,{action:'get',id:c.job.id});const finalPoll=f.count();
 output.successWithoutIntermediatePolls={create,merchant,assistant,finalPoll,totalReads:create.reads+merchant.reads+assistant.reads+finalPoll.reads};
}
for(const n of [1,10]){
 const f=fixture(),clients=await start(f,n);let elapsed=0,tick=0;
 while(elapsed<130000 && clients.some(c=>['queued','waiting'].includes(c.job.state))){
  const dt=tick<4?2500:5000;f.time(dt);elapsed+=dt;tick++;
  for(const c of clients)if(['queued','waiting'].includes(c.job.state))c.job=(await f.api().handle(c.owner,{action:'get',id:c.job.id})).job;
 }
 output[`noReply_${n}_sessions_130s`]={...f.count(),elapsedMs:elapsed,states:clients.map(c=>c.job.state)};
}
console.log(JSON.stringify(output,null,2));
