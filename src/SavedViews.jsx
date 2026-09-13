import { useState } from "react";
import { Bookmark, ArrowRight, Trash2, Pencil, Save } from "lucide-react";
import PlaceInput from "./PlaceInput.jsx";
import TimeInput from "./TimeInput.jsx";
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
      <summary>About your saved items</summary>
      <p>
        Your saved childcare, notes and searches stay in this browser.
        Searches keep your public pickup place, care times and pickup preference.
        Dates and child ages aren’t saved.
      </p>
      <p>
        Clearing browser data can remove these items. They won’t appear on
        your other devices.
      </p>
    </details>
  );
}
export function SavedSearchReminder({ templates, onReuse, onChoose, disabled }) {
  if (!templates.length) return null;
  const single = templates.length === 1;
  return <section className="saved-search-reminder" aria-label="Saved search reminder">
    <div className="saved-search-reminder-heading"><Bookmark size={17} aria-hidden="true" />
      <strong>{single ? "Your saved search" : `${templates.length} saved searches`}</strong>
    </div>
    <p>{single ? <>Use <strong>{templates[0].name}</strong> with a new date.</> : "Reuse your pickup place and care times with a new date."}</p>
    <button type="button" className="text-link" disabled={disabled} onClick={() => single ? onReuse(templates[0]) : onChoose()}>
      {single ? "Use this search" : "Choose a saved search"}<ArrowRight size={15} aria-hidden="true" />
    </button>
  </section>;
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
        {tab === "favourites"
          ? "Your favourite childcare, ready to check for a new date."
          : "Your pickup place and care times, ready to use again. Just choose a new date."}
      </p>
      {failure && (
        <div className="error-box" role="alert">
          <p>{failure}</p>
          <button onClick={onRetry}>Try again</button>
        </div>
      )}
      <div className="saved-tabs" role="group" aria-label="Saved item type">
        <button
          aria-pressed={tab === "favourites"}
          onClick={() => setTab("favourites")}
        >
          Childcare <em>{library.favourites.length}</em>
        </button>
        <button
          aria-pressed={tab === "templates"}
          onClick={() => setTab("templates")}
        >
          Searches <em>{library.templates.length}</em>
        </button>
      </div>
      {!entries.length && (
        <div className="empty-state">
          <Bookmark size={30} />
          <h3>
            {tab === "favourites"
              ? "Save childcare you like"
              : "No saved searches yet"}
          </h3>
          <p>
            {tab === "favourites"
              ? "Tap Save on any childcare option to keep it here."
              : "Choose Save this search on Find childcare to keep your pickup place and care times."}
          </p>
          <button className="primary" onClick={onDiscover}>
            Find childcare <ArrowRight size={16} />
          </button>
        </div>
      )}
      {entries.map((item) => (
        <article className="saved-row" key={item.id}>
          {tab === "favourites" && <div className="section-kicker">{item.category} · {item.region}</div>}
          <h3>{item.name}</h3>
          {tab === "favourites" ? (
            <>
              {item.reason && <p>{item.reason}</p>}
              <small>
                Saved {item.savedAt?.slice(0, 10)}
              </small>
              <details className="saved-source-dates"><summary>When were these details checked?</summary>
                <small>Details saved {item.snapshot?.capturedAt?.slice(0, 10) ?? "date unavailable"}</small>
                <small>{factDates(item.snapshot?.facts)}</small>
              </details>
            </>
          ) : (
            <>
              <p className="saved-pickup"><span>Pickup place</span>{item.pickup?.label}</p>
              <dl className="saved-search-times">
                <div><dt>Collect by</dt><dd>{item.deadline || "Not set"}</dd></div>
                <div><dt>Care until</dt><dd>{item.end || "Not set"}</dd></div>
                <div><dt>Pickup option</dt><dd>{item.transport === "institution"
                  ? "Centre pickup"
                  : item.transport === "self"
                    ? "I’ll arrange transport"
                    : "Not specified"}</dd></div>
              </dl>
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
                : "Use this search"}{" "}
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
      <SaveExplanation />
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
        Search name{" "}
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
        <div className="field">
          <label htmlFor="template-deadline">Collect by</label>
          <TimeInput
            id="template-deadline"
            label="Template collect by"
            value={draft.deadline}
            onChange={(value) => field("deadline", value)}
            invalid={!!errors.deadline}
            describedBy={errors.deadline ? "template-deadline-error" : undefined}
          />
          {errors.deadline && (
            <small id="template-deadline-error" className="field-error">{errors.deadline}</small>
          )}
        </div>
        <div className="field">
          <label htmlFor="template-care-end">Care until</label>
          <TimeInput
            id="template-care-end"
            label="Template care until"
            value={draft.end}
            onChange={(value) => field("end", value)}
            invalid={!!errors.end}
            describedBy={errors.end ? "template-care-end-error" : undefined}
          />
          {errors.end && <small id="template-care-end-error" className="field-error">{errors.end}</small>}
        </div>
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
        Next time, your pickup place and times will be ready. Choose a new date
        and add your child’s age if needed.
      </p>
      {failure && (
        <p className="error-box" role="alert">
          {failure}
        </p>
      )}
      <div className="saved-actions">
        <button type="submit" className="primary">
          <Save size={16} />
          Save search
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
