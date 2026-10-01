import test from "node:test";
import assert from "node:assert/strict";
import { displayName, placeLabel, placeLine, categoryLabel, tidyCaps } from "../shared/display.mjs";

test("all-caps register names read as names, keeping acronyms and mixed-case spellings", () => {
  assert.equal(displayName("ETIQA MAYBANK TIGER CUBS CHILD CARE CENTRE"), "Etiqa Maybank Tiger Cubs Child Care Centre");
  assert.equal(displayName("KBMC CHILD CARE CENTRE PLT"), "KBMC Child Care Centre PLT");
  assert.equal(displayName("TASKA PEREKA ILMU SDN BHD"), "Taska Pereka Ilmu Sdn Bhd");
  assert.equal(displayName("TASKA AZ-ZAHRAH"), "Taska Az-Zahrah");
  assert.equal(displayName("LITTLE DREAMERS CHILDCARE CENTRE (RC RESIDENCE)"), "Little Dreamers Childcare Centre (RC Residence)");
  assert.equal(displayName("TOY8 Playground — The Gardens Mall"), "TOY8 Playground — The Gardens Mall");
  assert.equal(tidyCaps(""), "");
  assert.equal(displayName(undefined), undefined);
});

test("places drop zone and territory prefixes and never repeat themselves", () => {
  assert.equal(placeLabel({ district: "ZON BANGSAR/PUDU", region: "Kuala Lumpur" }), "Bangsar/Pudu");
  assert.equal(placeLabel({ district: "W.P. Kuala Lumpur", region: "Kuala Lumpur" }), "Kuala Lumpur");
  assert.equal(placeLine({ district: "Kuala Lumpur", region: "Kuala Lumpur" }), "Kuala Lumpur");
  assert.equal(placeLine({ district: "HULU LANGAT", region: "Selangor" }), "Hulu Langat, Selangor");
  assert.equal(placeLabel({ district: null, region: "Selangor" }), "Selangor");
  assert.equal(categoryLabel({ category: "CHILDCARE" }), "Childcare centre");
  assert.equal(categoryLabel({ category: "TASKA" }), "TASKA");
});
