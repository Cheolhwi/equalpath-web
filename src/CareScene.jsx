import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Layers } from "lucide-react";
import { ArchiveScene } from "./vendor/rhine/scene";
import { fileAtCell } from "./vendor/rhine/archive-loop";
import { records } from "./vendor/rhine/data";

export default function CareScene({ reduced }) {
  const host = useRef(null);
  const instance = useRef(null);
  const selected = useRef(16);
  const mode = useRef("detail");
  const reducedRef = useRef(reduced);
  const [status, setStatus] = useState("loading");
  const [theme, setTheme] = useState("GROW");
  const [overview, setOverview] = useState(false);
  const [retry, setRetry] = useState(0);
  const choose = (index, navigation) => {
    selected.current = index;
    instance.current?.select(index, navigation);
    setTheme(records[index].title);
  };
  useEffect(() => {
    reducedRef.current = reduced;
    instance.current?.setReduced(reduced);
  }, [reduced]);
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
        choose(fileAtCell(next), { cell: next });
      };
      scene
        .load()
        .then(() => {
          if (!alive) return;
          scene.select(selected.current);
          scene.setMode(mode.current);
          scene.revealImmediately();
          // Settle the original extraction before the first visible frame.
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
  }, [retry]);
  const navigate = (direction) => {
    const next =
      (selected.current + direction * 8 + records.length) % records.length;
    choose(next, { axis: "lane", direction });
  };
  return (
    <section
      className="care-scene"
      aria-label="Interactive childcare scene"
      data-scene-status={status}
      data-scene-view={overview ? "collection" : "detail"}
    >
      <div ref={host} className="care-scene-canvas" />
      <div className="care-scene-soften" aria-hidden="true" />
      {status !== "ready" && (
        <div className="care-scene-status" role="status">
          {status === "loading" ? (
            "A little play. A little possibility."
          ) : (
            <button onClick={() => setRetry((n) => n + 1)}>
              Reload the scene
            </button>
          )}
        </div>
      )}
      <div className="care-scene-controls">
        <div className="care-scene-caption">
          <span>{overview ? "DRAG TO EXPLORE" : "DRAG TO TURN"}</span>
          <strong>{theme}</strong>
          <small>
            {overview
              ? "DRAG TO EXPLORE · SELECT TO LIFT"
              : "DRAG TO TURN THE OBJECT"}
          </small>
        </div>
        <div className="care-scene-actions">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous care object"
            disabled={status !== "ready"}
          >
            <ArrowLeft size={18} />
          </button>
          <button
            onClick={() => {
              mode.current = overview ? "detail" : "archive";
              instance.current?.setMode(mode.current);
              setOverview(!overview);
            }}
            aria-pressed={overview}
            disabled={status !== "ready"}
          >
            <Layers size={16} />
            {overview ? "CLOSE UP" : "VIEW COLLECTION"}
          </button>
          <button
            onClick={() => navigate(1)}
            aria-label="Next care object"
            disabled={status !== "ready"}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </div>
    </section>
  );
}
