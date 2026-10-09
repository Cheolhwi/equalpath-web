import { useState } from 'react';
import { exportLearningData } from '../shared/recommendation-learning.mjs';
import { saveInterests } from './interest-store.js';
import './recommendation-learning.css';

export default function RecommendationLearning({ interests, mode }) {
  const [message, setMessage] = useState('');
  const download = () => {
    try {
      // Created only when the user exports; stable within this local history so
      // repeated exports cannot silently masquerade as different people.
      const history = saveInterests(mode, h => ({ ...h, rankingActor: h.rankingActor ?? `u_${crypto.randomUUID()}` }));
      const data = exportLearningData(history, history.rankingActor, mode);
      if (!data.sessions.length) {
        setMessage('No search activity has been recorded yet.');
        return;
      }
      const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `equalpath-recommendation-data-${mode}.json`;
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('Downloaded to your device. Nothing was sent to a server.');
    } catch { setMessage('The download did not work. Please try again.'); }
  };
  return <details className="recommendation-controls">
    <summary>How search learns from you</summary>
    <p>Your choices help with your first search. The centres you open, compare and save help with your next search.</p>
    <p>You can browse at your own pace. The results on your screen stay in the same order.</p>
    <p>Search learning records stay in this browser for up to 60 days. They do not include your address, child’s age or care times.</p>
    <label><input type="checkbox" checked={interests.history.enabled} onChange={e => interests.update(h => ({ ...h, enabled: e.target.checked }))} />Use my activity to improve suggestions</label>
    <p>You can download these records if you want to share them for testing. They include centre IDs, choices and search scores. Nothing is uploaded automatically.</p>
    <div className="learning-actions">
      <button className="secondary" onClick={download}>Download my recommendation data</button>
      <button className="text-link" onClick={() => { interests.reset(); setMessage(''); }}>Clear learning history</button>
    </div>
    {message && <p role="status">{message}</p>}
    {interests.error && <p role="alert">{interests.error}</p>}
  </details>;
}
