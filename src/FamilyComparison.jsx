import { useRef, useState } from 'react';
import { Award, Baby, CalendarDays, Car, CheckCircle2, ChevronDown, Clock3, Copy, Check, HelpCircle, AlertTriangle, MapPin, MessageCircle, Wallet, X, ArrowRight } from 'lucide-react';
import { Fact } from './Comparison.jsx';
import SelectMenu from './SelectMenu.jsx';
import { PublishedContacts, SourceLink } from './ProviderViews.jsx';
import { displayName, displayAddress } from '../shared/display.mjs';
import { childFitLine, childFeeShort, familyComparisonFee, familyCompareOrder, FAMILY_SORTS, FAMILY_SORT_REASONS } from '../shared/family-comparison.mjs';
import { ageText, childName, sameCentreMessage } from '../shared/two-child.mjs';
import { childRequest } from '../shared/two-child.mjs';
import VirtualEnquiry from './VirtualEnquiry.jsx';

// Two children, organised by topic (like the one-child comparison) rather than
// by child: the total first, the drive, one line per child for the checks, the
// care end time, and one Contact per centre that asks about both children.
const KIDS = ['a', 'b'];
const FitIcon = ({ state }) => state === 'supported' ? <CheckCircle2 size={15} aria-hidden="true" /> : state === 'conflict' ? <AlertTriangle size={15} aria-hidden="true" /> : <HelpCircle size={15} aria-hidden="true" />;

export default function FamilyComparison({ items: given, children, plan, onRemove, onPrepare, onToast }) {
  const [sort, setSort] = useState('distance');
  const order = familyCompareOrder(given, sort), items = order.items;
  const [pair, setPair] = useState([]);
  const [more, setMore] = useState(false);
  const [contactId, setContactId] = useState(null);
  const contactRef = useRef(null);
  const visible = [...pair.filter(id => items.some(p => p.id === id)), ...items.map(p => p.id).filter(id => !pair.includes(id))].slice(0, 2);
  const cell = p => ({ 'data-provider-id': p.id, 'data-mobile-hidden': !visible.includes(p.id) || undefined, style: { '--mobile-column': visible.indexOf(p.id) + 1 } });
  const date = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${children.a.request.date}T12:00:00Z`));
  const contact = items.find(p => p.id === contactId);
  const openContact = id => { setContactId(id); requestAnimationFrame(() => contactRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })); };
  const careState = (p, k) => p.children[k]?.fit?.conditions?.find(c => c.id === 'care')?.state;
  const careNote = p => {
    const off = KIDS.filter(k => careState(p, k) !== 'supported');
    if (!off.length) return <small className="family-ok"><CheckCircle2 size={13} aria-hidden="true" />Open until both pickups</small>;
    return off.map(k => careState(p, k) === 'conflict'
      ? <small key={k} className="family-off">Closes before {childName(k)}’s {children[k].request.end}</small>
      : <small key={k} className="family-ask">Check {childName(k)}’s {children[k].request.end}</small>);
  };
  return <div className="compare-view family-compare">
    <div className="compare-visit" aria-label="Your two children">
      <span><CalendarDays size={17} />{date}</span>
      {KIDS.map(key => <span key={key}><Baby size={17} /><strong>{childName(key)}</strong> {ageText(children[key].request.age)} · {children[key].request.deadline}–{children[key].request.end}</span>)}
      {children.a.request.pickup?.label && <details className="compare-address"><summary><MapPin size={16} />Starting point<ChevronDown size={14} /></summary><p>{children.a.request.pickup.label}</p></details>}
    </div>
    <div className="compare-toolbar">
      <div className="compare-sort-control"><span>Sort by</span><SelectMenu label="Comparison priority" value={order.sort}
        options={FAMILY_SORTS.map(({ value, label }) => ({ value, label }))} available={order.available} unavailableReasons={FAMILY_SORT_REASONS} onChange={setSort} /></div>
    </div>
    {items.length > 2 && <details className="compare-pair" aria-label="Choose two centres to compare">
      <summary><span>2 of {items.length} centres</span><span>Change centres<ChevronDown size={14} /></span></summary>
      <div>{visible.map((id, index) => <SelectMenu key={index} label={`Centre ${index + 1}`} value={id}
        options={items.filter(p => p.id === id || !visible.includes(p.id)).map(p => ({ value: p.id, label: displayName(p.name) }))}
        onChange={next => setPair(visible.map((value, i) => i === index ? next : value))} />)}</div>
    </details>}
    <div className="comparison-scroll compare-table">
      <table aria-label="Compare centres for two children">
        <colgroup><col />{items.map(p => <col key={p.id} />)}</colgroup>
        <thead><tr><th scope="col"><span className="sr-only">What to compare</span></th>{items.map(p => <th scope="col" key={p.id} {...cell(p)} className={order.best.ids.includes(p.id) ? 'comparison-best' : undefined}>
          <div className="compare-centre-top"><span>{order.best.ids.includes(p.id) && <span className="comparison-best-tag"><Award size={13} aria-hidden="true" />{order.best.label}</span>}</span><button className="remove-compare" aria-label={`Remove ${p.name} from comparison`} onClick={() => { if (contactId === p.id) setContactId(null); onRemove(p.id); }}><X size={17} /></button></div>
          <h3>{displayName(p.name)}</h3>
          <button className="primary compare-contact" aria-label={`Contact ${p.name} about both children`} aria-expanded={contactId === p.id} onClick={() => openContact(p.id)}><MessageCircle size={16} />Contact<ArrowRight size={16} /></button>
        </th>)}</tr></thead>
        <tbody>
          <tr data-fact="fees"><th scope="row"><Wallet size={18} />Both children</th>{items.map(p => <td key={p.id} {...cell(p)}>
            <strong>{familyComparisonFee(p.children)}</strong>
            {KIDS.some(k => p.children[k]?.cost?.available) && <small className="family-fee-split">{KIDS.map(k => `${childName(k)} ${childFeeShort(p.children[k])}`).join(' · ')}</small>}
          </td>)}</tr>
          <tr data-fact="drive"><th scope="row"><Car size={18} />By car</th>{items.map(p => <td key={p.id} {...cell(p)}>
            <strong>{p.driving?.state === 'available' ? `About ${p.driving.minutes} min` : 'Not available'}</strong>
          </td>)}</tr>
          <tr data-fact="children"><th scope="row"><Baby size={18} />Your children</th>{items.map(p => <td key={p.id} {...cell(p)}>
            <ul className="family-fit-lines">{KIDS.map(k => { const line = childFitLine(p.children[k]);
              return <li key={k} className={line.state}><FitIcon state={line.state} /><b>{childName(k)}</b><span>{line.text}</span></li>; })}</ul>
          </td>)}</tr>
          <tr data-fact="care"><th scope="row"><Clock3 size={18} />Care ends at</th>{items.map(p => <td key={p.id} {...cell(p)}>
            <strong>{p.careEndTimeLabel ?? p.businessHoursLabel ?? 'Not listed'}</strong>
            <div className="family-care-notes">{careNote(p)}</div>
          </td>)}</tr>
          {more && <>
            {KIDS.map(k => <tr key={k} data-fact={`details-${k}`}><th scope="row"><Baby size={18} />{childName(k)} details<small>{ageText(children[k].request.age)} · {children[k].request.deadline}–{children[k].request.end}</small></th>{items.map(p => <td key={p.id} {...cell(p)}>
              <div className="family-child-checks">{[['age', 'Age'], ['admission', 'Short care'], ['care', 'Care hours']].map(([id, label]) => <div key={id}><b>{label}</b><Fact p={p.children[k]} id={id} request={children[k].request} /></div>)}</div>
            </td>)}</tr>)}
            <tr><th scope="row"><MapPin size={18} />Address</th>{items.map(p => <td key={p.id} {...cell(p)}>{displayAddress(p.address) || 'Address not listed'}<SourceLink source={p.addressSource} /></td>)}</tr>
            <tr><th scope="row"><CheckCircle2 size={18} />Registration</th>{items.map(p => <td key={p.id} {...cell(p)}><strong>{[p.registration?.authority, p.registration?.number].filter(Boolean).join(' · ') || 'No record found'}</strong><SourceLink source={p.registration?.source} /></td>)}</tr>
          </>}
        </tbody>
      </table>
    </div>
    <button className="secondary compare-expand" aria-expanded={more} onClick={() => setMore(!more)}>{more ? 'Show less' : 'More details'}<ChevronDown size={16} /></button>
    {contact && <FamilyContact refEl={contactRef} p={contact} plan={plan} onClose={() => setContactId(null)} onPrepare={onPrepare} onToast={onToast} />}
    <p className="compare-footnote">Fees are estimates for each child’s times; the total adds both at the same centre. Extras and sibling discounts are not included. Driving times don’t include traffic. Centres where a child’s details don’t match come last.</p>
  </div>;
}

// One message about two places at the same centre (the same text as the
// two-children plan), with the centre's published contacts.
function FamilyContact({ refEl, p, plan, onClose, onPrepare, onToast }) {
  const [copied, setCopied] = useState(false), [manual, setManual] = useState(false);
  const message = plan ? sameCentreMessage({ a: p.children.a, b: p.children.b }, plan) : '';
  const copy = async () => {
    try { await navigator.clipboard.writeText(message); setCopied(true); onToast?.('Message copied. Paste it into WhatsApp or a text message.'); }
    catch { setManual(true); }
  };
  return <section ref={refEl} className="family-compare-contact" aria-label={`Contact ${p.name}`}>
    <div className="family-compare-contact-head"><h3>Contact {displayName(p.name)}</h3><button className="remove-compare" aria-label="Close contact" onClick={onClose}><X size={17} /></button></div>
    <p>One message asks about places for both children.</p>
    <div className="family-compare-contact-ways"><PublishedContacts p={p} compact /></div>
    {message && <>
      <pre className="family-compare-message">{message}</pre>
      <div className="enquiry-button-row"><button className="primary" onClick={copy}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}{copied ? 'Copied' : 'Copy message'}</button>
      <VirtualEnquiry providerId={p.id} requests={KIDS.map(k => childRequest(plan, k))} /></div>
      {manual && <textarea readOnly value={message} aria-label="Message to copy" className="enquiry-manual-message" />}
    </>}
    <p className="family-compare-contact-more">Need different questions for each child?{KIDS.map(k => <button key={k} className="text-link" onClick={() => onPrepare(p.children[k], k)}>Questions for {childName(k)}</button>)}</p>
  </section>;
}
