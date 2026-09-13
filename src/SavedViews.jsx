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
        Only items you choose to save: institution references, published fact
        snapshots and optional non-identifying reasons; template names, public
        pickup places, collection / care times and transport preferences.
      </p>
      <p>
        Service dates, child ages, identities and health information are not
        saved. Clearing browser data can remove these items. They do not sync or
        recover automatically on other browsers or devices.
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
        A familiar starting point. Choose a new date and check this occasion
        again.
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
          Institutions <em>{library.favourites.length}</em>
        </button>
        <button
          aria-pressed={tab === "templates"}
          onClick={() => setTab("templates")}
        >
          Request templates <em>{library.templates.length}</em>
        </button>
      </div>
      {!entries.length && (
        <div className="empty-state">
          <Bookmark size={30} />
          <h3>
            {tab === "favourites"
              ? "Keep a promising option."
              : "Save your usual starting point."}
          </h3>
          <p>
            {tab === "favourites"
              ? "Use Save on an institution’s card or details."
              : "Choose Save request template below the search form. Your date is always chosen afresh."}
          </p>
          <button className="primary" onClick={onDiscover}>
            Go to discovery <ArrowRight size={16} />
          </button>
        </div>
      )}
      {entries.map((item) => (
        <article className="saved-row" key={item.id}>
          <div className="section-kicker">
            {tab === "favourites"
              ? `${item.category} · ${item.region}`
              : "REUSABLE REQUEST"}
          </div>
          <h3>{item.name}</h3>
          {tab === "favourites" ? (
            <>
              <p>{item.reason || "No reason added."}</p>
              <small>
                Saved {item.savedAt?.slice(0, 10)} · Last snapshot{" "}
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
                  ? "Institutional pickup"
                  : item.transport === "self"
                    ? "Self-arranged delivery"
                    : "Transport unspecified"}
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
                ? "Reopen & check new date"
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
            "Not saved. The previous saved version is unchanged. Your institution is still available; retry or return.",
          );
      }}
    >
      <p className="dialog-lead">{p.name}</p>
      <SaveExplanation />
      <label className="field">
        Why keep this option?{" "}
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
          {existing ? "Update saved reason" : "Save institution"}
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
          "Not saved. The previous saved version is unchanged. Retry saving.",
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
          <option value="self">I'll arrange delivery</option>
          <option value="institution">Institutional pickup</option>
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
      <div className="section-kicker">SAVED OPTION / FACT REVIEW</div>
      <h3>
        {failure
          ? "Current facts could not be refreshed"
          : !changes.comparable
            ? "Earlier facts cannot be compared"
            : changes.changes.length
              ? `${changes.changes.length} published fact group${changes.changes.length === 1 ? " has" : "s have"} changed`
              : "No material differences in the compared facts"}
      </h3>
      <p className="notice">
        Saved snapshot {saved.snapshot?.capturedAt ?? "unavailable"}.{" "}
        {current
          ? `Current snapshot checked ${current.capturedAt}.`
          : "Last saved dates are retained."}{" "}
        A successful retrieval does not mean the institution updated its
        information.
      </p>
      {failure && (
        <p className="error-box">
          {failure} Changes could not be checked; no unchanged claim is made.
        </p>
      )}
      {!changes.comparable && (
        <p>No comparable earlier fact snapshot is available.</p>
      )}
      {!!changes.uncompared?.length && <p className="notice">No comparable snapshot for: {changes.uncompared.join(', ')}.</p>}
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
          Keep this reviewed snapshot
        </button>
      )}
    </section>
  );
}
