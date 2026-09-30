// Route enrichment cannot change membership, ranking, fit, or current search data.
const unavailable = Object.freeze({ state: 'unavailable', reason: 'service_unavailable' });
export function mergeSearchRoutes(items, response) {
  const routes = new Map((response?.items ?? []).map(p => [p.id, p.driving]));
  return items.map(p => ({ ...p, driving: routes.get(p.id) ?? unavailable }));
}
