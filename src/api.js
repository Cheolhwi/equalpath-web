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
    ? "Published facts have changed. Run the search again to check this request against the new version."
    : e?.code === "OUTSIDE_SERVICE_AREA"
      ? "Choose a pickup place in Kuala Lumpur or Selangor. Putrajaya and other states are outside our service area."
      : e?.code === "PLACE_UNAVAILABLE"
        ? "This branch is unavailable in the current regional directory. Return to the results and choose another."
        : "The search service is temporarily unavailable. Your entries and earlier results are still here. Please retry.";
