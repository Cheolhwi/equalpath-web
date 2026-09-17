import { useId } from "react";
import { Clock3 } from "lucide-react";
export default function CareTypeChoice({ value, onChange }) {
  const name = useId();
  return <fieldset className="care-type-choice">
    <legend className="sr-only">Care type</legend>
    <div>{[["short_term", "Short time"], ["regular", "Long term"]].map(([key, label]) =>
      <label key={key} className={value === key ? "selected" : ""}>
        <input type="radio" name={name} value={key} aria-label={label} checked={value === key} onChange={() => onChange(key)} />
        {key === "short_term" && <Clock3 size={18} aria-hidden="true" />}
        <span>{label}</span>
      </label>)}</div>
  </fieldset>;
}
