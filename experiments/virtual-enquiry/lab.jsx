import { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowLeft, Copy, FlaskConical } from 'lucide-react';
import VirtualEnquiry, { virtualEnquiryEnabled } from '../../src/VirtualEnquiry.jsx';
import { businessHoursFor } from '../../shared/conditions.mjs';
import { todayKL } from '../../shared/request.mjs';
import './lab.css';

function Lab() {
  const [config, setConfig] = useState(null), [error, setError] = useState('');
  const [providerId, setProviderId] = useState(''), [date, setDate] = useState(todayKL());
  const [count, setCount] = useState(1), [scenario, setScenario] = useState('rules'), [copied, setCopied] = useState(false);
  const [children, setChildren] = useState([{ age: '2', deadline: '14:00', end: '16:00' }, { age: '5', deadline: '14:00', end: '16:00' }]);
  useEffect(() => { if (virtualEnquiryEnabled) fetch('/virtual-enquiry-api/config').then(r => { if (!r.ok) throw Error(); return r.json(); }).then(c => { setConfig(c); setProviderId(c.branches[0].id); }).catch(() => setError('The local test service is unavailable.')); }, []);
  const branch = config?.branches.find(b => b.id === providerId), rules = branch?.facts;
  const requests = children.slice(0, count).map(c => ({ ...c, date }));
  const update = (i, key, value) => { setCopied(false); setChildren(old => old.map((c, j) => i === j ? { ...c, [key]: value } : c)); };
  return <main className="virtual-lab">
    <header className="lab-nav"><a href="/#discover"><ArrowLeft size={17} />Back to EqualPath</a><span><FlaskConical size={17} />Local test project</span></header>
    <section className="lab-intro"><span className="virtual-badge">No real centres are contacted</span><h1>Try an automatic enquiry.</h1><p>Choose a virtual centre and a visit. See how a reply comes back to the website.</p></section>
    {!virtualEnquiryEnabled ? <p>Start this project with <code>npm run dev:enquiry</code>.</p> : error ? <p role="alert">{error}</p> : !config ? <p>Loading virtual centres…</p> : <div className="lab-grid">
      <section className="lab-form" aria-label="Test visit details"><h2>1. Set up a test visit</h2><p className="lab-help">All {config.count} centres use listed ages and hours. Spaces and replies are simulated.</p>
        <label>Virtual centre<select value={providerId} onChange={e => { setProviderId(e.target.value); setCopied(false); }}>{config.branches.map(b => <option key={b.id} value={b.id}>{b.name} · {b.listedName}</option>)}</select></label>
        <label>Date<input type="date" value={date} onChange={e => { setDate(e.target.value); setCopied(false); }} /></label>
        <label>Children<select value={count} onChange={e => { setCount(+e.target.value); setCopied(false); }}><option value="1">1 child</option><option value="2">2 children</option></select></label>
        {children.slice(0, count).map((c, i) => <fieldset key={i}><legend>Child {i + 1}</legend><label>Age<select value={c.age} onChange={e => update(i, 'age', e.target.value)}><option value="">Not given</option><option value="0">Under 1 year</option>{[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} {n === 1 ? 'year' : 'years'}</option>)}</select></label><div className="lab-times"><label>Start<input type="time" value={c.deadline} onChange={e => update(i, 'deadline', e.target.value)} /></label><label>End<input type="time" value={c.end} onChange={e => update(i, 'end', e.target.value)} /></label></div></fieldset>)}
        <details className="lab-test-controls"><summary>Try another kind of reply</summary><label>Test scenario<select value={scenario} onChange={e => setScenario(e.target.value)}><option value="rules">Use listed facts + simulated spaces</option><option value="available">Test: 2 simulated spaces</option><option value="full">Test: no simulated spaces</option><option value="conditional">Test: a condition applies</option><option value="more_info">Test: needs more information</option><option value="no_reply">Test: no reply (15 seconds locally)</option></select></label></details>
      </section>
      <section className="lab-conversation" aria-label="Test conversation"><h2>2. Send and read the reply</h2><p className="lab-help">Check the visit details before sending. Changing them starts a separate test.</p>
        <VirtualEnquiry providerId={providerId} requests={requests} scenario={scenario} />
        <button className="lab-copy secondary" onClick={async () => { try { await navigator.clipboard.writeText(`SIMULATION ONLY — ${branch.name}\nDate: ${date}\n${requests.map((c,i) => `Child ${i+1}: age ${c.age || 'not given'}, ${c.deadline}–${c.end}`).join('\n')}\nCan you take the children? What is the total fee?`); setCopied(true); } catch { setError('Copy was blocked by this browser.'); } }}><Copy size={16} />{copied ? 'Copied test message' : 'Copy test message'}</button>
        <aside className="lab-how"><h3>What happens here?</h3><ol><li>Listed ages and hours are checked first. Only spaces and staff replies are simulated.</li><li>Each child gets a separate answer.</li><li>The reply appears here with the original message.</li></ol><p>{config.transport === 'local-simulation' ? 'Telegram is not connected yet. The same flow runs locally, without sending any external messages.' : 'The request goes only to your private Telegram test chat. Tap a reply button there to play the virtual centre.'}</p></aside>
        <details className="lab-rules"><summary>View listed facts and simulated spaces</summary>{rules && <><p>{branch.listedName}</p><ul><li>Listed ages: {rules.age?.rangeLabel || rules.age?.wording || 'Not listed'}</li><li>Listed business hours: {businessHoursFor(rules, date)}</li><li>Age source: {rules.age?.source?.label || 'Not listed'} · {rules.age?.source?.sourceDate || rules.age?.source?.retrievedAt || 'Date unknown'}</li><li>Hours source: {rules.businessHours?.source?.label || 'Not listed'} · {rules.businessHours?.source?.sourceDate || rules.businessHours?.source?.retrievedAt || 'Date unknown'}</li><li>Simulated spaces: {branch.capacity.places} at once; up to {branch.capacity.olderPlaces} for ages 4–6</li></ul></>}</details>
      </section>
    </div>}
    <footer>Simulation only. No booking, real availability update or recommendation training.</footer>
  </main>;
}
createRoot(document.getElementById('root')).render(<Lab />);
