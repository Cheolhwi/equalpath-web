import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, AlertCircle, LoaderCircle } from "lucide-react";

export default function SearchActions({ busy, results, dirty, failure, submitRef, reopening, compact = false }) {
  const state = busy ? "loading" : failure ? "failed" : dirty ? "pending" : results ? "applied" : "ready";
  const wasBusy = useRef(false);
  const confirmationTimer = useRef(null);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const completed = wasBusy.current && !busy && results && !dirty && !failure;
    wasBusy.current = busy;
    if (completed) {
      setConfirmed(true);
      window.clearTimeout(confirmationTimer.current);
      confirmationTimer.current = window.setTimeout(() => setConfirmed(false), 1200);
    } else if (busy || dirty || failure) {
      window.clearTimeout(confirmationTimer.current);
      setConfirmed(false);
    }
  }, [busy, dirty, failure, results]);
  useEffect(() => () => window.clearTimeout(confirmationTimer.current), []);
  const title = {
    loading: results ? "Updating results…" : "Finding childcare…",
    failed: "Results not updated",
    pending: "Changes not applied",
    applied: "Results up to date",
    ready: reopening ? "Check saved centre" : "Choose your options",
  }[state];
  const hint = {
    loading: "Please wait.",
    failed: "Try again to use these choices.",
    pending: "Update to use these choices.",
    applied: "",
    ready: reopening ? "Then check this centre." : "Then find childcare.",
  }[state];
  const actionText = busy ? results ? "Updating…" : "Searching…" : confirmed ? "Updated" : failure ? "Try again" : reopening ? "Check saved centre" : results ? "Update results" : "Find childcare";
  const actionLabel = confirmed ? "Results updated" : failure ? "Retry search" : busy ? (results ? "Updating results" : "Finding childcare") : reopening ? "Check saved centre" : results ? "Update results" : "Find childcare";
  const showAction = !results || dirty || failure || busy || confirmed || reopening;
  return <div className="search-actions" data-state={state} data-confirmed={confirmed || undefined}>
    <span className="search-apply-status sr-only" id="search-apply-status" role="status" aria-live="polite" aria-atomic="true">{title}{hint ? ` ${hint}` : ""}</span>
    {showAction && <button ref={submitRef} type="submit" className={`primary ${compact ? "dock-find" : "find-button"}`} disabled={busy} aria-label={actionLabel} aria-describedby="search-apply-status">
      {busy && <LoaderCircle className="search-action-spinner" size={18} aria-hidden="true" />}
      {confirmed && <Check className="search-confirm-icon" size={18} aria-hidden="true" />}
      {failure && !busy && !confirmed && <AlertCircle className="search-failure-icon" size={18} aria-hidden="true" />}
      <span>{actionText}</span>{!busy && !confirmed && <ArrowRight size={18} aria-hidden="true" />}
    </button>}
  </div>;
}
