import { ArrowRight, Check, Pencil, Search, AlertCircle, LoaderCircle } from "lucide-react";

export default function SearchActions({ busy, results, dirty, failure, submitRef, reopening, compact = false }) {
  const state = busy ? "loading" : failure ? "failed" : dirty ? "pending" : results ? "applied" : "ready";
  const Icon = { loading: LoaderCircle, failed: AlertCircle, pending: Pencil, applied: Check, ready: Search }[state];
  const title = { loading: results ? "Updating results…" : "Finding childcare…", failed: "Results not updated", pending: "Changes not applied", applied: "Results up to date", ready: "Choose your options" }[state];
  const hint = { loading: "Please wait.", failed: "Try again to use these choices.", pending: "Update to use these choices.", applied: "", ready: reopening ? "Then tap Check saved centre." : "Then tap Find care." }[state];
  const label = busy ? "Finding childcare" : reopening ? "Check saved centre" : results ? "Update results" : "Find childcare";
  return <div className="search-actions" data-state={state}>
    <div className="search-apply-status" id="search-apply-status" role="status" aria-live="polite" aria-atomic="true">
      <Icon size={18} aria-hidden="true" />
      <span><strong>{title}</strong>{hint && <small>{hint}</small>}</span>
    </div>
    <button ref={submitRef} type="submit" className={`primary ${compact ? "dock-find" : "find-button"}`} disabled={busy} aria-label={label} aria-describedby="search-apply-status">
      <span>{busy ? results ? "Updating…" : "Searching…" : reopening ? "Check saved centre" : results ? "Update results" : "Find care"}</span><ArrowRight size={18} aria-hidden="true" />
    </button>
  </div>;
}
