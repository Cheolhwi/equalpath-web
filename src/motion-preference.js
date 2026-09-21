const MOTION_KEY = "equalpath:motion:v1";

// Start with the designed motion language. Users can opt into reduced motion
// from the landing footer or Display and data settings.
export function readMotionPreference() {
  try {
    return window.localStorage.getItem(MOTION_KEY) === "reduce";
  } catch {
    return false;
  }
}

export function hasStoredMotionPreference() {
  try {
    return window.localStorage.getItem(MOTION_KEY) !== null;
  } catch {
    return false;
  }
}

export function writeMotionPreference(reduced) {
  try {
    window.localStorage.setItem(MOTION_KEY, reduced ? "reduce" : "full");
  } catch {
    // The setting still applies for this session when storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent("equalpath-motion-change", { detail: { reduced } }));
}
