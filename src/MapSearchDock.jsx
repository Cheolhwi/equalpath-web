import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Baby, CalendarDays, Clock3, SlidersHorizontal, X, MapPin, Users, ArrowRight, Pencil, ChevronUp, PanelLeft, Check } from "lucide-react";
import PlaceInput from "./PlaceInput.jsx";
import CareTypeChoice from "./CareTypeChoice.jsx";
import AgeRangeChoice from "./AgeRangeChoice.jsx";
import TimeInput from "./TimeInput.jsx";
import SearchActions from "./SearchActions.jsx";
import { isShortCare, searchRadius, SHORT_CARE_RADIUS_KM, MAX_SEARCH_RADIUS_KM } from "../shared/request.mjs";

const shortDate = date => date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Choose date";
export default function MapSearchDock({ draft, setField, errors, onSearch, busy, results, dirty, mode, active, queryReset, onQueryChange, onMap, onPanel, submitRef, focusRequest, onHeight, collapsed, onCollapsedChange, notice, failure, onRetry, addressStatus, onRetryAddress }) {
  const root = useRef(null), lastTrigger = useRef(null), options = useRef(null), pendingFocus = useRef(null);
  const summary = useRef(null);
  const canCollapse = !!results?.total && !busy && !dirty && !failure && !Object.values(errors).some(Boolean);
  const compact = collapsed && canCollapse;
  const [part, setPart] = useState(null);
  const [menuPosition, setMenuPosition] = useState({});
  const short = isShortCare(draft);
  const changed = key => !!results && JSON.stringify(draft[key]) !== JSON.stringify(results.request[key]);
  const moreFields = ["transport", "query", "radius", "includeUnknown", "includeConflicts"];
  const pending = name => name === "more" ? moreFields.some(changed) : changed(name === "care" ? "careType" : name);
  const selectedFilters = [
    draft.transport && `Pickup: ${draft.transport === "institution" ? "The centre" : "I’ll handle it"}`,
    draft.query?.trim() && `Name / area: ${draft.query.trim()}`,
    searchRadius(draft.radius, draft.careType) !== searchRadius(MAX_SEARCH_RADIUS_KM, draft.careType) && `Within ${draft.radius} km`,
    !draft.includeUnknown && "Hide centres with unconfirmed details",
    !draft.includeConflicts && "Hide centres that don’t meet my needs",
  ].filter(Boolean);
  const closeOptions = () => { pendingFocus.current = lastTrigger.current; setPart(null); };
  const toggle = (name, event) => { pendingFocus.current = null; lastTrigger.current = event.currentTarget; setPart(p => p === name ? null : name); };
  useLayoutEffect(() => {
    if (!focusRequest) return;
    onCollapsedChange(false);
    const field = focusRequest.field;
    lastTrigger.current = root.current?.querySelector(`[data-field="${field}"]`);
    pendingFocus.current = field === "pickup" ? "pickup-search" : field === "date" ? "service-date" : field === "end" ? "care-end" : field;
    setPart(["age", "date", "care", "more"].includes(field) ? field : null);
  }, [focusRequest]);
  // The requested field may be inside a menu that has not mounted yet. Focus
  // after that commit instead of racing the render with an animation frame.
  useLayoutEffect(() => {
    const target = typeof pendingFocus.current === "string" ? document.getElementById(pendingFocus.current) : pendingFocus.current;
    if (!target?.isConnected || !target.getClientRects().length) return;
    target.focus({ preventScroll: true });
    pendingFocus.current = null;
  }, [part, focusRequest, compact]);
  useLayoutEffect(() => {
    if (compact && summary.current?.getClientRects().length && root.current.contains(document.activeElement)) {
      summary.current.focus({ preventScroll: true });
    }
  }, [compact]);
  useEffect(() => { if (busy || !active) setPart(null); }, [busy, active]);
  useLayoutEffect(() => {
    const update = () => {
      const overlay = root.current?.closest('.map-tools-overlay'), map = overlay?.closest('.map-wrap');
      if (map) onHeight(overlay.getBoundingClientRect().bottom - map.getBoundingClientRect().top);
    };
    const observer = new ResizeObserver(update);
    observer.observe(root.current.closest('.map-tools-overlay')); window.addEventListener("resize", update);
    return () => { observer.disconnect(); window.removeEventListener("resize", update); };
  }, [onHeight]);
  useLayoutEffect(() => {
    if (!part) return;
    const position = () => {
      const dock = root.current.getBoundingClientRect();
      const trigger = root.current.querySelector(`[data-field="${part}"]`)?.getBoundingClientRect();
      if (!trigger || !options.current) return;
      const width = options.current.offsetWidth;
      setMenuPosition({
        left: Math.max(0, Math.min(trigger.left - dock.left, dock.width - width)),
        right: "auto", top: trigger.bottom - dock.top + 8,
        maxHeight: Math.max(120, innerHeight - trigger.bottom - 20),
      });
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(root.current); window.addEventListener("resize", position);
    return () => { observer.disconnect(); window.removeEventListener("resize", position); };
  }, [part]);
  useEffect(() => {
    if (!part) return;
    const outside = e => {
      const popover = options.current;
      const trigger = root.current?.querySelector(`[data-field="${part}"]`);
      if (!popover?.contains(e.target) && !trigger?.contains(e.target)) {
        setPart(null);
        lastTrigger.current?.focus({ preventScroll: true });
      }
    };
    const escape = e => { if (e.key === "Escape" && !e.defaultPrevented) { e.preventDefault(); setPart(null); lastTrigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [part]);
  const chip = (name, Icon, label, value, error) => <button type="button" className={`search-chip${part === name ? " active" : ""}${error ? " invalid" : ""}${pending(name) ? " unapplied" : ""}`} data-field={name} data-pending={pending(name) || undefined} aria-describedby={pending(name) ? "search-apply-status" : undefined} aria-label={`${label}: ${value}`} aria-invalid={!!error || undefined} aria-expanded={part === name} aria-controls={part === name ? "search-options" : undefined} onClick={e => toggle(name, e)}>
    <Icon size={21} aria-hidden="true" /><span><small>{label}{pending(name) && <Pencil size={11} aria-hidden="true" />}</small><strong>{value}</strong></span>
  </button>;
  return <div className={`map-search-dock${compact ? " search-collapsed" : ""}`} ref={root}>
    {canCollapse && <button type="button" ref={summary} className="mobile-search-summary" aria-expanded={!compact} aria-controls="request-form" aria-label="Change search" aria-describedby="mobile-search-applied" onClick={() => { pendingFocus.current = "pickup-search"; onCollapsedChange(false); }}>
      <MapPin size={20} aria-hidden="true" />
      <span className="mobile-search-context"><small id="mobile-search-applied" className="mobile-search-applied" role="status"><span className="mobile-search-check" aria-hidden="true"><Check size={12} /></span><span className="sr-only">Results up to date</span></small><strong>{results.request.pickup.label}</strong><small>{short ? `${shortDate(results.request.date)} · ${results.request.deadline}–${results.request.end}` : "Long term"}</small></span>
      <span className="mobile-search-edit"><Pencil size={16} aria-hidden="true" />Change search</span>
    </button>}
    {canCollapse && <button type="button" className="mobile-search-hide" onClick={() => { setPart(null); onCollapsedChange(true); }}><ChevronUp size={17} aria-hidden="true" />Hide search</button>}
    <form id="request-form" className="request-form dock-form" onSubmit={onSearch} noValidate aria-label="Find childcare">
      <div className="dock-address-row">
        <PlaceInput compact hideLabel mode={mode} value={draft.pickup} queryReset={queryReset} onQueryChange={onQueryChange} active={active} error={errors.pickup} onChange={p => setField("pickup", p)} onMap={onMap} label={short ? "Where will your child leave from?" : "Where do you need care?"}
          leading={<button type="button" className="map-search-launch dock-panel-toggle" onClick={onPanel} aria-label="Open search panel" title="Open search panel"><PanelLeft size={20} /></button>}
          />
      </div>
      <div className="dock-filter-panel">
      <div className="dock-options" data-tour="care-times">
        {chip("care", Clock3, "Care", short ? "Short time" : "Long term")}
        {short && chip("date", CalendarDays, "Date", shortDate(draft.date), errors.date)}
        {chip("age", Baby, "Age", draft.age ? `${draft.age.replace("-", "–")} years` : "Select", errors.age)}
        {short && <>
          <TimeInput variant="chip" icon={MapPin} shortLabel="Start" pending={changed("deadline")} id="deadline" label="When will your child leave this address?" value={draft.deadline} onChange={v => setField("deadline", v)} invalid={!!errors.deadline} describedBy={errors.deadline ? "deadline-error" : changed("deadline") ? "search-apply-status" : undefined} onOpen={() => setPart(null)} />
          <TimeInput variant="chip" icon={Users} shortLabel="End" pending={changed("end")} id="care-end" label="When will you pick up your child from childcare?" value={draft.end} onChange={v => setField("end", v)} invalid={!!errors.end} describedBy={errors.end ? "care-end-error" : changed("end") ? "search-apply-status" : undefined} onOpen={() => setPart(null)} />
        </>}
        {chip("more", SlidersHorizontal, "More", selectedFilters.length ? `Filters (${selectedFilters.length})` : "Filters")}
      </div>
      <SearchActions compact busy={busy} results={results} dirty={dirty} failure={failure} submitRef={submitRef} />
      </div>
      {part && <section ref={options} className={`dock-popover dock-popover-${part}`} id="search-options" aria-label={`${part} options`} style={menuPosition}>
        {!['care', 'age'].includes(part) && <button type="button" className="dock-popover-close" aria-label="Close options" onClick={closeOptions}><X size={19} /></button>}
        {part === "care" && <CareTypeChoice value={draft.careType} onChange={v => { setField("careType", v); closeOptions(); }} />}
        {part === "date" && <div className="field"><label htmlFor="service-date"><CalendarDays size={21} />Date</label><input id="service-date" type="date" value={draft.date} onChange={e => setField("date", e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : undefined} />{errors.date && <small className="field-error" id="date-error">{errors.date}</small>}</div>}
        {part === "age" && <AgeRangeChoice value={draft.age} onChange={v => { setField("age", v); closeOptions(); }} error={errors.age} />}
        {part === "more" && <><h2>More filters</h2><div className="field"><label htmlFor="transport"><Users size={18} />Pickup help</label><select id="transport" value={draft.transport} onChange={e => setField("transport", e.target.value)}><option value="">Not sure yet</option><option value="institution">The centre</option><option value="self">I’ll handle it</option></select></div>
          <div className="field"><label htmlFor="provider-query">Centre name or area</label><input id="provider-query" value={draft.query} onChange={e => setField("query", e.target.value)} placeholder="Centre name or area" /></div>
          <div className="field"><label htmlFor="radius">Search radius</label><select id="radius" value={searchRadius(draft.radius, draft.careType)} onChange={e => setField("radius", Number(e.target.value))}>{(short ? [SHORT_CARE_RADIUS_KM] : [5, MAX_SEARCH_RADIUS_KM]).map(n => <option key={n} value={n}>Within {n} km</option>)}</select></div>
          <label className="checkbox"><input type="checkbox" checked={draft.includeUnknown} onChange={e => setField("includeUnknown", e.target.checked)} />Include centres with details to confirm</label>
          <label className="checkbox"><input type="checkbox" checked={draft.includeConflicts} onChange={e => setField("includeConflicts", e.target.checked)} />Include centres that don’t meet all my needs</label>
          <div className="filter-review"><p className="sr-only">Changes apply when you tap {results ? "Update results" : "Find care"}.</p><button type="submit" className="primary" disabled={busy}>{results ? "Update results" : "Find care"} <ArrowRight size={16} /></button></div>
        </>}
      </section>}
    </form>
    {(errors.deadline || errors.end) && <p className="dock-feedback field-error" role="alert" id={errors.deadline ? "deadline-error" : "care-end-error"}>{errors.deadline || errors.end}</p>}
    {notice && <p className="dock-feedback" role="status">{notice}</p>}
    {addressStatus && <p className="dock-feedback" role="status">{addressStatus === "loading" ? "Finding the nearby street…" : <>Street address unavailable. <button onClick={onRetryAddress}>Retry address</button></>}</p>}
    {failure && <p className="dock-feedback field-error" role="alert">We couldn’t load centres. Use the Retry search button above to try again.</p>}
  </div>;
}
