import test from "node:test";
import assert from "node:assert/strict";
import { encodeChecklist, decodeChecklist } from "../shared/checklist-share.mjs";

test("a shared checklist link round-trips one child and two children", () => {
  const one = { mode: "live", date: "2026-10-12", transport: "self", pickup: { label: "KL Sentral", lat: 3.13391, lng: 101.68688 },
    items: [{ id: "provider_4f0f58b2f50eedf3b38e0c4f5cd", start: "09:00", end: "15:00", age: "3" }], checked: ["bag", "water"] };
  const link = encodeChecklist(one);
  assert.ok(link.length < 120, link);
  const back = decodeChecklist(link);
  assert.equal(back.items[0].id, one.items[0].id);
  assert.deepEqual(back.checked, ["bag", "water"]);
  assert.equal(back.pickup.label, "KL Sentral"); assert.equal(back.transport, "self"); assert.equal(back.date, "2026-10-12");
  const two = { ...one, mode: "demo", transport: "", pickup: { label: "Office ~ 2.0 * tower", lat: 3.1, lng: 101.6 },
    items: [{ id: "demo-garden", start: "13:00", end: "18:00", age: "2" }, { id: "demo-meadow", start: "13:00", end: "18:00", age: "3" }], checked: ["a:bag", "family:instructions"] };
  const b2 = decodeChecklist(encodeChecklist(two));
  assert.equal(b2.mode, "demo"); assert.equal(b2.items.length, 2); assert.equal(b2.items[1].id, "demo-meadow");
  assert.equal(b2.pickup.label, "Office ~ 2.0 * tower"); assert.deepEqual(b2.checked, ["a:bag", "family:instructions"]);
});

test("broken or foreign links open nothing", () => {
  for (const x of ["", "2~L", "1~L~2026~1,2~x~S~a.0900.1500.3~", "1~L~20261012~x,y~a~S~a.0900.1500.3~", "1~L~20261012~1,2~a~S~~"])
    assert.equal(decodeChecklist(x), null);
});
