import { chromium } from "playwright";
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PW_CHANNEL || "chrome",
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: "reduce",
});
const page = await context.newPage();
const calls = [],
  errors = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().includes("/functions/web-provider-query/executions"))
    calls.push(r.status());
});
await page.route(
  /https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
  (r) => r.abort(),
);
try {
  await page.goto(
    (process.env.QA_SITE_URL || "http://127.0.0.1:4180/") + "#discover",
    { waitUntil: "domcontentloaded" },
  );
  await page.locator("#pickup-search").fill("Kasyiful Ulum");
  await page
    .getByRole("button", { name: "Find pickup place", exact: true })
    .click();
  await page.locator(".place-results button").first().click({ timeout: 90000 });
  await page.locator("#service-date").fill("2026-09-21");
  await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("17:00");
  await page
    .getByRole("button", { name: "Find care options", exact: true })
    .click();
  await page.locator(".provider-row").first().waitFor({ timeout: 90000 });
  const row = page.locator(".provider-row").first();
  const name = await row.locator("h3").innerText();
  const id = await row.getAttribute("data-provider-id");
  await row.getByRole("button", { name: /^Save / }).click();
  await page
    .getByRole("button", { name: "Save centre", exact: true })
    .click();
  await page.getByRole("button", { name: /SAVED/ }).click();
  await page
    .getByRole("button", { name: "Check for a new date", exact: true })
    .click();
  assert.equal(await page.locator("#service-date").inputValue(), "");
  await page.locator("#service-date").fill("2026-09-22");
  await page
    .getByRole("button", { name: "Check saved centre", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "The details we checked haven’t changed",
      exact: true,
    })
    .waitFor({ timeout: 90000 });
  await page
    .getByRole("button", { name: "Create preparation sheet", exact: true })
    .click();
  await page
    .getByRole("heading", {
      name: "Pickup, drop-off and collection",
      exact: true,
    })
    .waitFor();
  await page.screenshot({ path: "evidence/phase4-5/preparation-live.png" });
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download sheet", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs("evidence/phase4-5/preparation-live.html");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("equalpath:saved:v1:live")),
  );
  assert.equal(stored.favourites[0].id, id);
  assert.equal(stored.favourites[0].request, undefined);
  assert.ok(calls.length > 0);
  assert.ok(calls.every((x) => x === 201 || x === 200));
  assert.deepEqual(errors, []);
  const record = {
    checkedAt: new Date().toISOString(),
    url: page.url(),
    provider: { id, name },
    publicQueryCalls: calls.length,
    actions: [
      "public-place search",
      "search",
      "save locally",
      "fresh date",
      "recheck public facts",
      "prepare",
      "download",
    ],
    ownerWrites: 0,
    externalMessages: 0,
    errors,
  };
  writeFileSync(
    "evidence/phase4-5/live-browser.json",
    JSON.stringify(record, null, 2),
  );
  console.log(record);
} finally {
  await context.close();
  await browser.close();
}
