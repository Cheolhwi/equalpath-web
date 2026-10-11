import { chooseAge, openNearby, openResults, openSearch, returningVisitor, setDate, setTimes, submitSearch } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { mkdirSync } from "node:fs";

const out = process.env.QA_EVIDENCE_DIR || ".build/read-budget";
mkdirSync(out, { recursive: true });
// The bundled published catalogue answers nearby, search, details and compare
// with no TablesDB reads. EqualPath is short-term care only since 2 Oct 2026.
for (const width of [1440, 390]) test(`published catalogue works without TablesDB on ${width}px`, async ({ page }) => {
  await page.setViewportSize({ width, height: 950 });
  const errors = [], responses = [];
  page.on("pageerror", error => errors.push(error.message));
  const api = createAPI({ reverseGeocode: null, drivingRoutes: async (_, rows) => rows.map(p => ({ ...p, driving: { state: "unavailable" } })) });
  await page.route("**/api", async route => {
    const body = route.request().postDataJSON();
    const result = await api(body);
    responses.push({ action: body.action, result });
    await route.fulfill({ json: { ok: true, ...result } });
  });
  await returningVisitor(page);
  await page.addInitScript(() => {
    const pickup = { lat: 3.134, lng: 101.6863, label: "KL Sentral" };
    localStorage.setItem("equalpath:map:v1:live", JSON.stringify({ version: 1, zoom: 13, center: pickup, pickup }));
  });
  await page.goto("/#discover");
  await openNearby(page);
  await expect(page.locator(".nearby-card")).toHaveCount(10);
  const nearby = responses.filter(x => x.action === "nearby").at(-1).result;
  expect(nearby.items.every(p => p.distanceKm <= 5)).toBe(true);
  await openSearch(page);
  await setDate(page, "2026-09-21"); await chooseAge(page); await setTimes(page, "13:00", "17:00");
  await submitSearch(page); await openResults(page);
  const short = responses.filter(x => x.action === "search").at(-1).result;
  expect(short.collection.total).toBe(101);
  expect(short.items.length).toBeGreaterThan(0);
  expect(short.items.every(p => p.distanceKm <= 5)).toBe(true);
  await expect(page.locator(".provider-row")).toHaveCount(short.items.length);
  await expect(page.locator(".results-toolbar")).toContainText("within 5 km");
  await page.locator(".provider-row").first().getByRole("button", { name: /^View details for/ }).click();
  await expect(page.locator(".centre-metrics")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  for (const index of [0, 1]) await page.locator(".provider-row").nth(index).getByRole("button", { name: /^Compare / }).click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Compare/}).click();
  await expect(page.locator(".comparison-scroll table")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: `${out}/published-catalogue-${width}.png` });
  expect(errors).toEqual([]);
});
