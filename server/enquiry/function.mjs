import { createCloudStore } from './store.mjs';
import { createCloudEnquiry } from './service.mjs';
import { createTelegram } from './telegram.mjs';
import { createSearchStore } from '../search-catalog.mjs';
import { virtualBranches, EnquiryError } from '../../experiments/virtual-enquiry/model.mjs';
let catalogue;
export function createEntry({ env=process.env, storeFactory=createCloudStore, telegramFactory=createTelegram, loadBranches=defaultBranches }={}) {
  // Use one immutable catalogue per worker, but never cache private job state.
  const branches = loadBranches;
  return async ({req,res}) => {
    const origin=req.headers?.origin||'', allowed=origin==='https://equalpathcare.me'||(env.ENQUIRY_ALLOW_LOCAL==='1'&&/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(origin));
    const headers={ 'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',
      'Access-Control-Allow-Origin':allowed?origin:'https://equalpathcare.me','Vary':'Origin','Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type, Authorization, X-EqualPath-Sandbox' };
    if(req.method==='OPTIONS') return res.text('',204,headers);
    const configured=['TELEGRAM_ASSISTANT_TOKEN','TELEGRAM_MERCHANT_TOKEN','TELEGRAM_ASSISTANT_ID','TELEGRAM_MERCHANT_ID','TELEGRAM_ASSISTANT_USERNAME','TELEGRAM_MERCHANT_USERNAME','ENQUIRY_OWNER_SECRET','TELEGRAM_ASSISTANT_WEBHOOK_SECRET','TELEGRAM_MERCHANT_WEBHOOK_SECRET'].every(k=>!!env[k]);
    const path=(req.path||'/').split('?')[0];
    if(path==='/health') return res.json({ok:true,simulation:true,transport:'telegram-cloud',enabled:configured&&env.ENQUIRY_ENABLED==='1',retentionMinutes:30,dailyLimit:200,queue:{concurrency:1,maxWaitMinutes:10,replyTimeoutSeconds:120,recoveryMinutes:5},readBudget:{version:2,statusScansQueue:false,queueHeadLimit:1}},200,headers);
    try {
      const store=storeFactory({endpoint:env.APPWRITE_FUNCTION_API_ENDPOINT,project:env.APPWRITE_FUNCTION_PROJECT_ID,key:req.headers?.['x-appwrite-key']});
      if(req.headers?.['x-appwrite-trigger']==='schedule') {
        if(configured&&env.ENQUIRY_ENABLED==='1')await createCloudEnquiry({branches:[],store,telegram:telegramFactory(env),env}).pump();
        const deleted=new Date().getUTCMinutes()===0?await store.prune(Date.now()):0;
        return res.json({ok:true,deleted},200,headers);
      }
      if(req.method!=='POST') throw new EnquiryError('Use the enquiry button.',405);
      if((req.bodyText||'').length>10000) throw new EnquiryError('Request too large.',413);
      let body; try {body=req.bodyJson??JSON.parse(req.bodyText);} catch {throw new EnquiryError('Invalid request.');}
      if(!configured) throw new EnquiryError('The Telegram test is not connected yet.',503);
      const webhook=/^\/telegram\/(assistant|merchant)$/.exec(path);
      if(!webhook && origin && !allowed) throw new EnquiryError('Not allowed.',403);
      // Status polls/cancellation need no catalogue reads. It is loaded only for
      // a new enquiry or for a verified Telegram delivery.
      const needFacts=!!webhook||body.action==='create';
      const service=createCloudEnquiry({branches:needFacts?await branches():[],store,telegram:telegramFactory(env),env});
      const value=webhook?await service.webhook(webhook[1],req.headers?.['x-telegram-bot-api-secret-token'],body):await service.handle(req.headers?.authorization?.replace(/^Bearer /,''),body);
      return res.json(value,200,headers);
    } catch(e) { return res.json({error:e instanceof EnquiryError?e.message:'The enquiry service is temporarily unavailable.'},e instanceof EnquiryError?e.status:503,headers); }
  };
}
async function defaultBranches() { return catalogue??=(async()=>virtualBranches((await createSearchStore().catalog('short_term')).items))(); }
export default createEntry({loadBranches:defaultBranches});
