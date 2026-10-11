import { ArrowRight, ChevronLeft, ClipboardList, Users } from "lucide-react";
import { displayName } from "../shared/display.mjs";
import { preparationFor } from "../shared/preparation.mjs";
import Preparation, { FamilyPreparation, StatusChip, familyPacking } from "./Preparation.jsx";
import { useEnquiryStatus } from "./VirtualEnquiry.jsx";
import "./checklist.css";

/* Checklist (11 Oct 2026): a list of the plans the parent saved — one child
   or two — each opening the same kind of "get ready" page. Ticks are kept
   with each plan while the page is open. */
const dayLabel = (date) => { try { return new Date(`${date}T12:00:00+08:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kuala_Lumpur" }); } catch { return date; } };
function progress(entry) {
  const items = entry.kind === "family"
    ? familyPacking(entry).all
    : (() => { const s = preparationFor(entry.p, entry.request); return [...s.packing, ...s.published].map((x) => x.id); })();
  return { done: items.filter((id) => entry.checked.includes(id)).length, total: items.length };
}

export default function Checklist({ entries, openId, onOpen, onBack, onRemove, onToggle, onTimesChange, onContact, onFind }) {
  const statusOf = useEnquiryStatus();
  const active = entries.find((e) => e.id === openId) ?? (entries.length === 1 ? entries[0] : null);
  if (!entries.length) return <div className="empty-state checklist-empty">
    <ClipboardList size={34} aria-hidden="true" />
    <h3>Nothing to get ready yet</h3>
    <p>Open a plan on the map and choose <strong>Save to Checklist</strong>. It keeps your times for the day and what to bring.</p>
    <button className="primary" onClick={onFind}>Find childcare <ArrowRight size={16} /></button>
  </div>;
  if (active) {
    const status = (id) => statusOf(id, active.kind === "family" ? active.date : active.request.date);
    return <div className="checklist-detail">
      <div className="checklist-detail-bar">
        {entries.length > 1 ? <button className="family-back" onClick={onBack}><ChevronLeft size={18} aria-hidden="true" />All checklists · {entries.length}</button> : <span />}
        <button className="text-link checklist-remove" onClick={() => onRemove(active.id)}>Remove from Checklist</button>
      </div>
      {active.kind === "family"
        ? <FamilyPreparation entry={active} checked={active.checked} onToggle={(id) => onToggle(active.id, id)} statusFor={(id) => statusOf(id, active.date)} onContact={onContact} />
        : <Preparation key={active.id} p={active.p} request={active.request} checked={active.checked} onToggle={(id) => onToggle(active.id, id)}
            status={status(active.p.id)} onTimesChange={(times) => onTimesChange(active.id, times)} onEnquiry={() => onContact(active.p, active.request)} />}
    </div>;
  }
  return <div className="checklist-list">
    <p className="checklist-intro">Your saved plans. Open one to see the day and tick off what to bring.</p>
    <ul>{entries.map((e) => {
      const { done, total } = progress(e), date = e.kind === "family" ? e.date : e.request.date;
      const centres = e.kind === "family" ? [...new Map(e.items.map((it) => [it.p.id, it.p])).values()] : [e.p];
      const statuses = centres.map((p) => statusOf(p.id, date));
      const status = statuses.every((x) => x === "confirmed") ? "confirmed" : statuses.find((x) => x && x !== "confirmed") ?? (statuses.includes("confirmed") ? "replied" : null);
      return <li key={e.id}><button className="checklist-card" onClick={() => onOpen(e.id)}>
        <span className="checklist-card-icon" aria-hidden="true">{e.kind === "family" ? <Users size={20} /> : <ClipboardList size={20} />}</span>
        <span className="checklist-card-main">
          <strong>{e.kind === "family" ? e.title : displayName(e.p.name)}</strong>
          <small>{dayLabel(date)} · {e.kind === "family" ? `Two children · ${e.items.map((it) => `${it.request.deadline}–${it.request.end}`).filter((x, i, a) => a.indexOf(x) === i).join(" and ")}` : `${e.request.deadline}–${e.request.end}`}</small>
          <span className="checklist-card-meta"><StatusChip status={status} /><span className="checklist-card-progress"><progress value={done} max={total} aria-hidden="true" />{done} of {total} ready</span></span>
        </span>
        <ArrowRight size={18} aria-hidden="true" className="checklist-card-go" />
      </button></li>;
    })}</ul>
    <p className="checklist-note">Your Checklist stays while this page is open. Open a plan to print or download it.</p>
  </div>;
}
