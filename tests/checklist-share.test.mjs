import test from "node:test";
import assert from "node:assert/strict";
import { packChecklist, unpackChecklist } from "../shared/checklist-share.mjs";

const sample = { v: 1, t: "Tadika Nemo Bestari", d: "Mon, 12 Oct 2026", b: "For a 3-year-old · 3 h of care",
  s: [["09:47", "Leave KL Sentral"], ["", "At Tadika Nemo Bestari"], ["12:47", "Collect your child"]],
  c: [["Tadika Nemo Bestari", "12 Jalan Example, Kuala Lumpur", "016-323 4369", null, null]],
  g: [["Pack for your child", [["Bag with name", "Pack a bag labelled with your child’s name.", [], null, [["bag", null, 1]]],
    ["Lunch & snack", "Pack lunch and a snack — or pay for the centre’s meal.", ["Care covers lunch", "Centre listing"], "Centre meal: RM8/day", [["meal", null, 0]]]]]],
  n: "Each centre still needs to confirm a place." };

test("a shared checklist packs into the link and unpacks unchanged", async () => {
  const code = await packChecklist(sample);
  assert.match(code, /^[A-Za-z0-9_-]+$/);
  assert.ok(code.length < 600, String(code.length));
  assert.deepEqual(await unpackChecklist(code), sample);
});

test("broken links open nothing", async () => {
  for (const x of ["", "abc", "%%%", (await packChecklist({ v: 2 }))]) assert.equal(await unpackChecklist(x), null);
});
