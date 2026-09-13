import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowLeft, Check, MapPin, Clock3, Search, CheckCircle2, Scale, MessageCircle, X } from "lucide-react";
import { tourPlacement } from "../shared/tour.mjs";
import "./tour.css";

const steps = [
  { title: "Find care in a few steps", icon: MapPin },
  { title: "Choose a pickup place", target: ".pickup-field", icon: MapPin, body: "Search an address, station or landmark. Short names and small typos work too. You can also choose a point on the map." },
  { title: "Set your care hours", target: "[data-tour='care-times']", icon: Clock3, body: "Choose a date. Collect by is the latest pickup time; Care until is when you’ll collect your child from the new centre. Age and pickup preference are optional." },
  { title: "Explore nearby centres", target: ".map-canvas", icon: Search, body: "Select a pin or a centre in the list. Add your care details, then choose Check conditions to see whether it fits." },
  { title: "Read the condition checks", target: ".condition-list", icon: CheckCircle2, body: "We’ve opened an example centre. Green means a detail matches; red means a conflict. Amber means you need to ask the centre. Open the source links when you want to check the evidence." },
  { title: "Compare your options", target: ".comparison-scroll", icon: Scale, body: "We’ve added two examples to Compare. Look across the columns to compare hours, distance, fees and pickup. In your own search, use + Compare to select up to three centres." },
  { title: "Get ready to contact", target: ".question-list", icon: MessageCircle, body: "These questions come from the selected centre and your care details. Choose what to ask and copy the list. Use the centre’s listed phone or WhatsApp when you’re ready. You can also save it or create a pickup checklist." },
];


export default function GettingStarted({ onClose, onStep, reduced }) {
  const [step, setStep] = useState(0), [picked, setPicked] = useState(false),
    [layout, setLayout] = useState(() => ({ card: tourPlacement(null, { width: innerWidth, height: innerHeight }, 420), target: null })),
    [working, setWorking] = useState(false), [error, setError] = useState(""), [retry, setRetry] = useState(0), [previewColumn, setPreviewColumn] = useState(0);
  const dialog = useRef(null), card = useRef(null), heading = useRef(null);
  const current = steps[step], Icon = current.icon;
  useEffect(() => { if (step !== 5) setPreviewColumn(0); }, [step]);
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
    let frame;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const element = current.target ? document.querySelector(current.target) : null;
        const r = element?.getBoundingClientRect();
        const boundary = element?.closest(".tour-behind, .discovery-panel, .map-wrap")?.getBoundingClientRect();
        const top = Math.max(8, r?.top ?? 0, boundary?.top ?? 0), left = Math.max(8, r?.left ?? 0, boundary?.left ?? 0);
        const right = Math.min(innerWidth - 8, r?.right ?? 0, boundary?.right ?? innerWidth), bottom = Math.min(innerHeight - 8, r?.bottom ?? 0, boundary?.bottom ?? innerHeight);
        const target = r && right > left && bottom > top ? { top, left, right, bottom, width: right - left, height: bottom - top } : null;
        setLayout({ target, card: tourPlacement(target, { width: innerWidth, height: innerHeight }, card.current?.offsetHeight ?? 360) });
      });
    };
    const start = requestAnimationFrame(() => {
      const el = current.target ? document.querySelector(current.target) : null;
      const panel = el?.closest(".discovery-panel");
      if (panel) {
        const r = el.getBoundingClientRect(), p = panel.getBoundingClientRect();
        panel.scrollTop += r.top - p.top - 20;
      }
      const detail = el?.closest(".tour-behind");
      if (detail) detail.scrollTop += el.getBoundingClientRect().top - detail.getBoundingClientRect().top - 20;
      heading.current?.focus({ preventScroll: true });
      card.current?.scrollTo({ top: 0 });
      update();
    });
    const observer = new ResizeObserver(update);
    if (card.current) observer.observe(card.current);
    const target = current.target && document.querySelector(current.target);
    if (target) observer.observe(target);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => { cancelAnimationFrame(start); cancelAnimationFrame(frame); observer.disconnect(); window.removeEventListener("resize", update); window.removeEventListener("scroll", update, true); };
  }, [step, current, working]);
  const next = () => step === steps.length - 1 ? onClose("completed") : setStep((s) => s + 1);
  return <dialog ref={dialog} className="tour-dialog" aria-labelledby="tour-title" aria-describedby="tour-description" data-step={step} data-reduced={reduced} onCancel={(e) => { e.preventDefault(); onClose("skipped"); }}>
    {layout.target ? <div className="tour-spotlight" aria-hidden="true" style={{ top: layout.target.top - 5, left: layout.target.left - 5, width: layout.target.width + 10, height: layout.target.height + 10 }} /> : <div className="tour-shade" aria-hidden="true" />}
    <section key={step} className="tour-card" ref={card} style={layout.card} data-stage={step}>
      <div className="tour-top"><span>QUICK TOUR {step > 0 && `／ ${String(step).padStart(2, "0")} OF 06`}</span><button aria-label="Skip tour" onClick={() => onClose("skipped")}><X size={18} /></button></div>
      {step > 0 && <div className="tour-progress" aria-label={`Step ${step} of 6`}>{steps.slice(1).map((_, i) => <span key={i} className={i < step ? "done" : ""} />)}</div>}
      <div className="tour-icon"><Icon size={24} strokeWidth={1.4} /></div>
      <h2 id="tour-title" ref={heading} tabIndex={-1}>{current.title}</h2>
      <p id="tour-description">{step === 0 ? "We’ll fill in sample details and run through finding, comparing and contacting childcare. Then you can start your own search." : current.body}</p>
      {step === 0 && <><ol className="tour-route"><li><MapPin size={17} /><span>Choose a place & time</span></li><li><CheckCircle2 size={17} /><span>Check & compare centres</span></li><li><MessageCircle size={17} /><span>Prepare your questions</span></li></ol><p className="tour-hint">About a minute. Skip anytime. Your search stays as it is.</p></>}
      {step === 1 && <div className="tour-example"><small>TRY AN EXAMPLE</small><div className="tour-search-example"><Search size={15} />KL sentrl</div><button className="tour-place-example" onClick={() => setPicked(true)} aria-pressed={picked}><MapPin size={17} /><span><strong>KL Sentral</strong><small>Kuala Lumpur</small></span>{picked ? <Check size={17} /> : <ArrowRight size={17} />}</button>{picked && <p className="tour-feedback" role="status">Place selected. Next, choose your hours.</p>}</div>}
      {step === 2 && <div className="tour-example"><small>EXAMPLE · SAME DAY</small><div className="tour-times"><div><small>Collect by</small><strong>13:00</strong><span>Pick up from the first place</span></div><ArrowRight size={18}/><div><small>Care until</small><strong>18:00</strong><span>Collect from the new centre</span></div></div></div>}
      {working && <p className="tour-feedback" role="status">Running the example…</p>}
      {error && <p className="tour-error" role="alert">{error} <button className="text-link" onClick={() => setRetry((v) => v + 1)}>Retry example</button></p>}
      {step === 5 && !working && !error && <div className="tour-mobile-columns">{["Centre 1", "Centre 2"].map((label, i) => <button key={label} className="secondary" aria-pressed={previewColumn === i} onClick={() => {
        setPreviewColumn(i);
        const table = document.querySelector(".tour-behind .comparison-scroll");
        table?.scrollTo({ left: i ? table.scrollWidth - table.clientWidth : 0, behavior: reduced ? "instant" : "smooth" });
      }}>{label}<ArrowRight size={13}/></button>)}</div>}
      <div className="tour-actions"><button className="tour-back" onClick={() => step ? setStep((s) => s - 1) : onClose("skipped")}>{step ? <><ArrowLeft size={15}/>Back</> : "Skip"}</button><button className="primary" disabled={working || !!error} onClick={next}>{step === 0 ? "Show me around" : step === 6 ? "Find childcare" : "Next"}<ArrowRight size={16}/></button></div>
    </section>
  </dialog>;
}
