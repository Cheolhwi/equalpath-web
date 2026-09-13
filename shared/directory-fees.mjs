// Only structured amounts rendered by the public fee section. Never parse form placeholders.
const positive = n => Number.isFinite(n) && n > 0;
export function directoryFeeFacts(row, sourceURL, retrievedAt) {
  const fees = [], verification = row.is_claimed ? 'school_reported_via_directory' : 'directory_published';
  const add = (kind, amount, min, max, basis, conditions, programme = null) => fees.push({
    kind, currency: 'MYR', amount, min, max, basis, programme, conditions,
    verification, source_url: sourceURL, source_kind: 'carischools_public_directory',
    source_retrieved_at: retrievedAt, source_updated_at: row.fee_updated_at ?? null,
    original_fee_source_url: row.fee_source_url ?? null,
    fee_document_url: row.fee_document_url ?? null,
  });
  const provenance = row.is_claimed ? 'School-reported on CariSchool.' : 'Published by CariSchool.';
  const programmes = (Array.isArray(row.fee_programs) ? row.fee_programs : []).filter(p => positive(p?.amount) && typeof p.program === 'string' && p.program.trim());
  for (const p of programmes) {
    const kind = /meal|makan|snack|breakfast|lunch|teatime/i.test(p.program) ? 'meal'
      : /transport|pengangkutan/i.test(p.program) ? 'transport' : 'programme';
    add(kind, p.amount, null, null, 'month', `${p.program.trim()}. ${provenance}`, p.program.trim());
  }
  // The directory sometimes derives fee_min from meal add-ons. Prefer named care programmes.
  if (!programmes.some(p => !/meal|makan|snack|breakfast|lunch|teatime|transport|pengangkutan/i.test(p.program)) && positive(row.fee_min) && (row.fee_max == null || positive(row.fee_max) && row.fee_max >= row.fee_min))
    add('tuition_range', null, row.fee_min, row.fee_max ?? row.fee_min, 'month', `${provenance} Programme and hours may affect the price.`);
  if (!row.fee_min && positive(row.monthly_fee)) {
    const basis = { monthly:'month', term:'term', semester:'semester', annual:'year' }[row.billing_period] ?? 'month';
    add('tuition_estimate', row.monthly_fee, null, null, basis, 'Directory estimate; not confirmed by the school.');
    fees.at(-1).verification = 'directory_estimate';
  }
  if (Number.isFinite(row.registration_fee) && row.registration_fee >= 0)
    add('registration', row.registration_fee, null, null, 'one_off', `Registration fee. ${provenance}`);
  if (Number.isFinite(row.annual_fee) && row.annual_fee >= 0)
    add('annual', row.annual_fee, null, null, 'year', `Annual fee. ${provenance}`);
  return fees;
}
