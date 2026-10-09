import test from "node:test";
import assert from "node:assert/strict";
import { FLAGS_KEY, flagErrors, flagItems, flagsFor, parseFlags, removeFlag, serialiseFlags, upsertFlag } from "../shared/arrival-flags.mjs";
import { readArrivalFlags, writeArrivalFlags } from "../src/arrival-flag-store.js";

const p = { id: "provider_a", name: "Garden House" };
const draft = { item: { id: "photo:0", label: "Street photo · Original view" }, type: "changed", note: "  Shop sign is different now  " };
const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; };

test("7.5.1 a flag keeps the branch, the item, the kind of problem and a short note; it can be edited and removed", () => {
  let flags = upsertFlag([], p, draft, "2026-10-08T10:00:00Z", () => "f1");
  assert.deepEqual(flags[0], { id: "f1", providerId: "provider_a", providerName: "Garden House", item: draft.item, type: "changed", note: "Shop sign is different now", createdAt: "2026-10-08T10:00:00Z", updatedAt: "2026-10-08T10:00:00Z" });
  flags = upsertFlag(flags, p, { ...draft, id: "f1", type: "entrance", note: "Door is round the back" }, "2026-10-09T10:00:00Z");
  assert.equal(flags.length, 1);
  assert.equal(flags[0].type, "entrance");
  assert.equal(flags[0].createdAt, "2026-10-08T10:00:00Z");
  assert.equal(flags[0].updatedAt, "2026-10-09T10:00:00Z");
  assert.deepEqual(removeFlag(flags, "f1"), []);
});

test("a flag needs an item, a kind and a short note", () => {
  assert.deepEqual(Object.keys(flagErrors({})).sort(), ["item", "note", "type"]);
  assert.ok(flagErrors({ ...draft, note: "x".repeat(201) }).note);
  assert.deepEqual(flagErrors(draft), {});
});

test("only this centre's flags are shown on its details", () => {
  const flags = [...upsertFlag([], p, draft, undefined, () => "a"), ...upsertFlag([], { id: "other", name: "Other" }, draft, undefined, () => "b")];
  assert.deepEqual(flagsFor(flags, "provider_a").map((f) => f.id), ["a"]);
});

test("7.5.2 flags survive a reload from browser storage; broken or foreign data is ignored", () => {
  const storage = memory();
  const flags = upsertFlag([], p, draft, undefined, () => "f1");
  assert.equal(writeArrivalFlags(flags, storage), true);
  assert.deepEqual(readArrivalFlags(storage), flags);
  storage.setItem(FLAGS_KEY, "{not json");
  assert.deepEqual(readArrivalFlags(storage), []);
  assert.deepEqual(parseFlags(serialiseFlags([{ id: 1 }])), []);
});

test("7.5.2 a failed write reports failure and leaves the saved flags as they were", () => {
  const storage = memory();
  const saved = upsertFlag([], p, draft, undefined, () => "f1");
  writeArrivalFlags(saved, storage);
  const full = { ...storage, setItem: () => { throw new Error("QuotaExceededError"); } };
  assert.equal(writeArrivalFlags([...saved, ...upsertFlag([], p, draft, undefined, () => "f2")], full), false);
  assert.deepEqual(readArrivalFlags(storage), saved);
});

test("the items to flag are the address, the map place and each street view", () => {
  assert.deepEqual(flagItems(p, [{ direction: "Original view" }, { direction: "Look left" }]).map((i) => i.id), ["address", "map", "photo:0", "photo:1"]);
});
