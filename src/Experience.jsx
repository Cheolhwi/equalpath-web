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
import LandingLoader from "./LandingLoader.jsx";
import { careArtworks } from "./care-artworks.js";
import { ENTRANCE_COVER_MS, ENTRANCE_REVEAL_MS, startEntrance } from "./entrance.js";
import "./landing.css";

const CareScene = lazy(() => import("./CareScene.jsx"));

class SceneBoundary extends Component {
  state = { unavailable: false };
  static getDerivedStateFromError() {
    return { unavailable: true };
  }
  componentDidCatch() { this.props.onError(); }
  render() {
    return this.state.unavailable ? null : this.props.children;
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
  const [readyArtworks, setReadyArtworks] = useState(() => new Set());
  const [sceneStatus, setSceneStatus] = useState("loading");
  const loadStage = sceneStatus;
  const [sceneAttempt, setSceneAttempt] = useState(0);
  const [homeVisit, setHomeVisit] = useState(0);
  const sceneError = useCallback(() => setSceneStatus("error"), []);
  const retryScene = () => {
    setSceneStatus("loading");
    setSceneAttempt(n => n + 1);
  };
  const enterButton = useRef(null);
  const hasEntered = useRef(phase === "ready");
  const moving = phase !== "welcome" && phase !== "ready";
  const keepLanding = phase !== "ready" || sceneStatus === "ready";
  const displayedArtwork = moving ? entryArtwork : activeArtwork;
  const artwork = careArtworks[displayedArtwork];
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
    // The optional decoration must never show an empty frame or hold up entry.
    if (loadStage !== "ready" || !readyArtworks.has(activeArtwork)) {
      finish();
      return;
    }
    cancelEntrance.current = startEntrance(
      (next) => (next === "ready" ? finish() : setPhase(next)),
      { reduced },
    );
  }, [phase, reduced, finish, activeArtwork, readyArtworks, loadStage]);
  const home = useCallback(() => {
    cancelEntrance.current();
    history.replaceState(null, "", `${location.pathname}${location.search}`);
    setActiveArtwork(0);
    setHomeVisit(n => n + 1);
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
    // Immediate entry can remove the inert/hidden landing state in the same
    // frame as the click. Start keyboard navigation at the app container,
    // without activating the address field or opening a mobile keyboard.
    const id = setTimeout(() => {
        if (phase === "ready")
          document
            .querySelector(".equalpath")
            ?.focus({ preventScroll: true });
        else if (phase === "welcome" && hasEntered.current)
          enterButton.current?.focus({ preventScroll: true });
    }, 0);
    return () => clearTimeout(id);
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
      {keepLanding && (
        <section
          className="landing"
          hidden={phase === "ready"}
          data-load-state={loadStage}
          aria-label="Welcome to EqualPath"
          aria-hidden={moving || undefined}
        >
          <div
            className="landing-content"
            inert={moving}
            aria-hidden={moving || undefined}
          >
            <div className="care-art">
              <SceneBoundary key={sceneAttempt} onError={sceneError}>
                <Suspense fallback={null}>
                  <CareScene reduced={reduced} animateOpening={!hasEntered.current}
                    active={phase !== "ready"} homeVisit={homeVisit}
                    leaving={moving} presented={loadStage === "ready"}
                    onStatusChange={setSceneStatus} onArtworkChange={setActiveArtwork} />
                </Suspense>
              </SceneBoundary>
            </div>
            <LandingLoader state={loadStage} onRetry={retryScene} />
            <header className="landing-header">
              <div className="landing-brand">
                <h1>
                  EQUALPATH
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
      {keepLanding && (
        <div className="entrance-curtain" hidden={phase === "ready"} aria-hidden="true" data-artwork={artwork.id}>
          <svg width="0" height="0" className="entrance-image-filters" focusable="false">
            <defs>
              <filter id="entrance-white-paper" colorInterpolationFilters="sRGB">
                {/* Whiten only near-white paper, leaving coloured subjects and shadows intact. */}
                <feColorMatrix in="SourceGraphic" values="1 0 0 0 0  1 0 0 0 0  1 0 0 0 0  0 0 0 1 0" result="red" />
                <feColorMatrix in="SourceGraphic" values="0 1 0 0 0  0 1 0 0 0  0 1 0 0 0  0 0 0 1 0" result="green" />
                <feColorMatrix in="SourceGraphic" values="0 0 1 0 0  0 0 1 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />
                <feBlend in="red" in2="green" mode="darken" result="redGreen" />
                <feBlend in="redGreen" in2="blue" mode="darken" result="lightestPaper" />
                <feColorMatrix in="lightestPaper" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  1 0 0 0 0" />
                <feComponentTransfer result="whitePaper">
                  <feFuncA type="linear" slope="28.3333" intercept="-24.4444" />
                </feComponentTransfer>
                <feComposite in="whitePaper" in2="SourceGraphic" operator="over" />
              </filter>
            </defs>
          </svg>
          <div className="entrance-composition">
            <div className="entrance-brand">
              <div className="entrance-wordmark">EQUALPATH</div>
              <div className="entrance-brand-rule" />
              <p>FIND CHILDCARE</p>
            </div>
            {careArtworks.map((cover, index) => (
              <figure key={cover.id} className="entrance-art" hidden={index !== displayedArtwork}
                data-artwork={cover.id} data-ready={readyArtworks.has(index)}>
                <img src={`${import.meta.env.BASE_URL}${cover.image}`} alt=""
                  crossOrigin="anonymous" loading="eager" decoding="async"
                  onLoad={async event => {
                    const image = event.currentTarget;
                    try {
                      await image.decode();
                      if (image.isConnected) setReadyArtworks(ready => new Set(ready).add(index));
                    } catch { /* Entry remains available if the optional artwork cannot decode. */ }
                  }} />
                <figcaption>
                  <span>{String(index + 1).padStart(2, "0")} / {String(careArtworks.length).padStart(2, "0")}</span>
                  <span>{cover.title}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
