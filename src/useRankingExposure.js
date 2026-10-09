import { useEffect, useRef } from 'react';
import { recordExposure } from '../shared/recommendation-learning.mjs';

export default function useRankingExposure({ results, items, mode, active, update }) {
  const slate = results?.learningSlate;
  const current = useRef(items); current.current = items;
  useEffect(() => {
    if (!active || !slate || !results || results.request.sort !== 'recommended') return;
    const seen = new Set(), timers = new Map(), observed = new Set();
    const io = new IntersectionObserver(entries => {
      for (const e of entries) {
        const id = e.target.dataset.providerId;
        clearTimeout(timers.get(e.target));
        if (!e.isIntersecting || e.intersectionRatio < .5 || seen.has(id)) continue;
        timers.set(e.target, setTimeout(() => {
          if (document.visibilityState !== 'visible' || !e.target.isConnected) return;
          const index = current.current.findIndex(p => p.id === id), p = current.current[index];
          if (!p?.learningFeatures || p.fit?.counts?.conflict) return;
          seen.add(id);
          update(h => recordExposure(h, { ...slate, careType: p.careType, items: [{ id, features: p.learningFeatures, position: index + 1 }] }));
        }, 400));
      }
    }, { threshold: [.5] });
    const observe = () => {
      for (const el of document.querySelectorAll('article[data-provider-id]')) if (!observed.has(el)) {
        observed.add(el); io.observe(el);
      }
    };
    observe();
    const mutations = new MutationObserver(observe);
    mutations.observe(document.querySelector('main') ?? document.body, { childList: true, subtree: true });
    return () => { io.disconnect(); mutations.disconnect(); for (const t of timers.values()) clearTimeout(t); };
  }, [results, slate, mode, active, update]);
}
