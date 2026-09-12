import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowDown,
  ArrowRight,
  ArrowUpRight,
  HeartHandshake,
  Minus,
  Plus,
  X,
} from "lucide-react";
import App from "./App.jsx";
import { startEntrance } from "./entrance.js";
import "./landing.css";

const CareScene = lazy(() => import("./CareScene.jsx"));

class SceneBoundary extends Component {
  state = { unavailable: false };
  static getDerivedStateFromError() {
    return { unavailable: true };
  }
  render() {
    return this.state.unavailable ? (
      <div className="care-scene-placeholder">
        The scene couldn’t load. You can still find childcare.
      </div>
    ) : (
      this.props.children
    );
  }
}

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
      <App introPhase={phase} introReduced={reduced} onHome={home} />
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
                  FIND CHILDCARE <ArrowUpRight size={18} />
                </button>
              </nav>
            </header>

            <div className="care-art">
              <SceneBoundary>
                <Suspense
                  fallback={
                    <div className="care-scene-placeholder">
                      A little play. A little possibility.
                    </div>
                  }
                >
                  <CareScene reduced={reduced} />
                </Suspense>
              </SceneBoundary>
            </div>

            <div className="landing-hero">
              <div className="hero-kicker">
                <span>CHILDCARE FOR THE DAY THAT CHANGED.</span>
                <span>01 — 03</span>
              </div>
              <h2>
                Care for them.
                <br />
                <span>
                  A little breathing
                  <br />
                  room for you.
                </span>
              </h2>
              <div className="hero-description">
                <p>
                  When pickup plans change, find childcare nearby. Compare your
                  options and know what to ask next.
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
                    ? "BACK TO YOUR OPTIONS"
                    : "FIND CHILDCARE"}
                </span>
                <ArrowRight size={28} strokeWidth={1.25} />
              </button>
              <div className="entry-caption">
                <span>NO ACCOUNT NEEDED</span>
                <span>PRESS ENTER TO EXPLORE</span>
              </div>
            </div>

            <div className="landing-bottom">
              <section
                className="care-note"
                aria-label="Care when plans change"
              >
                <HeartHandshake
                  size={28}
                  strokeWidth={1.15}
                  aria-hidden="true"
                />
                <div>
                  <h3>
                    For late meetings.
                    <br />
                    And life’s little surprises.
                  </h3>
                  <p>A place to start when your usual plans change.</p>
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
                <i /> FOR FAMILIES IN KL + SELANGOR
              </span>
              <span className="landing-footnote">
                ONE OCCASION. A LITTLE MORE POSSIBILITY.
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
