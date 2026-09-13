import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { ArrowRight, Minus, Plus } from "lucide-react";
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

export default function Experience() {
  const [phase, setPhase] = useState(() =>
    ["#discover", "#request-form"].includes(location.hash)
      ? "ready"
      : "welcome",
  );
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
  }, [moving, finish, home]);

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
          <div
            className="landing-content"
            inert={moving}
            aria-hidden={moving || undefined}
          >
            <div className="care-art">
              <SceneBoundary>
                <Suspense
                  fallback={
                    <div className="care-scene-placeholder">
                      Loading illustrations…
                    </div>
                  }
                >
                  <CareScene reduced={reduced} />
                </Suspense>
              </SceneBoundary>
            </div>
            <header className="landing-header">
              <div className="landing-brand">
                <h1>
                  EQUALPATH<span>／</span>
                </h1>
                <p>FIND CHILDCARE</p>
              </div>
              <span className="landing-region">
                CHILDCARE
                <br />
                KL + SELANGOR
              </span>
            </header>
            <div className="landing-entry">
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
                <ArrowRight size={22} strokeWidth={1.25} />
              </button>
            </div>
            <footer className="landing-footer">
              <span>NO ACCOUNT NEEDED</span>
              <button
                className="motion-toggle"
                onClick={() => setReduced((v) => !v)}
                aria-pressed={reduced}
              >
                {reduced ? "REDUCED MOTION" : "MOTION ON"}
                {reduced ? <Minus size={12} /> : <Plus size={12} />}
              </button>
            </footer>
          </div>
        </section>
      )}
    </div>
  );
}
