import { openNearby, pickTime } from './ui-helpers.mjs';
import { test, expect } from '@playwright/test';
import { createAPI } from '../../server/api.mjs';
import { demoPickup, fixtureProviders } from '../../server/fixtures.mjs';
import { template, favourite } from '../../shared/saved.mjs';

const savedKey = 'equalpath:saved:v1:demo';
const legacy = template({ pickup: demoPickup, deadline: '13:00', end: '17:00' }, 'Old search');
async function start(page, favourites = []) {
  const api = createAPI();
  await page.route('**/api', async route => route.fulfill({ json: { ok: true, ...await api({ ...route.request().postDataJSON(), mode: 'demo' }) } }));
  await page.addInitScript(({ legacy, favourites, savedKey }) => {
    localStorage.setItem('equalpath:tour:v1', '{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:interests:v1:live', JSON.stringify({ version: 1, enabled: true, visits: [], hidden: [], preferences: [], preferenceSetup: 'skipped' }));
    if (!sessionStorage.getItem('seeded')) {
      localStorage.setItem(savedKey, JSON.stringify({ version: 1, favourites, templates: [legacy] }));
      sessionStorage.setItem('seeded', 'true');
    }
  }, { legacy, favourites, savedKey });
  await page.goto('/?mode=demo#discover');
}
// Saved lives in the top navigation; the map has only the list button (8 Oct 2026).
for (const width of [320, 1440]) test(`${width}px: saved childcare stays visible; legacy searches have no controls or badges`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const centre = favourite(fixtureProviders[0]);
  await start(page, [centre]);
  const savedNav = page.getByRole('navigation').getByRole('button', { name: /^Saved/ });
  await expect(page.locator('.map-quick-actions')).not.toContainText(centre.name);
  await expect(page.getByRole('button', { name: /Saved searches|Save this search/ })).toHaveCount(0);
  await expect(savedNav).toHaveText('Saved 1');
  await savedNav.click();
  const dialog = page.getByRole('dialog', { name: 'Saved for later', exact: true });
  await expect(dialog.getByRole('heading', { name: centre.name, exact: true })).toBeVisible();
  await expect(dialog.locator('.saved-tabs button')).toHaveText(['Childcare 1', 'For you']);
  await dialog.getByRole('button', { name: 'For you', exact: true }).click();
  await expect(dialog.getByRole('heading', { name: 'What care do you need this time?' })).toBeVisible();
  await dialog.getByRole('button', { name: 'Childcare 1', exact: true }).click();
  await dialog.getByRole('button', { name: `Edit ${centre.name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.reload();
  await expect(savedNav).toHaveText('Saved 1');
  expect(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).templates, savedKey)).toEqual([legacy]);
  await openNearby(page);
  await expect(page.locator('.saved-centre-reminder')).toContainText(centre.name);
  await expect(page.locator('.saved-search-reminder')).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Saved searches|Save this search/ })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test('a browser with only legacy searches opens the childcare empty state without a misleading Saved count', async ({ page }) => {
  await start(page);
  await expect(page.getByRole('navigation').getByRole('button', { name: /^Saved/ })).toHaveText('Saved ');
  await page.getByRole('navigation').getByRole('button', { name: /^Saved/ }).click();
  await expect(page.getByRole('heading', { name: 'Save childcare you like' })).toBeVisible();
  await expect(page.getByText('Old search', { exact: true })).toHaveCount(0);
});
test('one shared care plan checks every saved centre', async ({ page }) => {
  const favourites = [favourite(fixtureProviders[0]), favourite(fixtureProviders[1])];
  await start(page, favourites);
  await page.getByRole('navigation').getByRole('button', { name: /^Saved/ }).click();
  const dialog = page.getByRole('dialog', { name: 'Saved for later', exact: true });
  await expect(dialog.getByRole('heading', { name: 'Check all saved centres', exact: true })).toBeVisible();
  await expect(dialog.getByText('Use one date and time for all 2 saved centres.', { exact: true })).toBeVisible();
  await dialog.getByLabel('Date for all saved centres').fill('2026-09-24');
  // Age and times use the app's own menu and picker (9 Oct 2026), not browser controls.
  await dialog.getByRole('combobox', { name: 'Child’s age for all saved centres' }).click();
  await page.getByRole('option', { name: '2 years', exact: true }).click();
  await pickTime(page, dialog.locator('#saved-check-start'), '09:00');
  await pickTime(page, dialog.locator('#saved-check-end'), '15:00');
  await dialog.getByRole('button', { name: 'Check all saved centres', exact: true }).click();
  await expect(dialog.getByText('Checked 2 of 2 saved centres', { exact: true })).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'View details', exact: true })).toHaveCount(2);
  await dialog.getByLabel('Date for all saved centres').fill('2026-09-25');
  await expect(dialog.getByText('You changed the plan. Check again to update every saved centre.', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Checked 2 of 2 saved centres', { exact: true })).toHaveCount(0);
});
