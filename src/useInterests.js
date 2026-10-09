import { useCallback, useEffect, useState } from 'react';
import { emptyInterests, interestKey, readInterests, recordInterest } from '../shared/recommendations.mjs';
import { INTERESTS_CHANGED, saveInterests, clearStoredInterests } from './interest-store.js';

export default function useInterests(mode, paused) {
  const [state, setState] = useState({ mode, data: emptyInterests(), error: '', ready: false });
  useEffect(() => {
    const reload = () => {
      try { setState({ mode, data: readInterests(window.localStorage, mode), error: '', ready: true }); }
      catch { setState({ mode, data: emptyInterests(), error: 'Viewing history could not be read. Your saved centres are unchanged.', ready: true }); }
    };
    reload();
    const onStorage = e => { if (!e.key || e.key === interestKey(mode)) reload(); };
    const onChange = e => { if (e.detail?.mode === mode) reload(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(INTERESTS_CHANGED, onChange);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(INTERESTS_CHANGED, onChange);
    };
  }, [mode]);
  const update = useCallback(change => {
    if (paused) return;
    try { saveInterests(mode, change); }
    catch { setState(s => ({ ...s, error: 'Viewing history could not be saved in this browser. Your saved centres are unchanged.' })); }
  }, [mode, paused]);
  const record = useCallback((providers, kind, slateId) => update(data => recordInterest(data, providers, kind, new Date().toISOString(), slateId)), [update]);
  const reset = () => {
    try {
      saveInterests(mode, current => ({ ...emptyInterests(), enabled: current.enabled,
        preferences: current.preferences,
        preferenceSetup: current.preferenceSetup }));
    } catch { setState(s => ({ ...s, error: 'History could not be cleared. Please try again.' })); }
  };
  const clear = useCallback(() => {
    try {
      clearStoredInterests(mode);
    } catch { setState(s => ({ ...s, error: 'Local data could not be cleared. Please try again.' })); }
  }, [mode]);
  return { history: state.mode === mode ? state.data : emptyInterests(), ready: state.mode === mode && state.ready, error: state.error, update, record, reset, clear };
}
