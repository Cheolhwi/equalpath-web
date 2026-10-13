import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";

// First visit (12 Oct 2026): the privacy card shows once on the map, before the
// tour offer; the full notice opens from the card and from Settings.
test.use({ storageState: { cookies: [], origins: [] } });

async function mock(page) {
  const api = createAPI({ store: { catalog: async () => fixtureCatalog } });
  await page.route("**/api", async (route) => route.fulfill({ json: { ok: true, ...(await api(route.request().postDataJSON())) } }));
}

async function openSettings(page) {
  const reveal = page.getByRole("button", { name: "Show menu", exact: true });
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole("button", { name: "Display and data settings", exact: true }).click();
}

for (const [width, height] of [[390, 844], [1440, 900]]) test(`${width}px: the privacy card shows once, before the tour offer`, async ({ page }) => {
  await page.setViewportSize({ width, height });
  await mock(page);
  await page.addInitScript(() => {
    if (localStorage.getItem("equalpath:interests:v1:live") === null)
      localStorage.setItem("equalpath:interests:v1:live", JSON.stringify({ version: 1, enabled: true, visits: [], hidden: [], preferences: [], preferenceSetup: "skipped" }));
  });
  await page.goto("/#discover");
  const card = page.locator(".privacy-card");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Your privacy");
  await expect(page.locator(".tour-invite")).toHaveCount(0);

  await card.getByRole("button", { name: "Read the privacy notice", exact: true }).click();
  const notice = page.getByRole("dialog", { name: "Privacy notice" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("Clear data on this device");
  await page.keyboard.press("Escape");
  await expect(notice).toHaveCount(0);
  await expect(card).toHaveCount(0);
  await expect(page.locator(".tour-invite")).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("equalpath:privacy:v1")))).toEqual({ version: 2 });

  await page.reload();
  await expect(page.locator("#pickup-search")).toBeVisible();
  await expect(page.locator(".privacy-card")).toHaveCount(0);
  await openSettings(page);
  await page.getByRole("button", { name: "Read privacy notice", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Privacy notice" })).toBeVisible();

  // Clearing data returns to the landing without reloading App. The next
  // map entry must still show the notice, even after it was dismissed here.
  await page.keyboard.press("Escape");
  await openSettings(page);
  await page.getByRole("button", { name: "Clear data", exact: true }).click();
  await page.getByRole("button", { name: "Clear everything", exact: true }).click();
  await expect(page.locator(".experience")).toHaveAttribute("data-intro-phase", "welcome");
  await page.locator(".landing-entry").getByRole("button", { name: "FIND CHILDCARE", exact: true }).click();
  await page.getByRole("button", { name: "Skip for now", exact: true }).click();
  await expect(card).toBeVisible();
});
