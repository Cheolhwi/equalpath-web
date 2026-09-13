import {
  CONTRACT,
  canonicalRequest,
  requestErrors,
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
  applicableWindows,
} from "../shared/conditions.mjs";
import { regionAt, regions, distanceKm } from "./geography.mjs";
import { fixtureCatalog, demoPickup } from "./fixtures.mjs";
import { createStore, ServiceError } from "./appwrite-store.mjs";
export function createAPI({ store = createStore() } = {}) {
  return async function handle(body) {
    if (!body || typeof body !== "object" || Array.isArray(body))
      throw new ServiceError("INVALID_REQUEST", 400);
    const mode = body.mode ?? "live";
    if (!["live", "demo"].includes(mode))
      throw new ServiceError("INVALID_MODE", 400);
    if (
      !["health", "places", "search", "details", "compare"].includes(
        body.action,
      )
    )
      throw new ServiceError("UNKNOWN_ACTION", 400);
    const catalog = mode === "demo" ? fixtureCatalog : await store.catalog(),
      items = catalog.items;
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
            (!request.radius ||
              !p.location ||
              distanceKm(request.pickup, p.location) <= request.radius),
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
      candidates = sortProviders(candidates, request.sort, request.date);
      const page = Number(body.page ?? 0);
      if (!Number.isInteger(page) || page < 0 || page > 1000)
        throw new ServiceError("INVALID_PAGE", 400);
      return {
        ...meta,
        request,
        items: candidates.slice(page * 20, page * 20 + 20),
        total: candidates.length,
        page,
        pageSize: 20,
        missingLocations: candidates.filter((p) => !p.location).length,
        ordering: ordering(request.sort, candidates, request.date),
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
      items: ordered,
      ordering: ordering(request.sort, hydrated, request.date),
    };
  };
}
function ordering(sort, items, date) {
  return {
    factor: sort,
    explanation:
      sort === "distance"
        ? "Nearest straight-line distance first; missing coordinates last. This is not a travel-time estimate."
        : sort === "closing"
          ? "Later care end time first; missing times last. One-off admission and capacity remain unconfirmed."
          : sort === "pickup"
            ? "Published institutional transport first; unknown transport last. Coverage and seats are checked separately."
            : "Names in alphabetical order, with a stable branch identifier for ties.",
    available: {
      name: true,
      distance: items.some((p) => p.distanceKm != null),
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
