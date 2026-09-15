import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";

const out = process.env.QA_EVIDENCE_DIR || ".build/sort-menu";
mkdirSync(out, { recursive: true });
async function start(page) {
  const searches = [], base = fixtureCatalog.items[0];
  const items = ["A", "B", "C"].map((name, i) => ({
    ...structuredClone(base), id: `test-${name}`, name: `Test Centre ${name}`,
    location: { lat: 3.139 + i * .001, lng: 101.6869 }, feeRule: null,
    fees: [{ amount: 900 - i * 100, currency: "MYR", basis: "month", kind: "programme" }],
  }));
  const api = createAPI({
    store: { catalog: async () => ({ ...fixtureCatalog, items }) },
    drivingRoutes: async (_, rows) => rows.map((p) => ({ ...p, driving: { state: "available", minutes: 8, distanceKm: 3 } })),
  });
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "search") searches.push(body.request?.sort ?? body.sort);
    const result = await api(body);
    if (result.ordering) result.ordering.available.closing = false;
    await route.fulfill({ json: { ok: true, ...result } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    localStorage.setItem("equalpath:map:v1:live", JSON.stringify({
      version: 1, zoom: 13, center: { lat: 3.139, lng: 101.6869 },
      pickup: { id: null, label: "KL Sentral", lat: 3.139, lng: 101.6869 },
    }));
  });
  await page.goto("/?care=short_term#discover");
  await page.locator("#service-date").fill("2026-09-14");
  await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("17:00");
  await page.locator("#transport").selectOption("self");
  await page.getByRole("button", { name: "Find care options", exact: true }).click();
  await expect(page.locator(".provider-row")).toHaveCount(3);
  return searches;
}
const activeOption = async (page, trigger) => page.locator(`[id="${await trigger.getAttribute("aria-activedescendant")}"]`);

test("styled sorting previews without queries, skips unavailable options and supports keyboard dismissal", async ({ page }) => {
  const searches = await start(page);
  const trigger = page.getByRole("combobox", { name: "Order search results", exact: true });
  await trigger.click();
  await expect(page.getByRole("option", { selected: true })).toHaveText("Nearest first");
  await expect(page.getByRole("option", { name: "By name", exact: true })).toHaveCount(0);
  await expect(page.getByRole("option", { name: /Later care end time/ })).toBeDisabled();
  await page.screenshot({ path: `${out}/sort-desktop.png` });
  await trigger.press("ArrowDown");
  await expect(await activeOption(page, trigger)).toHaveText("Lowest monthly fee");
  await trigger.press("ArrowDown");
  await expect(await activeOption(page, trigger)).toHaveText("Centres with pickup first");
  expect(searches).toHaveLength(1);
  await trigger.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.press("l");
  await trigger.press("Enter");
  await expect(trigger).toHaveText("Lowest monthly fee");
  await expect(page.locator(".provider-row").first()).toHaveAttribute("data-provider-id", "test-C");
  expect(searches).toHaveLength(2);
  await trigger.click();
  await page.getByRole("option", { name: "Lowest monthly fee", exact: true }).click();
  expect(searches).toHaveLength(2);
  await trigger.click();
  await trigger.press("Tab");
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await trigger.click();
  await page.getByRole("heading", { name: "Find childcare", exact: true }).click();
  await expect(page.getByRole("listbox")).toHaveCount(0);
});

test("sorting stays on small screens and Escape closes the menu without closing comparison", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  const trigger = page.getByRole("combobox", { name: "Order search results", exact: true });
  await trigger.scrollIntoViewIfNeeded();
  await trigger.click();
  const menu = page.getByRole("listbox");
  let box = await menu.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(390);
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: `${out}/sort-mobile.png` });
  // Less space below the trigger must flip the open popup above it.
  await page.setViewportSize({ width: 390, height: 600 });
  await expect.poll(async () => (await menu.boundingBox()).y).toBeLessThan((await trigger.boundingBox()).y);
  await page.screenshot({ path: `${out}/sort-upward.png` });
  await trigger.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  for (const name of ["A", "B"]) await page.getByRole("button", { name: `Compare Test Centre ${name}`, exact: true }).click();
  await page.getByRole("navigation", { name: "Main navigation" }).getByRole("button", { name: /COMPARE/ }).click();
  const priority = page.getByRole("combobox", { name: "Comparison priority", exact: true });
  await priority.click();
  await expect(menu).toBeVisible();
  await expect(page.getByRole("option", { name: "By name", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${out}/sort-comparison-mobile.png` });
  await priority.press("Escape");
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(priority).toBeFocused();
  await expect(menu).toHaveCount(0);
  await priority.press("End");
  await priority.press("Enter");
  await expect(priority).toHaveText("Centres with pickup first");
  await page.setViewportSize({ width: 320, height: 700 });
  await priority.click();
  box = await menu.boundingBox();
  expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y + box.height).toBeLessThanOrEqual(700);
  await page.screenshot({ path: `${out}/sort-comparison-320.png` });
  await priority.press("Escape");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Display and data settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await trigger.click();
  expect(await menu.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(43, 50, 45)");
  await page.screenshot({ path: `${out}/sort-dark.png` });
  expect(errors).toEqual([]);
});
