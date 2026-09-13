// Public city centres only. No device location is requested by the introduction.
export const INTRO_AREAS = [
  {
    name: "Kuala Lumpur",
    short: "KUALA LUMPUR",
    center: [101.6869, 3.139],
    coordinates: "03.1390° N / 101.6869° E",
  },
  {
    name: "Selangor",
    short: "SELANGOR",
    center: [101.5183, 3.0738],
    coordinates: "03.0738° N / 101.5183° E",
  },
];

export const ENTRANCE_COVER_MS = 360;
export const ENTRANCE_REVEAL_MS = 540;
export const ENTRANCE_DURATION_MS = ENTRANCE_COVER_MS + ENTRANCE_REVEAL_MS;

export const ENTRANCE_STAGES = [
  { phase: "entering", at: 0 },
  { phase: "ready", at: ENTRANCE_DURATION_MS },
];

// A single cancellation handle owns every pending frame of the transition.
export function startEntrance(
  onPhase,
  { reduced = false, schedule = setTimeout, cancel = clearTimeout } = {},
) {
  let active = true;
  const timers = [];
  if (reduced) onPhase("ready");
  else {
    onPhase("entering");
    for (const stage of ENTRANCE_STAGES.slice(1)) {
      timers.push(schedule(() => active && onPhase(stage.phase), stage.at));
    }
  }
  return () => {
    active = false;
    timers.forEach(cancel);
  };
}

export function entranceCamera(phase, area = 0) {
  const center = INTRO_AREAS[area]?.center ?? INTRO_AREAS[0].center;
  const flat = { pitch: 0, bearing: 0 };
  if (phase === "welcome")
    return { ...flat, center, zoom: 13.1, duration: 1100 };
  return null;
}
