const ended = ['failed', 'timed_out', 'cancelled'];
const childKey = (children) => JSON.stringify(children.map(c => [String(c.age ?? ''), c.start, c.end]).sort());

// Keep whole conversations: a two-centre enquiry must never lose one half
// merely because a newer single-centre enquiry was opened.
export function keepEnquiryConversations(items, limit = 5) {
  const keys = items.map((t, i) => /^group:[a-f0-9]{16}$/.test(t.group ?? '') ? t.group : `single:${i}`);
  const keep = new Set([...new Set(keys)].slice(-limit));
  return items.filter((_, i) => keep.has(keys[i]));
}

// Compare full branch/child visits before opening a confirmed family plan.
export function enquiryVisitsMatch(payloads, visits) {
  const rows = xs => xs.flatMap(p => (p.children ?? []).map(c =>
    [p.branchId, p.date, String(c.age ?? ''), c.start, c.end])).sort();
  return payloads.length > 0 && JSON.stringify(rows(payloads)) === JSON.stringify(rows(visits));
}

export function pendingGroupDecisions(threads) {
  if (threads.length !== 2 || threads.some(t => t.deciding || t.job?.confirmation?.state === 'sending')) return [];
  const decisions = threads.map(t => t.job?.confirmation?.decision).filter(Boolean);
  const consistent = !decisions.length || decisions.every(d => d === decisions[0]);
  if (!consistent || threads.some(t => t.job?.confirmation?.state === 'failed')) return [];
  return threads.filter(t => !t.job?.confirmation).map(t => ({ key: t.key, decision: decisions[0] ?? null }));
}

// Family plans require the exact requested times for both children. An offer
// on another day or at a later start does not make that original plan workable.
export function enquiryChildDeclined(child, family = false) {
  return family ? ['unavailable', 'conditional'].includes(child.state)
    : child.state === 'unavailable' && !child.offer;
}

export function enquiryGroupFor(threads, payloads) {
  const wanted = payloads.map(p => JSON.stringify(p)).sort();
  const groups = [...new Set(threads.map(t => t.group).filter(Boolean))];
  return groups.find(g => JSON.stringify(threads.filter(t => t.group === g).map(t => JSON.stringify(t.payload)).sort()) === JSON.stringify(wanted)) ?? null;
}

export function addEnquiryGroup(threads, items, group) {
  if (threads.some(t => t.group === group)) return threads;
  const added = items.map((item, i) => {
    const old = threads.findLast(t => JSON.stringify(t.payload) === JSON.stringify(item.payload));
    return { key: `${group}:${i}`, ...item, family: true, group, job: old?.job ?? null,
      error: '', busy: false, paused: false, retry: 0, unread: false };
  });
  return keepEnquiryConversations([...threads, ...added]);
}

// A reply belongs to the whole visit, not just the branch and date. Preserve
// multiplicity: two children with identical ages/times still need two places.
export function enquiryStatus(threads, branchId, requests = []) {
  const date = requests[0]?.date;
  if (!date || !requests.length || requests.some(r => r.date !== date || !r.deadline || !r.end)) return null;
  const children = childKey(requests.map(r => ({ age: r.age, start: r.deadline, end: r.end })));
  const matching = threads.filter(t => t.payload?.branchId === branchId && t.payload.date === date
    && Array.isArray(t.payload.children) && childKey(t.payload.children) === children
    && t.job && !ended.includes(t.job.state));
  if (!matching.length) return null;
  if (matching.some(t => t.job.confirmation?.state === 'acknowledged' && t.job.confirmation.decision === 'accept')) return 'confirmed';
  if (matching.some(({ job }) => !job.confirmation && job.result && (job.result.outcome === 'available'
    || (job.result.children?.length && job.result.children.every(c => c.state === 'available'))))) return 'available';
  return matching.some(t => t.job.result) ? 'replied' : 'asked';
}

// Persist references only; visit details come back from the authenticated job.
export function openEnquiryReferences(threads) {
  return keepEnquiryConversations(threads.filter(t => t.job?.id)).map(t => ({ id: t.job.id, family: !!t.family,
    // Two centres asked together share a random group ID (no visit details).
    ...(/^group:[a-f0-9]{16}$/.test(t.group ?? '') ? { group: t.group } : {}),
    centre: t.centre?.id ? { id: t.centre.id, name: t.centre.name } : null }));
}

export function restoredEnquiryPayload(job, reference) {
  if (!job?.request?.date || !Array.isArray(job.request.children) || !job.request.children.length) return null;
  return { branchId: reference.centre?.id || job.request.branchId, date: job.request.date,
    children: job.request.children.map(c => ({ label: c.label, age: String(c.age ?? ''), start: c.start, end: c.end })),
    questions: [...(job.request.questions || ['visit', 'fees'])].sort(), scenario: job.request.scenario || 'rules' };
}
