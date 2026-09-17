import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, Heart, MapPin, RotateCcw, Search, X } from 'lucide-react';
import { interestSeeds, recommendCentres, hideRecommendation } from '../shared/recommendations.mjs';
import { feeSummary } from '../shared/result-summary.mjs';
import { isShortCare } from '../shared/request.mjs';
import { favourite } from '../shared/saved.mjs';
import { requestAPI, errorMessage } from './api.js';

export default function Recommendations({ mode, library, interests, request, onDiscover, onOpen, onSave }) {
  const { history, update, reset, error: storageError } = interests;
  const seedIds = interestSeeds(library, history, request?.careType).map(s => s.id).sort();
  const key = JSON.stringify([mode, request, seedIds]);
  const [data, setData] = useState(null), [failure, setFailure] = useState(''), [retry, setRetry] = useState(0), [opening, setOpening] = useState(null);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    if (!request) return;
    let alive = true;
    setData(null); setFailure('');
    requestAPI({ action: 'recommendations', mode, request, seedIds }).then(r => {
      if (alive) setData({ ...r, key });
    }).catch(() => { if (alive) setFailure('We couldn’t check centre details. Please try again.'); });
    return () => { alive = false; };
  }, [key, retry]);
  const ready = data?.key === key;
  const cards = ready ? recommendCentres({ candidates: data.items, seeds: data.seeds, request: data.request, library, history }) : [];
  const open = async p => {
    setOpening(p.id); setFailure('');
    try {
      const fresh = await requestAPI({ action: 'details', mode, id: p.id, request: data.request });
      if (alive.current) onOpen(fresh.items[0], fresh.request);
    } catch (e) { if (alive.current) setFailure(errorMessage(e)); }
    finally { if (alive.current) setOpening(null); }
  };
  return <section className="recommendations" aria-labelledby="recommendations-title">
    <header className="recommendations-heading">
      <div className="recommendations-emblem"><Heart size={23} aria-hidden="true" /></div>
      <div><h3 id="recommendations-title">You may also like</h3><p>From the centres you saved and viewed.</p></div>
    </header>
    {request && <div className="recommendations-context"><MapPin size={17} aria-hidden="true" /><span>{request.pickup.label}
      {isShortCare(request) && <small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${request.date}T12:00:00Z`))} · {request.deadline}–{request.end}</small>}</span>
      <button className="text-link" onClick={onDiscover}>Change search <ArrowRight size={15} /></button></div>}
    {storageError && <p className="notice" role="status">{storageError}</p>}
    {failure && <div className="error-box" role="alert"><p>{failure}</p><button onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
    {!request ? <div className="recommendations-empty"><Search size={26} /><h4>What care do you need this time?</h4><p>Search first so we can check the location, age and times.</p><button className="primary" onClick={onDiscover}>Find childcare <ArrowRight size={16} /></button></div>
      : !ready && !failure ? <p className="recommendations-loading" role="status">Checking centre details…</p>
      : ready && <>
        {!seedIds.length && <p className="notice">Start with nearby centres. Saving and comparing will help us suggest others.</p>}
        <div className="recommendation-grid">{cards.map(({ p, reason, basedOn }) => <article className="recommendation-card" key={p.id}>
          <div className="recommendation-reason"><Heart size={15} aria-hidden="true" /><span>{reason}</span></div>
          <h4>{p.name}</h4>
          <p className="recommendation-area">{p.district || p.region}</p>
          <p className="recommendation-fee"><span>Fee</span><strong>{feeSummary(p).label}</strong></p>
          {basedOn && <p className="recommendation-anchor">Like {basedOn}</p>}
          <p className="recommendation-check">{p.fit.conditions.some(c => ['admission', 'care', 'age'].includes(c.id) && c.state === 'unknown') ? 'Some details need checking with the centre.' : 'Listed details fit your search.'}</p>
          <div className="recommendation-actions"><button className="secondary" onClick={() => onSave(favourite(p))}><Bookmark size={16} />Save</button>
            <button className="primary" disabled={!!opening} onClick={() => open(p)}>{opening === p.id ? 'Checking…' : 'View centre'}<ArrowRight size={16} /></button></div>
          <button className="recommendation-dismiss text-link" onClick={() => update(h => hideRecommendation(h, p))} aria-label={`Not interested in ${p.name}`}><X size={14} />Not interested</button>
        </article>)}</div>
        {!cards.length && <div className="recommendations-empty"><Check size={26} /><h4>No new suggestions for this search</h4><p>Try another location or time. Your saved centres are still in Childcare.</p><button className="secondary" onClick={onDiscover}>Change search <ArrowRight size={16} /></button></div>}
        {!!cards.length && <p className="recommendations-footnote">Based on listed details. Ask the centre if they have a place for your child.</p>}
      </>}
    <details className="recommendation-controls"><summary>How suggestions work</summary>
      <p>We check your current search, then look for centres similar to those you saved or viewed. Comparing a centre counts more than opening it once. Suggestions do not change your search sorting.</p>
      <p>Viewing history stays in this browser. It keeps centre IDs and activity counts, without your search address, care times or child’s age. Live and demo history stay separate.</p>
      <label><input type="checkbox" checked={history.enabled} onChange={e => update(h => ({ ...h, enabled: e.target.checked }))} />Use viewing history for suggestions</label>
      <p className="notice">Saved centres still help when this is off. Clear history also restores hidden suggestions; your saved items stay.</p>
      <button className="secondary" onClick={reset}><RotateCcw size={15} />Clear viewing history</button>
    </details>
  </section>;
}
