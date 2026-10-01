import { useEffect, useRef, useState } from 'react';
import { ArrowRight, Bell, Bookmark, Check, ChevronDown, Clock3, Heart, Hourglass, Leaf, MapPin, MessageCircle, Receipt, RotateCcw, Search, Shapes, ShieldCheck, Sparkles, WalletCards, X } from 'lucide-react';
import { DISCOVERY_PREFERENCES, interestSeeds, recommendCentres, hideRecommendation, normalisePreferenceTopics } from '../shared/recommendations.mjs';
import { feeSummary } from '../shared/result-summary.mjs';
import { isShortCare } from '../shared/request.mjs';
import { displayName, placeLabel } from '../shared/display.mjs';
import { favourite } from '../shared/saved.mjs';
import { requestAPI, errorMessage } from './api.js';
import { FIRST_PREFERENCES } from '../shared/review-profile.mjs';

export function PreferenceSetup({ history, onSave, compact = false, exiting = false, intro = null }) {
  const [draft, setDraft] = useState(() => normalisePreferenceTopics(history.preferences));
  const [editing, setEditing] = useState(history.preferenceSetup === 'new');
  const [showMore, setShowMore] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(normalisePreferenceTopics(history.preferences));
  }, [history.preferences, editing]);
  const toggle = id => setDraft(current => current.includes(id) ? current.filter(value => value !== id) : current.length >= 3 ? current : [...current, id]);
  const selectedCount = draft.length;
  const choiceName = option => option.onboardingLabel ?? option.label;
  const options = DISCOVERY_PREFERENCES.filter(p => showMore || FIRST_PREFERENCES.includes(p.id) || draft.includes(p.id));
  const icons = { caring_teachers: Heart, secure_pickup: ShieldCheck, clean_environment: Sparkles, healthy_meals: Leaf, engaging_activities: Shapes, responsive_team: MessageCircle, flexible_short_care: Hourglass, convenient_hours: Clock3, smooth_pickup: MapPin, clear_late_rules: Bell, predictable_fees: Receipt, value_for_money: WalletCards };
  const save = status => {
    const topics = status === 'skipped' ? [] : normalisePreferenceTopics(draft);
    onSave(topics, status === 'skipped' ? 'skipped' : topics.length ? 'complete' : 'skipped');
    setEditing(false);
  };
  if (!editing && !exiting) return <div className="preference-summary" aria-label="Your suggestion choices">
    <span>{history.preferences?.length ? `Looking for: ${history.preferences.map(id => { const option = DISCOVERY_PREFERENCES.find(p => p.id === id); return option ? choiceName(option) : null; }).filter(Boolean).join(', ')}` : 'Suggestions use your current search and the centres you save, compare or view.'}</span>
    <button className="text-link" type="button" onClick={() => setEditing(true)}>Change choices</button>
  </div>;
  const full = selectedCount >= 3;
  const optionList = <div className="preference-options" role="group" aria-label="Suggestion choices">
    {options.map(option => { const Icon = icons[option.id] ?? Heart; const on = draft.includes(option.id); return <button key={option.id} type="button" className="preference-option" aria-pressed={on} aria-disabled={compact && full && !on ? true : undefined} aria-describedby={`preference-${option.id}-description`} onClick={() => toggle(option.id)}>
      <span className="preference-option-check" aria-hidden="true">{on ? <Check size={compact ? 15 : 16} strokeWidth={3} /> : ''}</span><span className="preference-option-icon" aria-hidden="true"><Icon size={compact ? 20 : 21} /></span><span className="preference-option-copy"><strong>{choiceName(option)}</strong><small id={`preference-${option.id}-description`}>{option.description}</small></span>
    </button>; })}
  </div>;
  const moreToggle = <button className="text-link preference-more" type="button" aria-expanded={showMore} onClick={()=>setShowMore(!showMore)}>{showMore ? 'Fewer choices' : 'More choices'}<ChevronDown size={16}/></button>;
  if (compact) {
    const status = !selectedCount ? 'Choose at least one to continue' : full ? '3 of 3 chosen. Untick one to swap.' : `${selectedCount} of 3 chosen`;
    return <section className={`preference-setup preference-setup-compact${exiting ? ' preference-setup-exiting' : ''}`} data-full={full || undefined}>
      {intro && <div className="preference-setup-intro">{intro}</div>}
      <div className="preference-setup-main">{optionList}{moreToggle}</div>
      <div className="preference-setup-footer">
        <p className="preference-progress" aria-live="polite"><span className="preference-pips" aria-hidden="true">{[0, 1, 2].map(i => <i key={i} data-on={i < selectedCount || undefined} />)}</span><span>{status}</span></p>
        <div className="preference-setup-actions"><button className="primary" type="button" disabled={!selectedCount} onClick={() => save('complete')}>Continue <ArrowRight size={17} /></button><button className="text-link" type="button" onClick={() => save('skipped')}>Skip for now</button></div>
        <p className="preference-setup-note">You can change these later in Saved → For you.</p>
      </div>
    </section>;
  }
  return <section className="preference-setup" aria-labelledby="preference-setup-title">
    <div className="preference-setup-heading"><div><h4 id="preference-setup-title">What matters to you?</h4><p>Pick up to 3. We use these choices to order suggestions.</p></div><span aria-live="polite">{selectedCount} of 3 selected</span></div>
    {optionList}
    {moreToggle}
    {full && <p className="preference-limit" role="status">You chose 3. Untick one to choose another.</p>}
    <div className="preference-setup-actions"><button className="primary" type="button" disabled={!draft.length} onClick={() => save('complete')}>Use my choices <ArrowRight size={16} /></button><button className="text-link" type="button" onClick={() => save('skipped')}>Skip for now</button></div>
    <p className="preference-setup-note">You can change these later in Saved → For you.</p>
  </section>;
}

function RecommendationHero({ cards, onOpen, hasUsuals }) {
  const preview = cards.slice(0, 3);
  if (!preview.length) return null;
  return <section className="recommendation-hero" aria-labelledby="recommendation-hero-title">
    <div className="recommendation-hero-heading">
      <div className="recommendation-hero-emblem"><Sparkles size={26} aria-hidden="true" /></div>
      <div><h4 id="recommendation-hero-title">{hasUsuals ? 'Centres you’ve looked at' : 'Good matches for this search'}</h4><p>{hasUsuals ? 'These still fit your current search.' : 'Based on your search and your choices.'}</p></div>
    </div>
    <div className="recommendation-hero-cards" aria-label="Suggested centres">
      {preview.map(({ p, reason }) => <button key={p.id} type="button" className="recommendation-hero-card" onClick={() => onOpen(p)} aria-label={`View ${p.name}`}>
        <span className="recommendation-hero-card-icon"><Heart size={18} aria-hidden="true" /></span>
        <strong>{displayName(p.name)}</strong>
        <small>{reason}</small>
        <span className="recommendation-hero-card-fee">{feeSummary(p).label}</span>
      </button>)}
    </div>
    <a className="recommendation-hero-action" href="#recommendation-list">See all suggestions <ArrowRight size={17} aria-hidden="true" /></a>
  </section>;
}

export default function Recommendations({ mode, library, interests, request, onDiscover, onOpen, onSave }) {
  const { history, update, reset, error: storageError } = interests;
  const seedIds = [...new Set([...interestSeeds(library, history, request?.careType).map(s => s.id), ...(history.enabled ? history.hidden.filter(s=>s.careType===request?.careType).map(s=>s.id) : [])])].slice(0,100).sort();
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
      <div><h3 id="recommendations-title">You may also like</h3><p>{history.preferences?.length ? 'Based on your choices, your search and the centres you’ve saved.' : 'Tell us what matters to you, and we’ll suggest centres for your search.'}</p></div>
    </header>
    <PreferenceSetup history={history} onSave={(topics, status) => update(h => ({ ...h, preferences: topics, preferenceSetup: status }))} />
    {request && <div className="recommendations-context"><MapPin size={17} aria-hidden="true" /><span>{request.pickup.label}
      {isShortCare(request) && <small>{new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${request.date}T12:00:00Z`))} · {request.deadline}–{request.end}</small>}</span>
      <button className="text-link" onClick={onDiscover}>Change search <ArrowRight size={15} /></button></div>}
    {storageError && <p className="notice" role="status">{storageError}</p>}
    {failure && <div className="error-box" role="alert"><p>{failure}</p><button onClick={() => setRetry(n => n + 1)}>Try again</button></div>}
    {!request ? <div className="recommendations-empty"><Search size={26} /><h4>What care do you need this time?</h4><p>Search first, so we can check the place, age and times.</p><button className="primary" onClick={onDiscover}>Find childcare <ArrowRight size={16} /></button></div>
      : !ready && !failure ? <p className="recommendations-loading" role="status">Checking centre details…</p>
      : ready && <>
        {!seedIds.length && !history.preferences?.length && <p className="notice">These are nearby centres. Save or compare a few, and the suggestions will get better.</p>}
        <RecommendationHero cards={cards} onOpen={open} hasUsuals={seedIds.length > 0} />
        <div id="recommendation-list" className="recommendation-grid">{cards.map(({ p, reason, basedOn, preferenceMatches }) => <article className="recommendation-card" key={p.id}>
          <div className="recommendation-reason"><Heart size={15} aria-hidden="true" /><span>{reason}</span></div>
          <h4>{displayName(p.name)}</h4>
          <p className="recommendation-area">{placeLabel(p)}</p>
          <p className="recommendation-fee"><span>Fee</span><strong>{feeSummary(p).label}</strong></p>
          {basedOn && <p className="recommendation-anchor">Similar to {displayName(basedOn)}</p>}
          {preferenceMatches?.filter(match => match.state === 'supported').length > 1 && <p className="recommendation-tags">Parents also mention: {preferenceMatches.filter(match => match.state === 'supported').slice(1).map(match => DISCOVERY_PREFERENCES.find(option => option.id === match.id)?.label).filter(Boolean).join(', ')}</p>}
          <p className="recommendation-check">{p.fit.conditions.some(c => ['admission', 'care', 'age'].includes(c.id) && c.state === 'unknown') ? 'Some details need checking with the centre.' : 'The listed details fit your search.'}</p>
          <div className="recommendation-actions"><button className="secondary" onClick={() => onSave(favourite(p))}><Bookmark size={16} />Save</button>
            <button className="primary" disabled={!!opening} onClick={() => open(p)}>{opening === p.id ? 'Checking…' : 'View centre'}<ArrowRight size={16} /></button></div>
          <button className="recommendation-dismiss text-link" onClick={() => update(h => hideRecommendation(h, p))} aria-label={`Not interested in ${p.name}`}><X size={14} />Not interested</button>
        </article>)}</div>
        {!cards.length && <div className="recommendations-empty"><Check size={26} /><h4>No new suggestions for this search</h4><p>Try another location or time. Your saved centres are still in Childcare.</p><button className="secondary" onClick={onDiscover}>Change search <ArrowRight size={16} /></button></div>}
        {!!cards.length && <p className="recommendations-footnote">Based on your search and what parents say in reviews. Ask the centre if they have a place for your child.</p>}
      </>}
    <details className="recommendation-controls"><summary>How suggestions work</summary>
      <p>We use your choices and the centres you save, compare and look at. Recent activity counts more.</p>
      <p>Your choices move a centre up when parents praise those things in reviews. They never remove a centre that fits your search.</p>
      <p>Your viewing history stays in this browser. It only keeps which centres you looked at, not your address, times or child’s age.</p>
      <label><input type="checkbox" checked={history.enabled} onChange={e => update(h => ({ ...h, enabled: e.target.checked }))} />Use viewing history for suggestions</label>
      <p className="notice">When this is off, your saved centres are still used. Clearing history also brings back suggestions you hid. Your saved centres stay.</p>
      <button className="secondary" onClick={reset}><RotateCcw size={15} />Clear viewing history</button>
    </details>
  </section>;
}
