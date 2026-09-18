// Read-only production verification. Browser data below belongs to isolated
// ephemeral QA contexts; it never touches an existing user's saved library.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from '@playwright/test';
const out = process.env.QA_EVIDENCE_DIR || '.build/release-2026-09-18';
mkdirSync(out, { recursive: true });
const url = 'https://equalpathcare.me/#discover';
const browser = await chromium.launch();
const reports = [];
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: width < 760 ? 844 : 1000 }, reducedMotion: 'reduce' });
    const page = await context.newPage(), errors = [], responses = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('response', async r => {
      if (!r.url().endsWith('/executions')) return;
      try { const body = r.request().postDataJSON(); const request = JSON.parse(body.body); const execution = await r.json(); responses.push({ action: request.action, status: execution.responseStatusCode, deployment: execution.deploymentId }); } catch {}
    });
    page.setDefaultTimeout(90000);
    await page.addInitScript(() => {
      const pickup = { id: 'qa-kl-sentral', label: 'KL Sentral', lat: 3.134, lng: 101.6863 };
      localStorage.setItem('equalpath:tour:v1', JSON.stringify({ version: 1, status: 'skipped' }));
      localStorage.setItem('equalpath:map:v1:live', JSON.stringify({ version: 1, zoom: 13, center: pickup, pickup }));
    });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.locator('.map-search-launch').click();
    await page.locator('#service-date').fill('2026-09-22');
    await page.locator('#deadline').fill('13:00');
    await page.locator('#care-end').fill('17:00');
    await page.getByRole('radio', { name: '1–3 years', exact: true }).check();
    await page.getByRole('button', { name: 'Find childcare', exact: true }).click();
    await page.locator('.map-quick-actions button').first().filter({hasText:/All/}).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Saved searches', exact: true }).count(), 0);
    if (width < 760) {
      await page.locator('.mobile-search-summary').waitFor();
      assert.equal(await page.locator('.dock-form').isVisible(), false);
      await page.screenshot({ path: `${out}/production-map-collapsed-${width}.png` });
      await page.getByRole('button', { name: 'Change search', exact: true }).click();
      assert.match(await page.locator('#deadline').innerText(), /13:00/);
      await page.getByRole('button', { name: 'Hide search', exact: true }).click();
    }
    const interestsBeforeTour = await page.evaluate(() => localStorage.getItem('equalpath:interests:v1:live'));
    await page.getByRole('button', { name: 'Quick tour', exact: true }).click();
    const tour = page.locator('.tour-dialog');
    await tour.getByRole('button', { name: 'Show me around', exact: true }).click();
    for (let step = 1; step <= 7; step++) {
      await tour.locator('.tour-spotlight').waitFor();
      if (step === 4) await page.screenshot({ path: `${out}/production-map-tour-${width}.png` });
      await tour.getByRole('button', { name: step === 7 ? 'Back to my map' : 'Next', exact: true }).click();
    }
    await tour.waitFor({ state: 'detached' });
    assert.equal(await page.evaluate(() => localStorage.getItem('equalpath:interests:v1:live')), interestsBeforeTour);
    if (width < 760) await page.locator('.mobile-search-summary').waitFor();
    await page.locator('.map-quick-actions button').first().click();
    const rows = page.locator('.provider-row');
    await rows.first().waitFor();
    for (const index of [0, 1]) await rows.nth(index).getByRole('button', { name: /^Compare / }).click();
    await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Compare/ }).click();
    await page.locator('.compare-view').waitFor();
    await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
    await rows.first().getByRole('button', { name: /^Save / }).click();
    await page.getByRole('button', { name: 'Save centre', exact: true }).click();
    await page.getByRole('button', { name: 'Close search panel' }).click();
    await page.getByRole('navigation', {name:'Main navigation'}).getByRole('button', {name:/Saved/}).click();
    assert.equal(await page.getByRole('dialog').getByRole('button', { name: /^Searches/ }).count(), 0);
    await page.getByRole('dialog').getByRole('button', {name:'For you',exact:true}).click();
    await page.locator('.recommendation-card').first().waitFor();
    assert((await page.locator('.recommendation-card').count()) <= 3);
    await page.screenshot({ path: `${out}/production-for-you-${width}.png`, fullPage: true });
    const bounds = await page.locator('.recommendation-card').evaluateAll(es => es.map(e => ({ scroll: e.scrollWidth, width: e.clientWidth, right: e.getBoundingClientRect().right })));
    assert(bounds.every(b => b.scroll <= b.width + 1 && b.right <= width));
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('equalpath:saved:v1:live')).favourites);
    const interests = await page.evaluate(() => JSON.parse(localStorage.getItem('equalpath:interests:v1:live')));
    assert.equal(saved.length, 1); assert.equal(interests.visits.filter(v => v.compareCount === 1).length, 2);
    await page.locator('.recommendation-card').first().getByRole('button', { name: 'View centre' }).click();
    await page.locator('.centre-metrics').waitFor();
    assert.equal(errors.length, 0, errors.join('; '));
    assert(responses.some(r => r.action === 'recommendations' && r.status === 200));
    reports.push({ width, passed: true, responses, saved: saved.length, compared: interests.visits.length });
    await context.close();
  }
} finally { await browser.close(); }
writeFileSync(`${out}/production-journey.json`, JSON.stringify({ url, checkedAt: new Date().toISOString(), reports }, null, 2));
console.log(JSON.stringify({ website: url, viewports: reports.map(r => r.width), passed: reports.every(r => r.passed) }));
