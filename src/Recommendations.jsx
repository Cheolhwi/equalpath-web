import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bookmark, Check, Heart, MapPin, RotateCcw, Search, Sparkles, X } from 'lucide-react';
import { DISCOVERY_PREFERENCES, interestSeeds, recommendCentres, hideRecommendation, normalisePreferenceTopics } from '../shared/recommendations.mjs';
import { feeSummary } from '../shared/result-summary.mjs';
import { isShortCare } from '../shared/request.mjs';
import { favourite } from '../shared/saved.mjs';
import { requestAPI, errorMessage } from './api.js';

export function PreferenceSetup({ history, onSave, compact = false }) {
  const [draft, setDraft] = useState(() => normalisePreferenceTopics(history.preferences));
  const [editing, setEditing] = useState(history.preferenceSetup === 'new');
  useEffect(() => {
    if (!editing) setDraft(normalisePreferenceTopics(history.preferences));
  }, [history.preferences, editing]);
  const toggle = id => setDraft(current => current.includes(id) ? current.filter(value => value !== id) : current.length >= 3 ? current : [...current, id]);
  const save = status => {
    const topics = status === 'skipped' ? [] : normalisePreferenceTopics(draft);
    onSave(topics, status === 'skipped' ? 'skipped' : topics.length ? 'complete' : 'skipped');
    setEditing(false);
  };
  if (!editing) return <div className="preference-summary" aria-label="Your suggestion choices">
    <span>{history.preferences?.length ? `Looking for: ${history.preferences.map(id => DISCOVERY_PREFERENCES.find(p => p.id === id)?.label).filter(Boolean).join(', ')}` : 'Suggestions use your current search and saved centres.'}</span>
    <button className="text-link" type="button" onClick={() => setEditing(true)}>Change choices</button>
  </div>;
  return <section className={`preference-setup${compact ? ' preference-setup-compact' : ''}`} aria-labelledby="preference-setup-title">
    <div className="preference-setup-heading"><div><h4 id="preference-setup-title">{compact ? 'Tell us what matters' : 'What matters to you?'}</h4><p>{compact ? 'Pick up to 3. We’ll use them with your search.' : 'Choose up to 3. We use these choices to order suggestions.'}</p></div><span>{draft.length}/3</span></div>
    <div className="preference-options" role="group" aria-label="Suggestion choices">
      {DISCOVERY_PREFERENCES.map(option => <button key={option.id} type="button" className="preference-option" aria-pressed={draft.includes(option.id)} onClick={() => toggle(option.id)}>
        <span className="preference-option-check" aria-hidden="true">{draft.includes(option.id) ? '✓' : ''}</span><span><strong>{option.label}</strong><small>{option.description}</small></span>
      </button>)}
    </div>
    <div className="preference-setup-actions"><button className="primary" type="button" disabled={!draft.length} onClick={() => save('complete')}>{compact ? 'Use these choices' : 'Use my choices'} <ArrowRight size={16} /></button><button className="text-link" type="button" onClick={() => save('skipped')}>Skip for now</button></div>
    <p className="preference-setup-note">You can change this later. It stays in this browser only.</p>
  </section>;
}

function RecommendationHero({ cards, onOpen, hasUsuals }) {
  const preview = cards.slice(0, 3);
  if (!preview.length) return null;
  return <section className="recommendation-hero" aria-labelledby="recommendation-hero-title">
    <div className="recommendation-hero-heading">
      <div className="recommendation-hero-emblem"><Sparkles size={26} aria-hidden="true" /></div>
      <div><h4 id="recommendation-hero-title">{hasUsuals ? 'Your usual centres, ready to check' : 'Good matches, ready to check'}</h4><p>{hasUsuals ? 'Start with familiar places that fit this search.' : 'Start with places that fit your search and choices.'}</p></div>
    </div>
    <div className="recommendation-hero-cards" aria-label="Suggested centres">
      {preview.map(({ p, reason }) => <button key={p.id} type="button" className="recommendation-hero-card" onClick={() => onOpen(p)} aria-label={`View ${p.name}`}>
        <span className="recommendation-hero-card-icon"><Heart size={18} aria-hidden="true" /></span>
        <strong>{p.name}</strong>
        <small>{reason}</small>
        <span className="recommendation-hero-card-fee">{feeSummary(p).label}</span>
      </button>)}
    </div>
    <a className="recommendation-hero-action" href="#recommendation-list">See all suggestions <ArrowRight size={17} aria-hidden="true" /></a>
  </section>;
}

export default function Recommendations({ mode, library, interests, request, onDiscover, onOpen, onSave }) {
  const { history, update, reset, error: storageError } = interests;
  const seedIds = interestSeeds(library, history, request?.careType).map(s => s.id).sort();
  const preferenceIds = normalisePreferenceTopics(history.preferences).sort();
  const key = JSON.stringify([mode, request, seedIds, preferenceIds]);
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
  const cards = ready ? recommendCentres({ candidates: data.items, seeds: data.seeds, request: data.request, library, history, preferences: history.preferences }) : [];
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
      <div><h3 id="recommendations-title">You may also like</h3><p>{history.preferences?.length ? 'Using your choices, current search and saved centres.' : 'Choose what matters, then we’ll use it with your search.'}</p></div>
    </header>
    <PreferenceSetup history={history} onSave={(topics, status) => update(h => ({ ...h, preferences: topics, preferenceSetup: status }))} />
    {request && <div className="recommendations-context"><MapPin size={17} aria-hidden="true" /><span>{request.pickup.label}
      {isShortCare(request) && <small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${request.date}T12:00:00Z`))} · {request.deadline}–{request.end}</small>}</span>
      <button className="text-link" onClick={onDiscover}>Change search <ArrowRight size={15} /></button></div>}
    {storageError && <p className="notice" role="status">{storageError}</p>}
    {failure && <div className="error-box" role="alert"><p>{failure}</p><button onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
    {!request ? <div className="recommendations-empty"><Search size={26} /><h4>What care do you need this time?</h4><p>Search first so we can check the location, age and times.</p><button className="primary" onClick={onDiscover}>Find childcare <ArrowRight size={16} /></button></div>
      : !ready && !failure ? <p className="recommendations-loading" role="status">Checking centre details…</p>
      : ready && <>
        {!seedIds.length && !history.preferences?.length && <p className="notice">Start with nearby centres. Saving and comparing will help us suggest others.</p>}
        <RecommendationHero cards={cards} onOpen={open} hasUsuals={seedIds.length > 0} />
        <div id="recommendation-list" className="recommendation-grid">{cards.map(({ p, reason, basedOn, preferenceMatches }) => <article className="recommendation-card" key={p.id}>
          <div className="recommendation-reason"><Heart size={15} aria-hidden="true" /><span>{reason}</span></div>
          <h4>{p.name}</h4>
          <p className="recommendation-area">{p.district || p.region}</p>
          <p className="recommendation-fee"><span>Fee</span><strong>{feeSummary(p).label}</strong></p>
          {basedOn && <p className="recommendation-anchor">Like {basedOn}</p>}
          {preferenceMatches?.filter(match => match.state === 'supported').length > 1 && <p className="recommendation-tags">Also fits: {preferenceMatches.filter(match => match.state === 'supported').slice(1).map(match => DISCOVERY_PREFERENCES.find(option => option.id === match.id)?.label).filter(Boolean).join(', ')}</p>}
          <p className="recommendation-check">{p.fit.conditions.some(c => ['admission', 'care', 'age'].includes(c.id) && c.state === 'unknown') ? 'Some details need checking with the centre.' : 'Listed details fit your search.'}</p>
          <div className="recommendation-actions"><button className="secondary" onClick={() => onSave(favourite(p))}><Bookmark size={16} />Save</button>
            <button className="primary" disabled={!!opening} onClick={() => open(p)}>{opening === p.id ? 'Checking…' : 'View centre'}<ArrowRight size={16} /></button></div>
          <button className="recommendation-dismiss text-link" onClick={() => update(h => hideRecommendation(h, p))} aria-label={`Not interested in ${p.name}`}><X size={14} />Not interested</button>
        </article>)}</div>
        {!cards.length && <div className="recommendations-empty"><Check size={26} /><h4>No new suggestions for this search</h4><p>Try another location or time. Your saved centres are still in Childcare.</p><button className="secondary" onClick={onDiscover}>Change search <ArrowRight size={16} /></button></div>}
        {!!cards.length && <p className="recommendations-footnote">Based on your search and public review themes. Ask the centre if they have a place for your child.</p>}
      </>}
    <details className="recommendation-controls"><summary>How suggestions work</summary>
      <p>We check your current search, then look for centres similar to those you saved or viewed. Comparing a centre counts more than opening it once. Suggestions do not change your search sorting.</p>
      <p>Your choices gently reorder matching public review themes. They never remove a centre that fits your search, and missing review evidence is left unknown.</p>
      <p>Viewing history stays in this browser. It keeps centre IDs and activity counts, without your search address, care times or child’s age. Live and demo history stay separate.</p>
      <label><input type="checkbox" checked={history.enabled} onChange={e => update(h => ({ ...h, enabled: e.target.checked }))} />Use viewing history for suggestions</label>
      <p className="notice">Saved centres still help when this is off. Clear history also restores hidden suggestions; your saved items stay.</p>
      <button className="secondary" onClick={reset}><RotateCcw size={15} />Clear viewing history</button>
    </details>
  </section>;
}
