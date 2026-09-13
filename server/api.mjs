import {
  CONTRACT,
  canonicalRequest,
  requestErrors,
  needsPickupAddress,
  searchRadius,
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
  applicableWindows,
} from "../shared/conditions.mjs";
import { regionAt, regions, distanceKm } from "./geography.mjs";
import { fixtureCatalog, demoPickup } from "./fixtures.mjs";
import { createStore, ServiceError } from "./appwrite-store.mjs";
import { createPlaceSearch } from "./places.mjs";
import { createDrivingRoutes } from "./driving.mjs";
export function createAPI({ store = createStore(), placeSearch = createPlaceSearch(), reverseGeocode = placeSearch.reverse, drivingRoutes = createDrivingRoutes() } = {}) {
  return async function handle(body) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ServiceError("INVALID_REQUEST", 400);
    const mode = body.mode ?? "live";
    if (!["live", "demo"].includes(mode))
      throw new ServiceError("INVALID_MODE", 400);
    if (
      !["health", "places", "reverse", "nearby", "search", "details", "compare"].includes(
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
    const catalog = mode === "demo" ? fixtureCatalog : await store.catalog(),
      items = body.features?.includes?.('area-fees-v1') === true ? catalog.items : catalog.items.map(p=>p.fees?.some(f=>f.verification==='area_estimate') ? {...p,fees:p.fees.filter(f=>f.verification!=='area_estimate')} : p);
    const meta = {
      contract: CONTRACT,
      mode,
      version: catalog.version,
      release: catalog.release,
      regions,
      available: items.length,
      withheld: catalog.held.length,
      distanceBasis:
        "Straight-line distance; not road distance or travel time.",
    };
    if (body.action === "health") return { ...meta, ok: true };
    if (body.action === "nearby") {
      const center = { lat: body.center?.lat, lng: body.center?.lng };
      if (!regions.includes(regionAt(center)))
        throw new ServiceError("OUTSIDE_SERVICE_AREA", 422);
      const radius = searchRadius(body.radius);
      const candidates = items.filter((p) => withinRadius(center, p.location, radius))
        .map((p) => ({ id: p.id, name: p.name, category: p.category, address: p.address, district: p.district, region: p.region, location: p.location, fees: p.fees, distanceKm: distanceKm(center, p.location) }))
        .sort((a, b) => a.distanceKm - b.distanceKm || a.id.localeCompare(b.id));
      return { ...meta, center, radius, total: candidates.length, items: candidates.slice(0, 20) };
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
    if (mode === "live" && needsPickupAddress(request.pickup) && reverseGeocode) {
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
    const hydrate = (p) => {
      const fit = assess(p, request);
      return {
        ...p,
        distanceKm: distanceKm(request.pickup, p.location),
        fit,
        cost: costFor(p, request),
        enquiries: enquiries(p, request, fit),
        businessHoursLabel: businessHoursFor(p, request.date),
        careEndTimeLabel: careEndTimeFor(p, request.date),
        careEndTimeSource: careEndScheduleFor(p, request.date).source,
        weeklyCareEndTimes: weeklyCareEndTimes(p, request.date),
        businessHoursDay: new Intl.DateTimeFormat("en", {weekday:"long", timeZone:"UTC"}).format(new Date(request.date + "T12:00:00Z")),
      };
    };
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
      const pageItems = sortProviders(candidates.slice(page * 20, page * 20 + 20), request.sort, request.date);
      return {
        ...meta,
        request,
        items: await withDriving(suggestProviders(pageItems, request)),
        total: candidates.length,
        page,
        pageSize: 20,
        missingLocations: candidates.filter((p) => !p.location).length,
        ordering: ordering(request.sort, candidates, request.date, request.radius),
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
      ordered =
        body.action === "compare"
          ? sortProviders(hydrated, request.sort, request.date)
          : hydrated;
    return {
      ...meta,
      request,
      items: await withDriving(ordered),
      ordering: ordering(request.sort, hydrated, request.date),
    };
  };
}
function withinRadius(center, location, radius) {
  const distance = distanceKm(center, location);
  return Number.isFinite(distance) && distance <= radius;
}
function ordering(sort, items, date, radius = null) {
  return {
    factor: sort,
    ...(radius !== null ? { pageSelection: "nearest" } : {}),
    explanation: (radius !== null
      ? `Each page shows the next 20 nearest centres within ${radius} km. Your priority sorts that page, with conflicting details last. `
      : "Compare options for your priority, with conflicting details last. ") + (
      sort === "distance"
        ? "Nearest first; missing locations last."
        : sort === "price"
          ? "Lowest monthly care fee first, using the starting amount for ranges. Estimated budgets are included and labelled. Other billing periods and missing monthly fees go last; extras are excluded."
        : sort === "closing"
          ? "Later care end time first; missing times last. One-off admission and capacity remain unconfirmed."
          : sort === "pickup"
            ? "Published institutional transport first; unknown transport last. Coverage and seats are checked separately."
            : "Names in alphabetical order, with a stable branch identifier for ties."),
    available: {
      name: true,
      distance: items.some((p) => p.distanceKm != null),
      price: items.some((p) => priorityValue(p, 'price', date) != null),
      closing: items.some(
        (p) => applicableWindows(p.businessHours?.windows, date).length,
      ),
      pickup: items.some((p) => p.transport.exists !== null),
    },
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
