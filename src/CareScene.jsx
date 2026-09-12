import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Layers, Pause, Play } from "lucide-react";
import { ArchiveScene } from "./vendor/rhine/scene";
import { fileAtCell } from "./vendor/rhine/archive-loop";
import { fileLocation, records } from "./vendor/rhine/data";
import { careArtworks, nextArtwork, artworkDwell } from "./care-artworks.js";

export default function CareScene({ reduced }) {
  const host = useRef(null);
  const instance = useRef(null);
  const selected = useRef(0);
  const direction = useRef(1);
  const keyboardInteraction = useRef(false);
  const mode = useRef("detail");
  const reducedRef = useRef(reduced);
  const [status, setStatus] = useState("loading");
  const [artIndex, setArtIndex] = useState(0);
  const [overview, setOverview] = useState(false);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const [retry, setRetry] = useState(0);
  const choose = useCallback((index, navigation) => {
    selected.current = index;
    instance.current?.select(index, navigation);
    setArtIndex(fileLocation(index).lane);
  }, []);
  useEffect(() => {
    reducedRef.current = reduced;
    instance.current?.setReduced(reduced);
  }, [reduced]);
  useEffect(() => {
    const changed = () => setHidden(document.hidden);
    const keyboard = (event) => {
      if (event.key === "Tab") keyboardInteraction.current = true;
    };
    const pointer = () => {
      keyboardInteraction.current = false;
    };
    document.addEventListener("keydown", keyboard, true);
    document.addEventListener("pointerdown", pointer, true);
    document.addEventListener("visibilitychange", changed);
    changed();
    return () => {
      document.removeEventListener("visibilitychange", changed);
      document.removeEventListener("keydown", keyboard, true);
      document.removeEventListener("pointerdown", pointer, true);
    };
  }, []);
  const playing =
    status === "ready" && !paused && !reduced && !overview && !hidden;
  useEffect(() => {
    if (!playing) return;
    return artworkDwell(() => {
      const next = nextArtwork(artIndex, direction.current);
      direction.current = next.direction;
      choose(next.index * 8, { axis: "lane", direction: next.direction });
    });
  }, [playing, artIndex, choose]);
  useEffect(() => {
    let alive = true;
    let frame = 0;
    let scene;
    setStatus("loading");
    try {
      scene = new ArchiveScene(host.current);
      instance.current = scene;
      scene.setReduced(reducedRef.current);
      scene.setQuality({
        scale: 100,
        pixelRatio: 1,
        aoSamples: 16,
        aoResolution: 0.5,
        depthOfField: 70,
        shadows: 1024,
        transmission: 0.5,
      });
      scene.setArchiveCoverage(true);
      scene.onSelect = (index, cell, intent) => {
        setPaused(true);
        choose(index, { cell });
        if (intent === "activate") {
          mode.current = "detail";
          setOverview(false);
          scene.setMode("detail");
        }
      };
      scene.onNavigate = (axis, direction) => {
        const location = scene.getStats().selectedCell;
        if (!location) return;
        const next = {
          ...location,
          [axis === "lane" ? "lane" : "row"]:
            location[axis === "lane" ? "lane" : "row"] + direction,
        };
        setPaused(true);
        choose(fileAtCell(next), { cell: next });
      };
      scene
        .load()
        .then(() => {
          if (!alive) return;
          scene.select(selected.current);
          scene.setMode(mode.current);
          scene.revealImmediately();
          // Settle the default pop-up before the first visible frame.
          scene.setReduced(true);
          const now = performance.now() / 1000;
          for (let i = 0; i < 90; i++)
            scene.update(now - 1.5 + i / 60, undefined, false);
          scene.setReduced(reducedRef.current);
          setStatus("ready");
          const tick = (ms) => {
            if (!alive) return;
            if (!document.hidden) scene.update(ms / 1000);
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        })
        .catch(() => {
          if (alive) setStatus("error");
        });
    } catch {
      setStatus("error");
    }
    const resize = new ResizeObserver(() => scene?.resize());
    resize.observe(host.current);
    return () => {
      alive = false;
      cancelAnimationFrame(frame);
      resize.disconnect();
      instance.current = null;
      scene?.dispose();
    };
  }, [retry, choose]);
  const navigate = (step) => {
    setPaused(true);
    direction.current = step;
    choose((selected.current + step * 8 + records.length) % records.length, {
      axis: "lane",
      direction: step,
    });
  };
  const artwork = careArtworks[artIndex];
  return (
    <section
      className="care-scene"
      aria-label="Childcare art collection"
      aria-roledescription="carousel"
      data-scene-status={status}
      data-scene-view={overview ? "collection" : "detail"}
      data-artwork={artwork.id}
      data-autoplay={playing ? "playing" : "paused"}
      data-pause-reason={
        status !== "ready"
          ? "loading"
          : reduced
            ? "reduced-motion"
            : overview
              ? "collection"
              : hidden
                ? "hidden"
                : paused
                  ? "interaction"
                  : "none"
      }
    >
      <div
        ref={host}
        className="care-scene-canvas"
        onPointerDown={() => setPaused(true)}
      />
      <div className="care-scene-soften" aria-hidden="true" />
      {status !== "ready" && (
        <div className="care-scene-status" role="status">
          {status === "loading" ? (
            "Opening the collection…"
          ) : (
            <button onClick={() => setRetry((n) => n + 1)}>
              Reload artwork
            </button>
          )}
        </div>
      )}
      <div
        className="care-scene-controls"
        onFocusCapture={(event) => {
          if (keyboardInteraction.current) setPaused(true);
        }}
      >
        <div
          className="care-scene-caption"
          aria-live={playing ? "off" : "polite"}
          aria-atomic="true"
        >
          <span>0{artIndex + 1} / 04</span>
          <strong>{artwork.title}</strong>
          <span className="sr-only">{artwork.alt}</span>
        </div>
        <div className="care-scene-actions">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous artwork"
            disabled={status !== "ready"}
          >
            <ArrowLeft size={17} />
          </button>
          <button
            onClick={() => {
              mode.current = overview ? "detail" : "archive";
              instance.current?.setMode(mode.current);
              setOverview(!overview);
              setPaused(true);
            }}
            aria-label={overview ? "Show raised artwork" : "Explore collection"}
            aria-pressed={overview}
            disabled={status !== "ready"}
          >
            <Layers size={16} />
          </button>
          <button
            onClick={() => {
              if (overview) {
                mode.current = "detail";
                instance.current?.setMode("detail");
                setOverview(false);
              }
              setPaused(playing);
            }}
            aria-label={
              playing ? "Pause artwork slideshow" : "Play artwork slideshow"
            }
            disabled={status !== "ready" || reduced}
            title={
              reduced ? "Slideshow disabled with reduced motion" : undefined
            }
          >
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Next artwork"
            disabled={status !== "ready"}
          >
            <ArrowRight size={17} />
          </button>
        </div>
      </div>
    </section>
  );
}
