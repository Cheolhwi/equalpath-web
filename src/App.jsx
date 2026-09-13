import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  MapPin,
  LocateFixed,
  Search,
  SlidersHorizontal,
  Scale,
  List,
  Map as MapIcon,
  Check,
  X,
  RotateCcw,
  Sun,
  Moon,
  Info,
} from "lucide-react";
import MapCanvas from "./MapCanvas.jsx";
import Dialog from "./Dialog.jsx";
import {
  ProviderCard,
  Details,
  Comparison,
  Enquiry,
  Status,
} from "./ProviderViews.jsx";
import { requestAPI, errorMessage } from "./api.js";
import { requestErrors, todayKL, requestCaption } from "../shared/request.mjs";
import { currentLocation } from "./geolocation.js";
const EMPTY = [];
const initial = () => ({
  pickup: null,
  date: todayKL(),
  deadline: "",
  end: "",
  age: "",
  transport: "",
  radius: 5,
  query: "",
  includeUnknown: true,
  includeConflicts: true,
  sort: "distance",
});
const scenario = (r) =>
  r
    ? JSON.stringify([
        r.pickup?.label,
        r.pickup?.lat,
        r.pickup?.lng,
        r.date,
        r.deadline,
        r.end,
        r.age,
        r.transport,
      ])
    : "";
const fingerprint = (r) =>
  r
    ? scenario(r) +
      JSON.stringify([
        r.radius,
        r.query,
        r.includeUnknown,
        r.includeConflicts,
        r.sort,
      ])
    : "";
function PlaceInput({ mode, value, onChange, onMap, error, active = true }) {
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
    if (value) setQuery(value.label);
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
    setBusy(true);
    setMessage("");
    setOpen(true);
    try {
      const r = await requestAPI({ action: "places", mode, query: q });
      if (seq === token.current) {
        setOptions(r.items);
        if (!r.items.length)
          setMessage(
            "No matching public centre found. Try another name or select a public place on the map.",
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
      <label htmlFor="pickup-search">
        Public pickup place <span>Required</span>
      </label>
      <div className={`location-search ${error ? "invalid" : ""}`}>
        <MapPin size={17} />
        <input
          id="pickup-search"
          aria-invalid={!!error}
          aria-describedby={error ? "pickup-error" : "pickup-help"}
          placeholder="Your usual childcare centre"
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
        <small className="field-error" id="pickup-error">
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
          <span>Only after your permission</span>
        )}
      </div>
      {geoMessage && (
        <p className="location-feedback" role="status">
          {geoMessage}
        </p>
      )}
      <div className="location-help" id="pickup-help">
        <span>Institution names in KL / Selangor</span>
        <button
          type="button"
          onClick={() => {
            token.current++;
            stopLocating();
            setBusy(false);
            onMap();
          }}
        >
          Choose on map <ArrowUpRight size={12} />
        </button>
      </div>
      {open && (
        <div className="place-results" aria-label="Pickup search results">
          {busy && <p role="status">Finding public places…</p>}
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
export default function App({
  introPhase = "ready",
  introArea = 0,
  introReduced = false,
  onHome,
}) {
  const [mode, setMode] = useState(
      new URLSearchParams(location.search).get("mode") === "demo"
        ? "demo"
        : "live",
    ),
    [draft, setDraft] = useState(initial),
    [errors, setErrors] = useState({}),
    [results, setResults] = useState(null),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(null),
    [formOpen, setFormOpen] = useState(true),
    [selected, setSelected] = useState(null),
    [compareIds, setCompareIds] = useState([]),
    [comparison, setComparison] = useState(null),
    [compareSort, setCompareSort] = useState("distance"),
    [dialog, setDialog] = useState(null),
    [profile, setProfile] = useState(null),
    [enquiry, setEnquiry] = useState(null),
    [questionSelection, setQuestionSelection] = useState({}),
    [dialogBusy, setDialogBusy] = useState(false),
    [dialogError, setDialogError] = useState(null),
    [mobilePane, setMobilePane] = useState("list"),
    [choosing, setChoosing] = useState(false),
    [theme, setTheme] = useState("light"),
    [labels, setLabels] = useState(true),
    [reduced, setReduced] = useState(
      matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
    [health, setHealth] = useState(null),
    [toast, setToast] = useState(""),
    [mapStatus, setMapStatus] = useState("loading");
  const requestSeq = useRef(0),
    dialogSeq = useRef(0),
    listRef = useRef(null),
    submitRef = useRef(null),
    toastTimer = useRef(null);
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const notify = (text) => {
    setToast(text);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 4200);
  };
  useEffect(() => {
    let alive = true;
    setHealth(null);
    requestAPI({ action: "health", mode })
      .then((h) => alive && setHealth(h))
      .catch(() => alive && setHealth({ unavailable: true }));
    if (mode === "demo")
      setDraft({
        ...initial(),
        pickup: {
          id: "demo-pickup",
          label: "Demo usual centre · Kuala Lumpur",
          lat: 3.139,
          lng: 101.6869,
          region: "Kuala Lumpur",
        },
        deadline: "16:00",
        end: "18:00",
        age: "4",
        transport: "institution",
      });
    return () => {
      alive = false;
    };
  }, [mode]);
  useEffect(() => {
    const key = (e) => {
      if (
        introPhase === "ready" &&
        e.key === "/" &&
        !dialog &&
        !["INPUT", "TEXTAREA", "SELECT"].includes(e.target.tagName)
      ) {
        e.preventDefault();
        setFormOpen(true);
        setMobilePane("list");
        setTimeout(() => document.getElementById("pickup-search")?.focus(), 0);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [dialog, introPhase]);
  const setField = (field, value) => {
    setDraft((x) => ({ ...x, [field]: value }));
    setErrors((x) => ({ ...x, [field]: null }));
  };
  const dirty = results && fingerprint(draft) !== fingerprint(results.request),
    activeRequest = results?.request,
    items = results?.items ?? EMPTY,
    active = items.find((p) => p.id === selected);
  const switchMode = (next) => {
    requestSeq.current++;
    dialogSeq.current++;
    setMode(next);
    setDraft(initial());
    setResults(null);
    setErrors({});
    setFailure(null);
    setBusy(false);
    setFormOpen(true);
    setSelected(null);
    setCompareIds([]);
    setComparison(null);
    setDialog(null);
    setEnquiry(null);
    setQuestionSelection({});
    setChoosing(false);
    setMobilePane("list");
    const u = new URL(location.href);
    u.searchParams.set("mode", next);
    u.hash = "";
    history.replaceState(null, "", u.pathname + u.search);
  };
  const search = async (e, page = 0, override = null) => {
    e?.preventDefault?.();
    const request = override ?? draft,
      issues = requestErrors(request);
    setErrors(issues);
    if (Object.keys(issues).length) {
      setFormOpen(true);
      setTimeout(
        () => document.querySelector('[aria-invalid="true"]')?.focus(),
        0,
      );
      return;
    }
    const seq = ++requestSeq.current;
    setBusy(true);
    setFailure(null);
    setChoosing(false);
    try {
      const r = await requestAPI({ action: "search", mode, request, page });
      if (seq !== requestSeq.current) return;
      setResults(r);
      const editedWhilePending =
        fingerprint(draftRef.current) !== fingerprint(request);
      if (!editedWhilePending) setDraft(r.request);
      setSelected(r.items[0]?.id ?? null);
      setFormOpen(editedWhilePending);
      setHealth(r);
      setMobilePane("list");
      listRef.current?.scrollTo({ top: 0 });
    } catch (e) {
      if (seq !== requestSeq.current) return;
      setFailure(e);
      if (e.fields) {
        setErrors(e.fields);
        setFormOpen(true);
      }
    } finally {
      if (seq === requestSeq.current) setBusy(false);
    }
  };
  const select = (id, fromMap = false) => {
    setSelected(id);
    if (fromMap) {
      document.getElementById("card-" + id)?.scrollIntoView({
        block: "nearest",
        behavior: reduced ? "instant" : "smooth",
      });
    }
  };
  const toggleCompare = (id) => {
    if (compareIds.includes(id))
      setCompareIds((x) => x.filter((v) => v !== id));
    else if (compareIds.length < 3) setCompareIds((x) => [...x, id]);
    else notify("Compare up to three institutions. Remove one to add another.");
  };
  const openDetails = (p) => {
    setProfile({ p, request: activeRequest });
    setSelected(p.id);
    setDialogError(null);
    setDialog("details");
  };
  const loadComparison = async (ids = compareIds, sort = compareSort) => {
    setDialog("compare");
    setDialogError(null);
    if (ids.length < 2 || !activeRequest) return;
    const seq = ++dialogSeq.current;
    setDialogBusy(true);
    try {
      const r = await requestAPI({
        action: "compare",
        mode,
        ids,
        request: { ...activeRequest, sort },
        version: results.version,
      });
      if (seq === dialogSeq.current) setComparison(r);
    } catch (e) {
      if (seq === dialogSeq.current) setDialogError(e);
    } finally {
      if (seq === dialogSeq.current) setDialogBusy(false);
    }
  };
  const removeCompare = (id) => {
    const next = compareIds.filter((x) => x !== id);
    setCompareIds(next);
    if (next.length >= 2) loadComparison(next);
    else setComparison(null);
  };
  const prepare = (p, request = activeRequest) => {
    setEnquiry({ p, request });
    setDialogError(null);
    setDialog("enquiry");
  };
  const close = () => {
    dialogSeq.current++;
    setDialogBusy(false);
    setDialogError(null);
    setDialog(null);
  };
  const requestChanged =
    comparison && scenario(comparison.request) !== scenario(activeRequest);
  const retryDialog = () => loadComparison();
  return (
    <main
      className={`equalpath ${theme} mobile-${mobilePane}`}
      data-reduced={reduced}
      data-mode={mode}
      inert={introPhase !== "ready"}
      aria-hidden={introPhase !== "ready" || undefined}
    >
      <a className="skip-link" href="#request-form">
        Skip to your request
      </a>
      <header className="app-header">
        <button
          className="wordmark"
          aria-label="EqualPath home"
          onClick={() => {
            close();
            setMobilePane("list");
            onHome?.();
          }}
        >
          <strong>
            EQUALPATH<span>／</span>
          </strong>
          <small>CARE FOR THIS OCCASION</small>
        </button>
        <nav aria-label="Main navigation">
          <button
            className={!dialog ? "active" : ""}
            onClick={() => {
              close();
              setMobilePane("list");
            }}
          >
            <small>01</small>DISCOVER
          </button>
          <button
            className={dialog === "compare" ? "active" : ""}
            onClick={() => loadComparison()}
          >
            <small>02</small>COMPARE <em>{compareIds.length}</em>
          </button>
          <button
            className={dialog === "enquiry" ? "active" : ""}
            onClick={() => setDialog("enquiry")}
          >
            <small>03</small>ENQUIRY
          </button>
        </nav>
        <div className="header-end">
          <span className={`data-badge ${mode === "demo" ? "demo" : ""}`}>
            {mode === "demo" ? "CONTROLLED DEMO" : "KL + SELANGOR"}
          </span>
          <button
            aria-label="Display and data settings"
            onClick={() => setDialog("settings")}
          >
            <SlidersHorizontal size={19} />
          </button>
        </div>
      </header>
      <aside
        className="discovery-panel"
        aria-label="Find care for this request"
      >
        <div className="intro">
          <div className="eyebrow">
            FOR THE DAY THAT CHANGED <span>／ 01</span>
          </div>
          <h1>
            A little more time.
            <br />
            <span>A clearer next step.</span>
          </h1>
          <p>
            Find institutional care. Check the conditions.
            <br />
            Know what to ask before you call.
          </p>
        </div>
        {mode === "demo" && (
          <p className="demo-notice">
            Controlled examples — fictional providers, times and prices for
            trying daytime and evening care.{" "}
            <button onClick={() => switchMode("live")}>
              Use real directory
            </button>
          </p>
        )}
        <div className="request-heading">
          <strong>YOUR CURRENT OCCASION</strong>
          {results && (
            <button onClick={() => setFormOpen((v) => !v)}>
              {formOpen ? "Hide form" : "Edit request"}{" "}
              <SlidersHorizontal size={13} />
            </button>
          )}
        </div>
        {!formOpen && activeRequest && (
          <div className="compact-request">
            <p>
              <MapPin size={14} />
              {activeRequest.pickup.label}
            </p>
            <div>
              <strong>{activeRequest.date}</strong>
              <span>
                By {activeRequest.deadline} → until {activeRequest.end}
              </span>
            </div>
            <small>
              {activeRequest.age === ""
                ? "Age unspecified"
                : activeRequest.age === "0"
                  ? "Under 1 year"
                  : `Age ${activeRequest.age}`}{" "}
              ·{" "}
              {activeRequest.transport === "self"
                ? "Self-arranged delivery"
                : activeRequest.transport === "institution"
                  ? "Institutional pickup"
                  : "Transport unspecified"}
            </small>
          </div>
        )}
        <form
          id="request-form"
          onSubmit={search}
          noValidate
          className={formOpen ? "request-form" : "request-form collapsed"}
        >
          <PlaceInput
            active={introPhase === "ready"}
            mode={mode}
            value={draft.pickup}
            onChange={(p) => setField("pickup", p)}
            error={errors.pickup}
            onMap={() => {
              setChoosing(true);
              setMobilePane("map");
              notify("Select a public pickup place on the flat map.");
            }}
          />
          <div className="field">
            <label htmlFor="service-date">
              Service date <span>Malaysia time</span>
            </label>
            <input
              id="service-date"
              type="date"
              value={draft.date}
              onInput={(e) => setField("date", e.target.value)}
              aria-invalid={!!errors.date}
              aria-describedby={errors.date ? "date-error" : undefined}
            />
            {errors.date && (
              <small id="date-error" className="field-error">
                {errors.date}
              </small>
            )}
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="deadline">Collect by</label>
              <input
                id="deadline"
                type="time"
                value={draft.deadline}
                onInput={(e) => setField("deadline", e.target.value)}
                aria-invalid={!!errors.deadline}
              />
              {errors.deadline && (
                <small className="field-error">{errors.deadline}</small>
              )}
            </div>
            <div className="field">
              <label htmlFor="care-end">Care until</label>
              <input
                id="care-end"
                type="time"
                value={draft.end}
                onInput={(e) => setField("end", e.target.value)}
                aria-invalid={!!errors.end}
              />
              {errors.end && (
                <small className="field-error">{errors.end}</small>
              )}
            </div>
          </div>
          <div className="field-pair">
            <div className="field">
              <label htmlFor="age">
                Age on this date <span>Optional</span>
              </label>
              <select
                id="age"
                value={draft.age}
                onChange={(e) => setField("age", e.target.value)}
                aria-invalid={!!errors.age}
              >
                <option value="">Not specified</option>
                <option value="0">Under 1 year</option>
                {[1, 2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n} {n === 1 ? "year" : "years"}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label htmlFor="transport">
                Pickup preference <span>Optional</span>
              </label>
              <select
                id="transport"
                value={draft.transport}
                onChange={(e) => setField("transport", e.target.value)}
              >
                <option value="">Not specified</option>
                <option value="institution">Institutional pickup</option>
                <option value="self">I'll arrange delivery</option>
              </select>
            </div>
          </div>
          <details className="search-refinements">
            <summary>
              Refine the search <PlusIcon />
            </summary>
            <div className="field">
              <label htmlFor="provider-query">Institution name or area</label>
              <input
                id="provider-query"
                value={draft.query}
                onChange={(e) => setField("query", e.target.value)}
                placeholder="Optional name / neighbourhood"
              />
            </div>
            <div className="field">
              <label htmlFor="radius">Distance from pickup</label>
              <select
                id="radius"
                value={draft.radius ?? ""}
                onChange={(e) =>
                  setField(
                    "radius",
                    e.target.value === "" ? null : Number(e.target.value),
                  )
                }
              >
                {[5, 10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    Within {n} km (straight-line)
                  </option>
                ))}
                <option value="">All KL + Selangor</option>
              </select>
            </div>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.includeUnknown}
                onChange={(e) => setField("includeUnknown", e.target.checked)}
              />
              Include conditions needing confirmation
            </label>
            <label className="checkbox">
              <input
                type="checkbox"
                checked={draft.includeConflicts}
                onChange={(e) => setField("includeConflicts", e.target.checked)}
              />
              Include known condition conflicts
            </label>
          </details>
          <button
            ref={submitRef}
            type="submit"
            className="primary find-button"
            disabled={busy}
          >
            {busy ? (
              <>
                <span className="spinner" />
                Checking this request…
              </>
            ) : (
              <>
                {results ? "Update results" : "Find care options"}
                <ArrowRight size={18} />
              </>
            )}
          </button>
          <p className="form-foot">
            One date, one care gap. No account or child profile.
          </p>
        </form>
        {failure && (
          <div className="error-box" role="alert">
            <strong>Search unavailable</strong>
            <p>{errorMessage(failure)}</p>
            <button className="text-link" onClick={() => search(null)}>
              Retry search <RotateCcw size={13} />
            </button>
          </div>
        )}
        {results && (dirty || busy) && (
          <div className="earlier-results" role="status">
            <strong>
              {busy ? "Updating results…" : "Showing the earlier request"}
            </strong>
            <p>{requestCaption(results.request)}</p>
            {!busy && (
              <button onClick={() => search(null)}>
                Apply edited request <ArrowRight size={12} />
              </button>
            )}
          </div>
        )}
        {results ? (
          <>
            <div className="results-toolbar">
              <div>
                <strong>{results.total.toLocaleString()}</strong>
                <span>institutions to explore</span>
              </div>
              <label>
                <span className="sr-only">Order search results</span>
                <select
                  aria-label="Order search results"
                  value={results.request.sort}
                  disabled={busy}
                  onChange={(e) => {
                    const r = { ...draft, sort: e.target.value };
                    setDraft(r);
                    search(null, 0, r);
                  }}
                >
                  {[
                    ["distance", "Nearest first"],
                    ["closing", "Later care end time"],
                    ["pickup", "Published pickup first"],
                    ["name", "By name"],
                  ].map(([id, label]) => (
                    <option
                      key={id}
                      value={id}
                      disabled={results.ordering?.available[id] === false}
                    >
                      {label}
                      {results.ordering?.available[id] === false
                        ? " — unavailable"
                        : ""}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <div className="results-note">
              <button onClick={() => setDialog("ordering")}>
                Why this order? <Info size={12} />
              </button>
              <span>
                Page {results.page + 1} · {items.length} shown
              </span>
            </div>
            {results.missingLocations > 0 && (
              <p className="location-limit">
                {results.total - results.missingLocations} located candidates +{" "}
                {results.missingLocations} without coordinates. Their distance
                cannot be checked.
              </p>
            )}
            <div
              className="provider-list"
              ref={listRef}
              aria-busy={busy}
              inert={busy ? true : undefined}
            >
              {items.map((p, i) => (
                <ProviderCard
                  key={p.id}
                  p={p}
                  index={i}
                  selected={p.id === selected}
                  compared={compareIds.includes(p.id)}
                  onSelect={() => select(p.id)}
                  onDetail={() => openDetails(p)}
                  onCompare={() => toggleCompare(p.id)}
                />
              ))}
              {!items.length && (
                <div className="empty-state">
                  <Search size={29} />
                  <h2>No candidates in this search.</h2>
                  <p>
                    Area:{" "}
                    {results.request.radius
                      ? `${results.request.radius} km from pickup`
                      : "all KL and Selangor"}
                    .{" "}
                    {results.request.query &&
                      `Name / area: “${results.request.query}”. `}
                    {!results.request.includeUnknown &&
                      "Unknown conditions are excluded. "}
                    {!results.request.includeConflicts &&
                      "Known conflicts are excluded."}
                  </p>
                  <button
                    className="secondary"
                    onClick={() => {
                      setFormOpen(true);
                      setMobilePane("list");
                    }}
                  >
                    Change search restrictions <ArrowRight size={15} />
                  </button>
                  {!draft.includeUnknown && (
                    <button
                      className="text-link"
                      onClick={() => {
                        const r = { ...draft, includeUnknown: true };
                        setDraft(r);
                        search(null, 0, r);
                      }}
                    >
                      Include conditions needing confirmation
                    </button>
                  )}
                </div>
              )}
            </div>
            {results.total > 20 && (
              <div className="pagination">
                <button
                  disabled={busy || dirty || results.page === 0}
                  onClick={() =>
                    search(null, results.page - 1, results.request)
                  }
                >
                  Previous
                </button>
                <span>
                  {results.page * 20 + 1}–
                  {Math.min((results.page + 1) * 20, results.total)} /{" "}
                  {results.total}
                </span>
                <button
                  disabled={
                    busy || dirty || (results.page + 1) * 20 >= results.total
                  }
                  onClick={() =>
                    search(null, results.page + 1, results.request)
                  }
                >
                  Next <ArrowRight size={13} />
                </button>
              </div>
            )}
            {results.missingLocations > 0 && (
              <p className="location-limit">
                {results.missingLocations} matching records have no coordinates.
                They remain in the list; their distance cannot be checked.
              </p>
            )}
          </>
        ) : (
          <div className="before-results">
            <span>01 — DISCOVER</span>
            <p>
              Your request becomes a shortlist of possibilities.
              <br />
              Published facts help you decide what to ask.
            </p>
            {health?.unavailable && (
              <p className="notice">
                The directory could not connect yet. You can fill your request
                and retry.
              </p>
            )}
          </div>
        )}
        <footer className="panel-footer">
          <span className="connection-dot" />
          {mode === "demo"
            ? "Fictional examples"
            : health && !health.unavailable
              ? `${health.available.toLocaleString()} regional records connected`
              : "Connecting public directory"}
          <button onClick={() => setDialog("sources")}>Data & sources</button>
        </footer>
      </aside>
      <div className="map-wrap">
        <MapCanvas
          items={items}
          pickup={
            choosing ? draft.pickup : (activeRequest?.pickup ?? draft.pickup)
          }
          selected={selected}
          onSelect={select}
          onPick={(p) => {
            setField("pickup", p);
            setChoosing(false);
            setMobilePane("list");
            setFormOpen(true);
            notify(
              "Map point selected. Its region will be checked with your request.",
            );
          }}
          choosing={choosing}
          theme={theme}
          reduced={reduced}
          labels={labels}
          visible={mobilePane === "map"}
          onStatus={setMapStatus}
          introPhase={introPhase}
          introArea={introArea}
          introReduced={introReduced}
        />
        {choosing && (
          <button
            className="cancel-map-pick secondary"
            onClick={() => {
              setChoosing(false);
              setMobilePane("list");
            }}
          >
            Cancel place selection <X size={15} />
          </button>
        )}
        {active && !choosing && (
          <div className="map-preview">
            <span className="eyebrow">SELECTED INSTITUTION</span>
            <h3>{active.name}</h3>
            <p>
              {active.district} · {active.region}
            </p>
            <div>
              <Status
                state={active.fit.counts.conflict ? "conflict" : "unknown"}
              />
              <button onClick={() => openDetails(active)}>
                Check conditions <ArrowUpRight size={18} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mobile-view-switch">
        <button
          aria-pressed={mobilePane === "list"}
          onClick={() => setMobilePane("list")}
        >
          <List size={17} />
          List / request
        </button>
        <button
          aria-pressed={mobilePane === "map"}
          onClick={() => setMobilePane("map")}
        >
          <MapIcon size={17} />
          Map
        </button>
      </div>
      {compareIds.length > 0 && (
        <div className="compare-tray">
          <span>{compareIds.length} / 3 selected</span>
          <button onClick={() => loadComparison()}>
            Compare institutions <ArrowRight size={16} />
          </button>
          <button
            aria-label="Clear comparison"
            onClick={() => {
              setCompareIds([]);
              setComparison(null);
            }}
          >
            <X size={15} />
          </button>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {dialog && (
        <Dialog
          title={
            dialog === "details"
              ? profile?.p.name
              : dialog === "compare"
                ? "A clearer comparison."
                : dialog === "enquiry"
                  ? "Know what to ask."
                  : dialog === "settings"
                    ? "Make it comfortable."
                    : dialog === "ordering"
                      ? "Why this order?"
                      : "Where the facts come from."
          }
          kicker={
            dialog === "details"
              ? "CONDITIONS & EVIDENCE"
              : dialog === "enquiry"
                ? "PREPARE TO CONTACT"
                : dialog === "compare"
                  ? "COMPARE FOR THIS REQUEST"
                  : "EQUALPATH / INFORMATION"
          }
          wide={dialog === "compare" || dialog === "details"}
          onClose={close}
        >
          {dialog === "details" && profile && (
            <>
              <p className="dialog-context">
                {requestCaption(profile.request)}
              </p>
              <Details
                p={profile.p}
                onPrepare={() => prepare(profile.p, profile.request)}
                onCompare={() => toggleCompare(profile.p.id)}
                compared={compareIds.includes(profile.p.id)}
              />
            </>
          )}
          {dialog === "compare" &&
            (compareIds.length < 2 ? (
              <div className="empty-state">
                <Scale size={31} />
                <h3>Choose at least two institutions.</h3>
                <p>
                  Add up to three from the results. They will be checked against
                  the same request.
                </p>
                <button className="primary" onClick={close}>
                  Back to discovery <ArrowRight size={16} />
                </button>
              </div>
            ) : (
              <>
                {dialogBusy && (
                  <p className="loading-line" role="status">
                    <span className="spinner" />
                    Checking the selected institutions…
                  </p>
                )}
                {dialogError && (
                  <div className="error-box" role="alert">
                    <p>{errorMessage(dialogError)}</p>
                    <button className="text-link" onClick={retryDialog}>
                      Retry comparison
                    </button>
                  </div>
                )}
                {comparison && (
                  <>
                    <p className="dialog-context">
                      {requestCaption(comparison.request)}
                    </p>
                    {requestChanged && (
                      <p className="notice">
                        This comparison still belongs to the earlier request.
                      </p>
                    )}
                    <div
                      inert={
                        dialogBusy || requestChanged || !!dialogError
                          ? true
                          : undefined
                      }
                    >
                      <Comparison
                        items={comparison.items.filter((p) =>
                          compareIds.includes(p.id),
                        )}
                        onRemove={removeCompare}
                        onPrepare={(p) => prepare(p, comparison.request)}
                        sort={compareSort}
                        ordering={comparison.ordering}
                        onSort={(v) => {
                          setCompareSort(v);
                          loadComparison(compareIds, v);
                        }}
                      />
                    </div>
                  </>
                )}
              </>
            ))}
          {dialog === "enquiry" &&
            enquiry &&
            scenario(enquiry.request) !== scenario(activeRequest) && (
              <p className="notice">
                These questions belong to the earlier request shown below.
                Prepare a new enquiry from the updated results to use the new
                conditions.
              </p>
            )}
          {dialog === "enquiry" &&
            (enquiry ? (
              <Enquiry
                key={enquiry.p.id + scenario(enquiry.request)}
                p={enquiry.p}
                request={enquiry.request}
                selection={
                  questionSelection[enquiry.p.id + scenario(enquiry.request)]
                }
                onSelection={(ids) =>
                  setQuestionSelection((x) => ({
                    ...x,
                    [enquiry.p.id + scenario(enquiry.request)]: ids,
                  }))
                }
                onCompare={() => loadComparison()}
              />
            ) : (
              <div className="empty-state">
                <h3>Start with a candidate.</h3>
                <p>
                  Open an institution’s conditions or comparison, then choose
                  Prepare questions.
                </p>
                <button className="primary" onClick={close}>
                  Find care options <ArrowRight size={16} />
                </button>
              </div>
            ))}
          {dialog === "ordering" && (
            <div className="prose">
              <p>{results?.ordering.explanation}</p>
              <p>
                Unknown factors remain visible and sort after comparable
                published values. Results have no hidden quality score or
                guaranteed-availability ranking.
              </p>
              <p>
                List and map use the same page of candidates. Records without
                coordinates stay in the list.
              </p>
            </div>
          )}
          {dialog === "settings" && (
            <>
              <div className="setting-line">
                <span>Appearance</span>
                <div className="theme-buttons">
                  <button
                    aria-pressed={theme === "light"}
                    onClick={() => setTheme("light")}
                  >
                    <Sun size={16} />
                    Light
                  </button>
                  <button
                    aria-pressed={theme === "dark"}
                    onClick={() => setTheme("dark")}
                  >
                    <Moon size={16} />
                    Dark
                  </button>
                </div>
              </div>
              <label className="setting-line">
                <span>Map labels</span>
                <input
                  type="checkbox"
                  checked={labels}
                  onChange={(e) => setLabels(e.target.checked)}
                />
              </label>
              <label className="setting-line">
                <span>Reduce motion</span>
                <input
                  type="checkbox"
                  checked={reduced}
                  onChange={(e) => setReduced(e.target.checked)}
                />
              </label>
              <div className="data-mode">
                <h3>Explore with real facts or controlled examples.</h3>
                <p>
                  Ten fictional examples include daytime care, two evening-care
                  schedules, and supported, conflicting and unknown conditions. Changing mode clears the current search and
                  selection.
                </p>
                <button
                  className="secondary"
                  onClick={() => switchMode(mode === "live" ? "demo" : "live")}
                >
                  {mode === "live"
                    ? "Try controlled examples"
                    : "Use real Appwrite directory"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </>
          )}
          {dialog === "sources" && (
            <div className="prose">
              <p>
                Only Kuala Lumpur and Selangor are served. Putrajaya and other
                states are excluded.{" "}
                {health &&
                  !health.unavailable &&
                  `${health.available.toLocaleString()} records are available; ${health.withheld} are held for region or branch checks.`}
              </p>
              <p>
                <strong>JKM</strong> is an imported registration source.{" "}
                <strong>CariSchool</strong> supplies separate branch
                descriptions and KPM code claims; a directory claim is not
                official KPM verification. Contact and service facts keep their
                own source links and retrieval dates.
              </p>
              <p>
                Published care end times are used for this check.
                Specific care schedules and date exceptions take precedence.
                Transport coverage and actual acceptance are checked separately.
                No route duration or live vacancy is inferred.
              </p>
              <p>
                Geographic checks use a versioned{" "}
                <a
                  href="https://www.geoboundaries.org/api/current/gbOpen/MYS/ADM1/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OSM / geoBoundaries administrative boundary dataset
                </a>{" "}
                representing 2017, under ODbL. Contradictory coordinates are
                withheld; this is not a survey-grade boundary service.
              </p>
              <p>
                Your current request stays in this browser’s active page and is
                sent only for the current query. There is no parent account,
                child identity form, automatic contact or saved search history.
                Public map tiles are fetched from the map provider.
              </p>
              <p>
                Registration and historical listings do not prove present
                availability, suitability or care quality. Contact the specific
                institution to confirm the arrangement.
              </p>
              <button
                className="secondary"
                onClick={() => switchMode(mode === "live" ? "demo" : "live")}
              >
                {mode === "live"
                  ? "Try controlled examples"
                  : "Return to real directory"}
                <ArrowRight size={15} />
              </button>
            </div>
          )}
        </Dialog>
      )}
    </main>
  );
}
function PlusIcon() {
  return <span aria-hidden="true">＋</span>;
}
