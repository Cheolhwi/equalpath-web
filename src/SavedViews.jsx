import { useEffect, useState } from "react";
import { displayName, placeLabel, categoryLabel, dateLabel } from "../shared/display.mjs";
import { Bookmark, ArrowRight, Trash2, Pencil, Save, CalendarDays, Clock3, Users, RefreshCw, Check, CircleHelp } from "lucide-react";
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

export function SavedCheckPanel({ entries, currentRequest, checking, result, onStartSearch, onCheck, onOpen }) {
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
  return <section className="saved-check-panel" aria-labelledby="saved-check-title">
    <div className="saved-check-heading">
      <span className="saved-check-icon"><RefreshCw size={19} aria-hidden="true" /></span>
      <div>
        <h3 id="saved-check-title">Check all saved centres</h3>
        <p>Use one date and time for all {entries.length} saved {entries.length === 1 ? "centre" : "centres"}.</p>
      </div>
    </div>
    {!form.pickup ? <div className="saved-check-empty">
      <p>Search with your starting point first. Then we can check all your saved centres at once.</p>
      <button className="secondary" type="button" onClick={onStartSearch}><SearchIcon />Set up a search <ArrowRight size={15} /></button>
    </div> : <>
      <div className="saved-check-location"><Bookmark size={16} aria-hidden="true" /><span>{form.pickup.label}</span><button type="button" className="text-link" onClick={onStartSearch}>Change</button></div>
      <form className="saved-check-form" onSubmit={(event) => { event.preventDefault(); if (canCheck) onCheck(formRequest); }}>
        {short && <label className="saved-check-field"><span><CalendarDays size={16} aria-hidden="true" />Date</span><input aria-label="Date for all saved centres" type="date" value={form.date} onChange={(event) => update("date", event.target.value)} /></label>}
        <div className="saved-check-field"><span><Users size={16} aria-hidden="true" />Child’s age</span><SelectMenu label="Child’s age for all saved centres" value={form.age} options={[{ value: "", label: "Choose age" }, ...(["1-3", "4-6"].includes(form.age) ? [{ value: form.age, label: ageWords(form.age) }] : []), ...CHILD_AGES.map(([age]) => ({ value: age, label: ageWords(age) }))]} onChange={(value) => update("age", value)} /></div>
        {short && <>
          <div className="saved-check-field"><span><Clock3 size={16} aria-hidden="true" />Start time</span><TimeInput variant="box" id="saved-check-start" label="Start time for all saved centres" pickerLabel="Start" value={form.deadline} suggest="09:00" onChange={(value) => update("deadline", value)} /></div>
          <div className="saved-check-field"><span><Clock3 size={16} aria-hidden="true" />End time</span><TimeInput variant="box" id="saved-check-end" label="End time for all saved centres" pickerLabel="End" value={form.end} suggest="12:00" onChange={(value) => update("end", value)} /></div>
        </>}
        <button className="primary saved-check-submit" type="submit" disabled={!canCheck || checking}>{checking ? <><RefreshCw size={16} className="spin" />Checking saved centres…</> : <><Check size={16} />Check all saved centres</>}</button>
      </form>
      {!canCheck && <p className="saved-check-hint"><CircleHelp size={15} aria-hidden="true" />Choose an age{short ? ", date, start time and end time" : ""} to check every saved centre.</p>}
    </>}
    {result?.status === "error" && <p className="error-box" role="alert">{result.error}</p>}
    {result?.status === "ready" && !resultMatches && <p className="saved-check-hint" role="status"><CircleHelp size={15} aria-hidden="true" />You changed the plan. Check again to update every saved centre.</p>}
    {result?.status === "ready" && resultMatches && <div className="saved-check-results" aria-live="polite">
      <div className="saved-check-result-heading"><strong>Checked {result.items.length} of {entries.length} saved {entries.length === 1 ? "centre" : "centres"}</strong><small>{result.checkedAt ? `Just checked${result.request?.date ? ` · for ${dateLabel(result.request.date)}` : ""}` : ""}</small></div>
      {result.failed > 0 && <p className="notice">We couldn’t check {result.failed} centre{result.failed === 1 ? "" : "s"}. {result.failed === 1 ? "It is" : "They are"} still saved.</p>}
      <div className="saved-check-result-list">{result.items.map((item) => { const status = checkStatus(item); return <div className="saved-check-result" key={item.id}>
        <div><strong>{displayName(item.name)}</strong><span className={`saved-check-status ${status.tone}`}><span aria-hidden="true">{status.tone === "supported" ? "✓" : status.tone === "unknown" ? "?" : "!"}</span>{status.label}</span></div>
        <button className="text-link" type="button" onClick={() => onOpen(item, result.request)}>View details <ArrowRight size={14} /></button>
      </div>; })}</div>
    </div>}
  </section>;
}
function SearchIcon() { return <Search size={16} aria-hidden="true" />; }

export function SavedLibrary({ library, failure, onRetry, onReopen, onEditFavourite, onDelete, onDiscover, onStartSearch = onDiscover, tab, setTab, suggestions, currentRequest, savedCheck, onCheckSaved, onOpenSaved }) {
  const entries = [...library.favourites].reverse().sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
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
      {entries.map(item => <article className="saved-row" key={item.id}>
        <div className="section-kicker">{[categoryLabel(item), placeLabel(item)].filter(Boolean).join(" · ")}</div><h3>{displayName(item.name)}</h3>
        {item.reason && <p>{item.reason}</p>}<small className="saved-dates">Saved {dateLabel(item.savedAt?.slice(0, 10)) ?? ""} · details {factDates(item.snapshot?.facts).replace(/^Checked/, "checked")}</small>
        <div className="saved-actions">
          <button className="secondary" onClick={() => onReopen(item)}>Check this centre <ArrowRight size={15} /></button>
          <button aria-label={`Edit ${item.name}`} onClick={() => onEditFavourite(item)}><Pencil size={15} />Edit</button>
          <button aria-label={`Remove ${item.name}`} onClick={() => onDelete("favourites", item.id)}><Trash2 size={15} />Remove</button>
        </div>
      </article>)}
      {entries.length > 1 && <SavedCheckPanel entries={entries} currentRequest={currentRequest} checking={savedCheck?.status === "checking"} result={savedCheck} onStartSearch={onStartSearch} onCheck={onCheckSaved} onOpen={onOpenSaved} />}
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
