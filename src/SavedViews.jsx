import { useEffect, useState } from "react";
import { displayName, placeLabel, categoryLabel, dateLabel } from "../shared/display.mjs";
import { Bookmark, ArrowRight, Trash2, Pencil, Save, CalendarDays, Clock3, Users, RefreshCw, Check, CircleHelp, MapPin, Search, StickyNote, AlertTriangle } from "lucide-react";
import {
  favourite,
  compareFacts,
  factDescription,
  factDates,
} from "../shared/saved.mjs";
import { isShortCare, requestErrors, CHILD_AGES } from "../shared/request.mjs";
import { ageWords } from "./AgeRangeChoice.jsx";
import SelectMenu from "./SelectMenu.jsx";
import TimeInput from "./TimeInput.jsx";

export function SaveExplanation() {
  return (
    <details className="save-explanation">
      <summary>About your saved items</summary>
      <p>
        Your saved centres and notes stay in this browser. For you uses
        them, and the centres you looked at, to suggest others.
      </p>
      <p>
        Clearing your browser data can delete them. They don’t appear on
        your other devices.
      </p>
    </details>
  );
}
export function SavedCentreReminder({ favourites, onChoose }) {
  if (!favourites.length) return null;
  return <section className="saved-centre-reminder" aria-label="Saved centres">
    <button type="button" onClick={onChoose}>
      <Bookmark size={19} aria-hidden="true" />
      <span><strong>Saved centres <span className="saved-centre-count">{favourites.length}</span></strong>
        <span>{favourites.at(-1).name}{favourites.length > 1 && <small> · {favourites.length - 1} more</small>}</span></span>
      <ArrowRight size={18} aria-hidden="true" />
    </button>
  </section>;
}
export function MapSavedShortcuts({ library, onCentres }) {
  const item = library.favourites.reduce((last, next) => !last || (next.savedAt ?? "") >= (last.savedAt ?? "") ? next : last, null);
  return <button className="map-saved-shortcut" onClick={onCentres}
    aria-label={`Saved centres${library.favourites.length ? ` (${library.favourites.length})` : ""}`} aria-describedby={item ? "map-saved-centre" : undefined} title={item?.name}>
    <Bookmark size={17} aria-hidden="true" />
    <span><span className="map-saved-label">Saved centres{library.favourites.length > 0 && <small>{library.favourites.length}</small>}</span>
      {item && <strong id="map-saved-centre">{item.name}</strong>}</span>
  </button>;
}
const checkRequestKey = (request) => JSON.stringify([
  request?.careType,
  request?.pickup?.label,
  request?.pickup?.lat,
  request?.pickup?.lng,
  request?.date,
  request?.deadline,
  request?.end,
  request?.age,
  request?.transport,
]);
const checkStatus = (p) => p.fit?.counts?.conflict
  ? { label: "Doesn’t match your search", tone: "conflict" }
  : p.fit?.counts?.unknown
    ? { label: "Ask the centre", tone: "unknown" }
    : { label: "Matches your search", tone: "supported" };

// A date in words for the visit box ("Mon, 12 Oct"); the picker stays native.
const dateWords = (iso) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso ?? "")) return "";
  try { return new Date(`${iso}T12:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }); } catch { return iso; }
};
function DateBox({ value, onChange, label }) {
  return <label className="saved-date-box">
    <span className={value ? "" : "placeholder"}>{dateWords(value) || "Choose date"}</span>
    <CalendarDays size={17} aria-hidden="true" />
    <input type="date" aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}
      onClick={(event) => { try { event.currentTarget.showPicker?.(); } catch { /* older browsers open it on their own */ } }} />
  </label>;
}
const StatusIcon = ({ tone }) => tone === "supported" ? <Check size={13} aria-hidden="true" /> : tone === "conflict" ? <AlertTriangle size={13} aria-hidden="true" /> : <CircleHelp size={13} aria-hidden="true" />;

/* Saved (14 Oct 2026, user: "saved这个单独的页面可能也要调整ui改改"): one visit
   bar at the top checks every saved centre for the same day, and each saved
   centre shows its own result — no second list of the same names below. */
export function SavedCheckPanel({ entries, currentRequest, checking, result, onStartSearch, onCheck }) {
  const requestKey = checkRequestKey(currentRequest);
  const [form, setForm] = useState(() => ({
    careType: currentRequest?.careType ?? "short_term",
    pickup: currentRequest?.pickup ?? null,
    date: currentRequest?.date ?? "",
    deadline: currentRequest?.deadline ?? "",
    end: currentRequest?.end ?? "",
    age: currentRequest?.age ?? "",
    transport: currentRequest?.transport ?? "",
  }));
  const short = isShortCare(form);
  const errors = requestErrors(form, { requireAge: true });
  const canCheck = !Object.keys(errors).length && !!form.pickup;
  const formRequest = { ...currentRequest, ...form };
  const resultMatches = !result?.request || checkRequestKey(result.request) === checkRequestKey(formRequest);
  useEffect(() => {
    setForm((previous) => ({
      ...previous,
      careType: currentRequest?.careType ?? previous.careType ?? "short_term",
      pickup: currentRequest?.pickup ?? previous.pickup ?? null,
      date: currentRequest?.date ?? previous.date ?? "",
      deadline: currentRequest?.deadline ?? previous.deadline ?? "",
      end: currentRequest?.end ?? previous.end ?? "",
      age: currentRequest?.age ?? previous.age ?? "",
      transport: currentRequest?.transport ?? previous.transport ?? "",
    }));
  }, [requestKey]);
  const update = (field, value) => setForm((previous) => ({ ...previous, [field]: value }));
  const counts = result?.status === "ready" && resultMatches ? result.items.reduce((c, item) => { c[checkStatus(item).tone]++; return c; }, { supported: 0, unknown: 0, conflict: 0 }) : null;
  return <section className="saved-visit" aria-labelledby="saved-check-title">
    <div className="saved-visit-head">
      <h3 id="saved-check-title"><RefreshCw size={17} aria-hidden="true" />Check them for one visit</h3>
      {form.pickup && <p className="saved-visit-from"><MapPin size={15} aria-hidden="true" /><span>From <strong>{form.pickup.label}</strong></span><button type="button" className="text-link" onClick={onStartSearch}>Change</button></p>}
    </div>
    {!form.pickup ? <div className="saved-visit-empty">
      <p>Search with your starting point first. Then all {entries.length} saved centres can be checked at once.</p>
      <button className="secondary" type="button" onClick={onStartSearch}><Search size={16} aria-hidden="true" />Set up a search<ArrowRight size={15} aria-hidden="true" /></button>
    </div> : <form className="saved-visit-form" onSubmit={(event) => { event.preventDefault(); if (canCheck) onCheck(formRequest); }}>
      {short && <div className="saved-check-field"><span><CalendarDays size={15} aria-hidden="true" />Date</span><DateBox label="Date for all saved centres" value={form.date} onChange={(value) => update("date", value)} /></div>}
      <div className="saved-check-field"><span><Users size={15} aria-hidden="true" />Child’s age</span><SelectMenu label="Child’s age for all saved centres" value={form.age} options={[{ value: "", label: "Choose age" }, ...(["1-3", "4-6"].includes(form.age) ? [{ value: form.age, label: ageWords(form.age) }] : []), ...CHILD_AGES.map(([age]) => ({ value: age, label: ageWords(age) }))]} onChange={(value) => update("age", value)} /></div>
      {short && <>
        <div className="saved-check-field"><span><Clock3 size={15} aria-hidden="true" />Start</span><TimeInput variant="box" id="saved-check-start" label="Start time for all saved centres" pickerLabel="Start" value={form.deadline} suggest="09:00" onChange={(value) => update("deadline", value)} /></div>
        <div className="saved-check-field"><span><Clock3 size={15} aria-hidden="true" />End</span><TimeInput variant="box" id="saved-check-end" label="End time for all saved centres" pickerLabel="End" value={form.end} suggest="12:00" onChange={(value) => update("end", value)} /></div>
      </>}
      <button className="primary saved-visit-submit" type="submit" disabled={!canCheck || checking}>{checking ? <><RefreshCw size={16} className="spin" aria-hidden="true" />Checking…</> : <>Check all {entries.length}</>}</button>
    </form>}
    {form.pickup && !canCheck && <p className="saved-check-hint"><CircleHelp size={15} aria-hidden="true" />Choose an age{short ? ", date, start and end" : ""} to check every saved centre.</p>}
    {result?.status === "error" && <p className="error-box" role="alert">{result.error}</p>}
    {result?.status === "ready" && !resultMatches && <p className="saved-check-hint" role="status"><CircleHelp size={15} aria-hidden="true" />You changed the visit. Check again to update every saved centre.</p>}
    {counts && <p className="saved-visit-summary" role="status" aria-live="polite">
      <strong>Checked {result.items.length} of {entries.length}{result.request?.date ? ` for ${dateWords(result.request.date)}` : ""}</strong>
      {counts.supported > 0 && <span className="supported"><Check size={13} aria-hidden="true" />{counts.supported} match</span>}
      {counts.unknown > 0 && <span className="unknown"><CircleHelp size={13} aria-hidden="true" />{counts.unknown} to ask</span>}
      {counts.conflict > 0 && <span className="conflict"><AlertTriangle size={13} aria-hidden="true" />{counts.conflict} don’t match</span>}
    </p>}
    {counts && result.failed > 0 && <p className="notice">We couldn’t check {result.failed} centre{result.failed === 1 ? "" : "s"}. {result.failed === 1 ? "It is" : "They are"} still saved.</p>}
  </section>;
}

export function SavedLibrary({ library, failure, onRetry, onReopen, onEditFavourite, onDelete, onDiscover, onStartSearch = onDiscover, tab, setTab, suggestions, currentRequest, savedCheck, onCheckSaved, onOpenSaved }) {
  const entries = [...library.favourites].reverse().sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
  // Results of "Check all" for the visit currently in the bar, shown on each centre.
  const checked = savedCheck?.status === "ready" ? new Map(savedCheck.items.map((item) => [item.id, item])) : new Map();
  return <div className="saved-library">
    {failure && <div className="error-box" role="alert"><p>{failure}</p><button onClick={onRetry}>Try again</button></div>}
    <div className="saved-tabs" role="group" aria-label="Saved item type">
      <button aria-pressed={tab === "favourites"} onClick={() => setTab("favourites")}>Childcare <em>{library.favourites.length}</em></button>
      <button aria-pressed={tab === "suggestions"} onClick={() => setTab("suggestions")}>For you</button>
    </div>
    {tab === "suggestions" ? suggestions : <>
      {!entries.length && <div className="empty-state"><Bookmark size={30} /><h3>Save childcare you like</h3>
        <p>Select Save on any centre to keep it here.</p>
        <button className="primary" onClick={onDiscover}>Find childcare <ArrowRight size={16} /></button></div>}
      {entries.length > 1 && <SavedCheckPanel entries={entries} currentRequest={currentRequest} checking={savedCheck?.status === "checking"} result={savedCheck} onStartSearch={onStartSearch} onCheck={onCheckSaved} />}
      {entries.length > 0 && <ul className="saved-list" aria-label="Saved centres">{entries.map((item) => {
        const hit = checked.get(item.id), status = hit ? checkStatus(hit) : null;
        const listed = factDates(item.snapshot?.facts);
        return <li key={item.id}><article className="saved-row saved-item">
          <div className="saved-item-main">
            <h3>{displayName(item.name)}</h3>
            <p className="saved-item-meta">{[categoryLabel(item), placeLabel(item)].filter(Boolean).join(" · ")}<span aria-hidden="true"> · </span><span title={listed}>Saved {dateLabel(item.savedAt?.slice(0, 10)) ?? ""}</span></p>
            {item.reason && <p className="saved-item-note"><StickyNote size={14} aria-hidden="true" /><span>{item.reason}</span></p>}
          </div>
          {status && <span className={`saved-item-status ${status.tone}`}><StatusIcon tone={status.tone} />{status.label}</span>}
          <div className="saved-item-actions">
            <button className="secondary saved-item-open" onClick={() => hit ? onOpenSaved(hit, savedCheck.request) : onReopen(item)}>{hit ? "View details" : "Check this centre"}<ArrowRight size={15} aria-hidden="true" /></button>
            <button className="saved-item-tool" aria-label={`Edit ${item.name}`} title={item.reason ? "Edit note" : "Add a note"} onClick={() => onEditFavourite(item)}><Pencil size={15} aria-hidden="true" /><span>{item.reason ? "Note" : "Add note"}</span></button>
            <button className="saved-item-tool" aria-label={`Remove ${item.name}`} title="Remove" onClick={() => onDelete("favourites", item.id)}><Trash2 size={15} aria-hidden="true" /><span>Remove</span></button>
          </div>
        </article></li>;
      })}</ul>}
    </>}
    <SaveExplanation />
  </div>;
}
export function FavouriteEditor({ p, existing, onSave, onCancel }) {
  const [reason, setReason] = useState(existing?.reason ?? ""),
    [error, setError] = useState("");
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const result = onSave(favourite(p, reason, existing));
        if (result) onCancel();
        else
          setError(
            "We couldn’t save this. Your earlier saved details are unchanged. Please try again.",
          );
      }}
    >
      <p className="dialog-lead">{p.name}</p>
      <label className="field">
        Add a note{" "}
        <span className="notice">
          Optional. Don’t add names, phone numbers or details about your child.
        </span>
        <textarea
          value={reason}
          maxLength={180}
          rows={3}
          onChange={(e) => setReason(e.target.value)}
          placeholder="For example: near work"
        />
      </label>
      {error && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      <div className="saved-actions">
        <button className="primary" type="submit">
          <Save size={16} />
          {existing ? "Save note" : "Save centre"}
        </button>
        <button type="button" onClick={onCancel}>
          Back
        </button>
      </div>
    </form>
  );
}
export function SavedChanges({ saved, current, failure, onUpdate }) {
  const changes = compareFacts(saved.snapshot, current);
  return (
    <section className="saved-changes">
      <div className="section-kicker">Since you saved this centre</div>
      <h3>
        {failure
          ? "We couldn’t check the latest details"
          : !changes.comparable
            ? "No earlier details to compare"
            : changes.changes.length
              ? `${changes.changes.length} ${changes.changes.length === 1 ? "detail has" : "details have"} changed`
              : "The details we checked haven’t changed"}
      </h3>
      <p className="notice">
        Saved {dateLabel(saved.snapshot?.capturedAt?.slice(0, 10)) ?? "on an unknown date"}.{" "}
        {current
          ? `Checked again ${dateLabel(current.capturedAt?.slice(0, 10))}.`
          : "Your saved details are still here."}{" "}
        These dates show when we read the sources, not when the centre
        changed anything.
      </p>
      {failure && (
        <p className="error-box">
          {failure} Your saved details are still here, but we can’t tell whether they’ve changed.
        </p>
      )}
      {!changes.comparable && (
        <p>There isn’t an earlier saved version to compare with.</p>
      )}
      {!!changes.uncompared?.length && <p className="notice">We don’t have earlier details for: {changes.uncompared.join(', ')}.</p>}
      {changes.changes.map((c) => (
        <div className="fact-change" key={c.key}>
          <h4>{c.label}</h4>
          <div>
            <section>
              <small>When you saved</small>
              <p>{factDescription(c.before)}</p>
              <small>{factDates(c.before)}</small>
            </section>
            <section>
              <small>Now</small>
              <p>{factDescription(c.after)}</p>
              <small>{factDates(c.after)}</small>
            </section>
          </div>
        </div>
      ))}
      {current && (
        <button className="text-link" onClick={onUpdate}>
          Update saved details
        </button>
      )}
    </section>
  );
}
