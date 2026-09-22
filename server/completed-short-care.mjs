import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const dataPath = resolve(import.meta.dirname, "data/short-care-completed-20260923.json");
const payload = JSON.parse(readFileSync(dataPath, "utf8"));
const byId = new Map(payload.providers.map(provider => [provider.id, provider]));
const DAYS = { mon: "MON", tue: "TUE", wed: "WED", thu: "THU", fri: "FRI", sat: "SAT", sun: "SUN" };
const minutes = value => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!match) return null;
  const result = Number(match[1]) * 60 + Number(match[2]);
  return result >= 0 && result <= 1439 ? result : null;
};
const safeNumber = value => Number.isFinite(Number(value)) ? Number(value) : null;
const currentSource = record => ({
  ...record.source,
  label: "Current provider data · user-provided completion sheet",
  current: true,
});
const currentFeeSource = record => ({
  ...(record.feeSource ?? record.source),
  current: true,
});
const feeProvenance = record => ({
  kind: "current_fee_data",
  source: currentFeeSource(record),
  estimatedFields: record.estimatedFields,
});
const mergeTopicEvidence = (existing, incoming) => {
  const merged = { ...(existing ?? {}) };
  for (const [group, value] of Object.entries(incoming ?? {})) {
    const old = merged[group];
    if (!old || value.positiveCount > (old.positiveCount ?? 0)) merged[group] = value;
  }
  return merged;
};
const parseDays = value => {
  const lower = String(value ?? "").toLowerCase();
  const days = Object.entries(DAYS).filter(([name]) => lower.includes(name)).map(([, day]) => day);
  if (lower.includes("daily")) return Object.values(DAYS);
  if (lower.includes("mon–fri") || lower.includes("mon-fri")) return ["MON", "TUE", "WED", "THU", "FRI"];
  if (lower.includes("mon–sat") || lower.includes("mon-sat")) return ["MON", "TUE", "WED", "THU", "FRI", "SAT"];
  return [...new Set(days)];
};

/**
 * Merge the current completion handoff into the immutable public catalogue.
 * Provider facts are usable search evidence, but every derived fact remains
 * visibly attributable to the current handoff. Review evidence is derived from
 * the supplied review sheet and is used only for preference reranking.
 */
export function applyCompletedShortCareData(catalog) {
  if (!catalog || !Array.isArray(catalog.items)) return catalog;
  return {
    ...catalog,
    items: catalog.items.map(provider => {
      const record = byId.get(provider.id);
      if (!record) return provider;
      const facts = record.facts;
      const source = currentSource(record);
      const feeSource = currentFeeSource(record);
      const updated = { ...provider, completedShortCare: record };

      // This workbook is the authoritative short-care handoff. Replace the
      // short-care facts for these 101 branches, while retaining unrelated
      // catalogue fields such as map coordinates and branch identity.
      if (facts.acceptsShortCare != null) {
        updated.admission = {
          value: facts.acceptsShortCare,
          wording: `The current provider data lists ${facts.shortCareTypes.join(", ") || "short-time care"}. Confirm a place, notice and the actual fee before travelling.`,
          source,
          sourceKind: source.kind,
          evidenceStatus: "current_provider_data",
          serviceTypes: facts.shortCareTypes,
          sameDayAcceptance: facts.sameDayBooking,
          placesAvailable: "unknown",
          question: "Can you take my child on this date, and is there a place for the requested hours?",
        };
      }

      if (facts.shortCareMinAgeMonths != null && facts.shortCareMaxAgeMonths != null) {
        updated.age = {
          min: facts.shortCareMinAgeMonths,
          max: facts.shortCareMaxAgeMonths,
          endpointKnown: true,
          maxInclusive: true,
          basis: "current_provider_data",
          wording: `${facts.shortCareMinAgeMonths}–${facts.shortCareMaxAgeMonths} months for short-time care (current provider data; confirm the child's exact age).`,
          rangeLabel: `${facts.shortCareMinAgeMonths} months–${Math.floor(facts.shortCareMaxAgeMonths / 12)} years`,
          source,
        };
      }

      const currentHours = provider.businessHours ?? { windows: [], closedDays: [], source: null };
      if (minutes(facts.openTime) != null && minutes(facts.closeTime) != null) {
        const days = parseDays(facts.openDays);
        updated.businessHours = {
          ...currentHours,
          windows: days.map(day => ({ days: [day], start: minutes(facts.openTime), end: minutes(facts.closeTime), source })),
          source,
          notes: "Current provider data; confirm date-specific care hours.",
        };
      }

      if (facts.offersTransport != null) {
        updated.transport = {
          ...(provider.transport ?? {}),
          exists: facts.offersTransport,
          type: facts.offersTransport ? "centre_transport" : null,
          wording: facts.offersTransport
            ? `Transport is listed within ${facts.transportRadiusKm ?? "the stated"} km. Confirm the route and seat.`
            : "The current provider data does not list centre transport.",
          source: facts.transportFeeMYRMonth != null ? feeSource : source,
        };
      }

      const earliest = minutes(facts.earliestPickup), latest = minutes(facts.latestPickup);
      if (updated.transport?.exists === true && earliest != null && latest != null) {
        updated.pickupWindows = [{ days: parseDays(facts.openDays), start: earliest, end: latest, source }];
      }
      if (latest != null) {
        updated.lateRule = { latestEnd: latest, wording: facts.latePickupRule || `Late collection is listed after ${facts.latestPickup}.`, source: facts.latePickupRule ? feeSource : source };
      }

      // The current fee workbook replaces older short-stay rates and keeps its
      // own provenance visible. Blank values remain unknown instead of being
      // converted to zero by the importer.
      if (safeNumber(facts.hourlyFeeMYR) != null) {
        const feeMeta = feeProvenance(record);
        const shortBases = new Set(["hour", "visit", "session", "day"]);
        const extraNotes = [
          facts.registrationFeeMYR != null ? `Registration fee: MYR ${facts.registrationFeeMYR}.` : null,
          facts.depositMYR != null ? `Deposit: MYR ${facts.depositMYR}.` : null,
          facts.extraCharges ? `Extra charges: ${facts.extraCharges}.` : null,
        ].filter(Boolean).join(" ");
        updated.fees = [
          ...(provider.fees ?? []).filter(fee => !shortBases.has(fee.basis)),
          {
            amount: facts.hourlyFeeMYR,
            currency: "MYR",
            basis: "hour",
            kind: "care",
            verification: "current_fee_data",
            provenance: feeMeta,
            conditions: `Current fee data lists this hourly rate. Minimum booking: ${facts.minimumBookingHours ?? "not listed"} hours; confirm extras and actual charges.${extraNotes ? ` ${extraNotes}` : ""}`,
            source: feeSource,
          },
          ...(facts.dailyFeeMYR != null ? [{
            amount: facts.dailyFeeMYR,
            currency: "MYR",
            basis: "day",
            kind: "care",
            verification: "current_fee_data",
            provenance: feeMeta,
            conditions: `Current fee data lists this daily rate; confirm what is included.${extraNotes ? ` ${extraNotes}` : ""}`,
            source: feeSource,
          }] : []),
        ];
        updated.feeRule = {
          validated: true,
          complete: true,
          basis: "hour",
          rate: facts.hourlyFeeMYR,
          currency: "MYR",
          minimumMinutes: Math.max(60, (facts.minimumBookingHours ?? 1) * 60),
          roundingMinutes: 60,
          includedExtras: [],
          transportIncluded: facts.offersTransport !== true,
          source: feeSource,
        };
      }

      const existingReview = provider.reviewEvidence;
      const currentReview = record.reviewEvidence;
      updated.reviewTopics = mergeTopicEvidence(provider.reviewTopics, currentReview.reviewTopics);
      updated.reviewEvidence = {
        ...(existingReview ? { original: existingReview } : {}),
        sourceKind: existingReview ? "mixed_user_provided_review_sources" : currentReview.sourceKind,
        source: currentReview.source,
        current: true,
        identityVerified: true,
        rating: currentReview.rating ?? existingReview?.rating ?? null,
        ratingSource: currentReview.ratingSource ?? existingReview?.ratingSource ?? null,
        reviewCount: currentReview.reviewCount ?? existingReview?.reviewCount ?? 0,
        reviewSampleCount: currentReview.reviewSampleCount ?? null,
        observedThemes: currentReview.observedThemes ?? existingReview?.observedThemes ?? [],
        reviewTopics: updated.reviewTopics,
        reviewTaxonomy: currentReview.reviewTaxonomy ?? Object.values(updated.reviewTopics),
        reviewPreferences: currentReview.reviewPreferences ?? [],
        ownerReplyCount: currentReview.ownerReplyCount ?? null,
        classifier: currentReview.classifier,
        dateRange: currentReview.dateRange,
      };
      return updated;
    }),
  };
}

export const completedShortCareMeta = payload.summary;
