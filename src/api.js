import { API_URL, APPWRITE_PROJECT } from "./config.js";
export async function requestAPI(body) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 75000),
    execution = API_URL.endsWith("/executions");
  try {
    const res = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(execution ? { "X-Appwrite-Project": APPWRITE_PROJECT } : {}),
      },
      body: JSON.stringify(
        execution
          ? {
              body: JSON.stringify(body),
              async: false,
              method: "POST",
              path: "/",
              headers: { "content-type": "application/json" },
            }
          : body,
      ),
      signal: controller.signal,
      credentials: "omit",
    });
    let data;
    try {
      const envelope = await res.json();
      data = execution && res.ok ? JSON.parse(envelope.responseBody) : envelope;
    } catch {
      throw Object.assign(Error("SERVICE_UNAVAILABLE"), {
        code: "SERVICE_UNAVAILABLE",
      });
    }
    if (!res.ok || data.ok === false)
      throw Object.assign(Error(data.code ?? "SERVICE_UNAVAILABLE"), data);
    return data;
  } catch (e) {
    if (!e.code) e.code = "SERVICE_UNAVAILABLE";
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
export const errorMessage = (e) =>
  e?.code === "FACTS_CHANGED"
    ? "Centre details have changed. Search again to see the latest information."
    : e?.code === "OUTSIDE_SERVICE_AREA"
      ? "Choose a pickup place in Kuala Lumpur or Selangor. Putrajaya and other states are outside our service area."
      : e?.code === "PLACE_UNAVAILABLE"
        ? "This centre is no longer in the directory. Go back to the results to choose another."
        : "Search isn’t available right now. Your details and previous results are still here. Please try again.";
