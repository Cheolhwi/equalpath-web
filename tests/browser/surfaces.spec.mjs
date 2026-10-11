import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createAPI } from '../../server/api.mjs';
import { chooseAge, openResults, returningVisitor, setDate, setTimes, setTransport, submitSearch } from './ui-helpers.mjs';

const out = process.env.QA_EVIDENCE_DIR || '.build/surfaces';
mkdirSync(out, { recursive: true });
async function start(page) {
  const errors = [], api = createAPI();
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api', async route => route.fulfill({ json: { ok: true, ...await api({ ...route.request().postDataJSON(), mode: 'demo' }) } }));
  await returningVisitor(page);
  await page.goto('/?mode=demo#discover', { waitUntil: 'domcontentloaded' });
  return errors;
}
async function capture(page, name) {
  const dialog = page.locator('dialog[open]:not([data-closing])');
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await dialog.getByRole('heading', { level: 2 }).scrollIntoViewIfNeeded();
  await expect(dialog.getByRole('button', { name: 'Close dialog', exact: true })).toBeInViewport();
  await page.screenshot({ path: `${out}/${name}.png` });
}
for (const width of [390, 1440]) test(`${width}px: centre, compare, contact and checklist keep their actions usable in the shared surfaces`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
  const errors = await start(page);
  // A fixed weekday: the default date is today, and demo centres close on some days.
  // The demo draft asks for centre pickup, which no demo centre offers (all hidden as mismatches).
  await setDate(page, '2026-09-22'); await chooseAge(page); await setTimes(page, '13:00', '17:00'); await setTransport(page, 'self');
  await submitSearch(page);
  await openResults(page);
  const rows = page.locator('.provider-row');
  await expect(rows.first()).toBeVisible();
  for (const i of [0, 1]) await rows.nth(i).getByRole('button', { name: /^Compare / }).click();
  await rows.first().getByRole('button', { name: /^View details for / }).click();
  await capture(page, `centre-${width}`);
  await expect(page.locator('.centre-metrics > div')).toHaveCount(4);
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name: /Compare/ }).click();
  await capture(page, `compare-${width}`);
  await expect(page.locator('.comparison-scroll thead h3')).toHaveCount(2);
  await page.getByRole('button', { name: 'More details', exact: true }).click();
  await expect(page.getByRole('rowheader', { name: 'Arrival time', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Show less', exact: true }).click();
  await page.locator('thead').getByRole('button', { name: /^Contact / }).first().click();
  // Contact is its own non-modal window since 10 Oct 2026.
  const contact = page.locator('.contact-panel');
  await expect(contact).toBeVisible();
  expect(await contact.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await expect(contact.getByRole('button', { name: 'Close contact', exact: true })).toBeInViewport();
  await page.screenshot({ path: `${out}/contact-${width}.png` });
  await expect(page.getByRole('button', { name: 'Copy message', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Get ready for childcare', exact: true }).click();
  await capture(page, `preparation-${width}`);
  await page.locator('.ready-item input').first().check();
  await expect(page.getByRole('progressbar', { name: 'Packing checklist progress' })).toHaveAttribute('value', '1');
  await page.locator('.time-value-button').first().click();
  await page.locator('.time-picker').getByRole('listbox', { name: 'Hour', exact: true }).getByRole('option', { name: '15', exact: true }).click();
  await page.locator('.time-picker').getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('.time-value-button').first()).toContainText('15:00');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  // Known gap (11 Oct 2026): the checklist opened from Contact returns focus to
  // <body>, because the Contact window that opened it has already closed.
  await expect(page.locator('.contact-panel')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('empty windows fit their content and dark settings retain keyboard closing', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await start(page);
  const nav = page.getByRole('navigation', { name: 'Main navigation' });
  await nav.getByRole('button', { name: /Compare/ }).click();
  await expect(page.getByRole('dialog')).toHaveCSS('animation-name', 'care-surface-appear');
  await expect(page.getByRole('dialog')).toHaveCSS('opacity', '1');
  expect((await page.getByRole('dialog').boundingBox()).width).toBeLessThanOrEqual(640);
  await capture(page, 'compare-empty');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: 'Display and data settings' }).click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await capture(page, 'settings-dark');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Display and data settings' })).toBeFocused();
  await nav.getByRole('button', { name: 'Saved', exact: true }).click();
  await capture(page, 'saved-empty-dark');
});
