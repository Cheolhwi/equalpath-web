import { useEffect, useRef, useState } from "react";
import {
  MapPin,
  Search,
  Check,
  X,
  LocateFixed,
  ArrowUpRight,
} from "lucide-react";
import { requestAPI } from "./api.js";
import { currentLocation } from "./geolocation.js";
export default function PlaceInput({
  mode,
  value,
  onChange,
  onMap,
  error,
  active = true,
  idPrefix = "pickup",
}) {
  const [query, setQuery] = useState(value?.label ?? ""),
    [options, setOptions] = useState([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [open, setOpen] = useState(false),
    [geoBusy, setGeoBusy] = useState(false),
    [geoMessage, setGeoMessage] = useState(""),
    [geoFailed, setGeoFailed] = useState(false),
    geoController = useRef(null),
    token = useRef(0);
  useEffect(() => {
    if (value?.label) setQuery(value.label);
  }, [value?.label]);
  useEffect(
    () => () => {
      token.current++;
      geoController.current?.abort();
    },
    [],
  );
  const stopLocating = () => {
    geoController.current?.abort();
    geoController.current = null;
    setGeoBusy(false);
    setGeoFailed(false);
    setGeoMessage("");
  };
  useEffect(() => {
    if (!active) {
      token.current++;
      stopLocating();
      setBusy(false);
      setOpen(false);
    }
  }, [active]);
  const locate = async () => {
    stopLocating();
    const seq = ++token.current;
    const controller = new AbortController();
    geoController.current = controller;
    setBusy(false);
    setGeoBusy(true);
    setGeoMessage("");
    setOpen(false);
    try {
      const p = await currentLocation(undefined, {
        signal: controller.signal,
        onProgress: (text) => {
          if (seq === token.current) setGeoMessage(text);
        },
      });
      if (seq === token.current) {
        onChange(p);
        setQuery(p.label);
        setGeoMessage(
          `Location found${p.accuracy ? " · approximately " + p.accuracy + " m accuracy" : ""}. Use this only if it is the intended pickup place. KL / Selangor is checked on search.`,
        );
      }
    } catch (e) {
      if (seq === token.current && e.name !== "AbortError") {
        setGeoFailed(true);
        setGeoMessage(e.message);
      }
    } finally {
      if (seq === token.current) {
        geoController.current = null;
        setGeoBusy(false);
      }
    }
  };
  const find = async (q) => {
    stopLocating();
    const seq = ++token.current;
    if (q.trim().length < 2) {
      setBusy(false); setMessage("Enter at least two characters."); setOptions([]); setOpen(true); return;
    }
    setBusy(true);
    setOptions([]);
    setMessage("");
    setOpen(true);
    try {
      const r = await requestAPI({ action: "places", mode, query: q });
      if (seq === token.current) {
        setOptions(r.items);
        if (!r.items.length)
          setMessage(
            "No places found in KL or Selangor. Try a shorter name or choose on the map.",
          );
      }
    } catch {
      if (seq === token.current)
        setMessage(
          "Place search is unavailable. Retry, or select a public pickup point on the map.",
        );
    } finally {
      if (seq === token.current) setBusy(false);
    }
  };
  useEffect(() => {
    token.current++;
    stopLocating();
    setBusy(false);
    setGeoMessage("");
    setQuery(value?.label ?? "");
    setOptions([]);
    setOpen(false);
  }, [mode]);
  return (
    <div className="field pickup-field">
      <label htmlFor={idPrefix + "-search"}>
        Pickup place <span>Required</span>
      </label>
      <div className={`location-search ${error ? "invalid" : ""}`}>
        <MapPin size={17} />
        <input
          id={idPrefix + "-search"}
          aria-invalid={!!error}
          aria-describedby={error ? idPrefix + "-error" : idPrefix + "-help"}
          placeholder="Search an address, station or place"
          value={query}
          onChange={(e) => {
            stopLocating();
            setQuery(e.target.value);
            onChange(null);
            setOptions([]);
            setOpen(false);
            token.current++;
            setBusy(false);
            setGeoMessage("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              find(query);
            }
            if (e.key === "Escape") setOpen(false);
          }}
        />
        <button
          type="button"
          aria-label="Find pickup place"
          onClick={() => find(query)}
          disabled={busy}
        >
          {busy ? <span className="spinner" /> : <Search size={17} />}
        </button>
      </div>
      {error && (
        <small className="field-error" id={idPrefix + "-error"}>
          {error}
        </small>
      )}
      {value && (
        <div className="chosen-place">
          <Check size={13} />
          <span>
            {value.label}
            <small>{value.region ?? "Region checked when you search"}</small>
          </span>
        </div>
      )}
      <div className="geolocation-control">
        <button type="button" onClick={locate} disabled={geoBusy}>
          <LocateFixed size={14} />
          {geoBusy
            ? "Locating…"
            : geoFailed
              ? "Retry my location"
              : "Use my location"}
        </button>
        {geoBusy ? (
          <button
            type="button"
            onClick={() => {
              token.current++;
              stopLocating();
              setGeoMessage(
                "Location cancelled. Search a place or choose on the map.",
              );
            }}
          >
            Cancel location
          </button>
        ) : (
          <span>With your permission</span>
        )}
      </div>
      {geoMessage && (
        <p className="location-feedback" role="status">
          {geoMessage}
        </p>
      )}
      <div className="location-help" id={idPrefix + "-help"}>
        <span>Choose a public place in KL or Selangor</span>
        <button
          disabled={!onMap}
          type="button"
          onClick={() => {
            token.current++;
            stopLocating();
            setBusy(false);
            onMap?.();
          }}
        >
          {onMap ? "Choose on map" : "Choose a place above"}{" "}
          <ArrowUpRight size={12} />
        </button>
      </div>
      {open && (
        <div className="place-results" aria-label="Pickup search results">
          {busy && <p role="status">Finding places…</p>}
          {!busy &&
            options.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  token.current++;
                  stopLocating();
                  onChange(p);
                  setQuery(p.label);
                  setOpen(false);
                }}
              >
                <strong>{p.label}</strong>
                <span>{p.address ?? p.region}</span>
                <ArrowUpRight size={14} />
              </button>
            ))}
          {message && <p role="status">{message}</p>}
          {mode === "live" && <p className="place-attribution">Partial names and small typos are OK. <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a> · <a href="https://photon.komoot.io/" target="_blank" rel="noreferrer">Photon</a></p>}
          {!busy && (
            <button
              type="button"
              className="close-options"
              onClick={() => setOpen(false)}
            >
              Close place results
            </button>
          )}
        </div>
      )}
    </div>
  );
}
