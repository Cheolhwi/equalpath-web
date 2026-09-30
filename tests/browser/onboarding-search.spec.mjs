import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createAPI } from '../../server/api.mjs';
import { demoPickup } from '../../server/fixtures.mjs';
import { emptyInterests, personaliseSearchItems } from '../../shared/recommendations.mjs';
import { emptyLibrary } from '../../shared/saved.mjs';
import { openResults } from './ui-helpers.mjs';

const out = process.env.QA_EVIDENCE_DIR || '.build/onboarding-search';
mkdirSync(out, { recursive: true });
const key = 'equalpath:interests:v1:live';
const now = Date.parse('2026-09-30T02:00:00Z');

for (const width of [1440, 390]) test(`${width}px first-use choices reach both first searches without reload or viewing a centre`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: width === 390 ? 'reduce' : 'no-preference' });
  await page.clock.setFixedTime(new Date(now));
  const responses = [], errors = [];
  const api = createAPI({
    placeSearch: async () => ({ items: [{ ...demoPickup, label: 'KL Sentral' }] }),
    drivingRoutes: async (_, rows) => rows,
  });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    const response = await api(body);
    if (body.action === 'search') responses.push(response);
    await route.fulfill({ json: { ok: true, ...response } });
  });
  await page.goto('/?mode=live#discover');
  await expect(page.locator('.preference-onboarding')).toBeVisible();
  await page.getByRole('button', { name: /Kind teachers Patient, caring staff/ }).click();
  await page.getByRole('button', { name: 'Continue', exact: true }).click();
  await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase', 'ready');
  await page.getByRole('button', { name: 'Open search panel' }).click();
  await page.locator('#pickup-search').fill('KL Sentral');
  await page.getByRole('button', { name: 'Find address', exact: true }).click();
  await page.locator('.place-results').getByRole('button', { name: /KL Sentral/ }).click();
  await page.locator('#service-date').fill('2026-09-30');
  await page.getByRole('radio', { name: '1–3 years', exact: true }).check();
  await page.locator('#deadline').fill('10:00');
  await page.locator('#care-end').fill('12:00');
  await page.locator('#care-end').press('Tab');
  await page.getByRole('button', { name: 'Find childcare', exact: true }).click();

  for (const index of [0, 1]) {
    await expect.poll(() => responses.length).toBe(index + 1);
    const response = responses[index];
    const expected = personaliseSearchItems({ items: response.items, seeds: response.seeds,
      request: response.request, library: emptyLibrary(),
      history: { ...emptyInterests(), preferences: ['caring_teachers'], preferenceSetup: 'complete' }, now });
    expect(expected.some(p => p.personalised)).toBe(true);
    await openResults(page);
    await expect(page.locator('.provider-row .personalised-tag')).toHaveCount(expected.filter(p => p.personalised).length);
    await expect.poll(() => page.locator('.provider-row').evaluateAll(rows => rows.map(row => row.dataset.providerId)))
      .toEqual(expected.map(p => p.id));
    expect(await page.locator('.provider-row').evaluateAll(rows => rows.map(row => Number(row.dataset.rerankPosition))))
      .toEqual(expected.map(p => p.personalisedRank));
    const stored = await page.evaluate(k => JSON.parse(localStorage.getItem(k)), key);
    expect(stored).toMatchObject({ preferences: ['caring_teachers'], visits: [], hidden: [], preferenceSetup: 'complete' });
    await page.getByRole('button', { name: 'Close search panel' }).click();
    await expect(page.locator('.discovery-panel')).toBeHidden();
    await expect(page.locator('.map-card-personalised').first()).toBeVisible();
    await expect(page.locator('.map-centre-card:not(.leaving)').first()).toHaveCSS('opacity', '1');
    await page.screenshot({ path: `${out}/first-use-${width}-search-${index + 1}.png` });
    if (index === 0) {
      if (await page.locator('.mobile-search-summary').isVisible()) await page.locator('.mobile-search-summary').click();
      await page.getByRole('button', { name: 'Open search panel' }).click();
      const change = page.getByRole('button', { name: 'Change search', exact: true });
      if (await change.isVisible()) await change.click();
      await page.locator('#care-end').fill('13:00');
      await page.locator('#care-end').press('Tab');
      await page.getByRole('button', { name: 'Update results', exact: true }).click();
    }
  }
  expect(errors).toEqual([]);
});
