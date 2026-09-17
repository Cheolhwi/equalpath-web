import { useId } from "react";

export default function AgeRangeChoice({ value, onChange, error, compact = false }) {
  const name = useId();
  return <fieldset id="age" className={`age-choice${compact ? " compact-age" : ""}`} tabIndex={-1} aria-label="Child’s age" aria-required="true" aria-invalid={!!error} aria-describedby={error ? "age-error" : undefined}>
    <legend>{compact ? "Age" : "Child’s age"}</legend>
    <div>{[["1-3", "1–3 years"], ["4-6", "4–6 years"]].map(([age, label]) =>
      <label key={age} className={value === age ? "selected" : ""}>
        <input type="radio" name={name} value={age} aria-label={label} checked={value === age} onChange={() => onChange(age)} required />
        <span>{compact ? age.replace("-", "–") : label}</span>
      </label>)}</div>
    {error && <small id="age-error" className="field-error">{error}</small>}
  </fieldset>;
}
