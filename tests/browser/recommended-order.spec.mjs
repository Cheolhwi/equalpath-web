import { test, expect } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { createAPI, errorResponse } from '../../server/api.mjs';
import { centreHighlights, emptyInterests } from '../../shared/recommendations.mjs';
import { chooseAge, hideOptionsPanel, openResults, openSearch, setDate, setTime, submitSearch } from './ui-helpers.mjs';

const out = process.env.QA_EVIDENCE_DIR || '.build/recommended-order';
mkdirSync(out, { recursive: true });
const pickup = { label: 'PJ test starting point', lat: 3.11, lng: 101.644 };
const history = { ...emptyInterests(), preferences: ['engaging_activities', 'secure_pickup'], preferenceSetup: 'complete' };
const ids = page => page.locator('.provider-row').evaluateAll(rows => rows.map(row => row.dataset.providerId));
const highlights = page => page.locator('.provider-row').evaluateAll(rows => Object.fromEntries(rows.map(row => [row.dataset.providerId,
  [...row.querySelectorAll('.centre-highlight')].map(tag => tag.textContent)])));
const menu = page => page.getByRole('combobox', { name: 'Order search results', exact: true });
async function search(page, date = '2026-10-01') {
  await openSearch(page);
  await setDate(page, date);
  await chooseAge(page, '2');
  await setTime(page, 'deadline', '12:50');
  await setTime(page, 'care-end', '17:50');
  await submitSearch(page);
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
}

for (const width of [1440, 390, 320]) test(`${width}px save a lower result, search again, switch factual order and reload`, async ({ page }) => {
  // Five searches, full-motion panels and screenshots on software OpenGL can
  // exhaust 90 s before the final reload. Keep each assertion's deadline.
  test.setTimeout(width === 1440 ? 180000 : 90000);
  await page.setViewportSize({ width, height: width < 760 ? 844 : 1000 });
  await page.emulateMedia({ reducedMotion: width < 760 ? 'reduce' : 'no-preference' });
  await page.clock.setFixedTime(new Date('2026-10-01T04:00:00Z'));
  const calls = [], errors = [];
  const api = createAPI({ drivingRoutes: async (_, rows) => rows });
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON();
    try {
      const response = await api(body);
      if (body.action === 'search') calls.push({ body, response });
      await route.fulfill({ json: { ok: true, ...response } });
    } catch (error) {
      const result = errorResponse(error);
      await route.fulfill({ status: result.status, json: result.body });
    }
  });
  await page.addInitScript(({ pickup, history }) => {
    if (!localStorage.getItem('equalpath:interests:v1:live')) localStorage.setItem('equalpath:interests:v1:live', JSON.stringify(history));
    localStorage.setItem('equalpath:tour:v1', '{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:map:v1:live', JSON.stringify({ version: 1, center: pickup, pickup, zoom: 13 }));
  }, { pickup, history });
  await page.goto('/?mode=live#discover');
  await search(page);
  await expect(menu(page)).toHaveText('Recommended');
  const before = await ids(page), target = before.at(-1);
  const branchTags = Object.fromEntries(calls.at(-1).response.items.map(p => [p.id,
    centreHighlights(p, Date.parse('2026-10-01T04:00:00Z')).map(t => t.label)]));
  expect(Object.values(branchTags).every(tags => tags.length >= 1 && tags.length <= 2)).toBe(true);
  // This fixture has contact details and no conflicts for every result, so
  // the client's reranked first three are the suggested set.
  const expectedTags = order => Object.fromEntries(order.map((id, index) => [id, index < 3 ? [] : branchTags[id]]));
  expect(await highlights(page)).toEqual(expectedTags(await ids(page)));
  // Enough results for a saved centre to start below the three suggestions.
  expect(before.length).toBeGreaterThanOrEqual(5);
  // Save acts immediately, with no dialog (9 Oct 2026).
  await page.locator(`.provider-row[data-provider-id="${target}"]`).getByRole('button', { name: /^Save / }).click();
  await expect(page.locator(`.provider-row[data-provider-id="${target}"]`).getByRole('button', { name: /^Save / })).toHaveAttribute('aria-pressed', 'true');
  // Save, Compare and browsing affect only the next search (10 Oct 2026,
  // docs/RECOMMENDATION_ML.md): the current order stays as it was.
  expect(await ids(page)).toEqual(before);
  // Make a real date edit, then return to the original request for a fresh
  // same-conditions query that carries the saved centre as a seed.
  await search(page, '2026-10-02');
  await search(page);
  await expect(menu(page)).toHaveText('Recommended');
  expect(calls.at(-1).body.seedIds).toContain(target);
  await expect.poll(async () => (await ids(page)).indexOf(target)).toBeLessThan(before.indexOf(target));
  const after = await ids(page);
  expect([...after].sort()).toEqual([...before].sort());
  expect(await highlights(page)).toEqual(expectedTags(await ids(page)));
  await menu(page).scrollIntoViewIfNeeded();
  await expect(page.locator('.provider-row').first()).toHaveCSS('opacity', '1');
  await expect(page.locator('.provider-row').first()).toHaveCSS('filter', 'none');
  await page.screenshot({ path: `${out}/saved-list-${width}.png` });

  await menu(page).click();
  await expect(page.getByRole('option', { name: 'Recommended', exact: true })).toBeVisible();
  await expect(page.getByRole('listbox')).toHaveCSS('opacity', '1');
  const box = await page.getByRole('listbox').boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  await page.screenshot({ path: `${out}/sort-menu-${width}.png` });
  await page.getByRole('option', { name: 'Nearest first', exact: true }).click();
  await expect(menu(page)).toHaveText('Nearest first');
  const nearest = calls.at(-1).response.items;
  expect(nearest.map(p => p.distanceKm)).toEqual(nearest.map(p => p.distanceKm).sort((a, b) => a - b));
  await expect.poll(() => ids(page)).toEqual(nearest.map(p => p.id));
  expect(await highlights(page)).toEqual(expectedTags(nearest.map(p => p.id)));
  await expect(page.locator('.provider-row .personalised-tag')).toHaveCount(0);
  await menu(page).click();
  await page.getByRole('option', { name: 'Recommended', exact: true }).click();
  await expect(menu(page)).toHaveText('Recommended');
  await expect.poll(() => ids(page)).toEqual(after);

  await page.getByRole('button', { name: 'Close search panel', exact: true }).click();
  await hideOptionsPanel(page);
  const mapCards = page.locator('.map-centre-card:not(.leaving)');
  await expect.poll(() => mapCards.evaluateAll(rows => rows.map(row => row.dataset.providerId).sort())).toEqual(after.slice(0, 3).sort());
  await expect(mapCards.first()).toHaveCSS('opacity', '1');
  if (width < 760) await page.locator(`.map-centre-card[data-provider-id="${target}"]`).scrollIntoViewIfNeeded();
  const cardTags = await mapCards.evaluateAll(cards => cards.map(card => {
    const bounds = card.getBoundingClientRect(), actions = card.querySelector('.map-card-actions').getBoundingClientRect();
    const tags = [...card.querySelectorAll('.centre-highlight')];
    return { id: card.dataset.providerId, labels: tags.map(tag => tag.textContent),
      clipped: tags.some(tag => { const r = tag.getBoundingClientRect(); return r.left < bounds.left || r.right > bounds.right || r.bottom > actions.top; }),
      actionsClipped: actions.bottom > bounds.bottom + 1 };
  }));
  for (const card of cardTags) {
    expect(card.labels).toEqual([]);
    expect(card.clipped).toBe(false); expect(card.actionsClipped).toBe(false);
  }
  await page.screenshot({ path: `${out}/saved-map-${width}.png` });

  // Open an ordinary centre from the list (nearby map pins can overlap).
  // Its preview keeps the same strongest review themes.
  const ordinary = after[3];
  await openResults(page);
  await page.locator(`.provider-row[data-provider-id="${ordinary}"] .provider-select`).click();
  await page.getByRole('button', { name: 'Close search panel', exact: true }).click();
  await hideOptionsPanel(page);
  const ordinaryCard = page.locator(`.map-centre-card.selected[data-provider-id="${ordinary}"]`);
  await expect(ordinaryCard).toBeVisible();
  await expect(ordinaryCard.locator('.centre-highlight')).toHaveText(branchTags[ordinary]);
  await expect(ordinaryCard.locator('.map-card-personalised')).toHaveCount(0);
  await expect(ordinaryCard).toHaveCSS('opacity', '1');
  const ordinaryLayout = await ordinaryCard.evaluate(card => {
    const actions = card.querySelector('.map-card-actions').getBoundingClientRect();
    return { actionsClipped: actions.bottom > card.getBoundingClientRect().bottom + 1,
      tagsClipped: [...card.querySelectorAll('.centre-highlight')].some(tag => tag.getBoundingClientRect().bottom > actions.top) };
  });
  expect(ordinaryLayout).toEqual({ actionsClipped: false, tagsClipped: false });
  await page.screenshot({ path: `${out}/ordinary-map-${width}.png` });
  await openResults(page);
  const ordinaryRow = page.locator(`.provider-row[data-provider-id="${ordinary}"]`);
  await ordinaryRow.scrollIntoViewIfNeeded();
  await expect(ordinaryRow.locator('.centre-highlight')).toHaveText(branchTags[ordinary]);
  await expect(ordinaryRow).toHaveCSS('opacity', '1');
  await expect(ordinaryRow).toHaveCSS('filter', 'none');
  await page.screenshot({ path: `${out}/ordinary-list-${width}.png` });

  await page.reload();
  await search(page);
  await expect(menu(page)).toHaveText('Recommended');
  await expect.poll(() => ids(page)).toEqual(after);
  expect(await highlights(page)).toEqual(expectedTags(await ids(page)));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('equalpath:saved:v1:live')));
  expect(stored.favourites.map(p => p.id)).toContain(target);
  expect(errors).toEqual([]);
  writeFileSync(`${out}/order-${width}.json`, JSON.stringify({ viewport: width, target, before, after, nearest: nearest.map(p => p.id), searchCalls: calls.length, browserErrors: errors }, null, 2));
});
