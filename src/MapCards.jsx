import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Bookmark, Car, Check, Heart, Plus, UsersRound, X } from "lucide-react";
import { feeSummary, drivingLabel } from "../shared/result-summary.mjs";
import { followMapCard, placeMapCards } from "../shared/map-cards.mjs";
import { displayName } from "../shared/display.mjs";
import { centreHighlights } from "../shared/recommendations.mjs";
import CentreHighlights from "./CentreHighlights.jsx";

// Map cards are narrow: shorten the shared reason prefix so the matched
// preference itself stays visible. The full reason remains in the tooltip.
const mapCardReason = reason => reason ? reason.replace(/^Matches your choices:\s*/, "Matches: ") : "For you";

function Card({ p, highlights, index, selected, saved, compared, onOpen, onClose, onSave, onCompare }) {
  return <>
    <div className="map-centre-card-main">
      <span className="map-card-number" aria-label={`Map point ${index}`}>{String(index).padStart(2, "0")}</span>
      <strong>{displayName(p.name)}</strong>
      {p.familyFor && <span className="map-card-for"><UsersRound size={12} aria-hidden="true" /><span>{p.familyFor}</span></span>}
      <CentreHighlights highlights={highlights} />
      {p.personalised && <span className="map-card-personalised" title={p.personalisedReason}><Heart size={12} aria-hidden="true" /><span>{mapCardReason(p.personalisedReason)}</span></span>}
      <span className="map-card-drive"><Car size={14} aria-hidden="true" />{drivingLabel(p.driving)}</span>
      <span className={`map-card-fee${feeSummary(p).estimate ? " fee-estimate" : ""}`}>Fee: {feeSummary(p).label}</span>
    </div>
    <div className="map-card-actions" aria-label={`Actions for ${p.name}`}>
      <button className={saved ? "is-saved" : ""} aria-label={`${saved ? "Remove from Saved" : "Save"}: ${p.name}`} aria-pressed={saved} onClick={() => onSave(p)}><Bookmark size={15} fill={saved ? "currentColor" : "none"} aria-hidden="true" />{saved ? "Saved" : "Save"}</button>
      {onCompare && <button aria-label={`Compare ${p.name}`} aria-pressed={compared} onClick={() => onCompare(p.id)}>{compared ? <Check size={15} aria-hidden="true" /> : <Plus size={15} aria-hidden="true" />}{compared ? "Added" : "Compare"}</button>}
      <button className="map-card-details" aria-label={`View details for ${p.name}`} onClick={() => onOpen(p)}>Details<ArrowRight size={15} aria-hidden="true" /></button>
    </div>
    <button className="map-centre-card-close" aria-label={selected ? "Close centre preview" : `Close preview for ${p.name}`} onClick={() => onClose(p.id)}><X size={17} /></button>
  </>;
}

export default function MapCards({ entries: rawEntries, pins, width, height, compact, topInset = 148, leftInset = 0, rightInset = 0, quiet = false, hasCompare, reduced, onOpen, onClose, savedIds = [], compareIds = [], onSave, onCompare }) {
  const entries = useMemo(() => rawEntries.map(entry => ({ ...entry,
    highlights: entry.p.suggested || entry.p.personalised ? [] : centreHighlights(entry.p),
  })), [rawEntries]);
  const retained = useRef([]);
  const [leaving, setLeaving] = useState([]);
  const key = entries.map(e => `${e.id}:${e.selected}`).join("|");
  useEffect(() => {
    if (!leaving.length) return;
    const timer = setTimeout(() => setLeaving([]), 220);
    return () => clearTimeout(timer);
  }, [leaving]);
  const cardWidth = Math.min(304, width - (compact ? 92 : 40));
  const shortMap = compact && height <= 650;
  const highlightCount = Math.max(0, ...entries.map(e => e.highlights.length));
  const highlightHeight = highlightCount ? (highlightCount > 1 && cardWidth < 280 ? 54 : 28) : 0;
  const cardHeight = (compact ? (shortMap ? 164 : 178) : 190) + (entries.some(e => e.p?.personalised) ? 20 : 0) + (entries.some(e => e.p?.familyFor) ? 20 : 0) + highlightHeight;
  const bottom = compact ? (hasCompare && !shortMap ? 112 : 48) : (hasCompare ? 116 : 96);
  const options = { width: compact ? width : Math.max(cardWidth + 24 + Math.max(12, leftInset), width - rightInset), height, top: topInset, bottom, cardWidth, cardHeight, pins, left: Math.max(12, leftInset) };
  // Phones keep one row of cards even after the search toolbar folds away.
  // Filling the newly freed map with three stacked cards would hide the pins.
  // Native scrolling keeps every recommendation and its full-size actions reachable.
  const narrowRail = compact;
  const selected = entries.length === 1 && entries[0].selected ? entries[0] : null;
  const selectedId = selected?.id;
  // Preserve the already visible recommendation's position when selecting it.
  // A new marker gets one placement decision, then follows its geographic point.
  const selectedOrigin = useMemo(() => {
    if (!selected) return null;
    return retained.current.find(p => p.point.id === selectedId && p.width === cardWidth && p.height === cardHeight)
      ?? placeMapCards([selected], options)[0];
  }, [selectedId, options.width, height, topInset, options.bottom, cardWidth, cardHeight]);
  const floating = selectedOrigin && selected
    ? [followMapCard(selectedOrigin, selected, options)] : placeMapCards(entries, options);
  const overlaps = floating.some((a, i) => floating.slice(i + 1).some(b => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height));
  const rail = narrowRail || overlaps;
  const positioned = rail ? [] : floating;
  // Exiting cards retain their actual last rectangles, not a fresh layout of
  // the shrinking group. They fade where the user last saw them.
  useLayoutEffect(() => {
    // No fade-out at old positions while the map is moving by itself.
    setLeaving(reduced || rail || quiet ? [] : retained.current.filter(old => !entries.some(e => e.id === old.point.id)));
  }, [key, reduced, rail, quiet]);
  useLayoutEffect(() => { retained.current = positioned; });
  return <div className="map-card-layer" aria-label="Centres on the map">
    {/* Anchor the scrolling rail to the viewport bottom. The toolbar's measured
        height can lag behind its collapse; it must never push actions offscreen. */}
    {rail && entries.length > 0 && <div className={`map-card-rail${compact ? " narrow-rail" : ""}`} aria-label="Recommended centres, scroll for more" style={{ bottom: Math.max(0, bottom - 8), height: cardHeight + 8, ...(!compact && leftInset ? { left: Math.max(0, leftInset - 12) } : {}) }}>
      {entries.map(point => <article key={point.id} className={`map-centre-card rail-card${point.selected ? " selected" : ""}`} data-provider-id={point.id} data-anchor-x={point.x} data-anchor-y={point.y} aria-label={point.p.name} style={{ width: cardWidth, height: cardHeight }}>
        <Card {...point} saved={savedIds.includes(point.id)} compared={compareIds.includes(point.id)} onOpen={onOpen} onClose={onClose} onSave={onSave} onCompare={onCompare} />
      </article>)}
    </div>}
    <svg className="map-card-lines" width={width} height={height} aria-hidden="true">
      {positioned.map(({ point, anchor }) => {
        const length = Math.hypot(anchor.x - point.x, anchor.y - point.y) || 1;
        const x = point.x + (anchor.x - point.x) * Math.min(23 / length, 1);
        const y = point.y + (anchor.y - point.y) * Math.min(23 / length, 1);
        return <path key={point.id} d={`M ${x} ${y} L ${anchor.x} ${anchor.y}`} />;
      })}
    </svg>
    {[...positioned.map(p => ({ ...p, exiting: false })), ...leaving.map(p => ({ ...p, exiting: true }))].map(({ x, y, width: itemWidth, height: itemHeight, point, exiting }) => <article
      key={`${point.id}-${exiting ? "out" : "in"}`}
      className={`map-centre-card${point.selected ? " selected" : ""}${exiting ? " leaving" : ""}`}
      data-provider-id={point.id}
      data-anchor-x={point.x}
      data-anchor-y={point.y}
      aria-label={point.p.name}
      aria-hidden={exiting || undefined}
      inert={exiting || undefined}
      style={{ left: x, top: y, width: itemWidth, height: itemHeight }}>
      <Card {...point} saved={savedIds.includes(point.id)} compared={compareIds.includes(point.id)} onOpen={onOpen} onClose={onClose} onSave={onSave} onCompare={onCompare} />
    </article>)}
  </div>;
}
