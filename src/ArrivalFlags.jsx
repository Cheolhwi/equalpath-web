import { useEffect, useId, useRef, useState } from "react";
import { Flag, Pencil, Trash2 } from "lucide-react";
import { FLAGS_KEY, FLAG_TYPES, NOTE_MAX, flagErrors, flagTypeLabel, flagsFor, removeFlag, upsertFlag } from "../shared/arrival-flags.mjs";
import { readArrivalFlags, writeArrivalFlags } from "./arrival-flag-store.js";
import "./arrival-flags.css";

const dayLabel = (iso) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(iso));

// Epic 7.5: the parent's own notes on arrival details that look wrong. Saved
// only in this browser, shown again whenever she opens this centre.
export default function ArrivalFlags({ p, items, request, onDone }) {
  const [all, setAll] = useState(() => readArrivalFlags());
  const [draft, setDraft] = useState(null);
  const [editing, setEditing] = useState(null);
  const [errors, setErrors] = useState({});
  const [failure, setFailure] = useState(null);
  const box = useRef(null), id = useId();
  const mine = flagsFor(all, p.id);
  useEffect(() => {
    if (!request) return;
    setDraft({ item: items.find((i) => i.id === request.item) ?? null, type: "", note: "" });
    setEditing(null); setErrors({}); setFailure(null);
    requestAnimationFrame(() => box.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }));
  }, [request]);
  // Another tab may change the same browser storage.
  useEffect(() => {
    const changed = (e) => { if (e.key === FLAGS_KEY) setAll(readArrivalFlags()); };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, []);
  // Fixing a field clears its message straight away.
  const change = (patch, field) => { setDraft((d) => ({ ...d, ...patch })); setErrors(({ [field]: _, ...rest }) => rest); };
  const finish = () => { setDraft(null); setEditing(null); setErrors({}); onDone?.(); };
  const save = (e) => {
    e.preventDefault();
    const issues = flagErrors(draft); setErrors(issues);
    if (Object.keys(issues).length) return;
    const next = upsertFlag(all, p, { ...draft, id: editing });
    if (!writeArrivalFlags(next)) { setFailure("Couldn’t save in this browser, so nothing changed. Your earlier flags are kept."); return; }
    setFailure(null); setAll(next); finish();
  };
  const remove = (flag) => {
    const next = removeFlag(all, flag.id);
    if (!writeArrivalFlags(next)) { setFailure("Couldn’t remove the flag in this browser, so nothing changed."); return; }
    setFailure(null); setAll(next);
    if (editing === flag.id) finish();
  };
  if (!mine.length && !draft) return null;
  return <section ref={box} className="arrival-flags" aria-labelledby={`${id}-title`}>
    <header><Flag size={17} aria-hidden="true" /><h3 id={`${id}-title`}>{mine.length ? `You flagged ${mine.length} ${mine.length === 1 ? "thing" : "things"} to check` : "Flag something to check"}</h3></header>
    {mine.length > 0 && <ul className="arrival-flag-list">{mine.map((f) => <li key={f.id} className={editing === f.id ? "editing" : ""}>
      <div><strong>{f.item.label}</strong><span>{flagTypeLabel(f.type)}</span><p>{f.note}</p><small>{f.updatedAt !== f.createdAt ? "Edited" : "Flagged"} {dayLabel(f.updatedAt)}</small></div>
      <div className="arrival-flag-actions">
        <button type="button" className="text-link" onClick={() => { setEditing(f.id); setDraft({ item: f.item, type: f.type, note: f.note }); setErrors({}); }} aria-label={`Edit flag: ${f.item.label}`}><Pencil size={14} aria-hidden="true" />Edit</button>
        <button type="button" className="text-link" onClick={() => remove(f)} aria-label={`Remove flag: ${f.item.label}`}><Trash2 size={14} aria-hidden="true" />Remove</button>
      </div>
    </li>)}</ul>}
    {draft && <form className="arrival-flag-form" onSubmit={save} noValidate aria-label={editing ? "Edit your flag" : "New flag"}>
      <label className="field"><span>What looks wrong?</span>
        <select value={draft.item?.id ?? ""} onChange={(e) => change({ item: items.find((i) => i.id === e.target.value) ?? null }, "item")} aria-invalid={!!errors.item}>
          <option value="">Choose</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.label}</option>)}
          {draft.item && !items.some((i) => i.id === draft.item.id) && <option value={draft.item.id}>{draft.item.label}</option>}
        </select>
        {errors.item && <small className="field-error">{errors.item}</small>}
      </label>
      <fieldset className="arrival-flag-types" aria-invalid={!!errors.type}><legend>What’s the problem?</legend>
        <div>{FLAG_TYPES.map(([key, label]) => <label key={key} className={draft.type === key ? "selected" : ""}>
          <input type="radio" name={`${id}-type`} value={key} checked={draft.type === key} onChange={() => change({ type: key }, "type")} /><span>{label}</span></label>)}</div>
        {errors.type && <small className="field-error">{errors.type}</small>}
      </fieldset>
      <label className="field"><span>Short note</span>
        <textarea rows={2} maxLength={NOTE_MAX} value={draft.note} placeholder="For example: the gate is on the side street" onChange={(e) => change({ note: e.target.value }, "note")} aria-invalid={!!errors.note} />
        <small className="arrival-flag-count">{draft.note.length} / {NOTE_MAX}</small>
        {errors.note && <small className="field-error">{errors.note}</small>}
      </label>
      <div className="arrival-flag-buttons"><button type="submit" className="primary">{editing ? "Save changes" : "Save flag"}</button><button type="button" className="secondary" onClick={finish}>Cancel</button></div>
    </form>}
    {failure && <p className="field-error" role="alert">{failure}</p>}
  </section>;
}
