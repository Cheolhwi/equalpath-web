import { expect } from "@playwright/test";

export async function openSearch(page) {
  const onboarding = page.locator('.preference-onboarding');
  if (await onboarding.isVisible()) {
    await onboarding.getByRole('button', { name: 'Skip for now', exact: true }).click();
    await expect(onboarding).toBeHidden();
  }
  if (await page.locator(".mobile-search-summary").isVisible()) await page.locator(".mobile-search-summary").click();
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

export async function chooseAge(page, age = "4") {
  const year = age === "1-3" ? "2" : age === "4-6" ? "4" : String(age);
  const group = year === "0" ? "Under 1 year" : `${year} ${year === "1" ? "year" : "years"}`;
  if (!await page.getByRole('radio', { name:group, exact:true }).isVisible()) await openSearch(page);
  await page.getByRole("radio", { name: group, exact: true }).check();
}
