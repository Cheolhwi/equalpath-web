import { expect } from "@playwright/test";

export async function openSearch(page) {
  if (await page.locator(".map-search-launch").isVisible()) await page.locator(".map-search-launch").click();
  const change = page.getByRole('button', {name:'Change search', exact:true});
  if (await change.isVisible()) await change.click();
  await expect(page.locator(".discovery-panel")).toBeVisible();
}

export async function openResults(page) {
  if (await page.locator('.discovery-panel .results-toolbar').isVisible()) return;
  await expect(page.locator(".map-quick-actions button").first()).toContainText(/^All/);
  await page.locator(".map-quick-actions button").first().click();
  await expect(page.locator(".discovery-panel")).toBeVisible();
}

export async function revealPreferences(page) {
  const preferences = page.locator(".optional-preferences");
  if (await preferences.isVisible() && await preferences.getAttribute("open") === null)
    await preferences.locator(":scope > summary").click();
}

export async function chooseAge(page, age = "4-6") {
  const group = age === "1-3" || (Number(age) > 0 && Number(age) < 4) ? "1–3 years" : "4–6 years";
  if (!await page.getByRole('radio', { name:group, exact:true }).isVisible()) await openSearch(page);
  await page.getByRole("radio", { name: group, exact: true }).check();
}
