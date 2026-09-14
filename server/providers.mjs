import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { providerRegion } from "./geography.mjs";
import { parsePublishedHours } from "../shared/published-hours.mjs";
import { whatsappLink } from "../shared/whatsapp.mjs";
import { parsePublishedAge, referenceAgeFor, ageRangeLabel } from "../shared/published-ages.mjs";
const index = JSON.parse(
  readFileSync(new URL("./data/provenance-index.json", import.meta.url)),
);
const reviewedFees = JSON.parse(readFileSync(new URL('./data/reviewed-fees.json', import.meta.url)));
export const supplementVersion = "service-review-2026-09-13-v7";
export function safeURL(value) {
  try {
    const u = new URL(value);
    return ["https:", "http:"].includes(u.protocol) &&
      !u.username &&
      !u.password &&
      !/^(localhost|127\.|10\.|192\.168\.|\[)/.test(u.hostname)
      ? u.href
      : null;
  } catch {
    return null;
  }
}
export const source = (
  label,
  url,
  retrievedAt = null,
  sourceDate = null,
  kind = "public_directory",
) => ({ label, url: safeURL(url), retrievedAt, sourceDate, kind });
export function phoneFact(display, evidence) {
  let n = String(display ?? "").replace(/[^\d+]/g, "");
  if (n.startsWith("0")) n = "+60" + n.slice(1);
  else if (n.startsWith("60")) n = "+" + n;
  return evidence?.url && /^\+60\d{8,11}$/.test(n)
    ? { display: String(display), href: "tel:" + n, source: evidence }
    : null;
}
export function normalizeProvider(raw, release) {
  const region = providerRegion(raw);
  if (!region.allowed)
    return {
      held: {
        id: raw.id,
        reason: region.reason,
        sourceRegion: raw.state,
        coordinateRegion: region.region,
      },
    };
  const x = release === index.release ? index.records[raw.id] : null;
  if (
    x?.matchStatus &&
    x.matchStatus !== "matched" &&
    raw.registration?.authority === "JKM"
  )
    return {
      held: { id: raw.id, reason: "directory_branch_match_unresolved" },
    };
  const r = raw.registration ?? {},
    regSource = source(
      r.authority === "JKM"
        ? "JKM imported register"
        : r.authority === "KPM" ? "KPM code listed by CariSchool" : "Registration record",
      r.source_url,
      r.source_retrieved_at,
      r.source_date,
      r.authority === "JKM" ? "official_register" : "directory_claim",
    );
  const directory = source(
    raw.public_profile?.label ?? "CariSchool branch directory",
    raw.public_profile?.url ?? x?.directory?.source_url ?? (r.authority === "KPM" ? r.source_url : null),
    raw.public_profile?.retrievedAt ?? x?.directory?.retrieved_at ?? r.source_retrieved_at,
    raw.public_profile?.sourceDate ?? null,
    raw.public_profile?.kind ?? "public_directory",
  );
  const contactSource = raw.contact_source
    ? source(
        "Published branch contact",
        raw.contact_source.source_url,
        raw.contact_source.retrieved_at,
      )
    : raw.public_phone && x?.google?.phone === raw.public_phone
      ? source(
          "Google Maps branch contact",
          x.google.source_url,
          x.google.retrieved_at,
        )
      : raw.public_phone && x?.directory?.phone === raw.public_phone
        ? directory
        : null;
  const h = raw.operating_hours ?? {},
    hs = source(
      h.source_kind === "provider_website"
        ? "Provider website hours"
        : "Published business hours",
      h.new_observation_source ?? h.source_url,
      h.observed_on ?? h.source_retrieved_at,
    );
  const ageSource = source(
    "Published admission ages",
    raw.age_source?.source_url ?? raw.admission?.evidence_urls?.[0],
    raw.age_source?.retrieved_at ?? directory.retrievedAt,
  );
  const translatedAge = parsePublishedAge(raw.age_source?.raw);
  const translatedHours = parsePublishedHours(h.notes);
  const p = {
    id: raw.id,
    name: raw.display_name ?? raw.official_name,
    registeredName: raw.official_name,
    region: raw.state,
    district: raw.district,
    address: raw.address ?? null,
    addressSource: directory.url ? directory : null,
    location: region.location
      ? {
          ...region.location,
          source: source("Published location", raw.location.source_url),
          basis: region.reason,
        }
      : null,
    locationBasis: region.reason,
    category: r.authority === "JKM" ? "TASKA" : r.authority === "KPM" ? "TADIKA" : "CHILDCARE",
    mode: "live",
    version: release + ":" + supplementVersion,
    registration: {
      authority: r.authority,
      number: r.record_number ?? null,
      category: r.recorded_category,
      publishedName: raw.official_name,
      from: r.valid_from,
      until: r.valid_until,
      match: r.match_status,
      official:
        r.authority === "JKM" &&
        r.match_status === "existing_registered_record",
      source: regSource,
      missingImportedFields:
        r.authority === "JKM" ? ["postal address", "telephone"] : [],
      matchBasis:
        x?.google?.match_basis ??
        (r.authority === "JKM"
          ? "Stable imported branch record; separate directory facts retain their own sources."
          : r.authority === "KPM" ? "CariSchool lists this KPM code for the named branch. The current official registration status has not been independently checked." : "Service and contact details come from public provider pages. No government registration record has been matched."),
      warnings: r.warning_codes ?? [],
    },
    phone: phoneFact(raw.public_phone, contactSource),
    whatsapp: (raw.whatsapp_contacts ?? []).flatMap(c => {
      const contact=whatsappLink(c.url);
      return contact && safeURL(c.source_url) ? [{...contact,scope:c.scope??'branch',source:source(c.source_kind==='kiddy123_directory'?'Kiddy123 branch contact':'Provider website enquiry',c.source_url,c.retrieved_at)}] : [];
    }),
    website: safeURL(raw.website),
    sourcePage: safeURL(raw.website) ?? directory.url ?? regSource.url,
    age:
      raw.age_min_months != null && ageSource.url
        ? {
            min: raw.age_min_months,
            max: raw.age_max_months,
            endpointKnown: translatedAge?.endpointKnown ?? false,
            maxInclusive: translatedAge?.maxInclusive,
            wording:
              translatedAge?.wording ?? raw.age_source?.raw ??
              `${raw.age_min_months}–${raw.age_max_months} months (published range; endpoint convention unconfirmed)`,
            originalWording: raw.age_source?.raw ?? null,
            basis: 'published',
            source: ageSource,
          }
        : null,
    admission: {
      value: null,
      wording: raw.admission?.flexi_care_published
        ? "Flexi-care is advertised; one-off admission rules and current capacity need confirmation."
        : "No explicit one-off admission policy is available in the current sources.",
      source: raw.admission?.evidence_urls?.length
        ? source(
            "Service description",
            raw.admission.evidence_urls[0],
            x?.service?.[0]?.retrieved_on ?? "2026-09-12",
            x?.service?.[0]?.source_date,
            "editorial",
          )
        : null,
    },
    transport: {
      exists:
        typeof raw.transport?.published === "boolean"
          ? raw.transport.published
          : null,
      type: raw.transport?.type ?? null,
      coverage: null,
      wording: raw.transport?.wording ?? null,
      source: raw.transport?.source_url ? source('Published transport service',raw.transport.source_url,raw.transport.retrieved_at) : null,
    },
    pickupWindows: [],
    careWindows: (raw.care_windows ?? []).map(w => ({days:w.days,start:w.start,end:w.end,source:w.source})),
    lateRule: null,
    businessHours: {
      publishedSchedule: raw.published_hours_schedule ? {
        windows: raw.published_hours_schedule.windows,
        notes: raw.published_hours_schedule.notes,
        source: source('Published programme hours',raw.published_hours_schedule.source_url,raw.published_hours_schedule.retrieved_at),
      } : null,
      windows: (h.weekly_windows ?? [])
        .filter(
          (w) => !(h.excluded_estimated_weekdays ?? []).includes(w.weekday),
        )
        .map((w) => ({
          days: [w.weekday],
          start: w.start_minute,
          end: w.end_minute,
          source: hs,
        })),
      closedDays: h.closed_weekdays ?? [],
      source: hs,
      notes: h.notes ?? null,
      translatedNotes: translatedHours.translated || null,
    },
    dateExceptions: (h.date_exceptions ?? []).map((e) => ({
      ...e,
      source: hs,
    })),
    fees: (raw.fees ?? []).map((f) => ({
      amount: f.amount,
      min: f.min,
      max: f.max,
      currency: f.currency ?? "MYR",
      basis: f.basis ?? "unspecified",
      kind: f.kind,
      programme: f.programme ?? null,
      verification: f.verification ?? null,
      estimate: f.estimate ?? null,
      originalSource: safeURL(f.original_fee_source_url),
      documentURL: safeURL(f.fee_document_url),
      conditions: f.conditions ?? "Published basis only; one-off applicability and extra charges need confirmation.",
      source: source(
        f.verification === 'area_estimate' ? "Budget reference source" : f.verification === 'school_reported_via_directory' ? "School-reported fees on CariSchool" : f.verification === 'directory_estimate' ? "CariSchool fee estimate" : f.source_kind === 'provider_website' ? "Provider fee schedule" : "Published fees",
        f.source_url,
        f.source_retrieved_at ?? f.source_updated_at,
        f.source_updated_at ?? null,
        f.source_kind,
      ),
    })),
    feeRule: null,
    notes: raw.public_profile_notes ?? [],
    sources: [regSource, directory, hs, contactSource, ageSource, ...(raw.profile_sources ?? [])].filter(
      (s) => s?.url,
    ),
  };
  if (!p.businessHours.windows.length && hs.url) {
    p.businessHours.windows = translatedHours.windows
      .map(w => ({...w, days:w.days.filter(d=>!(h.excluded_estimated_weekdays ?? []).includes(d)),source:hs}))
      .filter(w => w.days.length);
    p.businessHours.closedDays = [...new Set([...p.businessHours.closedDays,...translatedHours.closedDays])];
  }
  if (raw.id === "provider_c00ea9e07bdc5e171806cc3e768") {
    const s = source(
      "EDWETHINK — childcare and contact",
      "https://www.edwethink.com/child-care-centre",
      "2026-09-12",
      null,
      "provider_website",
    );
    p.age = {
      min: 15,
      max: null,
      endpointKnown: true,
      wording: "15 months and up (ordinary childcare programme)",
      source: s,
    };
    p.phone = phoneFact("+60 10-466 0613", s);
    p.businessHours = {
      windows: [
        {
          days: ["MON", "TUE", "WED", "THU", "FRI"],
          start: 480,
          end: 1080,
          source: s,
        },
        { days: ["SAT"], start: 540, end: 1140, source: s },
      ],
      closedDays: ["SUN"],
      source: s,
    };
    p.sources.push(s);
  }
  if (raw.id === "provider_57987832b49511aad3a52391f1b") {
    const s = source(
      "Little Whale — official branch contact",
      "https://www.littlewhalechildcarecentre.com/",
      "2026-09-12",
      null,
      "provider_website",
    );
    const service = source(
      "CariSchool — Little Whale service description",
      "https://www.carischools.com/school/little-whale-child-care-centre-selangor",
      "2026-09-12",
    );
    const ages = source(
      "Little Whale — programmes",
      "https://www.littlewhalechildcarecentre.com/services-1",
      "2026-09-12",
      null,
      "provider_website",
    );
    p.phone = phoneFact("+60 16 362 3022", s);
    p.admission = {
      value: true,
      wording:
        "The branch directory explicitly lists hourly care; confirm the session, notice and capacity directly.",
      source: service,
    };
    p.age = {
      min: 2,
      max: 48,
      endpointKnown: false,
      wording:
        "Infant care: 2–18 months; toddler care: 18 months–4 years. Endpoint convention needs confirmation.",
      source: ages,
    };
    p.sources.push(s, service, ages);
  }
  if (raw.id === "provider_05ae2bd1eaed1fbc438f3c4fc57")
    p.notes.push(
      "Kiddy123 describes weekend care, while Maps lists weekends closed. Ask whether weekend care is by arrangement.",
    );
  if (raw.admission_review) {
    const review = raw.admission_review;
    p.admission = {
      value: review.status === 'published' ? true : review.status === 'not_offered' ? false : null,
      wording: review.wording,
      question: review.question,
      source: review.sources[0],
      sources: review.sources,
      serviceTypes: review.service_types,
      scope: review.scope,
      evidenceStatus: review.status,
      sameDayAcceptance: 'unknown',
      placesAvailable: 'unknown',
    };
    p.sources.push(...review.sources);
  }
  p.sources = [...new Map(p.sources.map((s) => [s.url, s])).values()];
  const reviewed = reviewedFees.records.find(row => row.id === p.id);
  if (reviewed) {
    p.fees.push(...reviewed.fees.filter(f => !p.fees.some(x => x.source?.url === f.source?.url && x.amount === f.amount && (x.min ?? null) === (f.min ?? null) && (x.max ?? null) === (f.max ?? null) && x.basis === f.basis && x.conditions === f.conditions)));
    if (reviewed.phone) p.phone = phoneFact(reviewed.phone.display, reviewed.phone.source);
    p.sources.push(reviewed.matchSource, ...new Map(reviewed.fees.map(f => [f.source.url,f.source])).values());
  }
  if(raw.additional_operating_hours){
    const h=raw.additional_operating_hours,s=source(h.source_kind==='provider_website'?'Provider website opening hours':'Kiddy123 opening hours',h.source_url,h.retrieved_at);
    const alternative={windows:h.weekly_windows.map(w=>({days:[w.weekday],start:w.start_minute,end:w.end_minute,source:s})),closedDays:h.closed_weekdays,notes:h.notes,source:s};
    const known=new Set([...p.businessHours.closedDays,...p.businessHours.windows.flatMap(w=>w.days)]);
    p.businessHours.windows.push(...alternative.windows.filter(w=>!known.has(w.days[0])));
    p.businessHours.closedDays.push(...alternative.closedDays.filter(d=>!known.has(d)));
    p.businessHours.alternative=alternative;
    p.sources.push(s);
  }
  if (!p.age) p.age = referenceAgeFor(p.category);
  if (p.age) {
    p.age.basis ??= 'published';
    p.age.rangeLabel = ageRangeLabel(p.age);
    if (raw.additional_admission_age) {
      const extra = raw.additional_admission_age;
      const parsed = parsePublishedAge(extra.raw);
      if (parsed && (parsed.min !== p.age.min || parsed.max !== p.age.max)) {
        p.age.alternative = {...parsed, source: source('Additional published admission ages', extra.source_url, extra.retrieved_at)};
      }
    }
    p.sources.push(p.age.source, p.age.alternative?.source);
    p.sources = [...new Map(p.sources.filter(s=>s?.url).map(s=>[s.url,s])).values()];
  }
  return { provider: p };
}
export function buildCatalog(rows, release) {
  const items = [],
    held = [];
  for (const row of rows) {
    const p = normalizeProvider(row, release);
    if (p.provider) items.push(p.provider);
    else held.push(p.held);
  }
  return {
    items,
    held,
    release,
    version: release + ":" + supplementVersion,
    hash: createHash("sha256").update(JSON.stringify(items)).digest("hex"),
  };
}
