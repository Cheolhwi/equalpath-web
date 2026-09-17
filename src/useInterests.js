import { useCallback, useEffect, useState } from 'react';
import { emptyInterests, interestKey, readInterests, updateInterests, recordInterest } from '../shared/recommendations.mjs';

export default function useInterests(mode, paused) {
  const [state, setState] = useState({ mode, data: emptyInterests(), error: '' });
  useEffect(() => {
    const reload = () => {
      try { setState({ mode, data: readInterests(window.localStorage, mode), error: '' }); }
      catch { setState({ mode, data: emptyInterests(), error: 'Viewing history could not be read. Your saved centres are unchanged.' }); }
    };
    reload();
    const onStorage = e => { if (!e.key || e.key === interestKey(mode)) reload(); };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [mode]);
  const update = useCallback(change => {
    if (paused) return;
    try { setState({ mode, data: updateInterests(window.localStorage, mode, change), error: '' }); }
    catch { setState(s => ({ ...s, error: 'Viewing history could not be saved in this browser. Your saved centres are unchanged.' })); }
  }, [mode, paused]);
  const record = useCallback((providers, kind) => update(data => recordInterest(data, providers, kind)), [update]);
  const reset = () => {
    try {
      const data = { ...emptyInterests(), enabled: state.data.enabled };
      window.localStorage.setItem(interestKey(mode), JSON.stringify(data));
      setState({ mode, data, error: '' });
    } catch { setState(s => ({ ...s, error: 'History could not be cleared. Please try again.' })); }
  };
  return { history: state.mode === mode ? state.data : emptyInterests(), error: state.error, update, record, reset };
}
