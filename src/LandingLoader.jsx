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
        <div className="landing-loader-wordmark">EQUALPATH</div>
        <p role="status" aria-live="polite">Find childcare that fits your day.</p>
        {(slow || state === "error") && <div className="landing-loader-help">
          {state === "error" && <p role="alert">Something didn’t load. Please try again.</p>}
          <p>You can still find childcare below.</p>
          {state === "error" && <button onClick={onRetry}>Try again</button>}
        </div>}
      </div>
    </div>
  );
}
