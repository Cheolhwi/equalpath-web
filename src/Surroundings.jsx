import { useEffect, useId, useState } from 'react';
import { MapPin, ChevronDown } from 'lucide-react';
import photos from './surroundings.json';
import { loadSurrounding } from './surroundings-cache.js';
import './surroundings.css';

export default function Surroundings({ p }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const id = useId();
  const photo = p.mode === 'demo' ? null : photos[p.id];
  const [src, setSrc] = useState(null);
  const url = photo?.url;
  useEffect(() => {
    if (!open || !url) return;
    let active = true, objectUrl;
    setSrc(null); setFailed(false);
    loadSurrounding(url).then(blob => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob); setSrc(objectUrl);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [open, url]);
  if (!photo) return null;
  return <section className="centre-surroundings">
    <button className="surroundings-toggle" aria-expanded={open} aria-controls={id} onClick={() => { setFailed(false); setOpen(!open); }}>
      <MapPin size={18} aria-hidden="true" /><span>Check surroundings</span><ChevronDown size={18} aria-hidden="true" />
    </button>
    <div id={id} hidden={!open}>
      {open && <figure>
        {failed ? <p role="status">This photo could not load. Close and reopen to try again.</p> : src ? <img src={src} alt={`Street view near ${p.name}`} width="1024" height="576" decoding="async" onError={() => setFailed(true)} /> : <p role="status">Loading photo…</p>}
        <figcaption>Google Street View · Photo date unknown. The area may have changed.</figcaption>
      </figure>}
    </div>
  </section>;
}
