import { randomBytes } from 'node:crypto';
import { canonicalEnquiry, decide, EnquiryError, hash, messageFor, replyDelayMs } from './model.mjs';

export function createEnquiryService({ branches, transport = null, delayMs = null, timeoutMs = 120000, ttlMs = 30 * 60 * 1000, now = Date.now } = {}) {
  const jobs = new Map(), timers = new Set(), listeners = new Map();
  const later = (fn, delay) => { const t = setTimeout(() => { timers.delete(t); fn(); }, delay); t.unref?.(); timers.add(t); };
  const prune = () => { for (const [id, job] of jobs) if (now() - job.createdAt >= ttlMs) jobs.delete(id); };
  const publicJob = job => { const { owner, fingerprint, replying, ...rest } = job; return structuredClone(rest); };
  const get = (owner, id) => {
    prune(); const j = jobs.get(id);
    if (!j || j.owner !== owner) throw new EnquiryError('This test request has expired or is not in this browser session.', 404);
    return j;
  };
  const note = (j, text) => { j.updatedAt = now(); j.events.push({ at: j.updatedAt, text }); for (const emit of listeners.get(j.id) || []) emit(publicJob(j)); };
  async function reply(id, override) {
    const j = jobs.get(id);
    if (!j || j.state !== 'waiting' || j.replying) return false;
    if (now() >= j.expiresAt) { j.state = 'timed_out'; note(j, 'No reply arrived before the test time limit.'); return false; }
    const branch = branches.find(b => b.id === j.request.branchId);
    const result = decide(override ? { ...j.request, scenario: override } : j.request, branch);
    if (!result) return false;
    j.replying = true;
    try {
      if (transport) await transport.sendReply(result.rawReply);
      if (j.state !== 'waiting' || now() >= j.expiresAt) return false;
      j.result = result; j.state = 'replied'; note(j, 'The virtual centre replied.');
      return true;
    } catch { if (j.state === 'waiting') { j.state = 'failed'; note(j, 'The Telegram test reply could not be delivered. No acceptance was recorded.'); } return false; }
    finally { j.replying = false; }
  }
  return {
    config: () => ({ simulation: true, transport: transport?.name || 'local-simulation', count: branches.length,
      branches: branches.map(({ sourceId, ...b }) => ({ ...b, providerId: sourceId })), retentionMinutes: ttlMs / 60000 }),
    async handle(owner, body) {
      if (!/^[a-f0-9]{64}$/.test(owner ?? '')) throw new EnquiryError('Open a new test session.', 401);
      if (body.action === 'create') {
        prune(); const request = canonicalEnquiry(body.request, branches), fingerprint = hash(JSON.stringify(request));
        const existing = [...jobs.values()].find(j => j.owner === owner && j.fingerprint === fingerprint && !['cancelled', 'failed', 'timed_out'].includes(j.state));
        if (existing) return { job: publicJob(existing), reused: true };
        if (jobs.size >= 200 || [...jobs.values()].filter(j => j.owner === owner).length >= 30) throw new EnquiryError('Test limit reached. Wait for older requests to expire.', 429);
        const branch = branches.find(b => b.id === request.branchId), createdAt = now();
        const job = { id: randomBytes(12).toString('hex'), owner, fingerprint, request, simulation: true, branch: { id: branch.id, name: branch.name, listedName: branch.listedName },
          transport: transport?.name || 'local-simulation', message: messageFor(request, branch), state: 'queued',
          createdAt, updatedAt: createdAt, expiresAt: createdAt + timeoutMs, events: [], result: null };
        jobs.set(job.id, job); note(job, 'Test request created.');
        later(() => jobs.delete(job.id), ttlMs);
        later(async () => {
          if (job.state !== 'queued') return;
          try {
            if (transport) await transport.sendRequest(job);
            if (job.state !== 'queued') return;
            job.state = 'waiting'; note(job, transport ? 'Sent to your private Telegram test chat. Use a reply button there.' : 'The virtual centre is checking the test details.');
            if (!transport) later(() => { void reply(job.id); }, delayMs ?? replyDelayMs(job.id));
          } catch { if (job.state === 'queued') { job.state = 'failed'; note(job, 'The Telegram test message could not be sent.'); } }
        }, 20);
        later(() => { if (['queued', 'waiting'].includes(job.state)) { job.state = 'timed_out'; note(job, 'No reply arrived before the test time limit. This does not mean no places.'); } }, timeoutMs);
        return { job: publicJob(job) };
      }
      if (body.action === 'get') return { job: publicJob(get(owner, body.id)) };
      if (body.action === 'cancel') {
        const j = get(owner, body.id);
        if (['queued', 'waiting'].includes(j.state)) { j.state = 'cancelled'; note(j, 'Test stopped. An already sent Telegram message cannot be recalled.'); }
        return { job: publicJob(j) };
      }
      throw new EnquiryError('Unknown test action.');
    },
    subscribe(owner, id, emit) {
      const j = get(owner, id);
      if ((listeners.get(id)?.size || 0) >= 4) throw new EnquiryError('Too many open chats for this request.', 429);
      const set = listeners.get(id) || new Set(); listeners.set(id, set); set.add(emit);
      emit(publicJob(j));
      return () => { set.delete(emit); if (!set.size) listeners.delete(id); };
    },
    reply,
    close() { for (const t of timers) clearTimeout(t); transport?.stop?.(); jobs.clear(); listeners.clear(); },
  };
}
