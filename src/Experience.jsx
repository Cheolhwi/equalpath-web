import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  Crosshair,
  Minus,
  Plus,
  X,
} from "lucide-react";
import App from "./App.jsx";
import { INTRO_AREAS, startEntrance } from "./entrance.js";
import "./landing.css";

const steps = [
  {
    title: "Find your options.",
    text: "Tell us where pickup starts and when care needs to end. Explore institutions around your day.",
  },
  {
    title: "See the whole picture.",
    text: "Compare the same conditions, published information and questions still worth asking.",
  },
  {
    title: "Make the next call count.",
    text: "Take a focused list of questions with you. Contact the institution when you are ready.",
  },
];

export default function Experience() {
  const [phase, setPhase] = useState(() =>
    ["#discover", "#request-form"].includes(location.hash)
      ? "ready"
      : "welcome",
  );
  const [area, setArea] = useState(0);
  const [step, setStep] = useState(0);
  const [showProcess, setShowProcess] = useState(false);
  const [reduced, setReduced] = useState(
    () => matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const cancelEntrance = useRef(() => {});
  const enterButton = useRef(null);
  const hasEntered = useRef(phase === "ready");
  const moving = phase !== "welcome" && phase !== "ready";
  const finish = useCallback(() => {
    cancelEntrance.current();
    setPhase("ready");
    hasEntered.current = true;
    history.replaceState(
      null,
      "",
      `${location.pathname}${location.search}#discover`,
    );
  }, []);
  const enter = useCallback(() => {
    if (phase !== "welcome") return;
    cancelEntrance.current();
    setShowProcess(false);
    cancelEntrance.current = startEntrance(
      (next) => (next === "ready" ? finish() : setPhase(next)),
      { reduced },
    );
  }, [phase, reduced, finish]);
  const home = useCallback(() => {
    cancelEntrance.current();
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setPhase("welcome");
  }, []);

  useEffect(() => () => cancelEntrance.current(), []);
  useEffect(() => {
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const changed = () => setReduced(media.matches);
    media.addEventListener("change", changed);
    return () => media.removeEventListener("change", changed);
  }, []);
  useEffect(() => {
    if (reduced && moving) finish();
  }, [reduced, moving, finish]);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      if (phase === "ready")
        document
          .getElementById("pickup-search")
          ?.focus({ preventScroll: true });
      else if (phase === "welcome")
        enterButton.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(id);
  }, [phase]);
  useEffect(() => {
    const keyboard = (e) => {
      if (e.key === "Escape" && moving) finish();
      if (e.key === "Escape" && showProcess) setShowProcess(false);
    };
    window.addEventListener("keydown", keyboard);
    const hashChanged = () => {
      if (location.hash === "#discover") finish();
      else if (!location.hash) home();
    };
    window.addEventListener("hashchange", hashChanged);
    return () => {
      window.removeEventListener("keydown", keyboard);
      window.removeEventListener("hashchange", hashChanged);
    };
  }, [moving, showProcess, finish, home]);

  return (
    <div
      className={`experience phase-${phase}`}
      data-intro-phase={phase}
      data-intro-reduced={reduced}
    >
      <App
        introPhase={phase}
        introArea={area}
        introReduced={reduced}
        onHome={home}
      />
      {phase !== "ready" && (
        <section
          className="landing"
          aria-label="Welcome to EqualPath"
          aria-hidden={moving || undefined}
        >
          <div className="landing-wash" aria-hidden="true" />
          <div
            className="landing-content"
            inert={moving}
            aria-hidden={moving || undefined}
          >
            <header className="landing-header">
              <div className="landing-brand">
                <h1>
                  EQUALPATH<span>／</span>
                </h1>
                <p>CARE FOR THIS OCCASION</p>
                <span className="brand-descriptor">
                  A LITTLE MORE POSSIBILITY.
                </span>
              </div>
              <nav aria-label="Welcome navigation">
                <button
                  onClick={() => setShowProcess((v) => !v)}
                  aria-expanded={showProcess}
                  aria-controls="landing-process"
                >
                  {showProcess ? <Minus size={13} /> : <Plus size={13} />} HOW
                  IT WORKS
                </button>
                <button onClick={enter}>
                  EXPLORE MAP <ArrowUpRight size={18} />
                </button>
              </nav>
            </header>

            <div
              className="landing-location"
              aria-label={`Previewing ${INTRO_AREAS[area].name}`}
            >
              <span className="landing-overline">
                A PLACE TO START / 0{area + 1}
              </span>
              <Crosshair
                size={42}
                strokeWidth={0.8}
                className="location-crosshair"
                aria-hidden="true"
              />
              <div key={area} className="location-caption">
                <span>{INTRO_AREAS[area].short}</span>
                <small>{INTRO_AREAS[area].coordinates}</small>
              </div>
            </div>

            <div className="landing-hero">
              <div className="hero-kicker">
                <span>YOUR DAY. YOUR NEXT STEP.</span>
                <span>01 — 03</span>
              </div>
              <h2>
                CARE,
                <br />
                <span>WITHIN REACH.</span>
              </h2>
              <div className="hero-description">
                <p>
                  For the hours that don’t go to plan.
                  <br />
                  Find childcare. Check the details.
                  <br />
                  Know what to ask.
                </p>
                <ArrowDown size={22} strokeWidth={1} aria-hidden="true" />
              </div>
              <button
                ref={enterButton}
                className="landing-enter"
                onClick={enter}
              >
                <span>
                  {hasEntered.current
                    ? "RETURN TO YOUR MAP"
                    : "FIND YOUR NEXT STEP"}
                </span>
                <ArrowRight size={28} strokeWidth={1.25} />
              </button>
              <div className="entry-caption">
                <span>NO ACCOUNT NEEDED</span>
                <span>PRESS ENTER TO EXPLORE</span>
              </div>
            </div>

            <div className="landing-bottom">
              <section className="landing-areas" aria-label="Map preview area">
                <span className="landing-overline">OUR NEIGHBOURHOOD</span>
                <div>
                  {INTRO_AREAS.map((item, index) => (
                    <button
                      key={item.name}
                      onClick={() => setArea(index)}
                      aria-pressed={area === index}
                    >
                      <small>0{index + 1}</small>
                      {item.name}
                      <ArrowUpRight size={16} />
                    </button>
                  ))}
                </div>
              </section>
              <section
                className="landing-steps"
                aria-label="Explore the process"
              >
                <div className="step-tabs">
                  {["DISCOVER", "COMPARE", "ENQUIRE"].map((name, index) => (
                    <button
                      key={name}
                      onClick={() => setStep(index)}
                      aria-pressed={step === index}
                    >
                      <small>0{index + 1}</small>
                      {name}
                    </button>
                  ))}
                </div>
                <div className="step-description" key={step}>
                  <strong>{steps[step].title}</strong>
                  <p>{steps[step].text}</p>
                </div>
              </section>
            </div>
            <footer className="landing-footer">
              <span className="landing-region">
                <i /> KUALA LUMPUR + SELANGOR
              </span>
              <span className="landing-attribution">
                <a
                  href="https://openfreemap.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenFreeMap
                </a>{" "}
                ·{" "}
                <a
                  href="https://openmaptiles.org/"
                  target="_blank"
                  rel="noreferrer"
                >
                  OpenMapTiles
                </a>{" "}
                ·{" "}
                <a
                  href="https://www.openstreetmap.org/copyright"
                  target="_blank"
                  rel="noreferrer"
                >
                  © OpenStreetMap
                </a>
              </span>
              <button
                className="motion-toggle"
                onClick={() => setReduced((v) => !v)}
                aria-pressed={reduced}
              >
                {reduced ? "REDUCED MOTION" : "MOTION ON"}
                {reduced ? <Minus size={13} /> : <Plus size={13} />}
              </button>
            </footer>
          </div>
          {showProcess && !moving && (
            <section
              className="landing-process"
              id="landing-process"
              aria-label="How EqualPath works"
            >
              <div className="process-heading">
                <span className="landing-overline">
                  THREE STEPS. A CLEARER CHOICE.
                </span>
                <button
                  onClick={() => setShowProcess(false)}
                  aria-label="Close how it works"
                >
                  <X size={20} />
                </button>
              </div>
              {steps.map((item, index) => (
                <div className="process-row" key={item.title}>
                  <span>0{index + 1}</span>
                  <div>
                    <h3>{item.title}</h3>
                    <p>{item.text}</p>
                  </div>
                </div>
              ))}
              <button className="landing-enter" onClick={enter}>
                LET’S START
                <ArrowRight size={23} />
              </button>
            </section>
          )}
        </section>
      )}
    </div>
  );
}
