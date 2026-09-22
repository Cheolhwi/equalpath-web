import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { classifyReview } from "../shared/recommendations.mjs";

// The completed provider and review sheets are user-provided current data.
// Keep the large raw review text out of the public Function and publish only
// provider-level, two-level derived evidence.
const args = process.argv.slice(2);
const valueAfter = (name, fallback = null) => {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] ?? fallback : fallback;
};
const dataPath = valueAfter("--data-csv");
const reviewsPath = valueAfter("--reviews-csv");
const feesPath = valueAfter("--fees-csv");
const outputPath = valueAfter("--output", resolve(import.meta.dirname, "../server/data/short-care-completed-20260923.json"));
if (!dataPath || !reviewsPath || !feesPath) throw new Error("Usage: node scripts/prepare-short-care-completed.mjs --data-csv <path> --reviews-csv <path> --fees-csv <path> [--output <path>]");

function parseCSV(text) {
  const rows = [], row = [];
  let cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (quoted) {
      if (character === '"') {
        if (text[i + 1] === '"') { cell += '"'; i += 1; }
        else quoted = false;
      } else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ",") { row.push(cell); cell = ""; }
    else if (character === "\n") { row.push(cell.replace(/\r$/, "")); rows.push([...row]); row.length = 0; cell = ""; }
    else cell += character;
  }
  if (cell.length || row.length) { row.push(cell); rows.push([...row]); }
  if (!rows.length) return [];
  const headers = rows[0].map((header, index) => index === 0 ? header.replace(/^\uFEFF/, "") : header);
  return rows.slice(1).filter(values => values.some(Boolean)).map(values => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""])));
}

const dataRows = parseCSV(readFileSync(resolve(dataPath), "utf8"));
const reviewRows = parseCSV(readFileSync(resolve(reviewsPath), "utf8"));
const feeRows = parseCSV(readFileSync(resolve(feesPath), "utf8"));
if (dataRows.length !== 101) throw new Error(`Expected 101 completed rows, received ${dataRows.length}`);
const ids = new Set(dataRows.map(row => row.provider_id));
if (ids.size !== dataRows.length || [...ids].some(id => !/^provider_[a-z0-9_]+$/i.test(id))) throw new Error("Completed data has duplicate or invalid provider IDs");
if (reviewRows.some(row => !ids.has(row.provider_id))) throw new Error("Review data contains a provider outside the completed short-care set");
if (feeRows.length !== 101) throw new Error(`Expected 101 fee rows, received ${feeRows.length}`);
const feeIds = new Set(feeRows.map(row => row.provider_id));
if (feeIds.size !== feeRows.length || [...feeIds].some(id => !ids.has(id)) || [...ids].some(id => !feeIds.has(id))) throw new Error("Fee data does not match the completed short-care provider set");

const number = (value) => {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
};
const text = (value) => String(value ?? "").trim();
const list = (value) => text(value).split(/[;|]/).map(item => item.trim()).filter(Boolean);
const bool = value => text(value).toLowerCase() === "yes";
const dateValue = value => /^\d{4}-\d{2}-\d{2}$/.test(text(value)) ? text(value) : null;
const recentFrom = "2025-09-23";
const source = {
  label: "Current provider data · user-provided completion sheet",
  kind: "user_provided_provider_sheet",
  retrievedAt: "2026-09-23",
  sourceDate: "2026-09-23",
  url: null,
};
const reviewSource = {
  label: "Current review data · user-provided review sheet",
  kind: "user_provided_review_sheet",
  retrievedAt: "2026-09-23",
  sourceDate: "2026-09-23",
  url: null,
};
const feeSource = {
  label: "Current fee data · user-provided fee sheet",
  kind: "user_provided_fee_sheet",
  retrievedAt: "2026-09-23",
  sourceDate: "2026-09-23",
  url: null,
};
const feeByProvider = new Map(feeRows.map(row => [row.provider_id, row]));
const reviewTopicToPreference = {
  price: "value_for_money",
  flexibility: "flexible_booking",
  location: "convenient_location",
  staff: "caring_teachers",
  food: "healthy_meals",
  safety: "secure_pickup",
  transport: "secure_pickup",
  hours: "convenient_hours",
  activities: "engaging_activities",
  communication: "responsive_team",
  cleanliness: "clean_environment",
};

const reviewByProvider = new Map();
for (const row of reviewRows) {
  const bucket = reviewByProvider.get(row.provider_id) ?? [];
  const sourceTopics = list(row.topics).map(topic => topic.toLowerCase());
  const classification = classifyReview({ text: text(row.review_text), topics: sourceTopics, service_used: text(row.service_used) });
  bucket.push({
    stars: number(row.stars),
    date: dateValue(row.review_date),
    classification,
    themes: sourceTopics,
    exactPreferences: [...new Set(sourceTopics.map(topic => reviewTopicToPreference[topic]).filter(Boolean))],
    exactLevel1: sourceTopics,
    service: text(row.service_used),
    reply: text(row.has_owner_reply).toLowerCase() === "yes",
  });
  reviewByProvider.set(row.provider_id, bucket);
}

const reviewTopicIds = ["flexible_short_care", "smooth_pickup", "clear_late_rules", "predictable_fees", "responsive_team"];
const reviewTopicGroup = {
  flexible_short_care: "temporary_care",
  smooth_pickup: "pickup",
  clear_late_rules: "late_collection",
  predictable_fees: "fees",
  responsive_team: "communication",
};
const level1ForPreference = {
  value_for_money: "price",
  flexible_booking: "flexibility",
  convenient_location: "location",
  caring_teachers: "staff",
  healthy_meals: "food",
  secure_pickup: "safety",
  convenient_hours: "hours",
  engaging_activities: "activities",
  responsive_team: "communication",
  clean_environment: "cleanliness",
};
const splitTopics = value => list(value).map(item => item.toLowerCase()).filter(Boolean);
const positiveReview = review => (review.stars ?? 0) >= 4;
function aggregateReviews(providerId) {
  const reviews = reviewByProvider.get(providerId) ?? [];
  const topics = {};
  for (const preference of reviewTopicIds) {
    const matching = reviews.filter(review => review.classification.level2.includes(preference));
    const positive = matching.filter(positiveReview);
    const recent = positive.filter(review => review.date && review.date >= recentFrom);
    topics[reviewTopicGroup[preference]] = {
      state: positive.length >= 2 && recent.length >= 2 ? "supported" : "limited",
      reviewCount: matching.length,
      positiveCount: positive.length,
      recentCount: recent.length,
      level1: reviewTopicGroup[preference],
      level2: preference,
    };
  }
  const stars = reviews.map(review => review.stars).filter(Number.isFinite);
  const themes = new Map();
  const level1 = new Map();
  const level2 = new Map();
  const exactLevel1Count = new Map();
  const exactLevel2Count = new Map();
  const exactLevel1FromReviews = new Set();
  const exactLevel2FromReviews = new Set();
  for (const review of reviews) {
    for (const theme of review.themes) themes.set(theme, (themes.get(theme) ?? 0) + 1);
    for (const id of review.classification.level1) level1.set(id, (level1.get(id) ?? 0) + 1);
    for (const id of review.classification.level2) level2.set(id, (level2.get(id) ?? 0) + 1);
    for (const id of review.exactLevel1) {
      exactLevel1FromReviews.add(id);
      exactLevel1Count.set(id, (exactLevel1Count.get(id) ?? 0) + 1);
    }
    for (const id of review.exactPreferences) {
      exactLevel2FromReviews.add(id);
      exactLevel2Count.set(id, (exactLevel2Count.get(id) ?? 0) + 1);
    }
  }
  const sourceRow = dataRows.find(row => row.provider_id === providerId);
  const sheetLevel1 = splitTopics(sourceRow?.review_level1_topics_filled);
  const sheetLevel2 = splitTopics(sourceRow?.review_level2_preferences_filled);
  const exactLevel1 = [...new Set([...sheetLevel1, ...exactLevel1FromReviews])];
  const exactLevel2 = [...new Set([...sheetLevel2, ...exactLevel2FromReviews])];
  const reviewPreferences = exactLevel2.map(id => ({
    id,
    level1: level1ForPreference[id] ?? null,
    reviewCount: exactLevel2Count.get(id) ?? 0,
    positiveCount: reviews.filter(review => positiveReview(review) && review.exactPreferences.includes(id)).length,
    source: reviewSource.kind,
  }));
  const sheetRating = number(sourceRow?.rating);
  const sheetReviewCount = number(sourceRow?.review_count);
  return {
    sourceKind: reviewSource.kind,
    source: reviewSource,
    current: true,
    reviewCount: sheetReviewCount ?? reviews.length,
    reviewSampleCount: reviews.length,
    rating: sheetRating ?? (stars.length ? Math.round(stars.reduce((sum, value) => sum + value, 0) / stars.length * 10) / 10 : null),
    ratingSource: text(sourceRow?.rating_source) || reviewSource.label,
    dateRange: {
      from: reviews.map(review => review.date).filter(Boolean).sort()[0] ?? null,
      to: reviews.map(review => review.date).filter(Boolean).sort().at(-1) ?? null,
    },
    observedThemes: [...themes.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([id, count]) => ({ id, count })),
    reviewTopics: topics,
    reviewTaxonomy: exactLevel1.map(id => ({
      level1: id,
      level2: exactLevel2.filter(preference => (level1ForPreference[preference] ?? id) === id),
      reviewCount: exactLevel1Count.get(id) ?? 0,
      source: reviewSource.kind,
    })),
    reviewPreferences,
    ownerReplyCount: reviews.filter(review => review.reply).length,
    classifier: { name: "deterministic-review-taxonomy", version: "2026-09-23-v2", evidenceThreshold: "2 positive reviews and 2 recent positive reviews" },
  };
}

const providers = dataRows.map(row => {
  const feeRow = feeByProvider.get(row.provider_id);
  const feeText = key => text(feeRow?.[key]);
  const feeNumber = key => number(feeRow?.[key]);
  return ({
  id: row.provider_id,
  name: row.name,
  source,
  current: true,
  estimatedFields: list(row.estimated_fields),
  sharedWith: {
    price: text(row.price_shared_with) || null,
    hours: text(row.hours_shared_with) || null,
  },
  facts: {
    acceptsShortCare: bool(row.accepts_short_care),
    shortCareTypes: list(row.short_care_types),
    sameDayBooking: text(row.same_day_booking) || null,
    openDays: text(row.open_days) || null,
    openTime: text(row.open_time) || null,
    closeTime: text(row.close_time) || null,
    minimumBookingHours: feeNumber("min_booking_hours") ?? number(row.min_booking_hours),
    sameDayCutoff: text(row.same_day_cutoff) || null,
    hourlyFeeMYR: feeNumber("hourly_fee_myr"),
    dailyFeeMYR: feeNumber("daily_fee_myr"),
    monthlyFeeMYR: feeNumber("monthly_fee_myr"),
    depositMYR: feeNumber("deposit_myr"),
    registrationFeeMYR: feeNumber("registration_fee_myr"),
    extraCharges: feeText("extra_charges") || null,
    minAgeMonths: number(row.min_age_months),
    maxAgeMonths: number(row.max_age_months),
    shortCareMinAgeMonths: number(row.short_care_min_age_months),
    shortCareMaxAgeMonths: number(row.short_care_max_age_months),
    offersTransport: feeText("offers_transport") ? bool(feeText("offers_transport")) : null,
    transportRadiusKm: number(row.transport_radius_km),
    transportTimes: text(row.transport_times) || null,
    transportFeeMYRMonth: feeNumber("transport_fee_myr_month"),
    earliestPickup: text(row.earliest_pickup) || null,
    latestPickup: text(row.latest_pickup) || null,
    latePickupRule: feeText("late_pickup_rule") || null,
  },
  feeSource,
  reviewEvidence: aggregateReviews(row.provider_id),
  });
});

const payload = {
  schema: "equalpath-short-care-completed-v1",
  completedOn: "2026-09-23",
  sourceKind: source.kind,
  reviewSourceKind: reviewSource.kind,
  feeSourceKind: feeSource.kind,
  providers,
  summary: {
    providers: providers.length,
    reviews: reviewRows.length,
    reviewProviders: reviewByProvider.size,
    feeProviders: feeRows.length,
    reviewTopicsSupported: Object.fromEntries(reviewTopicIds.map(id => [id, providers.filter(provider => provider.reviewEvidence.reviewTopics[reviewTopicGroup[id]]?.state === "supported").length])),
  },
};
mkdirSync(resolve(outputPath, ".."), { recursive: true });
writeFileSync(resolve(outputPath), JSON.stringify(payload, null, 2) + "\n");
console.log(JSON.stringify(payload.summary));
