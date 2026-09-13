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
import Pointer from "./Pointer.jsx";
import { careArtworks } from "./care-artworks.js";
import { ENTRANCE_COVER_MS, ENTRANCE_REVEAL_MS, startEntrance } from "./entrance.js";
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
  const [activeArtwork, setActiveArtwork] = useState(0);
  const [entryArtwork, setEntryArtwork] = useState(0);
  const artwork = careArtworks[entryArtwork];
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
    setEntryArtwork(activeArtwork);
    cancelEntrance.current();
    cancelEntrance.current = startEntrance(
      (next) => (next === "ready" ? finish() : setPhase(next)),
      { reduced },
    );
  }, [phase, reduced, finish, activeArtwork]);
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
      else if (phase === "welcome" && hasEntered.current)
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
      style={{
        "--entrance-cover": `${ENTRANCE_COVER_MS}ms`,
        "--entrance-reveal": `${ENTRANCE_REVEAL_MS}ms`,
      }}
    >
      <App introPhase={phase} introReduced={reduced} onHome={home} />
      <Pointer reduced={reduced} />
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
                  <CareScene reduced={reduced} animateOpening={!hasEntered.current}
                    leaving={moving} onArtworkChange={setActiveArtwork} />
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
      {moving && (
        <div className="entrance-curtain" aria-hidden="true" data-artwork={artwork.id}>
          <div className="entrance-composition">
            <div className="entrance-brand">
              <div className="entrance-wordmark">EQUALPATH<span>／</span></div>
              <div className="entrance-brand-rule" />
              <p>FIND CHILDCARE</p>
            </div>
            <figure className="entrance-art">
              <img src={`${import.meta.env.BASE_URL}${artwork.image}`} alt=""
                onError={event => { event.currentTarget.style.visibility = "hidden"; }} />
              <figcaption>
                <span>{String(entryArtwork + 1).padStart(2, "0")} / {String(careArtworks.length).padStart(2, "0")}</span>
                <span>{artwork.title}</span>
              </figcaption>
            </figure>
          </div>
        </div>
      )}
    </div>
  );
}
