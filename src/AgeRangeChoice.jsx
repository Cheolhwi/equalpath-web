import { useId } from "react";
import { CHILD_AGES } from "../shared/request.mjs";
import "./age-choice.css";

// How old is the child, in whole years: one row of short segments
// (Under 1 · 1 · 2 · 3 · 4 · 5 · 6). Used by the search form and the map dock,
// for one child or for each of two children (`who` names the child).
export const ageWords = (age) => age === "0" ? "Under 1 year" : `${String(age).replace("-", "–")} ${age === "1" ? "year" : "years"}`;

export default function AgeRangeChoice({ id = "age", value, onChange, error, compact = false, who = "" }) {
  const name = useId(), errorId = `${name}-error`;
  return <fieldset id={id || undefined} className={`age-choice age-years${compact ? " compact-age" : ""}`} tabIndex={id ? -1 : undefined}
    aria-label={who ? `${who}’s age in years` : undefined} aria-required="true" aria-invalid={!!error || undefined} aria-describedby={error ? errorId : undefined}>
    <legend>{who || (compact ? "Age" : "Child’s age")}{!who && <small> in years</small>}</legend>
    <div>{CHILD_AGES.map(([age, label]) =>
      <label key={age} className={value === age ? "selected" : ""}>
        <input type="radio" name={name} value={age} aria-label={who ? `${who}: ${ageWords(age)}` : ageWords(age)} checked={value === age} onChange={() => onChange(age)} />
        <span aria-hidden="true">{label}</span>
      </label>)}</div>
    {error && <small id={errorId} className="field-error">{error}</small>}
  </fieldset>;
}
