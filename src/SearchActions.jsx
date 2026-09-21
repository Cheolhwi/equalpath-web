import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Pencil, Search, AlertCircle, LoaderCircle } from "lucide-react";

export default function SearchActions({ busy, results, dirty, failure, submitRef, reopening, compact = false }) {
  const state = busy ? "loading" : failure ? "failed" : dirty ? "pending" : results ? "applied" : "ready";
  const Icon = { loading: LoaderCircle, failed: AlertCircle, pending: Pencil, applied: Check, ready: Search }[state];
  const title = { loading: results ? "Updating results…" : "Finding childcare…", failed: "Results not updated", pending: "Changes not applied", applied: "Results up to date", ready: "Choose your options" }[state];
  const hint = { loading: "Please wait.", failed: "Try again to use these choices.", pending: "Update to use these choices.", applied: "", ready: reopening ? "Then tap Check saved centre." : "Then tap Find care." }[state];
  const label = busy ? "Finding childcare" : reopening ? "Check saved centre" : results ? "Update results" : "Find childcare";
  const wasBusy = useRef(false);
  const [confirmed, setConfirmed] = useState(false);
  useEffect(() => {
    const completed = wasBusy.current && !busy && results && !dirty && !failure;
    wasBusy.current = busy;
    if (completed) {
      setConfirmed(true);
      const timer = window.setTimeout(() => setConfirmed(false), 1600);
      return () => window.clearTimeout(timer);
    }
  }, [busy, dirty, failure, results]);
  const actionText = busy ? results ? "Updating…" : "Searching…" : confirmed ? "Updated" : reopening ? "Check saved centre" : results ? "Update results" : "Find care";
  const actionLabel = confirmed ? "Results updated" : label;
  return <div className="search-actions" data-state={state} data-confirmed={confirmed || undefined}>
    <div className="search-apply-status" id="search-apply-status" role="status" aria-live="polite" aria-atomic="true" title={title}>
      <span className="search-apply-mark" aria-hidden="true"><Icon size={18} /></span>
      <span className="search-apply-copy"><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
    </div>
    <button ref={submitRef} type="submit" className={`primary ${compact ? "dock-find" : "find-button"}`} disabled={busy} aria-label={actionLabel} aria-describedby="search-apply-status">
      {confirmed && <Check className="search-confirm-icon" size={18} aria-hidden="true" />}<span>{actionText}</span>{!confirmed && <ArrowRight size={18} aria-hidden="true" />}
    </button>
  </div>;
}
