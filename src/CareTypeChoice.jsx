import { useId } from "react";
export default function CareTypeChoice({ value, onChange }) {
  const name = useId();
  return <fieldset className="care-type-choice">
    <legend>Need care for a few hours?</legend>
    <div>{[["regular", "No, regular care"], ["short_term", "Yes, short-term care"]].map(([key, label]) =>
      <label key={key} className={value === key ? "selected" : ""}>
        <input type="radio" name={name} value={key} checked={value === key} onChange={() => onChange(key)} />
        <span>{label}</span>
      </label>)}</div>
  </fieldset>;
}
