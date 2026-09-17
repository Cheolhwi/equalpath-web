import { useState } from 'react';
import { ArrowRight, Baby, CalendarDays, Car, CheckCircle2, ChevronDown, Clock3, HelpCircle, MapPin, MessageCircle, Star, Users, Wallet, X, AlertTriangle } from 'lucide-react';
import SelectMenu, { sortOptions } from './SelectMenu.jsx';
import { SourceLink } from './ProviderViews.jsx';
import { bestForPriority } from '../shared/conditions.mjs';
import { comparisonFact, comparisonPriorityLabel } from '../shared/comparison-view.mjs';
import { feeSummary, feesForCare, formatFee } from '../shared/result-summary.mjs';
import { isShortCare, todayKL } from '../shared/request.mjs';

function Fact({ p, id, request }) {
  const { value, note, state, condition } = comparisonFact(p, id, request);
  const Icon = state === 'conflict' ? AlertTriangle : state === 'supported' && !(id === 'age' && p.age?.basis === 'type_reference') ? CheckCircle2 : HelpCircle;
  return <details className={`compare-fact ${state}`}>
    <summary><div><strong>{value}</strong>{note && <span><Icon size={14} aria-hidden="true" />{note}</span>}</div><ChevronDown size={14} aria-hidden="true" /></summary>
    {condition?.reason && <p>{condition.reason}</p>}
    <SourceLink source={condition?.source} />
    {id === 'age' && p.age?.alternative && <SourceLink source={p.age.alternative.source} />}
  </details>;
}

export default function Comparison({ items, onRemove, onPrepare, sort, onSort, ordering, request }) {
  const [more, setMore] = useState(false);
  const [pair, setPair] = useState([]);
  // Keep the user's mobile pair stable through sorting; fill any removed slot.
  const visibleIds = [...pair.filter(id => items.some(p => p.id === id)), ...items.map(p => p.id).filter(id => !pair.includes(id))].slice(0, 2);
  const best = bestForPriority(items, sort, request.date), short = isShortCare(request);
  const cellProps = p => ({ 'data-provider-id': p.id, 'data-mobile-hidden': !visibleIds.includes(p.id) || undefined, style: { '--mobile-column': visibleIds.indexOf(p.id) + 1 } });
  const shortDate = request.date ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${request.date}T12:00:00Z`)) : '';
  const extraRows = [
    ['transport', 'Centre picks up', Users],
    ['coverage', 'Pickup from your address', MapPin],
    ['pickup', 'Pickup by the centre', Clock3],
    ['transfer', 'Arrive at childcare', Car],
  ].filter(([id]) => items.some(p => p.fit.conditions.some(c => c.id === id)) &&
    (more || (id === 'transport' && request.transport === 'institution') || items.some(p => p.fit.conditions.some(c => c.id === id && c.state === 'conflict'))));
  const conditionRow = (id, label, Icon) => <tr key={id} data-fact={id}><th scope="row"><Icon size={18} aria-hidden="true" />{label}</th>{items.map(p => <td key={p.id} {...cellProps(p)}><Fact p={p} id={id} request={request} /></td>)}</tr>;
  return <div className="compare-view">
    <div className="compare-visit" aria-label="Your search">
      <span><Clock3 size={17} />{short ? 'Short time' : 'Long term'}</span>
      {short && <span><CalendarDays size={17} />{shortDate}</span>}
      <span><Baby size={17} />{String(request.age).replace('-', '–')} years</span>
      {short && <span><Users size={17} />Pick up child at <strong>{request.end}</strong></span>}
      <details className="compare-address"><summary><MapPin size={16} />Your starting address<ChevronDown size={14} /></summary><p>{request.pickup.label}</p>{short && <p>Go to childcare at {request.deadline}</p>}</details>
    </div>
    <div className="compare-toolbar">
      <p>Choose a centre to contact.</p>
      <div className="compare-sort-control"><span>Sort by</span><SelectMenu label="Comparison priority" value={sort}
        options={sortOptions(items[0]?.careType).filter(o => o.value !== 'closing' || request.date).map(o => ({ ...o, label: o.value === 'closing' ? 'Open later' : o.value === 'pickup' ? 'Pickup service first' : o.label }))}
        available={ordering?.available} unavailableReasons={ordering?.unavailableReasons} onChange={onSort} /></div>
    </div>
    {items.length > 2 && <details className="compare-pair" aria-label="Choose two centres to compare">
      <summary><span>2 of {items.length} centres</span><span>Change centres<ChevronDown size={14} /></span></summary>
      <div>{visibleIds.map((id, index) => <SelectMenu key={index} label={`Centre ${index + 1}`} value={id}
        options={items.filter(p => p.id === id || !visibleIds.includes(p.id)).map(p => ({ value: p.id, label: p.name }))}
        onChange={next => setPair(visibleIds.map((value, i) => i === index ? next : value))} />)}</div>
    </details>}
    <div className="comparison-scroll compare-table">
      <table aria-label="Compare childcare centres">
        <colgroup><col />{items.map(p => <col key={p.id} />)}</colgroup>
        <thead><tr><th scope="col"><span className="sr-only">What to compare</span></th>{items.map(p => <th scope="col" key={p.id} {...cellProps(p)} className={best.ids.includes(p.id) ? 'comparison-best' : undefined}>
          <div className="compare-centre-top"><span>{best.ids.includes(p.id) && <span className="comparison-best-tag"><Star size={13} fill="currentColor" />{comparisonPriorityLabel(best.label)}</span>}</span><button className="remove-compare" aria-label={`Remove ${p.name} from comparison`} onClick={() => onRemove(p.id)}><X size={17} /></button></div>
          <h3>{p.name}</h3>
          <button className="primary compare-contact" aria-label={`Contact ${p.name}`} onClick={() => onPrepare(p)}><MessageCircle size={16} />Contact<ArrowRight size={16} /></button>
        </th>)}</tr></thead>
        <tbody>
          <tr data-fact="fees"><th scope="row"><Wallet size={18} />Fee</th>{items.map(p => <td key={p.id} {...cellProps(p)}><details className="compare-fact compare-fees"><summary><strong>{feeSummary(p).label}</strong><ChevronDown size={14} /></summary><p>{feeSummary(p).note}</p>{feesForCare(p).map((f, i) => <div key={i}><strong>{formatFee(f)}</strong><p>{f.conditions}</p><SourceLink source={f.source} /></div>)}</details></td>)}</tr>
          <tr data-fact="drive"><th scope="row"><Car size={18} />By car</th>{items.map(p => <td key={p.id} {...cellProps(p)}><strong>{p.driving?.state === 'available' ? `About ${p.driving.minutes} min` : 'Time not available'}</strong></td>)}</tr>
          {conditionRow('age', 'Age', Baby)}
          {short && conditionRow('admission', 'Short time', Clock3)}
          {short && conditionRow('care', 'Care ends', Clock3)}
          {extraRows.map(([id, label, Icon]) => conditionRow(id, label, Icon))}
          {more && <>
            <tr><th scope="row"><MapPin size={18} />Address</th>{items.map(p => <td key={p.id} {...cellProps(p)}>{p.address || 'Address not listed'}<SourceLink source={p.addressSource} /></td>)}</tr>
            {!short && <tr><th scope="row"><Clock3 size={18} />Opening hours</th>{items.map(p => <td key={p.id} {...cellProps(p)}>{p.businessHours?.notes || 'Ask the centre'}<SourceLink source={p.businessHours?.source} /></td>)}</tr>}
            <tr><th scope="row"><CheckCircle2 size={18} />Registration</th>{items.map(p => <td key={p.id} {...cellProps(p)}><strong>{[p.registration?.authority, p.registration?.number].filter(Boolean).join(' · ') || 'No record found'}</strong><p>{p.registration?.until && p.registration.until < todayKL() ? 'Old record · ask about renewal' : p.mode === 'demo' ? 'Demo centre' : p.registration?.official ? 'Official record found' : 'Not yet checked with the government'}</p><SourceLink source={p.registration?.source} /></td>)}</tr>
          </>}
        </tbody>
      </table>
    </div>
    <button className="secondary compare-expand" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Show less' : 'More details'}<ChevronDown size={16} /></button>
    <p className="compare-footnote">Ask the centre to confirm your visit and price. Driving times do not include live traffic.</p>
    <details className="compare-ranking"><summary>About this order<ChevronDown size={14} /></summary><p>Centres with details that do not fit your search come last.</p><p className="comparison-priority-message">{best.ids.length > 1 ? 'These centres share the same value for your chosen order.' : best.ids.length ? 'The marked centre comes first for your chosen order.' : 'Not enough details to mark a centre.'}</p>{sort === 'price' && <p>Hourly, daily and monthly prices are kept separate. Estimates are labelled.</p>}</details>
  </div>;
}
