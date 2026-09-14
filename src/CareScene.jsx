import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Layers, Pause, Play } from "lucide-react";
import { ArchiveScene } from "./vendor/rhine/scene";
import { fileAtCell } from "./vendor/rhine/archive-loop";
import { fileLocation, records } from "./vendor/rhine/data";
import { careArtworks, nextArtwork, artworkDwell } from "./care-artworks.js";

export default function CareScene({ reduced, animateOpening = true, leaving = false, presented = true, onStatusChange, onArtworkChange }) {
  const host = useRef(null);
  const instance = useRef(null);
  const selected = useRef(0);
  const direction = useRef(1);
  const keyboardInteraction = useRef(false);
  const mode = useRef(animateOpening && !reduced ? "archive" : "detail");
  const openingRef = useRef(animateOpening && !reduced ? "collection" : "complete");
  const reducedRef = useRef(reduced);
  const [status, setStatus] = useState("loading");
  const [artIndex, setArtIndex] = useState(0);
  const [overview, setOverview] = useState(animateOpening && !reduced);
  const [opening, setOpening] = useState(openingRef.current);
  const [paused, setPaused] = useState(false);
  const [hidden, setHidden] = useState(() => document.hidden);
  const reportStatus = useCallback(value => {
    setStatus(value);
    onStatusChange?.(value);
  }, [onStatusChange]);
  useEffect(() => { onArtworkChange?.(artIndex); }, [artIndex, onArtworkChange]);
  const finishOpening = useCallback(() => {
    openingRef.current = "complete";
    setOpening("complete");
  }, []);
  const interact = useCallback(() => {
    finishOpening();
    setPaused(true);
  }, [finishOpening]);
  const choose = useCallback((index, navigation) => {
    selected.current = index;
    instance.current?.select(index, navigation);
    setArtIndex(fileLocation(index).lane);
  }, []);
  useEffect(() => {
    reducedRef.current = reduced;
    instance.current?.setReduced(reduced);
    if (reduced && openingRef.current !== "complete") {
      finishOpening();
      mode.current = "detail";
      setOverview(false);
      instance.current?.setMode("detail");
      instance.current?.finishDecryption();
    }
  }, [reduced, finishOpening]);
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
    status === "ready" && presented && opening === "complete" && !paused && !reduced && !overview && !hidden && !leaving;
  useEffect(() => {
    if (status !== "ready" || !presented || opening === "complete" || hidden || paused || reduced || leaving) return;
    return artworkDwell(() => {
      if (openingRef.current === "complete") return;
      if (opening === "collection") {
        mode.current = "detail";
        instance.current?.setMode("detail");
        // The care illustration is readable as it rises; no decoding interlude.
        instance.current?.finishDecryption();
        setOverview(false);
        openingRef.current = "lifting";
        setOpening("lifting");
      } else finishOpening();
    }, { delay: opening === "collection" ? 300 : 1800 });
  }, [status, presented, opening, hidden, paused, reduced, leaving, finishOpening]);
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
    reportStatus("loading");
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
        interact();
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
        interact();
        choose(fileAtCell(next), { cell: next });
      };
      scene
        .load()
        .then(() => {
          if (!alive) return;
          scene.select(selected.current);
          scene.setMode(mode.current);
          scene.revealImmediately();
          // First render the settled collection. The short reveal starts only
          // after that frame is drawn; reduced motion and return visits open raised.
          scene.setReduced(true);
          const now = performance.now() / 1000;
          for (let i = 0; i < 90; i++)
            scene.update(now - 1.5 + i / 60, undefined, false);
          scene.setReduced(reducedRef.current);
          let firstFrame = true;
          const tick = (ms) => {
            if (!alive) return;
            if (!document.hidden) {
              scene.update(ms / 1000);
              if (firstFrame) { firstFrame = false; reportStatus("ready"); }
            }
            frame = requestAnimationFrame(tick);
          };
          frame = requestAnimationFrame(tick);
        })
        .catch(() => {
          if (alive) reportStatus("error");
        });
    } catch {
      reportStatus("error");
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
  }, [choose, interact, reportStatus]);
  const navigate = (step) => {
    interact();
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
      data-opening={opening}
      data-artwork={artwork.id}
      data-autoplay={playing ? "playing" : "paused"}
      data-pause-reason={
        status !== "ready"
          ? "loading"
          : opening !== "complete"
            ? "opening"
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
        onPointerDown={interact}
      />
      <div className="care-scene-soften" aria-hidden="true" />
      <div
        className="care-scene-controls"
        inert={!presented}
        onPointerDownCapture={finishOpening}
        onFocusCapture={(event) => {
          if (keyboardInteraction.current) interact();
        }}
      >
        <div
          className="care-scene-caption"
          aria-live={playing ? "off" : "polite"}
          aria-atomic="true"
        >
          <span>{String(artIndex + 1).padStart(2, "0")} / {String(careArtworks.length).padStart(2, "0")}</span>
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
              finishOpening();
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
              finishOpening();
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
