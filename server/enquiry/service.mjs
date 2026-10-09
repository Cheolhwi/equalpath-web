import { createHmac, timingSafeEqual } from 'node:crypto';
import { canonicalEnquiry, decide, EnquiryError, hash, messageFor } from '../../experiments/virtual-enquiry/model.mjs';
export const RETENTION_MS = 30 * 60 * 1000, REPLY_MS = 120000;
export const QUEUE_MS = 10 * 60 * 1000;
export const requestText = j => `EPDEMO/1 REQUEST ${j.id}\n${j.message}`;
export const replyText = (j, result) => `EPDEMO/1 REPLY ${j.id}\n${result.rawReply}`;
const eventId = (id, phase) => `${id}_${phase}`;
export function equalSecret(a, b) { return typeof a === 'string' && typeof b === 'string' && a.length >= 32 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b)); }
export function createCloudEnquiry({ branches, store, telegram, env, now = Date.now }) {
  if (!env.ENQUIRY_OWNER_SECRET || env.ENQUIRY_OWNER_SECRET.length < 32) throw Error('Demo service configuration is incomplete.');
  const ownerHash = token => {
    if(!/^[a-f0-9]{64}$/.test(token || '')) throw new EnquiryError('Open a new demo session.', 401);
    return createHmac('sha256', env.ENQUIRY_OWNER_SECRET).update(token).digest('hex');
  };
  const event = (j, phase, data = {}) => store.put(eventId(j.id, phase), { phase, ...data }, { parent: j.id, expiresAt: j.retainedUntil });
  async function load(id) {
    if(!/^[a-f0-9]{24}$/.test(id || '')) throw new EnquiryError('This demo request has expired.', 404);
    const j = await store.get(id);
    if(!j || now() >= j.retainedUntil) throw new EnquiryError('This demo request has expired.', 404);
    return j;
  }
  async function snapshot(j) {
    const events = (await store.events(j.id)).filter(e => e.phase).sort((a,b) => a.at-b.at);
    const cancel = events.find(e => e.phase === 'cancel'), failed = events.find(e => e.phase === 'failed');
    const dispatch = events.find(e => e.phase === 'dispatch');
    const expiresAt=dispatch?dispatch.at+REPLY_MS:j.queueUntil;
    const received = events.find(e => e.phase === 'received' && e.at < expiresAt);
    let state = received ? 'replied' : now() >= expiresAt ? 'timed_out' : dispatch ? 'waiting' : 'queued';
    if(cancel && (!received || cancel.at <= received.at)) state = 'cancelled';
    if(failed && (!received || failed.at < received.at) && state !== 'cancelled') state = 'failed';
    const labels = { sent:'Sent through Telegram to the virtual centre.', merchant:'The virtual centre received your request on Telegram.', received:'The virtual centre replied through Telegram.', cancel:'Enquiry stopped. No booking was made.', failed:'The Telegram enquiry could not be completed. No place is confirmed.' };
    return { id:j.id, request:j.request, branch:j.branch, simulation:true, transport:'telegram-cloud', message:j.message,
      sessionId:j.sessionId,createdAt:j.at, updatedAt:events.at(-1)?.at || j.at, expiresAt, state,
      events:[{ at:j.at,text:'Demo request added to the queue.' },...events.filter(e=>labels[e.phase]).map(e=>({at:e.at,text:labels[e.phase]})),
        ...(state==='timed_out'?[{at:expiresAt,text:dispatch?'No reply arrived in time. This does not mean no places.':'The queue wait ended. Please try again.'}]:[])],
      result: state === 'replied' ? received.result : null };
  }
  async function isPending(j) { return ['queued','waiting'].includes((await snapshot(j)).state); }
  async function pump() {
    // Every worker sees the oldest unfinished job. An immutable, unique claim
    // lets only one worker send it; all other jobs wait for its terminal state.
    // A crashed sender is never retried ambiguously: its reply deadline frees
    // the queue, and the user may explicitly start a new request.
    // Read one head, not the entire waiting line, on every submission/reply.
    // Keep cleanup bounded if several expired/cancelled heads remain.
    for(let scanned=0;scanned<20;scanned++) {
      const [j]=await store.queue();
      if(!j)return;
      const s=await snapshot(j);
      if(!['queued','waiting'].includes(s.state)) { await store.setKind(j.id,'done');continue; }
      if(s.state==='waiting')return;
      if(!await event(j,'dispatch'))return;
      try {
        // A cancel that arrived before the send claim remains authoritative.
        if(!await isPending(j)){await store.setKind(j.id,'done');return;}
        await telegram.send('assistant',requestText(j));
        await event(j,'sent');
      } catch {await event(j,'failed');await store.setKind(j.id,'done');}
      return;
    }
  }
  async function finish(j) {if(!await isPending(j))await store.setKind(j.id,'done');await pump();}
  return {
    pump,
    async handle(token, body) {
      const owner = ownerHash(token);
      if(body.action === 'create') {
        if(env.ENQUIRY_ENABLED !== '1') throw new EnquiryError('The Telegram demo is not connected yet.', 503);
        if(!/^[a-f0-9]{32}$/.test(body.nonce || '')) throw new EnquiryError('Start a new demo request.');
        // Scenario overrides are internal local QA only, never public controls.
        if(body.request?.scenario && body.request.scenario !== 'rules') throw new EnquiryError('Only the virtual centre can choose its reply.');
        const request = canonicalEnquiry(body.request, branches), fingerprint=hash(JSON.stringify(request));
        const id = hash(owner + ':' + body.nonce).slice(0,24);
        const existing = await store.get(id);
        if(existing) {
          if(existing.owner !== owner || existing.fingerprint !== fingerprint) throw new EnquiryError('Request details changed. Start again.',409);
          if(now()>=existing.retainedUntil)throw new EnquiryError('This demo request has expired.',404);
          return { job:await snapshot(existing),reused:true };
        }
        const branch = branches.find(b=>b.id===request.branchId), createdAt=now();
        const j = { owner,sessionId:hash(owner).slice(0,24),fingerprint,request,branch:{id:branch.id,name:branch.name,listedName:branch.listedName}, message:messageFor(request,branch), queueUntil:createdAt+QUEUE_MS,retainedUntil:createdAt+RETENTION_MS };
        const saved = await store.put(id,j,{kind:'registering',expiresAt:j.retainedUntil});
        if(!saved) {
          const concurrent = await load(id);
          if(concurrent.owner !== owner || concurrent.fingerprint !== fingerprint) throw new EnquiryError('Request details changed. Start again.',409);
          return { job:await snapshot(concurrent),reused:true };
        }
        try {
          const day = new Date(now()).toISOString().slice(0,10), quotaExpiry=Date.parse(`${day}T00:00:00Z`)+48*3600000;
          await store.quota(`u_${hash(owner+day).slice(0,30)}`,10,quotaExpiry);
          await store.quota(`g_${day}`,200,quotaExpiry);
          // Append only after admission/quota checks. The queue row's database
          // sequence is the FIFO order even if initial requests race or stall.
          await store.put(`${id}_queue`,saved,{kind:'queued',expiresAt:j.retainedUntil});
          await pump();
        } catch(e) { await event(saved,'failed');await store.setKind(id,'done');if(e.status===429) throw new EnquiryError(e.message,429); }
        return { job:await snapshot(saved) };
      }
      const j = await load(body.id);
      if(j.owner !== owner) throw new EnquiryError('This demo request is not in this browser session.',404);
      // Progress reads never scan or advance other users' jobs. Submission,
      // Telegram webhooks and cancellation advance the queue immediately;
      // scheduled recovery handles interrupted workers and reply timeouts.
      if(body.action === 'get') return { job:await snapshot(j) };
      if(body.action === 'cancel') { if(await isPending(j)) await event(j,'cancel');await finish(j);return { job:await snapshot(j) }; }
      throw new EnquiryError('Unknown demo action.');
    },
    async webhook(role, secret, update) {
      const expectedSecret = role==='merchant'?env.TELEGRAM_MERCHANT_WEBHOOK_SECRET:env.TELEGRAM_ASSISTANT_WEBHOOK_SECRET;
      if(!['merchant','assistant'].includes(role) || !equalSecret(secret,expectedSecret)) throw new EnquiryError('Not allowed.',403);
      const m=update?.message,peer=role==='merchant'?env.TELEGRAM_ASSISTANT_ID:env.TELEGRAM_MERCHANT_ID;
      // Ignore human chats, groups, forwards, arbitrary bots and edited messages.
      if(!m || !m.from?.is_bot || String(m.from.id)!==peer || m.chat?.type!=='private' || String(m.chat.id)!==peer || m.forward_origin) return {ok:true,ignored:true};
      const match=/^EPDEMO\/1 (REQUEST|REPLY) ([a-f0-9]{24})\n/.exec(m.text||'');
      if(!match || match[1] !== (role==='merchant'?'REQUEST':'REPLY')) return {ok:true,ignored:true};
      let j; try { j=await load(match[2]); } catch(e) { if(e.status===404) return {ok:true,ignored:true}; throw e; }
      if((await snapshot(j)).state!=='waiting') return {ok:true,ignored:true};
      const branch=branches.find(b=>b.id===j.request.branchId),result=decide(j.request,branch);
      if(role==='merchant') {
        if(m.text!==requestText(j)) return {ok:true,ignored:true};
        if(!await event(j,'merchant')) return {ok:true,duplicate:true};
        try { await telegram.send('merchant',replyText(j,result)); }
        catch { await event(j,'failed');await finish(j); }
      } else {
        // A result appears only after the allowlisted merchant's actual Telegram
        // reply arrives and exactly matches this request's structured rules.
        if(m.text!==replyText(j,result)) { await event(j,'failed');await finish(j);return {ok:true,invalidReply:true}; }
        await event(j,'received',{result,telegramMessageId:m.message_id});
        await finish(j);
      }
      return {ok:true};
    },
  };
}
