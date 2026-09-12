import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { LocateFixed, Plus, Minus, RotateCcw } from "lucide-react";
import { makeStyle } from "./map-style.js";
import { entranceCamera } from "./entrance.js";
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
  introPhase = "ready",
  introArea = 0,
  introReduced = false,
}) {
  const host = useRef(null),
    map = useRef(null),
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
    [retry, setRetry] = useState(0),
    [status, setStatus] = useState("loading"),
    [camera, setCamera] = useState({ pitch: 0, bearing: 0, zoom: 10.8 });
  latest.current = {
    items,
    pickup,
    onPick,
    choosing,
    onSelect,
    introPhase,
    introArea,
    cameraReduced: reduced || introReduced,
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
        center: [101.64, 3.13],
        zoom: 10.8,
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
        center: entranceCamera(introPhase, introArea)?.center ?? [101.64, 3.13],
        zoom: entranceCamera(introPhase, introArea)?.zoom ?? 10.8,
        maxZoom: 18,
        minZoom: 7,
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
        });
    });
    m.on("load", () => {
      const shot = entranceCamera(
        latest.current.introPhase,
        latest.current.introArea,
      );
      if (shot) m.jumpTo(shot);
      else fit({ immediate: true });
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
        latest.current.onPick({
          id: null,
          label: "Selected public map point",
          lat: e.lngLat.lat,
          lng: e.lngLat.lng,
        });
    });
    const ro = new ResizeObserver(() => m.resize());
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
        el.className = "provider-pin" + (p.id === selected ? " selected" : "");
        el.textContent = String(
          items.findIndex((x) => x.id === p.id) + 1,
        ).padStart(2, "0");
        el.title = p.name;
        el.setAttribute("aria-label", "Select " + p.name + " on map");
        el.setAttribute("aria-pressed", String(p.id === selected));
        el.dataset.providerId = p.id;
        el.onclick = (e) => {
          e.stopPropagation();
          latest.current.onSelect(p.id, true);
        };
        markers.current.push(
          new maplibregl.Marker({ element: el })
            .setLngLat([p.location.lng, p.location.lat])
            .addTo(m),
        );
      });
    if (pickup) {
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
  }, [items, pickup, selected, retry]);
  useEffect(() => {
    fit();
  }, [items, pickup, retry]);
  useEffect(() => {
    if (visible) requestAnimationFrame(() => map.current?.resize());
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
      else fit({ immediate: true });
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
    >
      <div ref={host} className="map-canvas" />
      <div className="map-heading">
        <span className="eyebrow">ONE OCCASION. A FEW POSSIBILITIES.</span>
        <h2>
          KUALA LUMPUR <span>+ SELANGOR</span>
        </h2>
        <p>
          {choosing
            ? "Click a public pickup place on the map."
            : items.length
              ? `${items.filter((p) => p.location).length} mapped on this page · P marks the pickup place`
              : "Your pickup place and care options, together."}
        </p>
      </div>
      <div className="map-tools">
        <button onClick={fit} aria-label="Fit pickup and results">
          <LocateFixed size={19} />
        </button>
        <button onClick={() => map.current?.zoomIn()} aria-label="Zoom in">
          <Plus size={20} />
        </button>
        <button onClick={() => map.current?.zoomOut()} aria-label="Zoom out">
          <Minus size={20} />
        </button>
      </div>
      <div className="map-bottom">
        <span className="map-state">
          <i className={status} />
          {status === "ready"
            ? "MAP CONNECTED"
            : status === "error"
              ? "MAP UNAVAILABLE"
              : "CONNECTING MAP"}{" "}
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
          <h3>The list is still available.</h3>
          <p>
            The map could not connect. Browse the same institutions from the
            list.
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
