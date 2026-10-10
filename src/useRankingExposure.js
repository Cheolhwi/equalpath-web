import { useEffect, useRef } from 'react';
import { recordExposure } from '../shared/recommendation-learning.mjs';
import { familyRankingExposures } from '../shared/family-learning.mjs';

export default function useRankingExposure({ results, familyResults, items, mode, active, update }) {
  const slate = results?.learningSlate;
  const current = useRef(items); current.current = items;
  useEffect(() => {
    if (!active || !(familyResults?.learningSlates || (slate && results?.request.sort === 'recommended'))) return;
    const seen = new Set(), timers = new Map(), observed = new Set();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        clearTimeout(timers.get(e.target));
        if (!e.isIntersecting || e.intersectionRatio < .5) continue;
        timers.set(e.target, setTimeout(() => {
          if (document.visibilityState !== 'visible' || !e.target.isConnected || e.target.closest('[inert], [aria-hidden="true"]')) return;
          const id = e.target.dataset.providerId;
          const index = current.current.findIndex(p => p.id === id), p = current.current[index];
          const exposures = familyResults ? familyRankingExposures(familyResults, e.target.dataset)
            : p?.learningFeatures && !p.fit?.counts?.conflict
              ? [{ ...slate, careType: p.careType, items: [{ id, features: p.learningFeatures, position: index + 1 }] }] : [];
          const fresh = exposures.filter(s => !seen.has(`${s.id}:${s.items[0].id}`));
          if (!fresh.length) return;
          fresh.forEach(s => seen.add(`${s.id}:${s.items[0].id}`));
          update(h => fresh.reduce((next, s) => recordExposure(next, s), h));
        }, 400));
      }
    }, { threshold: [.5] });
    const observe = () => {
      for (const el of document.querySelectorAll('article[data-provider-id], article[data-family-provider-a]')) if (!observed.has(el)) {
        observed.add(el); io.observe(el);
      }
    };
    observe();
    const mutations = new MutationObserver(records => {
      // A reused map card can change from Child 1 to Fits both children.
      for (const { type, target } of records) if (type === 'attributes' && observed.has(target)) {
        clearTimeout(timers.get(target)); io.unobserve(target); observed.delete(target);
      }
      observe();
    });
    mutations.observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true,
      attributes: true, attributeFilter: ['data-provider-id', 'data-family-role', 'data-family-provider-a', 'data-family-provider-b'] });
    return () => { io.disconnect(); mutations.disconnect(); for (const t of timers.values()) clearTimeout(t); };
  }, [results, slate, familyResults, mode, active, update]);
}
