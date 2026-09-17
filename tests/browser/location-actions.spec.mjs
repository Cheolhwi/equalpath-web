import { test, expect } from '@playwright/test';
import { createAPI } from '../../server/api.mjs';
import { fixtureCatalog } from '../../server/fixtures.mjs';
import { mkdirSync } from 'node:fs';

const out = process.env.QA_EVIDENCE_DIR || '.build/location-actions';
mkdirSync(out, { recursive: true });
async function setup(page, geo = 'success') {
  await page.addInitScript(mode => {
    localStorage.setItem('equalpath:tour:v1', '{"version":1,"status":"skipped"}');
    window.geoRequests = 0;
    window.geoCleared = [];
    navigator.geolocation.watchPosition = (success, failure) => {
      window.geoRequests++;
      // Keep the late callback even after clearWatch to exercise stale-result protection.
      window.deliverLocation = () => success({ coords: { latitude: 3.1341, longitude: 101.6865, accuracy: 15 } });
      if (mode === 'success') setTimeout(window.deliverLocation, 20);
      if (mode === 'blocked') setTimeout(() => failure({ code: 1 }), 20);
      return window.geoRequests;
    };
    navigator.geolocation.clearWatch = id => window.geoCleared.push(id);
  }, geo);
  const api = createAPI({
    store: { catalog: async () => fixtureCatalog },
    reverseGeocode: async point => ({ pickup: { ...point, id: null, label: 'Jalan Stesen Sentral, Kuala Lumpur' } }),
    drivingRoutes: async (_, items) => items.map(p => ({ ...p, driving: { state: 'unavailable' } })),
  });
  await page.route('**/api', async route => route.fulfill({ json: { ok: true, ...await api(route.request().postDataJSON()) } }));
  await page.goto('/#discover');
  await expect(page.locator('.provider-pin').first()).toBeVisible();
}

for (const [width, height] of [[320, 568], [390, 844], [768, 1024], [1440, 900]]) {
  test(`${width}px: both location actions are direct and map selection shows You`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await setup(page);
    const manual = page.getByRole('button', { name: 'Choose your location', exact: true });
    const device = page.getByRole('button', { name: 'Use my location', exact: true });
    for (const button of [manual, device]) {
      await expect(button).toBeInViewport();
      const b = await button.boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(width);
      expect(await button.evaluate(el => el.closest('details'))).toBeNull();
    }
    expect((await manual.boundingBox()).y).toBe((await device.boundingBox()).y);
    expect(await page.evaluate(() => window.geoRequests)).toBe(0);
    await expect(page.locator('.map-choose')).toHaveCount(0);
    await page.screenshot({ path: `${out}/location-actions-${width}.png` });
    await manual.click();
    await expect(page.getByRole('button', { name: 'Use this location', exact: true })).toBeInViewport();
    await expect(page.locator('.map-pick-confirm')).toHaveCSS('animation-name', 'none');
    await page.getByRole('button', { name: 'Use this location', exact: true }).click();
    await expect(page.locator('#pickup-search')).toHaveValue('Jalan Stesen Sentral, Kuala Lumpur');
    await expect(page.locator('.pickup-pin')).toHaveText('You');
    expect(await page.evaluate(() => window.geoRequests)).toBe(0);
    await page.reload();
    await expect(page.locator('.pickup-pin')).toHaveText('You');
  });
}

test('device location runs only on click, stops its watch, and shows You', async ({ page }) => {
  await setup(page);
  expect(await page.evaluate(() => window.geoRequests)).toBe(0);
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.locator('#pickup-search')).toHaveValue('Jalan Stesen Sentral, Kuala Lumpur');
  await expect(page.locator('.pickup-pin')).toHaveText('You');
  expect(await page.evaluate(() => window.geoRequests)).toBe(1);
  expect(await page.evaluate(() => window.geoCleared)).toContain(1);
});

test('blocked device location leaves the manual map action directly available', async ({ page }) => {
  await setup(page, 'blocked');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByText(/Location access is blocked/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry my location', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose your location', exact: true }).click();
  await page.getByRole('button', { name: 'Use this location', exact: true }).click();
  await expect(page.locator('.pickup-pin')).toHaveText('You');
});

test('switching to map selection cancels device location and ignores a late response', async ({ page }) => {
  await setup(page, 'pending');
  await page.getByRole('button', { name: 'Use my location', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Cancel location', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Choose your location', exact: true }).click();
  expect(await page.evaluate(() => window.geoCleared)).toContain(1);
  await page.getByRole('button', { name: 'Use this location', exact: true }).click();
  await expect(page.locator('#pickup-search')).toHaveValue('Jalan Stesen Sentral, Kuala Lumpur');
  const selected = await page.evaluate(() => JSON.parse(localStorage.getItem('equalpath:map:v1:live')).pickup);
  await page.evaluate(() => window.deliverLocation());
  await expect(page.locator('#pickup-search')).toHaveValue('Jalan Stesen Sentral, Kuala Lumpur');
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('equalpath:map:v1:live')).pickup)).toEqual(selected);
});
