import {
  CONTRACT,
  canonicalRequest,
  requestErrors,
  needsPickupAddress,
  searchRadius,
  searchPageSize,
  isShortCare,
  todayKL,
} from "../shared/request.mjs";
import {
  assess,
  businessHoursFor,
  careEndTimeFor,
  careEndScheduleFor,
  weeklyCareEndTimes,
  costFor,
  enquiries,
  sortProviders,
  priorityValue,
  suggestProviders,
} from "../shared/conditions.mjs";
import { feesForCare } from "../shared/result-summary.mjs";
import { regionAt, regions, distanceKm } from "./geography.mjs";
import { fixtureCatalog, demoPickup } from "./fixtures.mjs";
import { ServiceError } from "./service-error.mjs";
import { createSearchStore } from "./search-catalog.mjs";
import { createPlaceSearch } from "./places.mjs";
import { createDrivingRoutes } from "./driving.mjs";
export function createAPI({ store = createSearchStore(), placeSearch = createPlaceSearch(), reverseGeocode = placeSearch.reverse, drivingRoutes = createDrivingRoutes() } = {}) {
  const enrichedCatalogs = new WeakMap();
  const enrich = async catalog => {
    if (store.prepared) return catalog;
    if (!enrichedCatalogs.has(catalog)) enrichedCatalogs.set(catalog, (async () => {
      const [{ applyReviewEvidence }, { applyCompletedShortCareData }, { applyReviewProfiles }] = await Promise.all([
        import('./review-evidence.mjs'), import('./completed-short-care.mjs'), import('./review-profiles.mjs'),
      ]);
      return applyReviewProfiles(applyCompletedShortCareData(applyReviewEvidence(catalog)));
    })());
    return enrichedCatalogs.get(catalog);
  };
  const completeRows = rows => store.prepared
    ? Promise.all(rows.map(async p => ({ ...p, ...await store.extras(p.id) }))) : rows;
  return async function handle(body) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ServiceError("INVALID_REQUEST", 400);
    const mode = body.mode ?? "live";
    if (!["live", "demo"].includes(mode))
      throw new ServiceError("INVALID_MODE", 400);
    if (
      !["health", "places", "reverse", "nearby", "search", "details", "compare", "recommendations", "routes", "reviews"].includes(
        body.action,
      )
    )
      throw new ServiceError("UNKNOWN_ACTION", 400);
    // Place lookup is independent of childcare records and directory health.
    if (body.action === "places" && mode === "live")
      return { contract: CONTRACT, mode, regions, ...await placeSearch(body.query) };
    if (body.action === "reverse") {
      if (!regions.includes(regionAt(body.point))) throw new ServiceError("OUTSIDE_SERVICE_AREA", 422);
      return {contract:CONTRACT,mode,regions,...(mode === "demo" ? {pickup:null} : await reverseGeocode(body.point))};
    }
    const careType = body.request?.careType ?? body.careType ?? "short_term";
    if (!["regular", "short_term"].includes(careType)) throw new ServiceError("INVALID_REQUEST", 422, { careType: "Choose a care type." });
    const catalog = mode === "demo" ? fixtureCatalog : await enrich(await store.catalog(careType)),
      allItems = body.features?.includes?.('area-fees-v1') === true ? catalog.items : catalog.items.map(p=>p.fees?.some(f=>f.verification==='area_estimate') ? {...p,fees:p.fees.filter(f=>f.verification!=='area_estimate')} : p);
    if (mode === "live" && catalog.shortCareReady === false && !["health", "places"].includes(body.action)) throw new ServiceError("SOURCE_INCOMPLETE");
    const shortIds = mode === "live" && Array.isArray(catalog.shortCareIds) ? new Set(catalog.shortCareIds) : null;
    const items = (shortIds ? allItems.filter(p => shortIds.has(p.id) === (careType === "short_term")) : allItems)
      .map(p => ({ ...p, careType }));
    const seedIds = body.seedIds ?? [];
    if (!Array.isArray(seedIds) || seedIds.length > 100 || new Set(seedIds).size !== seedIds.length || seedIds.some(id => typeof id !== 'string' || !id.length || id.length > 160))
      throw new ServiceError('INVALID_SELECTION', 400);
    // Only current public facts travel back. User weights remain in the browser.
    const seedFact = p => ({ id:p.id,name:p.name,careType:p.careType,category:p.category,district:p.district,admission:p.admission,transport:p.transport,fees:p.fees,reviewTopics:p.reviewTopics,reviewProfile:p.reviewProfile ? { topics:p.reviewProfile.topics,asOf:p.reviewProfile.asOf } : undefined });
    const seeds = items.filter(p => seedIds.includes(p.id)).map(seedFact);
    const pageSize = searchPageSize(careType);
    const meta = {
      contract: CONTRACT,
      mode,
      version: catalog.version,
      release: catalog.release,
      regions,
      available: items.length,
      withheld: catalog.held.length,
      careType,
      shortCareIds: shortIds ? [...shortIds] : null,
      collection: { careType, total: items.length, coursework: mode === "live" && careType === "short_term", shortCareCount: shortIds?.size ?? null },
      distanceBasis:
        "Straight-line distance; not road distance or travel time.",
    };
    if (body.action === "health") return { ...meta, ok: true };
    if (body.action === "reviews") {
      if (body.version && body.version !== catalog.version) throw new ServiceError("FACTS_CHANGED", 409);
      if (typeof body.id !== "string") throw new ServiceError("INVALID_SELECTION", 400);
      const provider = items.find(p => p.id === body.id);
      if (!provider) throw new ServiceError("PLACE_UNAVAILABLE", 404);
      const [complete] = mode === "live" ? await completeRows([provider]) : [provider];
      return { ...meta, id: provider.id, reviewProfile: complete.reviewProfile ?? null };
    }
    if (body.action === "nearby") {
      const center = { lat: body.center?.lat, lng: body.center?.lng };
      if (!regions.includes(regionAt(center)))
        throw new ServiceError("OUTSIDE_SERVICE_AREA", 422);
      const radius = searchRadius(body.radius, careType);
      const candidates = items.filter((p) => withinRadius(center, p.location, radius))
        .map((p) => ({ id: p.id, name: p.name, category: p.category, careType, address: p.address, district: p.district, region: p.region, location: p.location, fees: p.fees, distanceKm: distanceKm(center, p.location) }))
        .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
      return { ...meta, center, radius, pageSize, total: candidates.length, items: candidates.slice(0, pageSize) };
    }
    if (body.action === "places") {
      const q = String(body.query ?? "")
        .normalize("NFKC")
        .trim()
        .toLowerCase()
        .slice(0, 100);
      const rows = items
        .filter(
          (p) =>
            p.location &&
            (!q ||
              [p.name, p.registeredName, p.address, p.district]
                .join(" ")
                .normalize("NFKC")
                .toLowerCase()
                .includes(q)),
        )
        .sort((a, b) => a.name.localeCompare(b.name));
      return {
        ...meta,
        items:
          mode === "demo"
            ? [
                demoPickup,
                ...rows
                  .slice(0, 7)
                  .map((p) => ({
                    id: p.id,
                    label: p.name,
                    ...p.location,
                    region: p.region,
                  })),
              ]
            : rows
                .slice(0, 10)
                .map((p) => ({
                  id: p.id,
                  label: p.name,
                  address: p.address,
                  region: p.region,
                  ...p.location,
                })),
        total: rows.length,
      };
    }
    const errors = requestErrors(body.request);
    if (Object.keys(errors).length)
      throw new ServiceError("INVALID_REQUEST", 422, errors);
    const request = canonicalRequest(body.request);
    if (mode === "live" && body.action !== "routes" && !(body.action === "search" && body.features?.includes?.('defer-driving-v1')) && needsPickupAddress(request.pickup) && reverseGeocode) {
      try { const r=await reverseGeocode(request.pickup); if (r.pickup) request.pickup=r.pickup; } catch { /* An address outage must not block care search. */ }
    }
    const withDriving = rows => mode === "demo" ? rows.map(p => ({ ...p, driving: { state: "unavailable", reason: "demo" } })) : drivingRoutes(request.pickup, rows);
    if (!regions.includes(regionAt(request.pickup)))
      throw new ServiceError("OUTSIDE_SERVICE_AREA", 422, {
        pickup:
          "Only Kuala Lumpur and Selangor are supported. Choose a place inside these regions.",
      });
    if (body.version && body.version !== catalog.version)
      throw new ServiceError("FACTS_CHANGED", 409);
    if (body.action === "routes") {
      const ids = body.ids;
      if (!Array.isArray(ids) || !ids.length || ids.length > pageSize || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string'))
        throw new ServiceError("INVALID_SELECTION", 400);
      const rows = ids.map(id => items.find(p => p.id === id));
      if (rows.some(p => !p || !withinRadius(request.pickup, p.location, request.radius)))
        throw new ServiceError("PLACE_UNAVAILABLE", 404);
      // Refresh only the requested public IDs; never accept destination coordinates.
      return { version: catalog.version, items: (await withDriving(rows)).map(p => ({ id: p.id, driving: p.driving })) };
    }
    const compact = body.features?.includes?.('search-summary-v1') === true;
    const present = async rows => compact ? rows.map(searchSummary) : mode === 'live' ? completeRows(rows) : rows;
    const hydrate = (p) => {
      const fit = assess(p, request);
      const dated = isShortCare(request);
      return {
        ...p,
        distanceKm: distanceKm(request.pickup, p.location),
        fit,
        cost: costFor(p, request),
        enquiries: enquiries(p, request, fit),
        businessHoursLabel: dated ? businessHoursFor(p, request.date) : "See weekly hours",
        careEndTimeLabel: dated ? careEndTimeFor(p, request.date) : null,
        careEndTimeSource: dated ? careEndScheduleFor(p, request.date).source : p.businessHours?.source,
        weeklyCareEndTimes: weeklyCareEndTimes(p, dated ? request.date : todayKL()),
        businessHoursDay: dated ? new Intl.DateTimeFormat("en", {weekday:"long", timeZone:"UTC"}).format(new Date(request.date + "T12:00:00Z")) : null,
      };
    };
    if (body.action === "recommendations") {
      // Fetch current public facts, never accept saved snapshots or inferred fit.
      // Activity weights/timestamps remain in the browser; this boundary only
      // receives the public IDs whose attributes need refreshing.
      const ids = seedIds;
      if (!Array.isArray(ids) || ids.length > 100 || new Set(ids).size !== ids.length || ids.some(id => typeof id !== 'string' || !id.length || id.length > 160))
        throw new ServiceError('INVALID_SELECTION', 400);
      const q = request.query.toLowerCase();
      const candidates = items.filter(p => withinRadius(request.pickup, p.location, request.radius) &&
        (!q || [p.name, p.registeredName, p.address, p.district].join(' ').toLowerCase().includes(q)))
        .map(hydrate).filter(p => !p.fit.counts.conflict && (request.includeUnknown || p.fit.conditions.filter(c => c.id !== 'transfer').every(c => c.state !== 'unknown')))
        .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
      return { ...meta, request, items: await present(candidates.slice(0, 100)), total: candidates.length, limit: 100,
        seeds, checkedAt: new Date().toISOString() };
    }
    if (body.action === "search") {
      const q = request.query.toLowerCase();
      let candidates = items
        .filter(
          (p) =>
            (!q ||
              [p.name, p.registeredName, p.address, p.district]
                .join(" ")
                .toLowerCase()
                .includes(q)) &&
            withinRadius(request.pickup, p.location, request.radius),
        )
        .map(hydrate);
      if (!request.includeUnknown)
        candidates = candidates.filter((p) =>
          p.fit.conditions
            .filter((c) => c.id !== "transfer")
            .every((c) => c.state !== "unknown"),
        );
      if (!request.includeConflicts)
        candidates = candidates.filter((p) => !p.fit.counts.conflict);
      // Page membership follows proximity, regardless of fit or priority.
      // Otherwise a nearby conflict can be displaced by hundreds of farther centres.
      candidates.sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
      const page = Number(body.page ?? 0);
      if (!Number.isInteger(page) || page < 0 || page > 1000)
        throw new ServiceError("INVALID_PAGE", 400);
      const pageCandidates = candidates.slice(page * pageSize, (page + 1) * pageSize);
      const order = ordering(request.sort, pageCandidates, request.date, request.radius, pageSize, careType, candidates,
        Boolean(request.query || !request.includeUnknown || !request.includeConflicts));
      request.sort = order.factor;
      const pageItems = sortProviders(pageCandidates, request.sort, request.date);
      // Unknown details remain candidates that can be checked with the centre.
      // The external no-match fallback is reserved for pages where every
      // candidate has a known conflict (the grey-pin state).
      const explicitMatchCount = candidates.filter((p) => p.fit?.counts?.conflict === 0).length;
      const drivingDeferred = mode === "live" && body.features?.includes?.('defer-driving-v1') === true;
      const suggested = suggestProviders(pageItems, request);
      return {
        ...meta,
        request,
        items: await present(drivingDeferred ? suggested.map(p => ({ ...p, driving: { state: 'loading' } })) : await withDriving(suggested)),
        drivingDeferred,
        seeds,
        total: candidates.length,
        explicitMatchCount,
        page,
        pageSize,
        missingLocations: candidates.filter((p) => !p.location).length,
        ordering: order,
      };
    }
    const ids = body.action === "details" ? [body.id] : body.ids;
    if (
      !Array.isArray(ids) ||
      ids.length < 1 ||
      ids.length > 3 ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => typeof id !== "string")
    )
      throw new ServiceError("INVALID_SELECTION", 400);
    const chosen = ids.map((id) => items.find((p) => p.id === id));
    if (chosen.some((p) => !p))
      throw new ServiceError("PLACE_UNAVAILABLE", 404);
    const hydrated = chosen.map(hydrate),
      order = ordering(request.sort, hydrated, request.date);
    request.sort = order.factor;
    const ordered =
        body.action === "compare"
          ? sortProviders(hydrated, request.sort, request.date)
          : hydrated;
    return {
      ...meta,
      request,
      items: await present(await withDriving(ordered)),
      ordering: order,
    };
  };
}
function searchSummary(provider) {
  // Search/reranking need topic observations, not hundreds of review passages
  // or the original completion workbook. Full evidence remains on demand.
  const { completedShortCare, reviewEvidence, ...result } = provider;
  if (provider.reviewProfile) {
    const { excerpts, ...profile } = provider.reviewProfile;
    result.reviewProfile = { ...profile, excerpts: [], deferred: true };
  }
  return result;
}
function withinRadius(center, location, radius) {
  const distance = distanceKm(center, location);
  return Number.isFinite(distance) && distance <= radius;
}
const sortAvailability = (items, date) => ({
  name: true,
  distance: items.some(p => Number.isFinite(p.distanceKm)),
  price: items.some(p => Number.isFinite(priorityValue(p, "price", date))),
  closing: Boolean(date) && items.some(p => Number.isFinite(priorityValue(p, "closing", date))),
  pickup: items.some(p => p.transport?.exists === true),
});
function ordering(requestedSort, items, date, radius = null, pageSize = 20, careType = items[0]?.careType ?? "regular", allItems = items, filtered = false) {
  const available = sortAvailability(items, date), allAvailable = sortAvailability(allItems, date);
  const unavailableReasons = {};
  for (const factor of ["distance", "price", "closing", "pickup"]) {
    if (available[factor]) continue;
    const scope = radius === null ? "comparison" : allAvailable[factor] ? "page" : filtered ? "matches" : "nearby";
    const scopedItems = allAvailable[factor] ? items : allItems;
    const foreignFees = factor === "price" && scopedItems.some(p => feesForCare(p).some(f =>
      (careType === "short_term" || f.basis === "month") && f.currency && f.currency !== "MYR" && Number.isFinite(f.amount ?? f.min)));
    const fee = careType === "short_term" ? "fees" : "monthly fees";
    unavailableReasons[factor] = {
      distance: "No mapped locations.",
      price: foreignFees ? "No comparable MYR fees."
        : scope === "page" ? `No ${fee} on this page.`
        : scope === "nearby" ? `No ${fee} listed nearby.`
        : scope === "matches" ? `No ${fee} for these results.` : `No ${fee} listed.`,
      closing: scope === "page" ? "No care hours on this page." : "No hours for this date.",
      pickup: scope === "page" ? "No pickup on this page." : "No pickup service listed.",
    }[factor];
  }
  const sort = requestedSort !== "distance" && available[requestedSort] === false ? "distance" : requestedSort;
  return {
    factor: sort,
    available,
    unavailableReasons,
    ...(sort !== requestedSort ? { fallback: { from: requestedSort, to: sort, reason: unavailableReasons[requestedSort] } } : {}),
    ...(radius !== null ? { pageSelection: "nearest", pageSize } : {}),
    explanation: (radius !== null
      ? `Each page shows the next ${pageSize} nearest centres within ${radius} km. Your priority sorts that page, with conflicting details last. `
      : "Compare options for your priority, with conflicting details last. ") + (
      sort === "distance"
        ? "Nearest first; missing locations last."
        : sort === "price"
          ? careType === "short_term"
            ? "Fees are grouped by billing period: estimated totals, hourly, per visit, per session, then daily. Within each group, the lowest starting fee comes first. Monthly fees and extras are excluded; unlisted short-stay prices go last."
            : "Lowest monthly care fee first, using the starting amount for ranges. Estimated budgets are included and labelled. Other billing periods and missing monthly fees go last; extras are excluded."
        : sort === "closing"
          ? "Later care end time first; missing times last. One-off admission and capacity remain unconfirmed."
          : sort === "pickup"
            ? "Published institutional transport first; unknown transport last. Coverage and seats are checked separately."
            : "Names in alphabetical order, with a stable branch identifier for ties."),
  };
}
export const api = createAPI();
export function errorResponse(e) {
  return {
    status: e instanceof ServiceError ? e.status : 503,
    body: {
      ok: false,
      code: e instanceof ServiceError ? e.code : "SERVICE_UNAVAILABLE",
      ...(e.fields ? { fields: e.fields } : {}),
    },
  };
}
