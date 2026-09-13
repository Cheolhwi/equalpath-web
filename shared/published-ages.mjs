// Parse a labelled admission-age field, never arbitrary numbers in page text.
export function parsePublishedAge(value) {
  const raw = String(value ?? '').trim();
  if (!raw || raw.length > 400) return null;
  const text = raw.toLowerCase().split('(')[0].trim()
    .replace(/\b(tahun|years?|yrs?)\b/g, 'years')
    .replace(/\b(bulan|months?|mths?|mos?)\b/g, 'months')
    .replace(/\bold\b/g, '')
    .replace(/^(?:student age group|admission ages?|ages?|aged|umur|usia)\s*:?\s*/, '')
    .replace(/\s+/g, ' ').trim();
  const number = '(\\d+(?:\\.\\d+)?)', unit = '(years|months)';
  const range = text.match(new RegExp(`^${number}\\s*${unit}?\\s*(?:[-–—]|to|hingga|sehingga)\\s*${number}\\s*${unit}$`));
  const amount = (n, u) => Number(n) * (u === 'years' ? 12 : 1);
  const label = (n, u) => `${Number(n)} ${Number(n) === 1 ? u.slice(0, -1) : u}`;
  if (range) {
    const [, a, firstUnit, b, lastUnit] = range, u = firstUnit || lastUnit;
    const min = amount(a, u), max = amount(b, lastUnit);
    if (!Number.isFinite(min) || min < 0 || max <= min || max > 216) return null;
    return {min, max, endpointKnown: false, wording: u===lastUnit ? `${Number(a)}–${label(b,lastUnit)}` : `${label(a,u)}–${label(b,lastUnit)}`, raw};
  }
  const under = text.match(new RegExp(`^(?:under|below|di bawah(?: umur)?|bawah)\\s+${number}\\s*${unit}$`));
  if (under) {
    const max = amount(under[1],under[2]);
    if (max <= 0 || max > 216) return null;
    return {min: 0, max, maxInclusive: false, endpointKnown: true, wording: `Under ${label(under[1],under[2])}`, raw};
  }
  return null;
}

export function ageRangeLabel(age) {
  if (age.basis === 'type_reference') return age.wording;
  const unit = n => n >= 12 && n % 12 === 0 ? `${n/12} ${n===12?'year':'years'}` : `${n} ${n===1?'month':'months'}`;
  return age.max == null ? `${unit(age.min)} and up` : `${unit(age.min)}–${unit(age.max)}`;
}

export function referenceAgeFor(category) {
  const source = {retrievedAt: '2026-09-13', sourceDate: null, kind: 'type_reference'};
  if (category === 'TASKA') return {
    min: 0, max: 48, maxInclusive: false, endpointKnown: true,
    basis: 'type_reference', wording: 'Under 4 years',
    source: {...source, label: 'KPWKM — TASKA age definition', url: 'https://www.kpwkm.gov.my/portal-main/list-services?type=taman-asuhan-kanak-kanak'},
  };
  if (category === 'TADIKA') return {
    min: 48, max: 84, maxInclusive: false, endpointKnown: true,
    basis: 'type_reference', wording: '4–6 years',
    source: {...source, label: 'KPM — preschool age reference', url: 'https://www.moe.gov.my/matlamat-pendidikan-prasekolah'},
  };
  return null;
}
