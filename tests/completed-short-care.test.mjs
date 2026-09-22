import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createPublishedStore } from "../server/published-catalog.mjs";
import { applyCompletedShortCareData } from "../server/completed-short-care.mjs";

const payload = JSON.parse(readFileSync(new URL("../server/data/short-care-completed-20260923.json", import.meta.url), "utf8"));

test("current provider, review and fee handoffs cover the short-care pool without publishing raw review text", async () => {
  assert.equal(payload.summary.providers, 101);
  assert.equal(payload.summary.reviewProviders, 101);
  assert.equal(payload.summary.reviews, 10211);
  assert.equal(payload.summary.feeProviders, 101);
  assert.equal(payload.feeSourceKind, "user_provided_fee_sheet");
  assert.doesNotMatch(JSON.stringify(payload), /review_text|I signed up for|I booked/);

  const catalog = await createPublishedStore().catalog();
  const merged = applyCompletedShortCareData(catalog);
  const shortCare = merged.items.filter(item => catalog.shortCareIds.includes(item.id));
  assert.equal(shortCare.length, 101);
  assert.ok(shortCare.every(item => item.completedShortCare?.current === true));
  assert.ok(shortCare.every(item => item.reviewEvidence?.current === true));
  assert.ok(shortCare.every(item => item.reviewEvidence?.sourceKind === "user_provided_review_sheet" || item.reviewEvidence?.sourceKind === "mixed_user_provided_review_sources"));

  const fee = shortCare.flatMap(item => item.fees ?? []).find(item => item.verification === "current_fee_data");
  assert.ok(fee, "at least one current fee must reach the public short-care result");
  assert.equal(fee.source.kind, "user_provided_fee_sheet");
  assert.equal(fee.provenance.kind, "current_fee_data");
  assert.ok(shortCare.some(item => item.completedShortCare.facts.transportFeeMYRMonth === null));
});
