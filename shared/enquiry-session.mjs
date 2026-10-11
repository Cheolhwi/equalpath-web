const ended = ['failed', 'timed_out', 'cancelled'];
const childKey = (children) => JSON.stringify(children.map(c => [String(c.age ?? ''), c.start, c.end]).sort());

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
  return threads.filter(t => t.job?.id).slice(-5).map(t => ({ id: t.job.id, family: !!t.family,
    centre: t.centre?.id ? { id: t.centre.id, name: t.centre.name } : null }));
}

export function restoredEnquiryPayload(job, reference) {
  if (!job?.request?.date || !Array.isArray(job.request.children) || !job.request.children.length) return null;
  return { branchId: reference.centre?.id || job.request.branchId, date: job.request.date,
    children: job.request.children.map(c => ({ label: c.label, age: String(c.age ?? ''), start: c.start, end: c.end })),
    questions: [...(job.request.questions || ['visit', 'fees'])].sort(), scenario: job.request.scenario || 'rules' };
}
