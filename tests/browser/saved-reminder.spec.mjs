import { chooseAge, openSearch } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { demoPickup, fixtureProviders } from "../../server/fixtures.mjs";
import { template, favourite } from "../../shared/saved.mjs";

const out = process.env.QA_EVIDENCE_DIR || ".build/saved-reminder";
mkdirSync(out, { recursive: true });
async function start(page, count, favourites = [], mapOnly = false) {
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
  await page.addInitScript(({templates, favourites}) => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    if (!sessionStorage.getItem("saved-reminder-seeded")) {
      localStorage.setItem("equalpath:saved:v1:demo", JSON.stringify({ version: 1, favourites, templates }));
      sessionStorage.setItem("saved-reminder-seeded", "true");
    }
  }, {templates, favourites});
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  if (!mapOnly) await openSearch(page);
  return searches;
}

for (const width of [320, 1440]) test(`${width}px: saved centres and searches are visible directly on the map and survive a reload`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  const centre = favourite(fixtureProviders[0]);
  const searches = await start(page, 2, [centre], true);
  const shortcuts = page.locator('.map-quick-actions');
  const saved = page.getByRole('dialog', { name: 'Saved for later', exact: true });
  await expect(page.locator('.discovery-panel')).not.toBeVisible();
  await expect(shortcuts).toContainText(centre.name);
  await expect(shortcuts).toContainText('After lunch');
  await shortcuts.getByRole('button', { name: 'Saved searches (2)', exact: true }).click();
  await expect(saved.getByRole('button', { name: 'Searches 2', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await saved.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await shortcuts.getByRole('button', { name: 'Saved centres (1)', exact: true }).click();
  await expect(saved.getByRole('heading', { name: centre.name, exact: true })).toBeVisible();
  await saved.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(shortcuts).toContainText(centre.name);
  await expect(shortcuts).toContainText('After lunch');
  for (const button of await shortcuts.getByRole('button').all()) {
    const box = await button.boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(width);
  }
  await page.screenshot({ path: `${out}/map-saved-${width}.png` });
  await shortcuts.getByRole('button', { name: 'Saved searches (2)', exact: true }).click();
  await saved.locator('article').filter({ hasText: 'After lunch' }).getByRole('button', { name: 'Use this search' }).click();
  await expect(page.locator('#service-date')).toHaveValue('');
  await expect(page.locator('#deadline')).toContainText('12:00');
  await expect(page.locator('[data-field="age"]')).toContainText('Select');
  expect(searches).toHaveLength(0);
  await page.locator('#service-date').fill('2026-09-22');
  await page.locator('[data-field="age"]').click();
  await page.getByRole('radio', { name: '4–6 years', exact: true }).click();
  await page.getByRole('button', { name: 'Find childcare', exact: true }).click();
  const cards = page.locator('.map-centre-card:not(.leaving)');
  await expect(cards).toHaveCount(3);
  const rects = await cards.evaluateAll(elements => elements.map(el => {
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return { left, top, right, bottom };
  }));
  for (const [index, a] of rects.entries()) for (const b of rects.slice(index + 1))
    expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top).toBe(true);
});

test("a returning user can reuse the highlighted search without restoring an old date or submitting automatically", async ({ page }) => {
  const searches = await start(page, 1);
  const reminder = page.getByRole("region", { name: "Saved search reminder" });
  await expect(reminder).toContainText("Weekday pickup");
  await expect(page.locator("#deadline")).toHaveValue("16:00");
  await page.screenshot({ path: `${out}/saved-reminder-desktop.png` });
  await reminder.getByRole("button", { name: "Use this search", exact: true }).click();
  await openSearch(page);
  await expect(page.locator("#service-date")).toHaveValue("");
  await expect(page.locator("#age input:checked")).toHaveCount(0);
  await expect(page.locator("#deadline")).toHaveValue("13:15");
  await expect(page.locator("#care-end")).toHaveValue("17:45");
  await expect(page.locator("#transport")).toHaveValue("self");
  expect(searches).toHaveLength(0);
  await page.locator("#service-date").fill("2026-09-22");
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0].request).toMatchObject({ date: "2026-09-22", deadline: "13:15", end: "17:45" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await openSearch(page);
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
  await openSearch(page);
  await expect(page.locator("#deadline")).toHaveValue("12:00");
  await expect(page.locator("#service-date")).toHaveValue("");
  await page.goto("/?mode=live#discover", { waitUntil: "domcontentloaded" });
  await expect(reminder).toHaveCount(0);
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await openSearch(page);
  await reminder.getByRole("button", { name: "Choose a saved search" }).click();
  for (const name of ["Weekday pickup", "After lunch"]) await dialog.getByRole("button", { name: `Remove ${name}`, exact: true }).click();
  await expect(dialog.getByRole("heading", { name: "No saved searches yet" })).toBeVisible();
  await dialog.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect(reminder).toHaveCount(0);
});

for (const width of [320, 1440]) test(`${width}px: an existing saved centre appears on search and opens the centre tab after viewing saved searches`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 });
  const centre = favourite(fixtureProviders[0]);
  const searches = await start(page, 0, [centre]);
  const reminder = page.getByRole("region", { name: "Saved centres", exact: true });
  const dialog = page.getByRole("dialog", { name: "Saved for later", exact: true });
  await expect(reminder).toContainText(centre.name);
  await expect(page.getByRole("region", { name: "Saved search reminder" })).toHaveCount(0);
  await expect(page.getByRole("radio", { name: "Short time", exact: true })).toBeChecked();
  await expect(page.locator(".intro-scope, .time-place")).toHaveCount(0);
  await expect(page.locator("#age legend")).toHaveText("Age");
  await expect(page.locator('label[for="pickup-search"]')).toHaveClass("sr-only");
  await expect(page.getByRole("textbox", { name: "Where will your child leave from?", exact: true })).toBeVisible();
  await page.screenshot({ path: `${out}/saved-centre-search-${width}.png` });
  await page.getByRole("button", { name: "Saved searches", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Searches 0", exact: true })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await reminder.getByRole("button").click();
  await expect(dialog.getByRole("button", { name: "Childcare 1", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("heading", { name: centre.name, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.reload({ waitUntil: "domcontentloaded" });
  await openSearch(page);
  await expect(reminder).toContainText(centre.name);
  await page.getByRole("button", { name: "Saved centres (1)", exact: true }).click();
  await expect(dialog.getByRole("heading", { name: centre.name, exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: `Remove ${centre.name}`, exact: true }).click();
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(reminder).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Saved centres", exact: true })).toBeVisible();
  expect(searches).toHaveLength(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
