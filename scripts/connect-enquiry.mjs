// Cloud-only credential setup: JSON is read from stdin, kept in memory, and
// uploaded as Appwrite secret variables. Never writes a local token/config file.
import { spawnSync } from 'node:child_process';
import { randomBytes, createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { hiddenInput } from './enquiry-secret-input.mjs';
const root=resolve(import.meta.dirname,'..'),backend=resolve(root,'../appwrite-backend'),id='web-enquiry-demo';
const endpoint='https://equalpath-enquiry-demo-6a916a6c.appwrite.network';
function cli(args,missing=false) {
 const r=spawnSync(resolve(backend,'node_modules/.bin/appwrite'),[...args,'--json','--force'],{cwd:backend,encoding:'utf8',timeout:30000,maxBuffer:1000000});
 if(r.status!==0) {
  if(missing&&/not found|not exist/i.test(r.stdout+r.stderr))return null;
  let detail=String(r.stderr||r.stdout||r.error?.code||r.signal||r.status);
  for(let i=0;i<args.length;i++)if(args[i]==='--value')detail=detail.replaceAll(args[i+1],'[redacted]');
  detail=detail.replace(/\d{7,12}:[A-Za-z0-9_-]{30,}/g,'[redacted]').slice(-900);
  throw Error(`Cloud ${args.slice(0,2).join('/')} failed (${r.status ?? r.error?.code ?? r.signal}): ${detail}`);
 }
 return JSON.parse(r.stdout.slice(r.stdout.indexOf('{')));
}
async function telegram(token,method,body={}) {
 try {const r=await fetch(`https://api.telegram.org/bot${token}/${method}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});const v=await r.json();if(!r.ok||!v.ok)throw Error();return v.result;}
 catch {throw Error(`Telegram ${method} failed; private response withheld.`);}
}
if(!process.argv.includes('--connect')) {console.log('Use --connect --prompt for hidden terminal entry, or --connect with protected JSON stdin. Tokens are stored only in Appwrite cloud.');process.exit(0);}
async function readTokens() {
 if (process.argv.includes('--prompt')) {
  console.log('EqualPath Telegram cloud setup\nPaste each existing BotFather token, then press Enter. Input is hidden.\nTokens are saved only as Appwrite web-enquiry-demo secret variables. No local .env file is created.\nCtrl+C cancels.');
  return {assistant:await hiddenInput('@EqualPathCareDemoBot token: '),merchant:await hiddenInput('@EqualPathVirtualCentreBot token: ')};
 }
 let raw='';for await(const chunk of process.stdin){
  raw+=chunk;if(raw.length>4000)throw Error('Credential input too large.');
  // A protected pipe may remain open after its one message; do not wait for EOF.
  try { const value=JSON.parse(raw);raw='';return value; } catch {}
 }
 try {return JSON.parse(raw);} catch {throw Error('Invalid credential input. Nothing was saved.');} finally {raw='';}
}
let tokens;
try { tokens=await readTokens(); } catch(error) { console.error(error.message);process.exit(1); }
for(const role of ['assistant','merchant']) if(!/^\d+:[A-Za-z0-9_-]+$/.test(tokens[role]||''))throw Error('Two bot tokens are required.');
const self={assistant:await telegram(tokens.assistant,'getMe'),merchant:await telegram(tokens.merchant,'getMe')};
if(self.assistant.username!=='EqualPathCareDemoBot'||self.merchant.username!=='EqualPathVirtualCentreBot')throw Error('Unexpected bot identity; nothing was configured.');
console.log('Verified both expected Telegram bot identities.');
for(const role of ['assistant','merchant']) {const w=await telegram(tokens[role],'getWebhookInfo');if(w.url&&w.url!==`${endpoint}/telegram/${role}`)throw Error('A bot already has another webhook. Nothing was changed.');}
const existing=cli(['functions','list-variables','--function-id',id]);
if((existing.variables||[]).some(v=>v.key.startsWith('TELEGRAM_')||v.key==='ENQUIRY_OWNER_SECRET'))throw Error('Cloud secret configuration already exists. Inspect its state before replacing anything.');
const secret=()=>randomBytes(32).toString('hex');
const variableId=key=>'eqenq_'+createHash('sha256').update(key).digest('hex').slice(0,24);
const settings={TELEGRAM_ASSISTANT_TOKEN:tokens.assistant,TELEGRAM_MERCHANT_TOKEN:tokens.merchant,
 TELEGRAM_ASSISTANT_USERNAME:self.assistant.username,TELEGRAM_MERCHANT_USERNAME:self.merchant.username,
 TELEGRAM_ASSISTANT_ID:String(self.assistant.id),TELEGRAM_MERCHANT_ID:String(self.merchant.id),
 TELEGRAM_ASSISTANT_WEBHOOK_SECRET:secret(),TELEGRAM_MERCHANT_WEBHOOK_SECRET:secret(),ENQUIRY_OWNER_SECRET:secret(),ENQUIRY_ALLOW_LOCAL:'1'};
for(const [key,value] of Object.entries(settings)) {
 cli(['functions','create-variable','--function-id',id,'--variable-id',variableId(key),'--key',key,'--value',value,'--secret=true']);
 console.log(`Saved cloud setting: ${key}`);
}
for(const role of ['assistant','merchant'])await telegram(tokens[role],'setWebhook',{url:`${endpoint}/telegram/${role}`,secret_token:settings[`TELEGRAM_${role.toUpperCase()}_WEBHOOK_SECRET`],allowed_updates:['message'],max_connections:2,drop_pending_updates:false});
// Enable only after both official Telegram webhooks are registered.
cli(['functions','create-variable','--function-id',id,'--variable-id',variableId('ENQUIRY_ENABLED'),'--key','ENQUIRY_ENABLED','--value','1','--secret=false']);
const receipt={configuredAt:new Date().toISOString(),assistant:self.assistant.username,merchant:self.merchant.username,endpoint,secrets:'Appwrite Function secret variables only',webhooksVerified:false,roundtripVerified:false};
for(const role of ['assistant','merchant']) {const w=await telegram(tokens[role],'getWebhookInfo');if(w.url!==`${endpoint}/telegram/${role}`)throw Error('Webhook verification failed.');}
receipt.webhooksVerified=true;
writeFileSync(resolve(root,'evidence/telegram-cloud-20261010/connection.json'),JSON.stringify(receipt,null,2)+'\n');
console.log(JSON.stringify(receipt));
