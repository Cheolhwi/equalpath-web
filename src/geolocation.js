const attempts = [
  { enableHighAccuracy: false, timeout: 10000, maximumAge: 60000 },
  { enableHighAccuracy: true, timeout: 30000, maximumAge: 0 },
];

const aborted = () => new DOMException("Location cancelled.", "AbortError");
const locationError = (code) =>
  Object.assign(
    new Error(
      code === 1
        ? "Location access is blocked. Allow location for this site and browser in your device settings, then retry. You can also search a place or choose on the map."
        : code === 3
          ? "Your browser has not returned a location after two attempts. Check that location services are on, then retry, search a place, or choose on the map."
          : "Your browser could not find a location. Check location services, then retry, search a place, or choose on the map.",
    ),
    { code },
  );

// A short-lived watch lets us stop the device request on success or cancellation.
// Only its first result is used; no background location subscription remains.
function locateOnce(geolocation, options, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(aborted());
    let watchId = null;
    let settled = false;
    let timer;
    const finish = (error, place) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", cancel);
      if (watchId !== null) geolocation.clearWatch(watchId);
      if (error) reject(error);
      else resolve(place);
    };
    const cancel = () => finish(aborted());
    signal?.addEventListener("abort", cancel, { once: true });
    // Also bound browsers that never deliver a success/error callback.
    timer = setTimeout(() => finish({ code: 3 }), options.timeout);
    try {
      watchId = geolocation.watchPosition(
        (position) => {
          const {
            latitude: lat,
            longitude: lng,
            accuracy,
          } = position?.coords ?? {};
          if (
            !Number.isFinite(lat) ||
            !Number.isFinite(lng) ||
            Math.abs(lat) > 90 ||
            Math.abs(lng) > 180
          ) {
            finish(
              Object.assign(
                new Error(
                  "A reliable location was not returned. Retry, search a place, or choose on the map.",
                ),
                { code: "INVALID" },
              ),
            );
            return;
          }
          finish(null, {
            id: null,
            label: "My current location",
            lat,
            lng,
            accuracy:
              Number.isFinite(accuracy) && accuracy >= 0
                ? Math.round(accuracy)
                : null,
          });
        },
        (error) => finish(error),
        options,
      );
      // Account for synchronous browser errors/test callbacks before the ID is returned.
      if (settled) geolocation.clearWatch(watchId);
    } catch (error) {
      finish(error?.name === "SecurityError" ? { code: 1 } : error);
    }
  });
}

export async function currentLocation(
  geolocation = globalThis.navigator?.geolocation,
  { signal, onProgress, secureContext = globalThis.isSecureContext } = {},
) {
  if (signal?.aborted) throw aborted();
  if (secureContext === false) {
    throw Object.assign(
      new Error(
        "Location needs a secure page. Open this site using HTTPS, or search a place or choose on the map.",
      ),
      { code: "INSECURE" },
    );
  }
  if (!geolocation?.watchPosition || !geolocation?.clearWatch) {
    throw Object.assign(
      new Error(
        "Location is unavailable in this browser. Search a place or choose it on the map.",
      ),
      { code: "UNSUPPORTED" },
    );
  }
  for (let index = 0; index < attempts.length; index++) {
    if (signal?.aborted) throw aborted();
    onProgress?.(
      index === 0
        ? "Waiting for your browser to share your location. Allow access if prompted."
        : "Still locating… trying again with up to 30 more seconds. You can cancel or choose a place manually.",
    );
    try {
      return await locateOnce(geolocation, attempts[index], signal);
    } catch (error) {
      if (error?.name === "AbortError" || error?.code === "INVALID")
        throw error;
      if (index === 0 && [2, 3].includes(error?.code)) continue;
      throw locationError(error?.code);
    }
  }
}
