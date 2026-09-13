import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { demoPickup } from "../../server/fixtures.mjs";
import { template } from "../../shared/saved.mjs";

const out = process.env.QA_EVIDENCE_DIR || ".build/saved-reminder";
mkdirSync(out, { recursive: true });
async function start(page, count) {
  const searches = [], api = createAPI();
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "search") searches.push(body);
    await route.fulfill({ json: { ok: true, ...await api({ ...body, mode: "demo" }) } });
  });
  const templates = Array.from({ length: count }, (_, i) => template({ pickup: demoPickup,
    deadline: i ? "12:00" : "13:15", end: "17:45", transport: "self" }, i ? "After lunch" : "Weekday pickup"));
  // Seed only once so reload/deletion checks use the actual stored library.
  await page.addInitScript((templates) => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    if (!sessionStorage.getItem("saved-reminder-seeded")) {
      localStorage.setItem("equalpath:saved:v1:demo", JSON.stringify({ version: 1, favourites: [], templates }));
      sessionStorage.setItem("saved-reminder-seeded", "true");
    }
  }, templates);
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  return searches;
}

test("a returning user can reuse the highlighted search without restoring an old date or submitting automatically", async ({ page }) => {
  const searches = await start(page, 1);
  const reminder = page.getByRole("region", { name: "Saved search reminder" });
  await expect(reminder).toContainText("Weekday pickup");
  await expect(page.locator("#deadline")).toHaveValue("16:00");
  await page.screenshot({ path: `${out}/saved-reminder-desktop.png` });
  await reminder.getByRole("button", { name: "Use this search", exact: true }).click();
  await expect(page.locator("#service-date")).toHaveValue("");
  await expect(page.locator("#age")).toHaveValue("");
  await expect(page.locator("#deadline")).toHaveValue("13:15");
  await expect(page.locator("#care-end")).toHaveValue("17:45");
  await expect(page.locator("#transport")).toHaveValue("self");
  expect(searches).toHaveLength(0);
  await page.locator("#service-date").fill("2026-09-22");
  await page.getByRole("button", { name: "Find care options", exact: true }).click();
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0].request).toMatchObject({ date: "2026-09-22", deadline: "13:15", end: "17:45" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(reminder).toBeVisible();
  await expect(page.locator("#deadline")).toHaveValue("16:00");
});

test("multiple searches open the search tab on a phone, and deleted or other-mode templates do not leave a reminder", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await start(page, 2);
  const reminder = page.getByRole("region", { name: "Saved search reminder" });
  await expect(reminder).toContainText("2 saved searches");
  const box = await reminder.boundingBox(); expect(box.x + box.width).toBeLessThanOrEqual(320);
  await page.screenshot({ path: `${out}/saved-reminder-mobile.png` });
  await reminder.getByRole("button", { name: "Choose a saved search" }).click();
  const dialog = page.getByRole("dialog", { name: "Saved for later", exact: true });
  await expect(dialog.getByRole("button", { name: "Searches 2", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.screenshot({ path: `${out}/saved-searches-mobile.png` });
  await dialog.locator("article").filter({ hasText: "After lunch" }).getByRole("button", { name: "Use this search" }).click();
  await expect(page.locator("#deadline")).toHaveValue("12:00");
  await expect(page.locator("#service-date")).toHaveValue("");
  await page.goto("/?mode=live#discover", { waitUntil: "domcontentloaded" });
  await expect(reminder).toHaveCount(0);
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await reminder.getByRole("button", { name: "Choose a saved search" }).click();
  for (const name of ["Weekday pickup", "After lunch"]) await dialog.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "No saved searches yet" })).toBeVisible();
  await dialog.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect(reminder).toHaveCount(0);
});
