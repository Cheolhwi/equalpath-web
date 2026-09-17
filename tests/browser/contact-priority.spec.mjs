import { chooseAge, openResults, openSearch, revealPreferences } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog, demoPickup } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const out = process.env.QA_EVIDENCE_DIR || ".build/contact-priority";
mkdirSync(out, { recursive: true });
test("contact priority stays consistent across results, map and comparison, with a contact-free second-page fallback", async ({ page }) => {
  const base = fixtureCatalog.items[0], source = { label: "Test published contact", url: "https://example.com/contact" };
  const items = Array.from({ length: 15 }, (_, i) => ({ ...structuredClone(base), id: `p-${i}`, name: `Test centre ${i}`, mode: "live",
    location: { lat: 3.139 + i * .001, lng: 101.6869 }, phone: i === 8 || i === 0 ? { display: "03-1234 5678", source } : null,
    whatsapp: i === 9 ? [{ href: "https://wa.me/60312345678", display: "03-1234 5678", source, scope: "website" }] : [],
    admission: { ...base.admission, value: i !== 0 }, feeRule: null,
    fees: [{ amount: (i + 1) * 100, basis: "hour", currency: "MYR", kind: "programme", source }],
  }));
  const api = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items }) }, drivingRoutes: async (_, rows) => rows });
  await page.route("**/api", async route => route.fulfill({ json: { ok: true, ...await api(route.request().postDataJSON()) } }));
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
  await page.addInitScript(pickup => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    localStorage.setItem("equalpath:map:v1:live", JSON.stringify({ version: 1, center: pickup, zoom: 13, pickup }));
  }, { ...demoPickup, label: "KL Sentral" });
  await page.goto("/?care=short_term#discover", { waitUntil: "domcontentloaded" });await openSearch(page);
  await page.locator("#service-date").fill("2026-09-14"); await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("18:00"); await revealPreferences(page); await page.locator("#transport").selectOption("self");
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();await openResults(page);
  const suggested = page.locator(".provider-row.suggested");
  await expect(suggested).toHaveCount(2);
  expect(await suggested.evaluateAll(rows => rows.map(p => p.dataset.providerId))).toEqual(["p-8", "p-9"]);
  expect(await page.locator(".provider-pin.suggested").evaluateAll(rows => rows.map(p => p.dataset.providerId).sort())).toEqual(["p-8", "p-9"]);
  await expect(page.locator(".provider-row")).toHaveCount(10);
  await expect(page.locator(".provider-row").last()).toHaveAttribute("data-provider-id", "p-0");
  await expect(page.locator(".provider-pin.conflict")).toHaveAttribute("data-provider-id", "p-0");
  await page.getByRole("combobox", { name: "Order search results", exact: true }).click();
  await page.getByRole("option", { name: "Lowest fee", exact: true }).click();
  await expect(page.locator(".provider-row").first()).toHaveAttribute("data-provider-id", "p-8");
  await page.getByRole("button", { name: "Why this order?", exact: true }).click();
  await expect(page.getByRole("dialog")).not.toContainText(/phone|WhatsApp|contact details/i);
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.screenshot({ path: `${out}/contacts-search-desktop.png` });
  for (const i of [1, 8, 9]) await page.getByRole("button", { name: `Compare Test centre ${i}`, exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /Compare/ }).click();
  await expect(page.locator("th.comparison-best")).toHaveAttribute("data-provider-id", "p-8");
  await expect(page.locator(".comparison-priority-message")).not.toContainText(/phone|WhatsApp|contact details/i);
  await page.getByRole("combobox", { name: "Comparison priority", exact: true }).click();
  await page.getByRole("option", { name: "Lowest fee", exact: true }).click();
  await expect(page.locator("th.comparison-best")).toHaveAttribute("data-provider-id", "p-8");
  await page.screenshot({ path: `${out}/contacts-comparison-desktop.png` });
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole('button',{name:'Close search panel'}).click();
  await expect(page.locator(".provider-pin.suggested")).toHaveCount(2);
  await page.screenshot({ path: `${out}/contacts-map-mobile.png` });
  await openResults(page);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(page.locator(".provider-row")).toHaveCount(5);
  await expect(suggested).toHaveCount(3);
  expect(await suggested.evaluateAll(rows => rows.map(p => p.dataset.providerId))).toEqual(["p-10", "p-11", "p-12"]);
  expect(await page.locator(".provider-pin.suggested").evaluateAll(rows => rows.map(p => p.dataset.providerId).sort())).toEqual(["p-10", "p-11", "p-12"]);
});
