import { useState } from "react";
import { Bookmark, ArrowRight, Trash2, Pencil, Save } from "lucide-react";
import PlaceInput from "./PlaceInput.jsx";
import {
  template,
  favourite,
  compareFacts,
  factDescription,
  factDates,
} from "../shared/saved.mjs";
import { requestErrors } from "../shared/request.mjs";

export function SaveExplanation() {
  return (
    <details className="save-explanation">
      <summary>What stays in this browser?</summary>
      <p>
        We save only what you choose: centres, their listed details, your
        notes and search templates with a public pickup place, times and
        transport preferences.
      </p>
      <p>
        Dates, child ages and personal or health details are not saved.
        Clearing browser data can remove these items. Saved items are only
        available in this browser, not on your other devices.
      </p>
    </details>
  );
}
export function SavedLibrary({
  library,
  failure,
  onRetry,
  onReuse,
  onReopen,
  onEditFavourite,
  onEditTemplate,
  onDelete,
  onDiscover,
  tab,
  setTab,
}) {
  const entries = library[tab];
  return (
    <div className="saved-library">
      <p className="dialog-lead">
        Pick up where you left off. Choose a new date when you reuse a
        saved centre or search.
      </p>
      <SaveExplanation />
      {failure && (
        <div className="error-box" role="alert">
          <p>{failure}</p>
          <button onClick={onRetry}>Retry saved items</button>
        </div>
      )}
      <div className="saved-tabs" role="group" aria-label="Saved item type">
        <button
          aria-pressed={tab === "favourites"}
          onClick={() => setTab("favourites")}
        >
          Centres <em>{library.favourites.length}</em>
        </button>
        <button
          aria-pressed={tab === "templates"}
          onClick={() => setTab("templates")}
        >
          Saved searches <em>{library.templates.length}</em>
        </button>
      </div>
      {!entries.length && (
        <div className="empty-state">
          <Bookmark size={30} />
          <h3>
            {tab === "favourites"
              ? "No saved centres yet"
              : "No saved searches yet"}
          </h3>
          <p>
            {tab === "favourites"
              ? "Tap Save on a centre to find it here next time."
              : "Use Save request template below the search form. You’ll choose a new date each time."}
          </p>
          <button className="primary" onClick={onDiscover}>
            Find childcare <ArrowRight size={16} />
          </button>
        </div>
      )}
      {entries.map((item) => (
        <article className="saved-row" key={item.id}>
          <div className="section-kicker">
            {tab === "favourites"
              ? `${item.category} · ${item.region}`
              : "SAVED SEARCH"}
          </div>
          <h3>{item.name}</h3>
          {tab === "favourites" ? (
            <>
              <p>{item.reason || "No note added."}</p>
              <small>
                Saved {item.savedAt?.slice(0, 10)} · Details saved{" "}
                {item.snapshot?.capturedAt?.slice(0, 10) ?? "unavailable"}
              </small>
              <small>{factDates(item.snapshot?.facts)}</small>
            </>
          ) : (
            <>
              <p>{item.pickup?.label}</p>
              <small>
                Collect by {item.deadline || "not set"} · care until{" "}
                {item.end || "not set"} ·{" "}
                {item.transport === "institution"
                  ? "Centre pickup"
                  : item.transport === "self"
                    ? "I’ll arrange transport"
                    : "Pickup not specified"}
              </small>
            </>
          )}
          <div className="saved-actions">
            <button
              className="secondary"
              onClick={() =>
                tab === "favourites" ? onReopen(item) : onReuse(item)
              }
            >
              {tab === "favourites"
                ? "Check for a new date"
                : "Use template"}{" "}
              <ArrowRight size={15} />
            </button>
            <button
              aria-label={`Edit ${item.name}`}
              onClick={() =>
                tab === "favourites"
                  ? onEditFavourite(item)
                  : onEditTemplate(item)
              }
            >
              <Pencil size={15} /> Edit
            </button>
            <button
              aria-label={`Remove ${item.name}`}
              onClick={() => onDelete(tab, item.id)}
            >
              <Trash2 size={15} /> Remove
            </button>
          </div>
        </article>
      ))}
    </div>
  );
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
          placeholder="For example: convenient location"
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
export function TemplateEditor({ value, mode, onSave, onCancel }) {
  const [draft, setDraft] = useState(value),
    [name, setName] = useState(value.name ?? "Usual pickup"),
    [errors, setErrors] = useState({}),
    [failure, setFailure] = useState("");
  const field = (key, v) => {
    setDraft((d) => ({ ...d, [key]: v }));
    setErrors((x) => ({ ...x, [key]: null }));
  };
  const submit = (e) => {
    e.preventDefault();
    const issues = requestErrors({ ...draft, date: "2030-01-01", age: "" });
    setErrors(issues);
    if (Object.keys(issues).length) return;
    try {
      if (onSave(template(draft, name, value.id))) onCancel();
      else
        setFailure(
          "We couldn’t save this. Your previous saved details are unchanged. Please try again.",
        );
    } catch (err) {
      setFailure(err.message);
    }
  };
  return (
    <form className="template-editor" onSubmit={submit} noValidate>
      <SaveExplanation />
      <label className="field">
        Template name{" "}
        <input
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          placeholder="Usual pickup"
        />
      </label>
      <PlaceInput
        idPrefix="template-pickup"
        mode={mode}
        value={draft.pickup}
        onChange={(p) => field("pickup", p)}
        error={errors.pickup}
      />
      <div className="field-pair">
        <label className="field">
          Collect by
          <input
            type="time"
            aria-label="Template collect by"
            value={draft.deadline}
            onChange={(e) => field("deadline", e.target.value)}
            aria-invalid={!!errors.deadline}
          />
          {errors.deadline && (
            <small className="field-error">{errors.deadline}</small>
          )}
        </label>
        <label className="field">
          Care until
          <input
            type="time"
            aria-label="Template care until"
            value={draft.end}
            onChange={(e) => field("end", e.target.value)}
            aria-invalid={!!errors.end}
          />
          {errors.end && <small className="field-error">{errors.end}</small>}
        </label>
      </div>
      <label className="field">
        Pickup preference
        <select
          value={draft.transport}
          onChange={(e) => field("transport", e.target.value)}
        >
          <option value="">Not specified</option>
          <option value="self">I'll arrange transport</option>
          <option value="institution">Centre pickup</option>
        </select>
      </label>
      <p className="notice">
        Public pickup and preferences only. Choose the service date and optional
        age again when you use this template.
      </p>
      {failure && (
        <p className="error-box" role="alert">
          {failure}
        </p>
      )}
      <div className="saved-actions">
        <button type="submit" className="primary">
          <Save size={16} />
          Save template
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
