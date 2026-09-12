import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const base = new URL(process.env.SITE_URL || "https://equalpathcare.me/");
assert(base.protocol === "https:", "Published website must use HTTPS");
assert(
  ["equalpathcare.me", "www.equalpathcare.me"].includes(base.hostname),
  "Unexpected publishing destination",
);
const expected =
  process.env.EXPECTED_SOURCE ||
  JSON.parse(
    readFileSync(new URL("../dist/build-info.json", import.meta.url), "utf8"),
  ).source;
assert(
  /^[a-f0-9]{64}$/.test(expected || ""),
  "Expected source digest is missing",
);

async function get(path, timeoutMs = 15000) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(timeoutMs),
    cache: "no-store",
  });
  assert(response.ok, `Website request failed: ${response.status}`);
  assert(
    new URL(response.url).protocol === "https:",
    "HTTPS was lost during redirect",
  );
  return response;
}
let manifest;
const verificationDeadline = Date.now() + 5 * 60 * 1000;
let lastProgressAt = 0;
while (true) {
  try {
    const remaining = Math.max(1, verificationDeadline - Date.now());
    manifest = await (
      await get(
        `build-info.json?revision=${expected}`,
        Math.min(15000, remaining),
      )
    ).json();
    assert.equal(
      manifest.source,
      expected,
      "CDN has not published this revision yet",
    );
    break;
  } catch (error) {
    const reason = [error.message, error.cause?.code]
      .filter(Boolean)
      .join(" | ");
    const remaining = verificationDeadline - Date.now();
    if (remaining <= 0) {
      throw new Error(
        `Unable to verify ${base.origin} within five minutes: ${reason}`,
      );
    }
    if (Date.now() - lastProgressAt >= 30000) {
      console.log(`Waiting for ${base.origin}: ${reason}`);
      lastProgressAt = Date.now();
    }
    await delay(Math.min(5000, remaining));
  }
}
assert.match(
  await (await get("")).text(),
  /EqualPath — Care for this occasion/,
);
for (const asset of manifest.assets) await get(asset);
const response = await fetch(
  "https://sgp.cloud.appwrite.io/v1/functions/web-provider-query/executions",
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Appwrite-Project": "6a916a6c0030a70a9d75",
      Origin: base.origin,
    },
    body: JSON.stringify({
      body: JSON.stringify({ action: "health", mode: "live" }),
      async: false,
      method: "POST",
      path: "/",
    }),
    signal: AbortSignal.timeout(90000),
  },
);
assert(response.ok, `Public Appwrite API returned ${response.status}`);
assert.equal(
  response.headers.get("access-control-allow-origin"),
  base.origin,
  "Production origin is not allowed",
);
const execution = await response.json();
assert.equal(execution.responseStatusCode, 200, "Public query failed");
const health = JSON.parse(execution.responseBody);
assert.equal(health.ok, true);
console.log(
  JSON.stringify({
    website: base.href,
    source: manifest.source,
    assets: manifest.assets.length,
    publicBackend: "ok",
  }),
);
