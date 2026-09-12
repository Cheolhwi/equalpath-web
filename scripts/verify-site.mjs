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

async function get(path) {
  const response = await fetch(new URL(path, base), {
    signal: AbortSignal.timeout(15000),
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
for (let attempt = 0; attempt < 60; attempt++) {
  try {
    manifest = await (await get(`build-info.json?revision=${expected}`)).json();
    assert.equal(
      manifest.source,
      expected,
      "CDN has not published this revision yet",
    );
    break;
  } catch (error) {
    if (attempt === 59) throw error;
    await delay(5000);
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
