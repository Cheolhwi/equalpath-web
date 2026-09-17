import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const out = process.env.QA_EVIDENCE_DIR || ".build/map-cards";
mkdirSync(out, { recursive: true });

async function setup(page, calls, coLocated = false, contacts = false) {
  const catalog = { ...fixtureCatalog, items: fixtureCatalog.items.map(p => ({ ...p,
    ...(coLocated ? { location: p.location ? { lat: 3.139, lng: 101.6869 } : null } : {}),
    ...(contacts ? { name: `${p.name} — A long branch name (Kuala Lumpur)`, phone: { display: "03-1234 5678", source: { label: "Test contact", url: "https://example.com/contact" } } } : {}),
  })) };
  const api = createAPI({ store: { catalog: async () => catalog }, drivingRoutes: async (_, items) => items.map(p => ({ ...p, driving: { state: "available", minutes: 8, distanceKm: 5.5, traffic: false } })) });
  await page.route("**/api", async route => { const body = route.request().postDataJSON(); calls.push(body); await route.fulfill({ json: { ok: true, ...await api(body) } }); });
  await page.addInitScript(() => localStorage.setItem("equalpath:map:v1:live", JSON.stringify({ version: 1, center: { lat: 3.139, lng: 101.6869 }, zoom: 13, pickup: { id: "demo-pickup", label: "KL Sentral", lat: 3.139, lng: 101.6869 } })));
  await page.goto("/#discover");
}
async function search(page) {
  await page.locator(".map-search-launch").click();
  await page.locator("#service-date").fill("2026-09-22");
  await page.locator("#deadline").fill("16:00");
  await page.locator("#care-end").fill("18:00");
  await page.getByRole("radio", { name: "4–6 years", exact: true }).check();
  await page.locator(".optional-preferences > summary").click();
  await page.locator("#transport").selectOption("institution");
  await page.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
}
const visibleCards = page => page.locator(".map-centre-card:not(.leaving)");

test('before a search, a map card can be saved and comparison asks for the missing visit details', async ({ page }) => {
  const calls = []; await setup(page, calls);
  await page.locator('.provider-pin').first().click();
  const card = visibleCards(page), name = await card.getAttribute('aria-label');
  await card.getByRole('button', { name: `Save: ${name}`, exact: true }).click();
  await page.getByRole('button', { name: 'Save centre', exact: true }).click();
  await expect(card.getByRole('button', { name: `Edit saved centre: ${name}`, exact: true })).toBeVisible();
  await card.getByRole('button', { name: `Compare ${name}`, exact: true }).click();
  await expect(page.locator('.map-search-dock')).toBeVisible();
  await expect(page.locator('.dock-feedback')).toContainText(`Add your search details for ${name}`);
  await expect(page.locator('#deadline')).toBeFocused();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.compare-tray')).toHaveCount(0);
  expect(calls.filter(c => c.action === 'search')).toHaveLength(0);
});
async function checkCards(page, count = 3) {
  await expect(visibleCards(page)).toHaveCount(count);
  if (await page.locator('.map-card-rail').count()) {
    // On short maps each complete card is reachable by native horizontal scroll.
    for (let i = 0; i < count; i++) {
      const card = visibleCards(page).nth(i);
      await card.scrollIntoViewIfNeeded();
      const box = await card.boundingBox();
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize().width);
      expect(box.y + box.height).toBeLessThanOrEqual(page.viewportSize().height - 40);
      for (const button of await card.locator('.map-card-actions button').all()) {
        expect((await button.boundingBox()).height).toBeGreaterThanOrEqual(44);
      }
    }
    await visibleCards(page).first().scrollIntoViewIfNeeded();
    return;
  }
  const boxes = await visibleCards(page).evaluateAll(nodes => nodes.map(n => { const b = n.getBoundingClientRect(); return { x: b.x, y: b.y, right: b.right, bottom: b.bottom, name: n.getAttribute("aria-label") }; }));
  const viewport = page.viewportSize();
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(0); expect(b.right).toBeLessThanOrEqual(viewport.width);
    expect(b.y).toBeGreaterThanOrEqual(114); expect(b.bottom).toBeLessThanOrEqual(viewport.height - 40);
    for (const other of boxes.filter(x => x !== b)) expect(b.right <= other.x || other.right <= b.x || b.bottom <= other.y || other.bottom <= b.y).toBe(true);
  }
}

for (const width of [320, 390, 1280, 1440]) test(`${width}px: map first, search opens three point cards, selection follows the marker and opens details`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 1280 ? 720 : 900 });
  const calls = []; await setup(page, calls);
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await expect(page.locator(".map-search-launch")).toBeVisible();
  await expect(page.locator(".provider-pin").first()).toBeVisible();
  await search(page); await checkCards(page);
  if (width >= 1280) await expect(page.locator('.map-card-rail')).toHaveCount(0);
  const suggested = await page.locator(".provider-pin.suggested").evaluateAll(ns => ns.map(n => n.dataset.providerId).sort());
  expect(await visibleCards(page).evaluateAll(ns => ns.map(n => n.dataset.providerId).sort())).toEqual(suggested);
  await expect(visibleCards(page).first()).toContainText("About 8 min by car");
  await page.screenshot({ path: `${out}/top-three-${width}.png` });
  const count = calls.filter(c => ["nearby", "search"].includes(c.action)).length;
  const pin = page.locator(".provider-pin:not(.suggested)").last();
  // On narrow maps, dismiss a card if it covers the marker we want to inspect.
  for (let attempt = 0; attempt < 3; attempt++) {
    const covering = await pin.evaluate(el => { const r = el.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('.map-centre-card')?.dataset.providerId; });
    if (!covering) break;
    await page.locator(`.map-centre-card[data-provider-id="${covering}"]:not(.leaving) .map-centre-card-close`).click();
  }
  const id = await pin.getAttribute("data-provider-id"); await pin.click();
  await checkCards(page, 1); await expect(visibleCards(page)).toHaveAttribute("data-provider-id", id);
  const before = Number(await visibleCards(page).getAttribute("data-anchor-x"));
  const drag = await page.locator(".map-canvas canvas").evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    for (let y = r.y + r.height * .55; y < r.bottom - 60; y += 25)
      for (let x = r.right - 60; x > r.x + 75; x -= 25)
        if (document.elementFromPoint(x, y) === canvas && document.elementFromPoint(x - 35, y) === canvas) return { x, y };
    return null;
  });
  expect(drag).not.toBeNull();
  await page.mouse.move(drag.x, drag.y); await page.mouse.down();
  await page.mouse.move(drag.x - 35, drag.y, { steps: 8 }); await page.mouse.up();
  await expect.poll(async () => Math.abs(Number(await visibleCards(page).getAttribute("data-anchor-x")) - before)).toBeGreaterThan(10);
  expect(calls.filter(c => ["nearby", "search"].includes(c.action)).length).toBe(count);
  await page.screenshot({ path: `${out}/selected-${width}.png` });
  await visibleCards(page).getByRole("button", { name: /View details/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await expect(page.locator(".provider-pin.selected")).toHaveAttribute("data-provider-id", id);
  await page.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(page.locator(".provider-pin.selected")).toHaveAttribute("data-provider-id", id);
  const blank = await page.locator(".map-canvas canvas").evaluate(canvas => {
    const r = canvas.getBoundingClientRect();
    for (let y = r.y + r.height - 80; y > r.y; y -= 35)
      for (let x = r.x + 30; x < r.right - 30; x += 35)
        if (document.elementFromPoint(x, y) === canvas) return { x, y };
    return null;
  });
  expect(blank).not.toBeNull();
  await page.mouse.click(blank.x, blank.y);
  await expect(page.locator(".provider-pin.selected")).toHaveCount(0);
  await expect(page.locator(".provider-pin[aria-pressed='true']")).toHaveCount(0);
  await expect(page.locator(".map-centre-card.selected:not(.leaving)")).toHaveCount(0);
  expect(calls.filter(c => ["nearby", "search"].includes(c.action)).length).toBe(count);
  await page.getByRole("button", { name: "Fit pickup and results", exact: true }).click();
  await checkCards(page);
  await page.locator(".map-quick-actions").getByRole("button", { name: /^All/ }).click();
  await expect(page.locator(".provider-row").first()).toBeVisible();
  await page.getByRole("button", { name: "Close search panel", exact: true }).click();
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await expect(page.locator(".map-search-launch")).toBeFocused();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("coincident recommendations remain separate; keyboard and reduced motion work", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const calls = []; await setup(page, calls, true); await search(page); await checkCards(page);
  await page.screenshot({ path: `${out}/coincident-mobile.png` });
  await page.locator(".map-search-launch").click();
  await page.locator("#deadline").fill("15:45");
  await page.keyboard.press("Escape");
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await page.locator(".map-search-launch").click(); await expect(page.locator("#deadline")).toHaveValue("15:45");
  await page.getByRole("button", { name: "Close search panel", exact: true }).click();
  await expect(page.locator(".map-first")).toHaveAttribute("data-reduced", "true");
});

test("cards and drawer fade out without leaving invisible interactive controls", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const calls = []; await setup(page, calls); await search(page); await checkCards(page);
  await expect(visibleCards(page).first()).toHaveCSS("animation-name", "map-card-in");
  await page.locator(".provider-pin:not(.suggested)").last().click();
  await expect(page.locator(".map-centre-card.leaving").first()).toHaveAttribute("inert", "");
  await expect(page.locator(".map-centre-card.leaving")).toHaveCount(0);
  await expect(visibleCards(page)).toHaveCount(1);
  await page.locator(".map-search-launch").click();
  await page.getByRole("button", { name: "Close search panel" }).click();
  await expect(page.locator(".discovery-panel")).toHaveAttribute("inert", "");
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
});

test("selecting a recommended pin keeps its card anchored during the camera animation", async ({ page }) => {
  await page.setViewportSize({ width: 927, height: 983 });
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const calls = []; await setup(page, calls); await search(page); await checkCards(page);
  // Record actual painted positions, including the cards fading out. A jump in
  // the offset from the moving pin exposes switching placement candidates.
  await page.evaluate(() => {
    window.cardFrames = []; window.recordCards = true;
    const record = () => {
      window.cardFrames.push([...document.querySelectorAll('.map-centre-card')].map(el => ({
        id: el.dataset.providerId, selected: el.classList.contains('selected'), leaving: el.classList.contains('leaving'),
        x: parseFloat(el.style.left), y: parseFloat(el.style.top), ax: Number(el.dataset.anchorX), ay: Number(el.dataset.anchorY),
      })));
      if (window.recordCards) requestAnimationFrame(record);
    }; requestAnimationFrame(record);
  });
  await page.locator('.provider-pin.suggested').first().click();
  await expect(visibleCards(page)).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.cardFrames.length)).toBeGreaterThan(40);
  const frames = await page.evaluate(() => { window.recordCards = false; return window.cardFrames; });
  const selected = frames.flatMap(f => f.filter(c => c.selected && !c.leaving));
  const firstSelectedFrame = frames.findIndex(f => f.some(c => c.selected && !c.leaving));
  const previous = frames.slice(0, firstSelectedFrame).reverse().flat().find(c => c.id === selected[0]?.id);
  expect(previous).toBeTruthy();
  expect(Math.hypot((selected[0].x-selected[0].ax)-(previous.x-previous.ax), (selected[0].y-selected[0].ay)-(previous.y-previous.ay))).toBeLessThan(2);
  const jumps = selected.slice(1).map((p, i) => Math.hypot((p.x-p.ax)-(selected[i].x-selected[i].ax), (p.y-p.ay)-(selected[i].y-selected[i].ay)));
  expect(Math.max(0, ...jumps), JSON.stringify(selected)).toBeLessThan(35);
  for (const id of new Set(frames.flatMap(f => f.filter(c => c.leaving).map(c => c.id)))) {
    const leaving = frames.flatMap(f => f.filter(c => c.leaving && c.id === id));
    expect(new Set(leaving.map(c => `${c.x}:${c.y}`)).size).toBe(1);
    const previous = frames.slice(0, frames.findIndex(f => f.some(c => c.leaving && c.id === id))).reverse().flat().find(c => c.id === id);
    expect(leaving[0].x).toBe(previous.x); expect(leaving[0].y).toBe(previous.y);
  }
});

test("short phone scrolls through three full action cards and opens the full centre name", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  const calls = []; await setup(page, calls); await search(page); await checkCards(page);
  await expect(visibleCards(page).first()).toHaveClass(/rail-card/);
  await page.screenshot({ path: `${out}/short-phone.png` });
  const name = await visibleCards(page).first().getAttribute("aria-label");
  await visibleCards(page).first().getByRole("button", { name: /View details/ }).click();
  await expect(page.getByRole("dialog")).toContainText(name);
});

for (const width of [320, 927, 1440]) test(`${width}px: map card save and compare act on the correct centre without opening details`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 983 });
  const calls = []; await setup(page, calls); await search(page);
  const card = visibleCards(page).first(), id = await card.getAttribute('data-provider-id'), name = await card.getAttribute('aria-label');
  const count = calls.filter(c => c.action === 'search').length;
  await card.getByRole('button', { name: `Compare ${name}`, exact: true }).click();
  await expect(card.getByRole('button', { name: `Compare ${name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(card).toContainText('Added');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.compare-tray-count')).toContainText('1 centre');
  // Visible does not mean clickable: map zoom controls must not cover actions.
  for (const button of await card.locator('.map-card-actions button').all()) {
    expect(await button.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)); })).toBe(true);
  }
  await card.getByRole('button', { name: `Save: ${name}`, exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText(name);
  await page.getByRole('button', { name: 'Save centre', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const savedCard = page.locator(`.map-centre-card[data-provider-id="${id}"]:not(.leaving)`);
  await expect(savedCard.getByRole('button', { name: `Edit saved centre: ${name}`, exact: true })).toHaveText('Saved');
  await expect(page.locator('.map-saved-shortcut').first()).toContainText(name);
  await savedCard.getByRole('button', { name: `Compare ${name}`, exact: true }).click();
  await expect(page.locator('.compare-tray')).toHaveCount(0);
  expect(calls.filter(c => c.action === 'search').length).toBe(count);
  await page.screenshot({ path: `${out}/actions-${width}.png` });
});

for (const width of [320, 390, 927, 1440]) test(`${width}px: scrolled results and contact windows keep full headers and rounded phone actions`, async ({ page }) => {
  await page.setViewportSize({ width, height: width === 320 ? 568 : 900 });
  const calls = []; await setup(page, calls, false, true); await search(page);
  await page.locator('.map-quick-actions').getByRole('button', { name: /^All/ }).click();
  const panel = page.locator('.discovery-panel');
  await panel.evaluate(el => { el.scrollTop = 260; });
  const header = panel.locator('.intro'), title = header.getByRole('heading');
  await expect(title).toBeInViewport();
  const panelBox = await panel.boundingBox(), headerBox = await header.boundingBox();
  expect(Math.abs(headerBox.y - panelBox.y)).toBeLessThan(3);
  expect(await header.evaluate(el => { const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + 5, r.y + 2)); })).toBe(true);
  await page.screenshot({ path: `${out}/list-scroll-${width}.png` });
  expect(await page.locator('.provider-row .row-actions > button:last-child').first().evaluate(el => {
    const luminance = colour => colour.match(/[\d.]+/g).slice(0, 3).map(Number).map(v => v / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4).reduce((sum, v, i) => sum + v * [.2126, .7152, .0722][i], 0);
    const style = getComputedStyle(el), a = luminance(style.color), b = luminance(style.backgroundColor);
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  })).toBeGreaterThanOrEqual(4.5);
  await page.locator('.provider-row').first().getByRole('button', { name: /View details/ }).click();
  await page.getByRole('button', { name: 'Contact the centre', exact: true }).click();
  const dialog = page.getByRole('dialog'), body = dialog.locator('.dialog-body'), top = dialog.locator('.dialog-top');
  await expect(dialog.getByRole('heading', { name: 'Contact the centre', exact: true })).toBeVisible();
  const phone = dialog.getByRole('link', { name: /^Call / });
  await expect(phone).toHaveAttribute('href', 'tel:0312345678');
  await expect(phone).toHaveCSS('border-radius', '999px');
  await phone.scrollIntoViewIfNeeded();
  expect(await phone.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  const before = await top.boundingBox();
  await body.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect((await top.boundingBox()).y).toBe(before.y);
  expect((await top.boundingBox()).y).toBeGreaterThanOrEqual((await dialog.boundingBox()).y);
  await page.screenshot({ path: `${out}/contact-scroll-${width}.png` });
  await page.getByRole('button', { name: 'Get ready for child care', exact: true }).click();
  await expect(dialog.getByRole('heading', { level: 2 })).toHaveText('Get ready for child care');
  await expect.poll(() => body.evaluate(el => el.scrollTop)).toBe(0);
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  expect(await body.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});

test("changed requests hide previous recommendations and empty searches keep the form available", async ({ page }) => {
  const calls = []; await setup(page, calls); await search(page); await checkCards(page);
  await page.locator(".map-search-launch").click();
  await page.locator("#deadline").fill("15:45");
  await page.getByRole("button", { name: "Close search panel" }).click();
  await expect(visibleCards(page)).toHaveCount(0);
  await expect(page.locator(".dock-changed")).toContainText("Search changed");
  // Serve the empty result from the same validated search shape, without a live request.
  const emptyAPI = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items: [] }) } });
  await page.route("**/api", async route => {
    const body = route.request().postDataJSON();
    if (body.action === "search") await route.fulfill({ json: { ok: true, ...await emptyAPI(body) } });
    else await route.fallback();
  });
  await page.locator(".map-search-launch").click();
  await page.getByRole("button", { name: "Update results", exact: true }).click();
  await expect(page.locator(".map-search-dock")).toBeVisible();
  await expect(visibleCards(page)).toHaveCount(0);
  await expect(page.locator(".provider-row")).toHaveCount(0);
  await expect(page.locator(".map-search-dock")).toContainText("No centres");
});
