import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { LocateFixed, Plus, Minus, RotateCcw, MapPin } from "lucide-react";
import { DEFAULT_MAP } from "../shared/map-memory.mjs";
import { makeStyle } from "./map-style.js";
import { entranceCamera } from "./entrance.js";
import MapCards from "./MapCards.jsx";
export default function MapCanvas({
  items = [],
  pickup,
  selected,
  onSelect,
  onOpen,
  onSave,
  onCompare,
  savedIds,
  compareIds,
  onClosePreview,
  showSuggestions = false,
  cardsVisible = true,
  hasCompare = false,
  topInset = 148,
  onShowList,
  onPick,
  choosing,
  theme,
  reduced,
  labels,
  visible,
  onStatus,
  viewTarget = DEFAULT_MAP,
  autoFit = true,
  onViewChange,
  onCancel,
  introPhase = "ready",
  introArea = 0,
  introReduced = false,
}) {
  const host = useRef(null),
    map = useRef(null),
    userMove = useRef(false),
    lastView = useRef(viewTarget),
    selectionStart = useRef(null),
    markers = useRef([]),
    latest = useRef({
      items,
      pickup,
      onPick,
      choosing,
      onSelect,
      introPhase,
      introArea,
      cameraReduced: reduced || introReduced,
    }),
    [dismissedCards, setDismissedCards] = useState([]),
    [retry, setRetry] = useState(0),
    [status, setStatus] = useState("loading"),
    [camera, setCamera] = useState({ pitch: 0, bearing: 0, zoom: viewTarget.zoom, ...viewTarget.center });
  latest.current = {
    items,
    pickup,
    onPick,
    choosing,
    onSelect,
    selected,
    onClosePreview,
    introPhase,
    introArea,
    autoFit,
    onViewChange,
    viewTarget,
    topInset,
    cameraReduced: reduced || introReduced,
  };
  // Exact shared addresses need separate hit targets. Offsets depend only on
  // stable centre IDs, so zooming/selecting cannot make pins switch places.
  const pinOffsets = useMemo(() => {
    const groups = new Map(), offsets = new Map();
    for (const p of items.filter(p => p.location)) {
      const key = `${p.location.lat},${p.location.lng}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(p);
    }
    for (const group of groups.values()) {
      group.sort((a, b) => a.id.localeCompare(b.id));
      group.forEach((p, i) => {
        const ring = Math.floor(i / 6), count = Math.min(6, group.length - ring * 6);
        const angle = -Math.PI / 2 + (i % 6) * 2 * Math.PI / count;
        offsets.set(p.id, group.length === 1 ? [0, 0] : [Math.cos(angle) * 60 * (ring + 1), Math.sin(angle) * 60 * (ring + 1)]);
      });
    }
    return offsets;
  }, [items]);
  useEffect(() => { setDismissedCards([]); }, [items, showSuggestions]);
  const fit = ({ immediate = false } = {}) => {
    setDismissedCards([]);
    const m = map.current;
    if (!m) return;
    if (latest.current.introPhase === "welcome") return;
    const coords = [
      ...latest.current.items
        .filter((p) => p.location)
        .map((p) => [p.location.lng, p.location.lat]),
      ...(latest.current.pickup
        ? [[latest.current.pickup.lng, latest.current.pickup.lat]]
        : []),
    ];
    if (!coords.length) {
      m.easeTo({
        center: [lastView.current.center.lng, lastView.current.center.lat],
        zoom: lastView.current.zoom,
        pitch: 0,
        bearing: 0,
        duration: immediate || latest.current.cameraReduced ? 0 : 600,
      });
      return;
    }
    const bounds = new maplibregl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    const compact = m.getContainer().clientWidth < 550;
    const height = m.getContainer().clientHeight;
    m.fitBounds(bounds, {
      padding: {
        top: Math.min(latest.current.topInset + 50, height * 0.55),
        bottom: Math.min(compact ? 110 : 100, height * 0.2),
        left: compact ? 48 : 150,
        right: compact ? 48 : 150,
      },
      maxZoom: 14.4,
      duration: immediate || latest.current.cameraReduced ? 0 : 650,
      pitch: 0,
      bearing: 0,
    });
  };
  useEffect(() => {
    let alive = true;
    setStatus("loading");
    let m;
    try {
      m = new maplibregl.Map({
        container: host.current,
        style: makeStyle(theme, labels),
      center: entranceCamera(introPhase, introArea)?.center ?? [viewTarget.center.lng, viewTarget.center.lat],
      zoom: entranceCamera(introPhase, introArea)?.zoom ?? viewTarget.zoom,
      maxZoom: 18,
      minZoom: 7,
      maxBounds: [[100.7, 2.55], [102.05, 3.95]],
        pitch: 0,
        bearing: 0,
        maxPitch: 0,
        dragRotate: false,
        touchPitch: false,
        attributionControl: false,
      });
      m.touchZoomRotate.disableRotation();
      m.keyboard.disableRotation?.();
      map.current = m;
    } catch {
      setStatus("error");
      return;
    }
    const timeout = setTimeout(() => {
      if (alive) setStatus((s) => (s === "ready" ? s : "error"));
    }, 22000);
    m.on("move", () => {
      if (alive)
        setCamera({
          pitch: m.getPitch(),
          bearing: m.getBearing(),
          zoom: m.getZoom(),
          lat: m.getCenter().lat,
          lng: m.getCenter().lng,
        });
    });
    m.on("movestart", (e) => { if (e.originalEvent) userMove.current = true; });
    m.on("moveend", () => {
      if (latest.current.introPhase !== "ready" || latest.current.choosing) { userMove.current = false; return; }
      const center = m.getCenter();
      lastView.current = { center: { lat: center.lat, lng: center.lng }, zoom: m.getZoom() };
      if (userMove.current) latest.current.onViewChange?.(lastView.current);
      userMove.current = false;
    });
    m.on("load", () => {
      const shot = entranceCamera(
        latest.current.introPhase,
        latest.current.introArea,
      );
      if (shot) m.jumpTo(shot);
      else if (latest.current.autoFit) fit({ immediate: true });
    });
    m.on("idle", () => {
      if (
        alive &&
        m.queryRenderedFeatures().some((f) => f.source === "openmaptiles")
      ) {
        setStatus("ready");
        clearTimeout(timeout);
      }
    });
    m.on("click", (e) => {
      // Only a click on the map itself dismisses a selected centre. MapLibre
      // distinguishes a click from dragging; overlay controls and pins stay active.
      if (e.originalEvent?.target !== m.getCanvas()) return;
      if (latest.current.choosing)
        m.easeTo({ center: e.lngLat, duration: latest.current.cameraReduced ? 0 : 200 });
      else if (latest.current.introPhase === "ready" && latest.current.selected)
        latest.current.onClosePreview?.();
    });
    const ro = new ResizeObserver(() => { m.resize(); setCamera(c => ({ ...c })); });
    ro.observe(host.current);
    return () => {
      alive = false;
      clearTimeout(timeout);
      ro.disconnect();
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      m.remove();
      map.current = null;
    };
  }, [retry]);
  useEffect(() => {
    onStatus?.(status);
  }, [status]);
  useEffect(() => {
    if (map.current) map.current.setStyle(makeStyle(theme, labels));
  }, [theme, labels]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    markers.current.forEach((x) => x.remove());
    markers.current = [];
    items
      .filter((p) => p.location)
      .forEach((p, i) => {
        const el = document.createElement("button");
        const conflict = (p.fit?.counts?.conflict ?? 0) > 0;
        el.className = "provider-pin" + (conflict ? " conflict" : "") + (p.suggested ? " suggested" : "") + (p.id === selected ? " selected" : "");
        el.textContent = String(
          items.findIndex((x) => x.id === p.id) + 1,
        ).padStart(2, "0");
        el.title = p.name + (conflict ? " · Some details don’t match" : p.suggested ? " · Suggested first" : "");
        if (conflict) el.setAttribute("aria-description", "Some details don’t match this request. Select to check.");
        if (p.suggested) {
          const badge = document.createElement("span");
          badge.className = "pin-star"; badge.textContent = "★"; badge.setAttribute("aria-hidden", "true"); el.appendChild(badge);
          el.setAttribute("aria-description", "Suggested first: no known conflicts, stronger condition matches on this page.");
        }
        el.setAttribute("aria-label", "Select " + p.name + " on map");
        el.setAttribute("aria-pressed", String(p.id === selected));
        el.dataset.providerId = p.id;
        el.onclick = (e) => {
          e.stopPropagation();
          latest.current.onSelect(p.id, true);
        };
        const marker = new maplibregl.Marker({ element: el, offset: pinOffsets.get(p.id) })
            .setLngLat([p.location.lng, p.location.lat])
            .addTo(m);
        markers.current.push(marker);
      });
    if (pickup && !choosing) {
      const el = document.createElement("div");
      el.className = "pickup-pin";
      el.textContent = "You";
      el.title = "Your chosen location: " + pickup.label;
      el.setAttribute("aria-label", "Your chosen location: " + pickup.label);
      markers.current.push(
        new maplibregl.Marker({
          element: el,
          anchor: "bottom",
          offset: [0, -10],
        })
          .setLngLat([pickup.lng, pickup.lat])
          .addTo(m),
      );
    }
  }, [items, pickup, selected, retry, choosing]);
  useEffect(() => {
    if (autoFit && !choosing) fit();
  }, [items, pickup, retry, autoFit]);
  useEffect(() => {
    lastView.current = viewTarget;
    if (map.current && introPhase === "ready") map.current.easeTo({ center: [viewTarget.center.lng, viewTarget.center.lat], zoom: viewTarget.zoom, padding: 0, duration: reduced ? 0 : 450 });
  }, [viewTarget]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    if (choosing) {
      selectionStart.current = { view: lastView.current, target: viewTarget };
      m.stop();
      m.jumpTo({ center: m.getCenter(), padding: 0 });
    } else if (selectionStart.current) {
      const start = selectionStart.current;
      if (start.target === viewTarget) m.jumpTo({ center: [start.view.center.lng, start.view.center.lat], zoom: start.view.zoom, padding: 0 });
      selectionStart.current = null;
    }
  }, [choosing]);
  useEffect(() => {
    if (visible) requestAnimationFrame(() => {
      map.current?.resize();
      if (latest.current.autoFit) fit({ immediate: true });
    });
  }, [visible]);
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const frame = requestAnimationFrame(() => {
      m.resize();
      const shot = entranceCamera(introPhase, introArea);
      if (shot)
        m.easeTo({
          ...shot,
          duration: reduced || introReduced ? 0 : shot.duration,
          easing: (t) => t * t * (3 - 2 * t),
        });
      else if (latest.current.autoFit) fit({ immediate: true });
      else m.jumpTo({ center: [lastView.current.center.lng, lastView.current.center.lat], zoom: lastView.current.zoom, padding: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [introPhase, introArea, retry, reduced, introReduced]);
  useEffect(() => {
    const p = items.find(p => p.id === selected);
    if (!p?.location || !map.current || choosing) return;
    map.current.easeTo({ center: [p.location.lng, p.location.lat], padding: { top: 130, bottom: 40, left: 0, right: 0 }, duration: reduced ? 0 : 420 });
  }, [selected]);
  const m = map.current;
  const width = host.current?.clientWidth ?? 0, height = host.current?.clientHeight ?? 0;
  const picked = items.find(p => p.id === selected);
  const cardItems = picked ? [picked] : showSuggestions ? items.filter(p => p.suggested).slice(0, 3).filter(p => !dismissedCards.includes(p.id)) : [];
  const entries = m && width && cardsVisible && !choosing ? cardItems.filter(p => p.location).map(p => {
    const point = m.project([p.location.lng, p.location.lat]);
    const [dx, dy] = pinOffsets.get(p.id) ?? [0, 0];
    return { x: point.x + dx, y: point.y + dy, id: p.id, p, selected: p.id === selected, index: items.findIndex(item => item.id === p.id) + 1 };
  }).filter(p => p.x >= 0 && p.x <= width && p.y >= 0 && p.y <= height) : [];
  return (
    <section
      className={`map-region ${choosing ? "choosing" : ""}${entries.length ? " has-point-cards" : ""}`}
      aria-label="Flat childcare map"
      data-map-status={status}
      data-map-pitch={camera.pitch}
      data-map-bearing={camera.bearing}
      data-map-zoom={camera.zoom}
      data-map-lat={camera.lat}
      data-map-lng={camera.lng}
    >
      <div ref={host} className="map-canvas" />
      <div className="map-controls">
        {choosing ? <p className="map-pick-hint">Drag the map to move the pin.</p> : <>
          <div className="map-legend" aria-label="Map legend">
            <span>{items.filter(p => p.location).length} centres</span>
            {pickup && <span><b className="map-legend-pickup">You</b> Your location</span>}
            {items.some(p => p.suggested) && <span className="map-suggestion-legend"><b>★</b> Suggested first</span>}
          </div>
        </>}
      </div>
      {choosing ? <>
        <div className="map-center-pin" aria-hidden="true"><MapPin size={40} fill="currentColor" /></div>
        <div className="map-pick-confirm">
          <strong><MapPin size={20} aria-hidden="true" />Choose your location</strong>
          <p>Move the map to place the pin.</p>
          <details><summary>Map coordinates</summary><small>{camera.lat?.toFixed(5)}, {camera.lng?.toFixed(5)}</small></details>
          <div><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={() => {
            const c = map.current?.getCenter();
            if (c) onPick({ id: null, label: "Selected location", lat: c.lat, lng: c.lng });
          }}>Use this location</button></div>
        </div>
      </> : null}
      <MapCards entries={entries} pins={m ? items.filter(p => p.location).map(p => { const point = m.project([p.location.lng, p.location.lat]); const [dx, dy] = pinOffsets.get(p.id) ?? [0, 0]; return { x: point.x + dx, y: point.y + dy }; }) : []} width={width} height={height} compact={width < 600} topInset={topInset} hasCompare={hasCompare} reduced={reduced || introReduced} onOpen={onOpen} onSave={onSave} onCompare={onCompare} savedIds={savedIds} compareIds={compareIds} onClose={id => selected ? onClosePreview() : setDismissedCards(ids => [...ids, id])} />
      <div className="map-tools">
        <button onClick={fit} aria-label="Fit pickup and results">
          <LocateFixed size={19} />
        </button>
        <button onClick={() => { userMove.current = true; map.current?.zoomIn(); }} aria-label="Zoom in">
          <Plus size={20} />
        </button>
        <button onClick={() => { userMove.current = true; map.current?.zoomOut(); }} aria-label="Zoom out">
          <Minus size={20} />
        </button>
      </div>
      <div className="map-bottom">
        <span className="map-state">
          <i className={status} />
          {status === "ready"
            ? "Map"
            : status === "error"
              ? "Map unavailable"
              : "Loading map…"}
        </span>
        <span>
          <a href="https://openfreemap.org/" target="_blank" rel="noreferrer">
            OpenFreeMap
          </a>{" "}
          ·{" "}
          <a href="https://openmaptiles.org/" target="_blank" rel="noreferrer">
            OpenMapTiles
          </a>{" "}
          ·{" "}
          <a
            href="https://www.openstreetmap.org/copyright"
            target="_blank"
            rel="noreferrer"
          >
            © OpenStreetMap
          </a>
        </span>
      </div>
      {status === "error" && (
        <div className="map-error" role="status">
          <h3>The map couldn’t load</h3>
          <p>
            You can still browse centres in the results list.
          </p>
          <button className="secondary" onClick={() => setRetry((x) => x + 1)}>
            <RotateCcw size={15} />
            Retry map
          </button>
          <button className="primary" onClick={onShowList}>Show centres</button>
        </div>
      )}
    </section>
  );
}
