import { expect } from "@playwright/test";

// Search now lives in the map dock (date, children, start/end, getting there,
// more filters). The side panel only lists results and, after a search, lets
// the visitor change it. These helpers drive the dock the way a parent does.
async function skipOnboarding(page) {
  const onboarding = page.locator('.preference-onboarding');
  if (await onboarding.isVisible()) {
    await onboarding.getByRole('button', { name: 'Skip for now', exact: true }).click();
    await expect(onboarding).toBeHidden();
  }
}

export async function openSearch(page) {
  await skipOnboarding(page);
  const close = page.getByRole('button', { name: 'Close search panel', exact: true });
  if (await close.isVisible()) await close.click();
  const summary = page.locator('.mobile-search-summary');
  if (await summary.isVisible() && await summary.getAttribute('aria-expanded') === 'false') await summary.click();
  await expect(page.locator('.map-search-dock .dock-form')).toBeVisible();
}

const closeOptions = async page => {
  const popover = page.locator('.dock-popover');
  if (!await popover.isVisible()) return;
  const close = popover.getByRole('button', { name: 'Close options', exact: true });
  if (await close.isVisible()) await close.click(); else await page.keyboard.press('Escape');
  await expect(popover).toHaveCount(0);
};

const openPart = async (page, name) => {
  await openSearch(page);
  if (!await page.locator(`.dock-popover-${name}`).isVisible()) await page.locator(`.map-search-dock [data-field="${name}"]`).click();
  await expect(page.locator(`.dock-popover-${name}`)).toBeVisible();
};

export async function setDate(page, date) {
  await openPart(page, 'date');
  await page.locator('#service-date').fill(date);
  await closeOptions(page);
}

// Times use the app's own hour/minute picker (5-minute steps, no free typing).
export async function setTime(page, id, time) {
  await openSearch(page);
  await pickTime(page, page.locator(`.map-search-dock #${id.replace(/^#/, '')}`), time);
}

// Any TimeInput (chip or box): open its picker, choose hour and minute, Done.
export async function pickTime(page, trigger, time) {
  const [hour, minute] = time.split(':');
  await trigger.click();
  const picker = page.locator('.time-picker');
  await picker.getByRole('listbox', { name: 'Hour', exact: true }).getByRole('option', { name: hour, exact: true }).click();
  await picker.getByRole('listbox', { name: 'Minute', exact: true }).getByRole('option', { name: minute, exact: true }).click();
  await picker.getByRole('button', { name: /^Done/ }).click();
  await expect(picker).toHaveCount(0);
}

export async function setTimes(page, start, end) {
  await setTime(page, 'deadline', start);
  await setTime(page, 'care-end', end);
}

const ageName = age => {
  const year = age === '1-3' ? '2' : age === '4-6' ? '4' : String(age);
  return year === '0' ? 'Under 1 year' : `${year} ${year === '1' ? 'year' : 'years'}`;
};

export async function chooseAge(page, age = '4') {
  await openPart(page, 'age');
  const popover = page.locator('.dock-popover-age');
  const one = popover.getByRole('radio', { name: '1 child', exact: true });
  if (await one.isVisible() && !await one.isChecked()) await one.check();
  // Choosing an age closes the menu for one child, so click rather than check.
  await popover.getByRole('radio', { name: `Your child: ${ageName(age)}`, exact: true }).click();
  await closeOptions(page);
  await expect(page.locator('.map-search-dock [data-field="age"] strong')).toHaveText(new RegExp(`^1 · ${age === '0' ? 'under 1' : `${ageName(age).split(' ')[0]} yrs?`}$`));
}

const TRANSPORT = { self: 'I’ll bring my child', institution: 'The centre picks my child up', '': 'Not sure yet' };
export async function setTransport(page, value) {
  await openPart(page, 'transport');
  await page.locator('.dock-popover-transport').getByRole('radio', { name: TRANSPORT[value ?? ''], exact: true }).click();
  await closeOptions(page);
}

export async function openFilters(page) { await openPart(page, 'more'); }

// Known mismatches are hidden unless the visitor opts in from More filters.
// Use this when a test is about how mismatches are shown, ordered or compared.
export async function includeConflicts(page, on = true) {
  await openFilters(page);
  await page.getByRole('checkbox', { name: 'Include centres that don’t meet all my needs', exact: true }).setChecked(on);
  await closeOptions(page);
}

export async function setRadius(page, km) {
  await openFilters(page);
  await page.locator('.dock-popover-more').getByRole('radio', { name: `Within ${km} km`, exact: true }).check();
  await closeOptions(page);
}

export async function submitSearch(page) {
  await closeOptions(page);
  await page.locator('.map-search-dock .search-actions button[type="submit"]').click();
}

// One short-care search through the dock. The starting point is usually
// seeded through equalpath:map:v1:live by the spec.
export async function searchShortCare(page, { date = '2026-09-22', start = '16:00', end = '18:00', age = '4', transport, conflicts, radius } = {}) {
  await openSearch(page);
  await setDate(page, date);
  await chooseAge(page, age);
  await setTimes(page, start, end);
  if (transport !== undefined) await setTransport(page, transport);
  if (radius) await setRadius(page, radius);
  if (conflicts) await includeConflicts(page);
  await submitSearch(page);
}

export async function openResults(page) {
  // Submitting switches the mobile view to the map on the next render, so a
  // list seen right after the click can be stale. Let the page render first,
  // then retry until the list is open.
  const toolbar = page.locator('.discovery-panel .results-toolbar');
  // On phones the suggestions sheet covers the list button.
  if ((page.viewportSize()?.width ?? 1440) <= 760 && !await toolbar.isVisible()) await hideOptionsPanel(page);
  const settledVisible = async () => {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return toolbar.isVisible();
  };
  await expect(async () => {
    if (!await settledVisible()) {
      await expect(page.locator(".map-quick-actions button").first()).toContainText(/^All/, { timeout: 1000 });
      await page.locator(".map-quick-actions button").first().click();
    }
    await expect(toolbar).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: 10000 });
}

// Before a search the map's list button reads "Nearby centres".
export async function openNearby(page) {
  await skipOnboarding(page);
  const list = page.locator('.map-quick-actions button').first();
  await expect(list).toContainText(/^Nearby centres/);
  await list.click();
  await expect(page.locator('.discovery-panel .nearby-results')).toBeVisible();
}

// After a one-child search the "Suggested for your child" panel (a bottom sheet
// on phones) covers part of the map. Fold it away like a parent would.
export async function hideOptionsPanel(page) {
  const hide = page.getByRole('button', { name: 'Hide the panel and show the whole map', exact: true });
  if (await hide.isVisible()) {
    await hide.click();
    await expect(page.locator('.one-child-panel')).toHaveCount(0);
  }
}

// On phones the navigation pill folds away after a search (6 Oct 2026); its
// "Show menu" grip brings it back. Returns the requested navigation button.
export async function navButton(page, name) {
  const reveal = page.getByRole('button', { name: 'Show menu', exact: true });
  if (await reveal.isVisible() && await reveal.getAttribute('aria-expanded') === 'false') await reveal.click();
  const button = page.getByRole('navigation', { name: 'Main navigation' }).getByRole('button', { name });
  await expect(button).toBeVisible();
  return button;
}

export async function revealPreferences(page) {
  const preferences = page.locator(".optional-preferences");
  if (await preferences.isVisible() && await preferences.getAttribute("open") === null)
    await preferences.locator(":scope > summary").click();
}


// A returning visitor who has already dismissed the guided tour and the
// first-visit preference screen. Specs that are not about first entry should
// start here so new onboarding steps do not silently block their journeys.
// Motion is on by default in the product (the browser's reduced-motion
// emulation is not followed), so pass { motion: "reduce" } when a test checks
// reduced-motion behaviour.
// Each value is only written when absent, so reloads keep what the app saved.
export async function returningVisitor(page, { motion = null } = {}) {
  await page.addInitScript(({ motion }) => {
    const seed = (key, value) => {
      try { if (localStorage.getItem(key) === null) localStorage.setItem(key, value); } catch {}
    };
    seed("equalpath:tour:v1", JSON.stringify({ version: 1, status: "skipped" }));
    seed("equalpath:interests:v1:live", JSON.stringify({ version: 1, enabled: true, visits: [], hidden: [], preferences: [], preferenceSetup: "skipped" }));
    if (motion) seed("equalpath:motion:v1", motion);
  }, { motion });
}
