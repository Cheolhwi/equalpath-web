import { interestKey, updateInterests } from '../shared/recommendations.mjs';

export const INTERESTS_CHANGED = 'equalpath-interests-change';

const notify = mode => window.dispatchEvent(new CustomEvent(INTERESTS_CHANGED, { detail: { mode } }));

export function saveInterests(mode, change) {
  const next = updateInterests(window.localStorage, mode, change);
  // Native storage events only reach other tabs. Onboarding and the retained
  // search app share this document and must see successful writes immediately.
  notify(mode);
  return next;
}

export function clearStoredInterests(mode) {
  window.localStorage.removeItem(interestKey(mode));
  notify(mode);
}
