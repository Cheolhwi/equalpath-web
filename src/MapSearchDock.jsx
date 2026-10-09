import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { CalendarDays, Car, SlidersHorizontal, X, MapPin, Users, UsersRound, ArrowRight, Pencil, ChevronUp, Check } from "lucide-react";
import PlaceInput from "./PlaceInput.jsx";
import AgeRangeChoice from "./AgeRangeChoice.jsx";
import TimeInput from "./TimeInput.jsx";
import SearchActions from "./SearchActions.jsx";
import { isShortCare, searchRadius, MAX_SEARCH_RADIUS_KM, minutes, timeLabel, todayKL, ageShort } from "../shared/request.mjs";

// A sensible first position for an empty time picker: a normal morning start
// on a future date, and a few hours after the chosen start for collection.
const laterBy = (time, hours) => { const m = minutes(time); return m === null ? null : timeLabel(Math.min(m + hours * 60, 23 * 60)); };
const shortDate = date => date ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`)) : "Choose date";
// The browser's own date box follows the computer's locale (10/01/2026 can
// mean 10 January), so the chosen date is also written out in words.
const longDate = date => new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T12:00:00Z`));
const addDays = (date, days) => new Date(Date.parse(`${date}T12:00:00Z`) + days * 864e5).toISOString().slice(0, 10);
const TRANSPORT = [["self", "I’ll bring my child", "I’ll bring"], ["institution", "The centre picks my child up", "Centre pickup"], ["", "Not sure yet", "Not sure"]];
const transportShort = value => TRANSPORT.find(([key]) => key === (value ?? ""))?.[2] ?? "Not sure";
// The age chip: "1 · 4 yrs", "1 · under 1", "2 · 2 & 5 yrs", "2 · ? & ? yrs".
const yrs = age => !age ? "age ?" : age === "0" ? "under 1" : `${ageShort(age)} ${age === "1" ? "yr" : "yrs"}`;
const agesChip = (a, b) => b === undefined ? `1 · ${yrs(a)}`
  : `2 · ${[a, b].map(x => x === "0" ? "under 1" : x ? ageShort(x) : "?").join(" & ")} yrs`;
export default function MapSearchDock({ draft, setField, errors, onSearch, busy, results, dirty, mode, active, queryReset, onQueryChange, onMap, submitRef, focusRequest, onHeight, collapsed, onCollapsedChange, notice, failure, onRetry, addressStatus, onRetryAddress }) {
  const root = useRef(null), lastTrigger = useRef(null), options = useRef(null), pendingFocus = useRef(null);
  const summary = useRef(null);
  const canCollapse = !!results?.total && !busy && !dirty && !failure && !Object.values(errors).some(Boolean);
  const compact = collapsed && canCollapse;
  const [part, setPart] = useState(null);
  const [menuPosition, setMenuPosition] = useState({});
  const short = isShortCare(draft);
  const two = short && draft.kids === 2, second = { age: "", same: true, deadline: "", end: "", ...(draft.second ?? {}) };
  const setSecond = (patch) => setField("second", { ...second, ...patch });
  const changed = key => !!results && JSON.stringify(draft[key]) !== JSON.stringify(results.request[key]);
  // Short care chooses transport on its own chip; regular care keeps it in More.
  const moreFields = [...(short ? [] : ["transport"]), "query", "radius", "includeUnknown", "includeConflicts"];
  const pending = name => name === "more" ? moreFields.some(changed) : name === "age" ? changed("age") || changed("kids") || changed("second") : changed(name === "care" ? "careType" : name);
  const selectedFilters = [
    !short && draft.transport && (draft.transport === "institution" ? "Centre picks up" : "You bring your child"),
    draft.query?.trim() && `Name / area: ${draft.query.trim()}`,
    searchRadius(draft.radius, draft.careType) !== searchRadius(undefined, draft.careType) && `Within ${draft.radius} km`,
    !draft.includeUnknown && "Hide centres with missing details",
    draft.includeConflicts && "Include centres that don’t meet my needs",
  ].filter(Boolean);
  const closeOptions = () => { pendingFocus.current = lastTrigger.current; setPart(null); };
  const toggle = (name, event) => { pendingFocus.current = null; lastTrigger.current = event.currentTarget; setPart(p => p === name ? null : name); };
  useLayoutEffect(() => {
    if (!focusRequest) return;
    onCollapsedChange(false);
    const field = focusRequest.field;
    lastTrigger.current = root.current?.querySelector(`[data-field="${field}"]`);
    pendingFocus.current = field === "pickup" ? "pickup-search" : field === "date" ? "service-date" : field === "end" ? "care-end" : field;
    setPart(["age", "date", "care", "more", "transport"].includes(field) ? field : field === "kids" ? "age" : null);
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
      // A time picker opened from inside this menu is portalled outside it.
      if (e.target.closest?.(".time-picker")) return;
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
      <span className="mobile-search-context"><small id="mobile-search-applied" className="mobile-search-applied" role="status"><span className="mobile-search-check" aria-hidden="true"><Check size={12} /></span><span className="sr-only">Results up to date</span></small><strong>{results.request.pickup.label}</strong><small>{short ? `${shortDate(results.request.date)} · ${results.request.deadline}–${results.request.end}${results.request.kids === 2 ? " · 2 children" : ""}` : "Regular care"}</small></span>
      <span className="mobile-search-edit"><Pencil size={16} aria-hidden="true" />Change search</span>
    </button>}
    {canCollapse && <button type="button" className="mobile-search-hide" onClick={() => { setPart(null); onCollapsedChange(true); }}><ChevronUp size={17} aria-hidden="true" />Hide search</button>}
    <form id="request-form" className="request-form dock-form" onSubmit={onSearch} noValidate aria-label="Find childcare">
      <div className="dock-address-row">
        <PlaceInput compact hideLabel mode={mode} value={draft.pickup} queryReset={queryReset} onQueryChange={onQueryChange} active={active} error={errors.pickup} onChange={p => setField("pickup", p)} onMap={onMap} label={short ? "Where will your child leave from?" : "Where do you need care?"} placeholder={short ? "Starting point, e.g. KL Sentral" : "Home, work or school, e.g. KL Sentral"}
          />
      </div>
      <div className="dock-filter-panel">
      <div className="dock-options" data-tour="care-times">
        {short && chip("date", CalendarDays, "Date", shortDate(draft.date), errors.date)}
        {two ? chip("age", UsersRound, "Children", agesChip(draft.age, second.age), errors.age || errors.secondAge || errors.second)
          : chip("age", UsersRound, "Children", agesChip(draft.age), errors.age)}
        {short && <>
          <TimeInput variant="chip" icon={MapPin} shortLabel="Start" suggest={draft.date && draft.date !== todayKL() ? "09:00" : undefined} pending={changed("deadline")} id="deadline" label="When does care start?" pickerLabel="Start" value={draft.deadline} onChange={v => setField("deadline", v)} invalid={!!errors.deadline} describedBy={errors.deadline ? "deadline-error" : changed("deadline") ? "search-apply-status" : undefined} onOpen={() => setPart(null)} />
          <TimeInput variant="chip" icon={Users} shortLabel="End" suggest={laterBy(draft.deadline, 3) ?? (draft.date && draft.date !== todayKL() ? "12:00" : undefined)} pending={changed("end")} id="care-end" label="When does care end?" pickerLabel="End" value={draft.end} onChange={v => setField("end", v)} invalid={!!errors.end} describedBy={errors.end ? "care-end-error" : changed("end") ? "search-apply-status" : undefined} onOpen={() => setPart(null)} />
        </>}
        {short && !two && chip("transport", Car, "Getting there", transportShort(draft.transport))}
        {chip("more", SlidersHorizontal, "More", selectedFilters.length ? `Filters (${selectedFilters.length})` : "Filters")}
      </div>
      <SearchActions compact busy={busy} results={results} dirty={dirty} failure={failure} submitRef={submitRef} />
      </div>
      {part && <section ref={options} className={`dock-popover dock-popover-${part}`} id="search-options" aria-label={`${part} options`} style={menuPosition}>
        {!['care', 'age', 'transport'].includes(part) && <button type="button" className="dock-popover-close" aria-label="Close options" onClick={closeOptions}><X size={19} /></button>}
        {part === "date" && <div className="field date-field"><label htmlFor="service-date"><CalendarDays size={21} />Date</label>
          <div className="date-quick" role="group" aria-label="Quick dates">{[["Today", todayKL()], ["Tomorrow", addDays(todayKL(), 1)]].map(([name, value]) =>
            <button type="button" key={name} aria-pressed={draft.date === value} onClick={() => { setField("date", value); closeOptions(); }}><strong>{name}</strong><small>{shortDate(value)}</small></button>)}</div>
          <input id="service-date" type="date" value={draft.date} onChange={e => setField("date", e.target.value)} aria-invalid={!!errors.date} aria-describedby={errors.date ? "date-error" : "date-in-words"} />
          {draft.date && /^\d{4}-\d{2}-\d{2}$/.test(draft.date) && <small className="date-in-words" id="date-in-words">{longDate(draft.date)}</small>}
          {errors.date && <small className="field-error" id="date-error">{errors.date}</small>}</div>}
        {part === "transport" && <fieldset className="care-type-choice transport-choice"><legend className="sr-only">Getting to the centre</legend><div>
          {TRANSPORT.map(([key, label]) => <label key={key || "unsure"} className={(draft.transport ?? "") === key ? "selected" : ""}>
            <input type="radio" name="dock-transport" value={key} aria-label={label} checked={(draft.transport ?? "") === key} onChange={() => { setField("transport", key); closeOptions(); }} /><span>{label}</span></label>)}
        </div></fieldset>}
        {part === "age" && !short && <div className="kids-choice"><h3>How old is your child?</h3><AgeRangeChoice value={draft.age} onChange={v => { setField("age", v); closeOptions(); }} error={errors.age} /></div>}
        {part === "age" && short && <div className="kids-choice">
          <fieldset className="care-type-choice kids-count"><legend className="sr-only">How many children?</legend><div>
            {[[1, "1 child"], [2, "2 children"]].map(([n, label]) => <label key={n} className={(two ? 2 : 1) === n ? "selected" : ""}>
              <input type="radio" name="dock-kids" value={n} aria-label={label} checked={(two ? 2 : 1) === n} onChange={() => setField("kids", n)} /><span>{label}</span></label>)}
          </div></fieldset>
          {!two ? <><h3>How old is your child?</h3><AgeRangeChoice who="Your child" value={draft.age} onChange={v => { setField("age", v); closeOptions(); }} error={errors.age} /></> : <>
            <h3>How old are they?</h3>
            <div className="kids-ages">
              <AgeRangeChoice who="Child 1" value={draft.age} onChange={v => setField("age", v)} error={errors.age} />
              <AgeRangeChoice id="" who="Child 2" value={second.age} onChange={v => setSecond({ age: v })} error={errors.secondAge} />
            </div>
            <h3>Child 2’s times</h3>
            <fieldset className="care-type-choice"><legend className="sr-only">Child 2’s times</legend><div>
              {[[true, `Same as Child 1${draft.deadline && draft.end ? ` (${draft.deadline}–${draft.end})` : ""}`], [false, "Different times"]].map(([same, label]) =>
                <label key={String(same)} className={second.same === same ? "selected" : ""}>
                  <input type="radio" name="dock-second-times" checked={second.same === same} aria-label={label} onChange={() => setSecond({ same })} /><span>{label}</span></label>)}
            </div></fieldset>
            {!second.same && <div className="field-pair">
              <div className="field"><label htmlFor="second-start">Start</label><TimeInput variant="box" id="second-start" label="Child 2 start" pickerLabel="Start" value={second.deadline} suggest={draft.deadline || "09:00"} invalid={!!errors.second} onChange={v => setSecond({ deadline: v })} /></div>
              <div className="field"><label htmlFor="second-end">End</label><TimeInput variant="box" id="second-end" label="Child 2 end" pickerLabel="End" value={second.end} suggest={draft.end || laterBy(second.deadline, 3) || "12:00"} invalid={!!errors.second} onChange={v => setSecond({ end: v })} /></div>
            </div>}
            {errors.second && <small className="field-error">{errors.second}</small>}
            <button type="button" className="primary" onClick={closeOptions}>Done</button>
          </>}
        </div>}
        {part === "more" && <><h2>More filters</h2>
          {!short && <div className="field"><label htmlFor="transport">Getting to the centre</label><select id="transport" value={draft.transport} onChange={e => setField("transport", e.target.value)}><option value="">Not sure yet</option><option value="institution">The centre picks my child up</option><option value="self">I’ll bring my child</option></select></div>}
          <div className="field"><label htmlFor="provider-query">Centre name or area</label><input id="provider-query" value={draft.query} onChange={e => setField("query", e.target.value)} placeholder="e.g. Little Playhouse or Bangsar" /></div>
          <fieldset className="field radius-choice"><legend>Search radius</legend><div>{[5, MAX_SEARCH_RADIUS_KM].map(n => { const on = searchRadius(draft.radius, draft.careType) === n; return <label key={n} className={on ? "selected" : undefined}><input type="radio" name="radius" id={n === 5 ? "radius" : undefined} value={n} checked={on} onChange={() => setField("radius", n)} />Within {n} km</label>; })}</div></fieldset>
          <label className="checkbox"><input type="checkbox" checked={draft.includeUnknown} onChange={e => setField("includeUnknown", e.target.checked)} />Include centres with missing details</label>
          <label className="checkbox"><input type="checkbox" checked={draft.includeConflicts} onChange={e => setField("includeConflicts", e.target.checked)} />Include centres that don’t meet all my needs</label>
          <div className="filter-review"><p className="sr-only">Changes apply when you select {results ? "Update results" : "Find childcare"}.</p><button type="submit" className="primary" disabled={busy}>{results ? "Update results" : "Find childcare"} <ArrowRight size={16} /></button></div>
        </>}
      </section>}
    </form>
    {(errors.deadline || errors.end) && <p className="dock-feedback field-error" role="alert" id={errors.deadline ? "deadline-error" : "care-end-error"}>{errors.deadline || errors.end}</p>}
    {notice && <p className="dock-feedback" role="status">{notice}</p>}
    {addressStatus && <p className="dock-feedback" role="status">{addressStatus === "loading" ? "Finding the street name…" : <>We couldn’t find the street name. <button onClick={onRetryAddress}>Retry address</button></>}</p>}
    {failure && <p className="dock-feedback field-error" role="alert">We couldn’t load centres. Select Retry search to try again.</p>}
  </div>;
}
