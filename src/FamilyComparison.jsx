import { useState } from 'react';
import { Baby, CalendarDays, CheckCircle2, HelpCircle, AlertTriangle, Wallet, X, ChevronDown, MessageCircle } from 'lucide-react';
import { Fact } from './Comparison.jsx';
import SelectMenu from './SelectMenu.jsx';
import { displayName } from '../shared/display.mjs';
import { feeSummary } from '../shared/result-summary.mjs';
import { childComparisonFit, familyComparisonFee } from '../shared/family-comparison.mjs';
import { childName } from '../shared/two-child.mjs';

export default function FamilyComparison({ items, children, onRemove, onPrepare }) {
  const [pair, setPair] = useState([]);
  const visible = [...pair.filter(id => items.some(p => p.id === id)), ...items.map(p => p.id).filter(id => !pair.includes(id))].slice(0, 2);
  const cell = p => ({ 'data-provider-id': p.id, 'data-mobile-hidden': !visible.includes(p.id) || undefined, style: { '--mobile-column': visible.indexOf(p.id) + 1 } });
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${children.a.request.date}T12:00:00Z`));
  return <div className="compare-view family-compare">
    <div className="compare-visit" aria-label="Your two children">
      <span><CalendarDays size={17} />{date}</span>
      {['a', 'b'].map(key => <span key={key}><Baby size={17} /><strong>{childName(key)}</strong> {children[key].request.age.replace('-', '–')} years · {children[key].request.deadline}–{children[key].request.end}</span>)}
    </div>
    <p className="family-compare-intro">Check each child separately. A centre may fit one child but not the other.</p>
    {items.length > 2 && <details className="compare-pair" aria-label="Choose two centres to compare">
      <summary><span>2 of {items.length} centres</span><span>Change centres<ChevronDown size={14} /></span></summary>
      <div>{visible.map((id, index) => <SelectMenu key={index} label={`Centre ${index + 1}`} value={id}
        options={items.filter(p => p.id === id || !visible.includes(p.id)).map(p => ({ value: p.id, label: displayName(p.name) }))}
        onChange={next => setPair(visible.map((value, i) => i === index ? next : value))} />)}</div>
    </details>}
    <div className="comparison-scroll compare-table">
      <table aria-label="Compare centres for two children">
        <colgroup><col />{items.map(p => <col key={p.id} />)}</colgroup>
        <thead><tr><th scope="col"><span className="sr-only">What to compare</span></th>{items.map(p => <th scope="col" key={p.id} {...cell(p)}>
          <div className="compare-centre-top"><span /><button className="remove-compare" aria-label={`Remove ${p.name} from comparison`} onClick={() => onRemove(p.id)}><X size={17} /></button></div>
          <h3>{displayName(p.name)}</h3>
        </th>)}</tr></thead>
        {['a', 'b'].map(key => <tbody key={key} aria-label={childName(key)}>
          <tr><th scope="row"><Baby size={18} />{childName(key)}<small>{children[key].request.age.replace('-', '–')} years<br />{children[key].request.deadline}–{children[key].request.end}</small></th>
            {items.map(p => { const fit = childComparisonFit(p.children[key]); const Icon = fit.state === 'supported' ? CheckCircle2 : fit.state === 'conflict' ? AlertTriangle : HelpCircle;
              return <td key={p.id} {...cell(p)}><details className={`compare-fact ${fit.state}`}><summary><strong><Icon size={16} /> {fit.label}</strong><ChevronDown size={14} /></summary>
                <div className="family-child-checks">{[['age', 'Age'], ['admission', 'Short care'], ['care', 'Care hours']].map(([id, label]) => <div key={id}><b>{label}</b><Fact p={p.children[key]} id={id} request={children[key].request} /></div>)}</div>
              </details></td>; })}</tr>
          <tr><th scope="row"><Wallet size={18} />{childName(key)} fee</th>{items.map(p => <td key={p.id} {...cell(p)}><strong>{feeSummary(p.children[key]).label}</strong><p className="family-fee-note">{feeSummary(p.children[key]).note}</p></td>)}</tr>
          <tr><th scope="row">Ask about {childName(key)}</th>{items.map(p => <td key={p.id} {...cell(p)}><button className="secondary family-child-contact" onClick={() => onPrepare(p.children[key], key)} aria-label={`Contact ${p.name} about ${childName(key)}`}><MessageCircle size={16} />{childName(key)}</button></td>)}</tr>
        </tbody>)}
        <tbody><tr><th scope="row"><Wallet size={18} />Both children</th>{items.map(p => <td key={p.id} {...cell(p)}><strong>{familyComparisonFee(p.children)}</strong></td>)}</tr></tbody>
      </table>
    </div>
    <p className="compare-footnote">The total adds both children’s fees at the same centre. Extras and sibling discounts are not included. Ask the centre to confirm places for both children.</p>
  </div>;
}
