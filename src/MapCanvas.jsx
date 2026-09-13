import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { LocateFixed, Plus, Minus, RotateCcw, MapPin } from "lucide-react";
import { DEFAULT_MAP } from "../shared/map-memory.mjs";
import { makeStyle } from "./map-style.js";
import { entranceCamera } from "./entrance.js";
import { areaMoved, MIN_SEARCH_ZOOM } from "../shared/map-search.mjs";
export default function MapCanvas({
  items = [],
  pickup,
  selected,
  onSelect,
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
  onChoose,
  onCancel,
  browseEnabled = false,
  browseCenter,
  browseBusy = false,
  onSearchArea,
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
    suggestedMarkers = useRef([]),
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
    [retry, setRetry] = useState(0),
    [status, setStatus] = useState("loading"),
    [camera, setCamera] = useState({ pitch: 0, bearing: 0, zoom: viewTarget.zoom, ...viewTarget.center });
  latest.current = {
    items,
    pickup,
    onPick,
    choosing,
    onSelect,
    introPhase,
    introArea,
    autoFit,
    onViewChange,
    viewTarget,
    cameraReduced: reduced || introReduced,
  };
  const spreadSuggestions = (m) => {
    const entries = suggestedMarkers.current.map(x => ({ ...x, point: m.project([x.location.lng, x.location.lat]) }));
    const seen = new Set();
    for (const first of entries) {
      if (seen.has(first)) continue;
      const group = [first]; seen.add(first);
      for (let i = 0; i < group.length; i++) for (const other of entries) {
        if (!seen.has(other) && Math.hypot(group[i].point.x-other.point.x, group[i].point.y-other.point.y) < 120) { seen.add(other); group.push(other); }
      }
      const center = { x: group.reduce((n,x)=>n+x.point.x,0)/group.length, y: group.reduce((n,x)=>n+x.point.y,0)/group.length };
      group.forEach((x,i) => {
        const angle = group.length === 2 ? i*Math.PI : -Math.PI/6+i*2*Math.PI/group.length;
        const offset = group.length === 1 ? [0,0] : [center.x+Math.cos(angle)*45-x.point.x, center.y+Math.sin(angle)*45-x.point.y];
        x.marker.setOffset(offset);
        const el=x.marker.getElement(); el.classList.toggle("spread-pin",group.length>1);
        el.style.setProperty("--stem-length",`${Math.hypot(...offset)}px`);
        el.style.setProperty("--stem-angle",`${Math.atan2(-offset[1],-offset[0])}rad`);
      });
    }
  };
  const fit = ({ immediate = false } = {}) => {
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
        top: Math.min(compact ? 175 : 140, height * 0.26),
        bottom: Math.min(compact ? 310 : 220, height * 0.4),
        left: 55,
        right: 65,
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
      spreadSuggestions(m);
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
      if (
        latest.current.choosing &&
        !e.originalEvent.target.closest?.(".provider-pin")
      )
        m.easeTo({ center: e.lngLat, duration: latest.current.cameraReduced ? 0 : 200 });
    });
    const ro = new ResizeObserver(() => m.resize());
    ro.observe(host.current);
    return () => {
      alive = false;
      clearTimeout(timeout);
      ro.disconnect();
      markers.current.forEach((x) => x.remove());
      markers.current = [];
      suggestedMarkers.current = [];
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
    suggestedMarkers.current = [];
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
        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([p.location.lng, p.location.lat])
            .addTo(m);
        markers.current.push(marker);
        if (p.suggested) suggestedMarkers.current.push({ marker, location: p.location });
      });
    spreadSuggestions(m);
    if (pickup && !choosing) {
      const el = document.createElement("div");
      el.className = "pickup-pin";
      el.textContent = "P";
      el.title = "Pickup: " + pickup.label;
      el.setAttribute("aria-label", "Pickup: " + pickup.label);
      markers.current.push(
        new maplibregl.Marker({
          element: el,
          anchor: "bottom",
          offset: [0, -19],
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
  return (
    <section
      className={`map-region ${choosing ? "choosing" : ""}`}
      aria-label="Flat childcare map"
      data-map-status={status}
      data-map-pitch={camera.pitch}
      data-map-bearing={camera.bearing}
      data-map-zoom={camera.zoom}
      data-map-lat={camera.lat}
      data-map-lng={camera.lng}
    >
      <div ref={host} className="map-canvas" />
      <div className="map-heading">
        <span className="eyebrow">CHILDCARE NEAR YOU</span>
        <h2>
          KUALA LUMPUR <span>+ SELANGOR</span>
        </h2>
        <p>
          {choosing
            ? "Drag the map to place the pin, then confirm."
            : items.length
              ? `${items.filter((p) => p.location).length} centres shown${pickup ? " · P marks your pickup place" : " · drag the map to explore"}`
              : "Find your pickup place and nearby centres here."}
        </p>
        {items.some(p => p.suggested) && <span className="map-suggestion-legend"><b>★</b> Suggested first · {items.filter(p=>p.suggested).length} on this page</span>}
      </div>
      {choosing ? <>
        <div className="map-center-pin" aria-hidden="true"><MapPin size={40} fill="currentColor" /></div>
        <div className="map-pick-confirm">
          <strong>Pickup location</strong>
          <small>{camera.lat?.toFixed(5)}, {camera.lng?.toFixed(5)}</small>
          <div><button className="secondary" onClick={onCancel}>Cancel</button><button className="primary" onClick={() => {
            const c = map.current?.getCenter();
            if (c) onPick({ id: null, label: "Selected location", lat: c.lat, lng: c.lng });
          }}>Use this location</button></div>
        </div>
      </> : <button className="map-choose secondary" onClick={onChoose}><MapPin size={15} />Choose pickup here</button>}
      {browseEnabled && !choosing && <div className="map-area-search">
        {camera.zoom < MIN_SEARCH_ZOOM ? <span>Zoom in to search this area</span> :
          <button className="secondary" disabled={browseBusy || (browseCenter && !areaMoved(camera, browseCenter))} onClick={() => {
            const m = map.current;
            if (!m || m.getZoom() < MIN_SEARCH_ZOOM || browseBusy) return;
            const c = m.getCenter();
            if (!browseCenter || areaMoved(c, browseCenter)) onSearchArea?.({ lat: c.lat, lng: c.lng });
          }}>{browseBusy ? "Finding centres…" : "Search this area"}</button>}
      </div>}
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
            ? "MAP READY"
            : status === "error"
              ? "MAP UNAVAILABLE"
              : "LOADING MAP"}{" "}
          · 2D
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
        </div>
      )}
    </section>
  );
}
