import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, Bookmark, MapPin, Clock3, Search, CheckCircle2, Scale, MessageCircle, X } from "lucide-react";
import { tourPlacement } from "../shared/tour.mjs";
import "./tour.css";

const steps = [
  { title: "Find childcare on the map", icon: MapPin },
  { title: "Choose your location", target: ".dock-address-row", icon: MapPin, body: "Type an address, tap Choose your location to place a pin, or use your phone’s location." },
  { title: "Choose date, age and times", target: ".dock-options", icon: Clock3, body: "Go to childcare is when you leave this address. Pick up child is when you collect your child from the centre." },
  { title: "Your results are on the map", target: ".mobile-search-summary, .map-centre-card:not(.leaving)", icon: Search, body: "Tap a numbered pin to see a centre. On a phone, the search tools fold away. Tap Change search to edit them." },
  { title: "Save or compare a centre", target: ".map-centre-card:not(.leaving) .map-card-actions", icon: Bookmark, body: "Tap Save to keep a centre in Saved. Tap Compare to see up to 3 centres side by side. Tap Details to learn more." },
  { title: "Check the centre’s details", target: ".condition-list", icon: CheckCircle2, body: "Tap Details on a map card to see fees, ages and care hours. Ask the centre about any details that need checking." },
  { title: "Compare your choices", target: ".comparison-scroll", icon: Scale, body: "Add 2 or 3 centres, then tap Compare. Read their fees and services side by side." },
  { title: "Contact the centre", target: ".enquiry-contact", icon: MessageCircle, body: "Call or message to ask if they have a place for your child. You can copy the ready-made message. Nothing is sent for you." },
];
const visibleTarget = selector => selector && [...document.querySelectorAll(selector)].find(el => el.getClientRects().length);



export default function GettingStarted({ onClose, onStep, reduced }) {
  const [step, setStep] = useState(0),
    [layout, setLayout] = useState(() => ({ card: tourPlacement(null, { width: innerWidth, height: innerHeight }, 420), target: null })),
    [working, setWorking] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0);
  const dialog = useRef(null), card = useRef(null), heading = useRef(null);
  const current = steps[step], Icon = current.icon;
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    let alive = true;
    setWorking(true); setError("");
    Promise.resolve(onStep(step)).catch(() => { if (alive) setError("The example couldn’t load. Retry or skip the tour."); }).finally(() => { if (alive) setWorking(false); });
    return () => { alive = false; };
  }, [step, retry]);
  useEffect(() => {
    let frame = null;
    const update = () => {
      // Map markers can update every frame. Coalesce updates without continually
      // cancelling the measurement before it gets a chance to run.
      if (frame !== null) return;
      frame = requestAnimationFrame(() => {
        frame = null;
        const element = visibleTarget(current.target);
        const r = element?.getBoundingClientRect();
        const boundary = element?.closest(".dialog-body, .tour-behind, .discovery-panel, .map-wrap")?.getBoundingClientRect();
        const top = Math.max(8, r?.top ?? 0, boundary?.top ?? 0), left = Math.max(8, r?.left ?? 0, boundary?.left ?? 0);
        const right = Math.min(innerWidth - 8, r?.right ?? 0, boundary?.right ?? innerWidth), bottom = Math.min(innerHeight - 8, r?.bottom ?? 0, boundary?.bottom ?? innerHeight);
        const target = r && right > left && bottom > top ? { top, left, right, bottom, width: right - left, height: bottom - top } : null;
        setLayout({ target, card: tourPlacement(target, { width: innerWidth, height: innerHeight }, card.current?.offsetHeight ?? 360) });
      });
    };
    const start = requestAnimationFrame(() => {
      const el = visibleTarget(current.target);
      const panel = el?.closest(".discovery-panel");
      if (panel) {
        const r = el.getBoundingClientRect(), p = panel.getBoundingClientRect();
        panel.scrollTop += r.top - p.top - 20;
      }
      const detail = el?.closest(".dialog-body");
      if (detail) detail.scrollTop += el.getBoundingClientRect().top - detail.getBoundingClientRect().top - 20;
      heading.current?.focus({ preventScroll: true });
      card.current?.scrollTo({ top: 0 });
      update();
    });
    const observer = new ResizeObserver(update);
    if (card.current) observer.observe(card.current);
    const target = visibleTarget(current.target);
    if (target) observer.observe(target);
    const mapObserver = new MutationObserver(update);
    const map = document.querySelector(".map-wrap");
    if (map && (step === 3 || step === 4)) mapObserver.observe(map, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(start); cancelAnimationFrame(frame); observer.disconnect(); mapObserver.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step, current, working]);
  const next = () => step === steps.length - 1 ? onClose("completed") : setStep((s) => s + 1);
  return <dialog ref={dialog} className="tour-dialog" aria-labelledby="tour-title" aria-describedby="tour-description" data-step={step} data-reduced={reduced} onCancel={(e) => { e.preventDefault(); onClose("skipped"); }}>
    {layout.target ? <div className="tour-spotlight" aria-hidden="true" style={{ top: layout.target.top - 5, left: layout.target.left - 5, width: layout.target.width + 10, height: layout.target.height + 10 }} /> : <div className="tour-shade" aria-hidden="true" />}
    <section key={step} className="tour-card" ref={card} style={layout.card} data-stage={step}>
      <div className="tour-top"><span>QUICK TOUR {step > 0 && `／ ${String(step).padStart(2, "0")} OF ${String(steps.length - 1).padStart(2, "0")}`}</span><button aria-label="Skip tour" onClick={() => onClose("skipped")}><X size={18} /></button></div>
      {step > 0 && <div className="tour-progress" aria-label={`Step ${step} of ${steps.length - 1}`}>{steps.slice(1).map((_, i) => <span key={i} className={i < step ? "done" : ""} />)}</div>}
      <div className="tour-heading"><Icon size={23} aria-hidden="true" /><h2 id="tour-title" ref={heading} tabIndex={-1}>{current.title}</h2></div>
      <p id="tour-description">{step === 0 ? "Try a sample search on the map. Then save, compare and contact centres." : current.body}</p>
      {step === 0 && <><ol className="tour-route"><li><MapPin size={17} /><span>Choose an address & time</span></li><li><CheckCircle2 size={17} /><span>Check & compare centres</span></li><li><MessageCircle size={17} /><span>Contact the centre</span></li></ol><p className="tour-hint">About a minute. Skip anytime. Your search stays as it is.</p></>}
      {step > 0 && <p className="tour-hint">Example only · your search and saved centres stay unchanged.</p>}
      {working && <p className="tour-feedback" role="status">Running the example…</p>}
      {error && <p className="tour-error" role="alert">{error} <button className="text-link" onClick={() => setRetry((v) => v + 1)}>Retry example</button></p>}
      <div className="tour-actions"><button className="tour-back" onClick={() => step ? setStep((s) => s - 1) : onClose("skipped")}>{step ? <><ArrowLeft size={15}/>Back</> : "Skip"}</button><button className="primary" disabled={working || !!error} onClick={next}>{step === 0 ? "Show me around" : step === steps.length - 1 ? "Back to my map" : "Next"}<ArrowRight size={16}/></button></div>
    </section>
  </dialog>;
}
