// Parse a dedicated public fee field only, never numbers elsewhere in a page.
export function listingFeeFacts(text, evidence) {
  if (typeof text !== 'string' || /<input|placeholder\s*=/i.test(text)) return [];
  const facts = [];
  for (const line of text.split(/\n|;/).map(s => s.trim()).filter(Boolean)) {
    const matches = [...line.matchAll(/RM\s*([\d,]+(?:\.\d{1,2})?)/gi)];
    if (!matches.length || matches.length > 2) continue;
    const amounts = matches.map(m => Number(m[1].replaceAll(',', '')));
    if (amounts.some(n => !Number.isFinite(n) || n <= 0)) continue;
    const registration = /registration|pendaftaran/i.test(line);
    const basis = registration ? 'one_off' : /per month|monthly|bulanan|\/\s*(?:month|mo|bulan)\b/i.test(line) ? 'month' : /per term|termly/i.test(line) ? 'term' : /per year|annually|tahunan/i.test(line) ? 'year' : 'unspecified';
    const startsAt = amounts.length === 1 && /from|onwards|starting|bermula|serendah/i.test(line);
    if (amounts.length === 2 && amounts[1] < amounts[0]) continue;
    facts.push({ amount: amounts.length === 1 && !startsAt ? amounts[0] : null, min: amounts.length === 2 || startsAt ? amounts[0] : null, max: amounts.length === 2 ? amounts[1] : null,
      currency: 'MYR', basis, kind: registration ? 'registration' : 'programme',
      conditions: `${registration ? 'Registration fee.' : 'Published branch programme fees.'}${startsAt ? ' Starting price; the final amount depends on the programme.' : ''}${basis === 'unspecified' ? ' Billing period is not stated in the listing.' : ''}`,
      verification: 'directory_published', source_kind: 'kiddy123_directory', source_updated_at: null,
      original_fee_source_url: null, fee_document_url: null, ...evidence });
  }
  return facts;
}
