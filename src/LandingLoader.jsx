import { useEffect, useState } from "react";

export default function LandingLoader({ state, onRetry }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    setSlow(false);
    if (state !== "loading") return;
    const timer = setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, [state]);
  if (state === "ready") return null;
  return (
    <div className="landing-loader" data-state={state}>
      <div className="landing-loader-center">
        <div className="landing-loader-cards" aria-hidden="true">
          <span /><span /><span />
        </div>
        <div className="landing-loader-wordmark" aria-hidden="true">EQUALPATH<span>／</span></div>
        <div className="landing-loader-line" aria-hidden="true"><span /></div>
        <p role="status" aria-live="polite">
          {state === "error" ? "The artwork couldn’t load." : "Loading artwork…"}
        </p>
        {(slow || state === "error") && <div className="landing-loader-help">
          <p>You can still find childcare below.</p>
          {state === "error" && <button onClick={onRetry}>Try again</button>}
        </div>}
      </div>
    </div>
  );
}
