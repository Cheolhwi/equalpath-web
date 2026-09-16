import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { createPublishedStore, decodeCatalogSnapshot } from "../server/published-catalog.mjs";
import { createAPI } from "../server/api.mjs";

const metadata = JSON.parse(await readFile(new URL("../server/data/catalog-snapshot.meta.json", import.meta.url), "utf8"));
const compressed = await readFile(new URL("../server/data/catalog-snapshot.json.gz", import.meta.url));
const pickup = { lat: 3.134, lng: 101.6863, label: "KL Sentral" };
const request = { careType: "short_term", pickup, date: "2026-09-21", deadline: "13:00", end: "17:00", transport: "self", sort: "distance" };

test("published archive preserves collection membership and loads only once for concurrent and subsequent callers", async () => {
  let reads = 0;
  const store = createPublishedStore({ loadFiles: async () => { reads++; return [compressed, JSON.stringify(metadata)]; } });
  const catalogs = await Promise.all(Array.from({ length: 20 }, () => store.catalog()));
  assert.equal(reads, 1);
  assert.ok(catalogs.every(catalog => catalog === catalogs[0]));
  const catalog = await store.catalog();
  assert.equal(reads, 1);
  assert.equal(catalog.items.length, metadata.providers);
  assert.equal(catalog.shortCareIds.length, metadata.shortCareProviders);
  assert.ok(catalog.shortCareIds.every(id => catalog.items.some(p => p.id === id)));
  assert.equal(catalog.version, metadata.version);
  assert.ok(catalog.items.some(p => p.fees.length && p.phone));
});

test("missing or tampered snapshot fails closed without falling back to the database", async t => {
  const network = t.mock.method(globalThis, "fetch", () => { throw Error("Unexpected network"); });
  assert.throws(() => decodeCatalogSnapshot(compressed, { ...metadata, sha256: "0".repeat(64) }), e => e.code === "SOURCE_INVALID");
  assert.throws(() => decodeCatalogSnapshot(compressed, { ...metadata, providers: metadata.providers + 1 }), e => e.code === "SOURCE_INVALID");
  const catalog = decodeCatalogSnapshot(compressed, metadata);
  catalog.shortCareIds[0] = "not-a-published-provider";
  const bytes = Buffer.from(JSON.stringify(catalog));
  assert.throws(() => decodeCatalogSnapshot(gzipSync(bytes), { ...metadata, bytes: bytes.length, sha256: createHash("sha256").update(bytes).digest("hex") }), e => e.code === "SOURCE_INVALID");
  let reads = 0;
  const missing = createPublishedStore({ loadFiles: async () => { reads++; throw Error("Private filesystem path"); } });
  for (let i = 0; i < 3; i++) await assert.rejects(missing.catalog(), e => e.code === "SOURCE_UNAVAILABLE" && !e.message.includes("Private"));
  assert.equal(reads, 1);
  assert.equal(network.mock.callCount(), 0);
});

test("cold Function instances serve health, nearby, searches, details and comparison with zero database requests", async t => {
  const network = t.mock.method(globalThis, "fetch", () => { throw Error("Database quota exhausted"); });
  const makeAPI = () => createAPI({
    placeSearch: async () => ({ items: [] }), reverseGeocode: null,
    drivingRoutes: async (_, rows) => rows.map(p => ({ ...p, driving: { state: "unavailable" } })),
  });
  for (let cold = 0; cold < 3; cold++) {
    const api = makeAPI();
    const health = await api({ action: "health", careType: "regular" });
    assert.equal(health.available, metadata.providers - metadata.shortCareProviders);
    const nearby = await api({ action: "nearby", careType: "short_term", center: pickup });
    assert.ok(nearby.items.length > 0 && nearby.items.length <= 10);
    assert.equal(nearby.radius, 5);
    const short = await api({ action: "search", request });
    assert.equal(short.items.length, 10);
    assert.equal(short.pageSize, 10);
    assert.ok(short.items.every(p => p.distanceKm <= 5));
    const second = await api({ action: "search", request, page: 1 });
    assert.ok(second.items.every(p => !short.items.some(first => first.id === p.id)));
    const regular = await api({ action: "search", request: { careType: "regular", pickup, sort: "price" } });
    assert.equal(regular.items.length, 20);
    assert.equal(regular.request.radius, 10);
    assert.ok(regular.items.every(p => p.distanceKm <= 10 && !short.shortCareIds.includes(p.id)));
    const detail = await api({ action: "details", request, id: short.items[0].id, version: short.version });
    assert.equal(detail.items[0].name, short.items[0].name);
    assert.deepEqual(detail.items[0].fees, short.items[0].fees);
    const compare = await api({ action: "compare", request, ids: short.items.slice(0, 3).map(p => p.id), version: short.version });
    assert.equal(compare.items.length, 3);
    assert.equal(compare.version, metadata.version);
  }
  assert.equal(network.mock.callCount(), 0);
});
