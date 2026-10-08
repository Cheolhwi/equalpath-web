import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Expand, X } from 'lucide-react';
import photos from './surroundings.json';
import { loadSurrounding } from './surroundings-cache.js';
import './surroundings.css';

// The street outside the centre (8 Oct 2026): a small photo beside the
// centre's address, so the page keeps its order (who, where, the key facts,
// reviews). Selecting it shows the photo large over the page.
const CAPTION = 'Google Street View';

export default function Surroundings({ p }) {
  const photo = p.mode === 'demo' ? null : photos[p.id];
  const images = photo?.images?.length ? photo.images : photo ? [photo] : [];
  const [index, setIndex] = useState(0);
  const url = images[index]?.url || photo?.url;
  useEffect(() => { setIndex(0); setLarge(false); }, [p.id]);
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
  if (!photo) return null;
  const move = delta => setIndex(i => (i + delta + images.length) % images.length);
  const shut = () => { setLarge(false); thumb.current?.focus({ preventScroll: true }); };
  return <figure className="centre-surroundings">
    <button ref={thumb} type="button" className="surroundings-thumb" disabled={!src && !failed} onClick={() => setLarge(true)}
      aria-label={failed ? `Open street views near ${p.name}` : src ? `Show the street photo near ${p.name} larger` : 'Loading the street photo'}>
      {src ? <img src={src} alt="" width="1024" height="576" decoding="async" onError={() => { setSrc(null); setFailed(true); }} /> : failed ? <span>Photo unavailable</span> : <span className="surroundings-loading" aria-hidden="true" />}
      <span className="surroundings-label"><Expand size={13} aria-hidden="true" />Surroundings{images.length > 1 && ` · ${images.length} views`}</span>
    </button>
    <figcaption>{CAPTION}</figcaption>
    {large && <div className="surroundings-lightbox" role="dialog" aria-modal="true" aria-label={`Street photo near ${p.name}`}
      onClick={shut} onKeyDown={e => { if (e.key === 'ArrowLeft') { e.preventDefault(); move(-1); } if (e.key === 'ArrowRight') { e.preventDefault(); move(1); } if (e.key === 'Tab') { const buttons = [...e.currentTarget.querySelectorAll('button')]; const first = buttons[0], last = buttons.at(-1); if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); } } if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); shut(); } }}>
      <figure onClick={e => e.stopPropagation()}>
        <div className="surroundings-frame">{src ? <img src={src} alt={`${images[index]?.direction || 'Street view'} near ${p.name}`} width="1024" height="576" onError={() => { setSrc(null); setFailed(true); }} /> : <p role="status">{failed ? 'This photo could not load. Try another view.' : 'Loading photo…'}</p>}</div>
        {images.length > 1 && <div className="surroundings-controls">
          <button type="button" aria-label="Previous view" onClick={() => move(-1)}><ChevronLeft size={20} />Previous</button>
          <span aria-live="polite">{index + 1} / {images.length} · {images[index]?.direction}</span>
          <button type="button" aria-label="Next view" onClick={() => move(1)}>Next<ChevronRight size={20} /></button>
        </div>}
        <figcaption>{CAPTION}{images.length > 1 && ' · Different directions from the same spot'}</figcaption>
      </figure>
      <button ref={close} type="button" className="surroundings-close" onClick={shut}><X size={18} aria-hidden="true" />Close photo</button>
    </div>}
  </figure>;
}
