import { useEffect, useMemo, useState } from 'react';
import { requestAPI } from './api.js';
import { mergeSearchRoutes } from '../shared/search-routes.mjs';
import { createRouteCache } from '../shared/route-cache.mjs';

const routeCache = createRouteCache(requestAPI);
export const clearSearchRouteCache = () => routeCache.clear();

export default function useSearchRoutes(results, rankedItems, mode) {
  const [routes, setRoutes] = useState(null);
  useEffect(() => {
    if (!results?.drivingDeferred || !results.items.length) return;
    let current = true;
    routeCache.load(results, mode)
      .then(response => {
        if (current) setRoutes({ results, response: response.version === results.version ? response : null });
      })
      .catch(() => { if (current) setRoutes({ results, response: null }); });
    // A newer search can reuse the same in-flight road lookup. Its response
    // never replaces the current search, and clearing local data invalidates it.
    return () => { current = false; };
  }, [results, mode]);
  return useMemo(() => !results?.drivingDeferred ? rankedItems : mergeSearchRoutes(rankedItems,
    routes?.results === results ? routes.response : routeCache.snapshot(results, mode)), [rankedItems, results, routes, mode]);
}
