import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createAPI } from '../../server/api.mjs';
import { fixtureCatalog } from '../../server/fixtures.mjs';
import { openSearch, openResults } from './ui-helpers.mjs';
const out = process.env.QA_EVIDENCE_DIR || '.build/compare-refresh';
mkdirSync(out, { recursive: true });
async function start(page, regular = false) {
  const base = fixtureCatalog.items[0];
  const catalog = { ...fixtureCatalog, items: [1, 2, 3].map(i => ({ ...structuredClone(base), id: `centre-${i}`, name: `Childcare ${i} — A long centre name in Kuala Lumpur`, location: { lat: 3.139 + i * .001, lng: 101.6869 }, age: { ...base.age, min: 12, max: 84, wording: '1–6 years' }, admission: { ...base.admission, value: i === 3 ? false : true } })) };
  const api = createAPI({ store: { catalog: async () => catalog }, drivingRoutes: async (_, items) => items.map(p => ({ ...p, driving: { state: 'available', minutes: 8, traffic: false } })) });
  await page.route('**/api', async route => route.fulfill({ json: { ok: true, ...await api(route.request().postDataJSON()) } }));
  await page.addInitScript(() => {
    localStorage.setItem('equalpath:tour:v1', '{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:map:v1:live', JSON.stringify({ version: 1, center: { lat: 3.139, lng: 101.6869 }, zoom: 13, pickup: { id: 'demo-pickup', label: 'KL Sentral', lat: 3.139, lng: 101.6869 } }));
  });
  await page.goto(regular ? '/?care=regular#discover' : '/#discover');
  await expect(page.locator('#pickup-search')).not.toBeFocused();
  await expect(page.locator('.equalpath')).toBeFocused();
  await page.keyboard.press('/'); await expect(page.locator('#pickup-search')).toBeFocused();
  await openSearch(page);
  if (!regular) {
    await page.locator('#service-date').fill('2026-09-22'); await page.locator('#deadline').fill('16:00'); await page.locator('#care-end').fill('18:00');
  }
  await page.getByRole('radio', { name: '4–6 years', exact: true }).check();
  await page.getByRole('button', { name: 'Find childcare', exact: true }).click();
  await openResults(page);
  for (const row of await page.locator('.provider-row').all()) await row.getByRole('button', { name: /^Compare / }).click();
  await page.getByRole('button', { name: 'Close search panel' }).click();
}
for (const width of [320, 390, 768, 1440]) test(`${width}px comparison keeps facts aligned and actions inside their columns`, async ({ page }) => {
  await page.setViewportSize({ width, height: 900 }); await start(page);
  const tray = page.locator('.compare-tray');
  await expect(tray).toContainText('3 centres');
  expect(await tray.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(20);
  await page.screenshot({ path: `${out}/tray-${width}.png` });
  await tray.getByRole('button', { name: 'Compare', exact: true }).click();
  await expect(page.locator('[data-fact="admission"]')).toContainText('Not offered');
  await expect(page.locator('.compare-view')).not.toContainText(/Matches|Confirmed range|Care for a few hours/);
  await expect(page.locator('[data-fact="transfer"]')).toHaveCount(0);
  const headers = page.locator('thead th[data-provider-id]:visible');
  await expect(headers).toHaveCount(width <= 640 ? 2 : 3);
  const within = await headers.evaluateAll(nodes => nodes.every(n => { const b = n.getBoundingClientRect(), a = n.querySelector('.compare-contact').getBoundingClientRect(); return a.x >= b.x && a.right <= b.right + 1 && a.height >= 44 && b.right <= innerWidth; }));
  expect(within).toBe(true);
  if (width <= 640) {
    await page.locator('.compare-pair > summary').click();
    await page.getByRole('combobox', { name: 'Centre 1', exact: true }).click();
    await page.getByRole('option', { name: 'Childcare 3 — A long centre name in Kuala Lumpur', exact: true }).click();
    await expect(page.locator('thead th[data-provider-id="centre-3"]')).toBeVisible();
    const third = await page.locator('thead th[data-provider-id="centre-3"]').boundingBox(), second = await page.locator('thead th[data-provider-id="centre-2"]').boundingBox();
    expect(third.x).toBeLessThan(second.x);
    await page.locator('.compare-pair > summary').click();
  }
  await page.screenshot({ path: `${out}/new-compare-${width}.png` });
  await page.getByRole('button', { name: 'More details', exact: true }).click();
  await expect(page.locator('[data-fact="transfer"]')).toBeVisible();
  await expect(headers.first()).toBeInViewport();
  await page.getByRole('button', { name: 'Show less', exact: true }).click();
  await headers.first().getByRole('button', { name: /^Contact / }).click();
  await expect(page.getByRole('heading', { name: 'Contact the centre', exact: true })).toBeVisible();
});

test('long term comparison does not show short visit or invented care times', async ({ page }) => {
  await start(page, true); await page.locator('.compare-tray-open').click();
  await expect(page.locator('.compare-visit')).toContainText('Long term');
  await expect(page.locator('[data-fact="admission"], [data-fact="care"]')).toHaveCount(0);
  await expect(page.locator('.compare-visit')).not.toContainText('Pick up child at');
});

test('map picking and notices use contained rounded controls', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 }); await start(page);
  await openSearch(page); await page.getByRole('button', { name: 'Choose your location', exact: true }).click();
  const picker = page.locator('.map-pick-confirm');
  await expect(picker).toContainText('Move the map to place the pin.');
  await expect(picker.locator('details')).not.toHaveAttribute('open');
  const pickBox = await picker.boundingBox(), toolsBox = await page.locator('.map-tools').boundingBox();
  expect(toolsBox.y + toolsBox.height).toBeLessThan(pickBox.y);
  for (const button of await picker.getByRole('button').all()) {
    await expect(button).toBeInViewport();
    expect(await button.evaluate(el => parseFloat(getComputedStyle(el).borderRadius))).toBeGreaterThan(20);
  }
  await page.screenshot({ path: `${out}/map-pick-390.png` });
  await picker.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.locator('.compare-tray').getByRole('button', { name: 'Clear comparison' }).click();
  await page.reload(); await openSearch(page);
  await page.locator('.nearby-card').first().click();
  const notice = page.locator('.toast'); await expect(notice).toBeVisible();
  const b = await notice.boundingBox(); expect(Math.abs(b.y + b.height / 2 - 422)).toBeLessThan(2);
  await page.screenshot({ path: `${out}/notice-390.png` });
  await notice.getByRole('button', { name: 'Close message' }).click(); await expect(notice).toHaveCount(0);
});
