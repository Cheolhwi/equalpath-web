import { useEffect, useRef, useState } from 'react';
import { Expand, X } from 'lucide-react';
import photos from './surroundings.json';
import { loadSurrounding } from './surroundings-cache.js';
import './surroundings.css';

// The street outside the centre (8 Oct 2026): a small photo beside the
// centre's address, so the page keeps its order (who, where, the key facts,
// reviews). Selecting it shows the photo large over the page.
const CAPTION = 'Google Street View';

export default function Surroundings({ p }) {
  const photo = p.mode === 'demo' ? null : photos[p.id];
  const url = photo?.url;
  const [src, setSrc] = useState(null);
  const [failed, setFailed] = useState(false);
  const [large, setLarge] = useState(false);
  const thumb = useRef(null), close = useRef(null);
  useEffect(() => {
    if (!url) return;
    let active = true, objectUrl;
    setSrc(null); setFailed(false);
    loadSurrounding(url).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setSrc(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [url]);
  useEffect(() => { if (large) close.current?.focus({ preventScroll: true }); }, [large]);
  if (!photo || failed) return null;
  const shut = () => { setLarge(false); thumb.current?.focus({ preventScroll: true }); };
  return <figure className="centre-surroundings">
    <button ref={thumb} type="button" className="surroundings-thumb" disabled={!src} onClick={() => setLarge(true)}
      aria-label={src ? `Show the street photo near ${p.name} larger` : 'Loading the street photo'}>
      {src ? <img src={src} alt="" width="1024" height="576" decoding="async" onError={() => setFailed(true)} /> : <span className="surroundings-loading" aria-hidden="true" />}
      <span className="surroundings-label"><Expand size={13} aria-hidden="true" />Surroundings</span>
    </button>
    <figcaption>{CAPTION}</figcaption>
    {large && <div className="surroundings-lightbox" role="dialog" aria-modal="true" aria-label={`Street photo near ${p.name}`}
      onClick={shut} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } }}>
      <figure onClick={e => e.stopPropagation()}>
        <img src={src} alt={`Street view near ${p.name}`} width="1024" height="576" />
        <figcaption>{CAPTION}</figcaption>
      </figure>
      <button ref={close} type="button" className="surroundings-close" onClick={shut}><X size={18} aria-hidden="true" />Close photo</button>
    </div>}
  </figure>;
}
