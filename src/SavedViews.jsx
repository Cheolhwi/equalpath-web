import { useState } from "react";
import { Bookmark, ArrowRight, Trash2, Pencil, Save } from "lucide-react";
import {
  favourite,
  compareFacts,
  factDescription,
  factDates,
} from "../shared/saved.mjs";
import { isShortCare } from "../shared/request.mjs";

export function SaveExplanation() {
  return (
    <details className="save-explanation">
      <summary>About your saved items</summary>
      <p>
        Your saved childcare and notes stay in this browser.
        For you uses your saved centres and local viewing history to suggest other centres.
      </p>
      <p>
        Clearing browser data can remove these items. They won’t appear on
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
export function SavedLibrary({ library, failure, onRetry, onReopen, onEditFavourite, onDelete, onDiscover, tab, setTab, suggestions }) {
  const entries = [...library.favourites].reverse().sort((a, b) => (b.savedAt ?? "").localeCompare(a.savedAt ?? ""));
  return <div className="saved-library">
    {failure && <div className="error-box" role="alert"><p>{failure}</p><button onClick={onRetry}>Try again</button></div>}
    <div className="saved-tabs" role="group" aria-label="Saved item type">
      <button aria-pressed={tab === "favourites"} onClick={() => setTab("favourites")}>Childcare <em>{library.favourites.length}</em></button>
      <button aria-pressed={tab === "suggestions"} onClick={() => setTab("suggestions")}>For you</button>
    </div>
    {tab === "suggestions" ? suggestions : <>
      {!entries.length && <div className="empty-state"><Bookmark size={30} /><h3>Save childcare you like</h3>
        <p>Tap Save on any childcare option to keep it here.</p>
        <button className="primary" onClick={onDiscover}>Find childcare <ArrowRight size={16} /></button></div>}
      {entries.map(item => <article className="saved-row" key={item.id}>
        <div className="section-kicker">{item.category} · {item.region}</div><h3>{item.name}</h3>
        {item.reason && <p>{item.reason}</p>}<small>Saved {item.savedAt?.slice(0, 10)}</small>
        <details className="saved-source-dates"><summary>When were these details checked?</summary>
          <small>Details saved {item.snapshot?.capturedAt?.slice(0, 10) ?? "date unavailable"}</small><small>{factDates(item.snapshot?.facts)}</small></details>
        <div className="saved-actions">
          <button className="secondary" onClick={() => onReopen(item)}>{isShortCare(item) ? "Check for a new date" : "Check centre"} <ArrowRight size={15} /></button>
          <button aria-label={`Edit ${item.name}`} onClick={() => onEditFavourite(item)}><Pencil size={15} />Edit</button>
          <button aria-label={`Remove ${item.name}`} onClick={() => onDelete("favourites", item.id)}><Trash2 size={15} />Remove</button>
        </div>
      </article>)}
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
            "We couldn’t save this. Your previous saved details are unchanged. Please try again.",
          );
      }}
    >
      <p className="dialog-lead">{p.name}</p>
      <SaveExplanation />
      <label className="field">
        Add a note{" "}
        <span className="notice">
          Optional · no names, phone numbers or child details
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
      <div className="section-kicker">CHANGES SINCE YOU SAVED</div>
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
        Details saved {saved.snapshot?.capturedAt ?? "unavailable"}.{" "}
        {current
          ? `Latest check ${current.capturedAt}.`
          : "Your saved details are still here."}{" "}
        The check date shows when we read the source, not when the centre
        last updated it.
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
              <small>SAVED</small>
              <p>{factDescription(c.before)}</p>
              <small>{factDates(c.before)}</small>
            </section>
            <section>
              <small>CURRENT</small>
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
