import { useEffect, useMemo, useState } from 'react';
import { requestAPI } from './api.js';
import { mergeSearchRoutes } from '../shared/search-routes.mjs';

export default function useSearchRoutes(results, rankedItems, mode) {
  const [routes, setRoutes] = useState(null);
  useEffect(() => {
    if (!results?.drivingDeferred || !results.items.length) return;
    const controller = new AbortController();
    let current = true;
    requestAPI({ action: 'routes', mode, request: results.request, version: results.version,
      ids: results.items.map(p => p.id) }, { signal: controller.signal, timeoutMs: 10000 })
      .then(response => {
        if (current) setRoutes({ results, response: response.version === results.version ? response : null });
      })
      .catch(() => { if (current) setRoutes({ results, response: null }); });
    return () => { current = false; controller.abort(); };
  }, [results, mode]);
  return useMemo(() => routes?.results === results
    ? mergeSearchRoutes(rankedItems, routes.response) : rankedItems, [rankedItems, results, routes]);
}
