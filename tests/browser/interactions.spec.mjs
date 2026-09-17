import { chooseAge, openResults, openSearch } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";
const out = process.env.QA_EVIDENCE_DIR || ".build/interaction-qa";
mkdirSync(out, { recursive: true });

async function start(page) {
  const calls = [];
  const items = Array.from({ length: 8 }, (_, i) => ({
    ...structuredClone(fixtureCatalog.items[0]), id: `motion-${i}`, name: `Garden Childcare ${i + 1}`,
    location: { lat: 3.139 + i * .001, lng: 101.6869 },
  }));
  const api = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items }) },
    drivingRoutes: async (_, rows) => rows.map(p => ({ ...p, driving: { state: "unavailable" } })) });
  await page.route("**/api", async route => {
    const body = route.request().postDataJSON(); calls.push(body.action);
    await route.fulfill({ json: { ok: true, ...await api(body) } });
  });
  await page.addInitScript(() => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    localStorage.setItem("equalpath:map:v1:live", JSON.stringify({ version: 1, zoom: 13,
      center: { lat: 3.139, lng: 101.6869 }, pickup: { id: null, label: "KL Sentral", lat: 3.139, lng: 101.6869 } }));
  });
  await page.goto("/?care=short_term#discover");await openSearch(page);
  return calls;
}
async function search(page) {
  await page.locator("#service-date").fill("2026-09-14");
  await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("17:00");
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();await openResults(page);
  await expect(page.locator(".provider-row")).toHaveCount(8);
}

test("circle pointer works above dialogs without blocking clicks and restores native input/map cursors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await start(page);
  const pointer = page.locator(".care-pointer");
  const saved = page.getByRole("button", { name: /^Saved(?: \d+)?$/ });
  await saved.hover();
  await expect(pointer).toBeVisible();
  expect(await pointer.evaluate(el => el.matches(":popover-open"))).toBe(true);
  await expect(pointer).toHaveAttribute("data-interactive", "true");
  await page.mouse.down(); await expect(pointer).toHaveAttribute("data-pressed", "true");
  await page.mouse.up();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  const close = dialog.getByRole("button", { name: "Close dialog" });
  await close.hover(); await expect(pointer).toBeVisible();
  expect(await close.evaluate(el => {
    const r = el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  })).toBe(true);
  await page.screenshot({ path: `${out}/dialog-pointer.png` });
  await page.keyboard.press("Escape"); await expect(dialog).toHaveCount(0);
  await expect(saved).toBeFocused(); await expect(pointer).not.toBeVisible();
  await page.locator("#pickup-search").hover();
  await expect(page.locator("html")).not.toHaveAttribute("data-equalpath-cursor", "true");
  expect(await page.locator("#pickup-search").evaluate(el => getComputedStyle(el).cursor)).not.toBe("none");
  await page.getByRole("button", { name: "Close search panel" }).click();
  await page.locator(".map-canvas canvas").hover({ position: { x: 100, y: 500 } });
  await expect(pointer).not.toBeVisible();
  await saved.hover(); await expect(pointer).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" }); await expect(pointer).not.toBeVisible();
  expect(errors).toEqual([]);
});

test("result cards reveal on first view without extra searches or hiding focused content", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const calls = await start(page); await search(page);
  const rows = page.locator(".provider-row");
  await expect(rows.first()).toHaveAttribute("data-reveal", "visible");
  await expect(rows.last()).toHaveAttribute("data-reveal", "waiting");
  await rows.last().scrollIntoViewIfNeeded();
  await expect(rows.last()).toHaveAttribute("data-reveal", "visible");
  expect(calls.filter(x => x === "search")).toHaveLength(1);
  await rows.first().scrollIntoViewIfNeeded();
  const detail = rows.first().getByRole("button", { name: /^View details/ });
  await detail.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe("care-surface-appear");
  await page.screenshot({ path: `${out}/details-reveal.png` });
  await expect.poll(() => dialog.evaluate(el => getComputedStyle(el).opacity)).toBe("1");
  await page.screenshot({ path: `${out}/details-settled.png` });
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await expect(detail).toBeFocused();
  await rows.last().getByRole("button", { name: /^View details/ }).focus();
  await expect(rows.last()).toHaveAttribute("data-reveal", "visible");
  expect(calls.filter(x => x === "search")).toHaveLength(1);
});

test("touch screens retain native interaction and reduced motion leaves all cards readable", async ({ browser, baseURL }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", baseURL });
  const page = await context.newPage();
  try {
    await start(page); await search(page);
    await expect(page.locator(".care-pointer")).not.toBeVisible();
    expect(await page.locator(".provider-row").evaluateAll(rows => rows.every(el => getComputedStyle(el).opacity === "1"))).toBe(true);
    await page.locator(".provider-row").first().getByRole("button", { name: /^View details/ }).click();
    const dialog = page.getByRole("dialog");
    expect(await dialog.evaluate(el => getComputedStyle(el).animationName)).toBe("none");
    expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    await page.screenshot({ path: `${out}/details-mobile.png` });
    await dialog.getByRole("button", { name: "Close dialog" }).click();
  } finally { await context.close(); }
});

test("dialogs fade out with their backdrop before removal for every dismissal route", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const calls = await start(page);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  const saved = page.locator(".app-header nav button").filter({ hasText: "Saved" });
  const dialog = page.locator("dialog");
  for (const method of ["close", "escape", "backdrop", "return"]) {
    if (method === "backdrop") await page.setViewportSize({ width: 390, height: 844 });
    await saved.click();
    await expect(dialog).toBeVisible();
    await page.evaluate(() => document.getAnimations().filter(a => a.animationName?.endsWith("appear")).forEach(a => a.finish()));
    if (method === "close") await dialog.getByRole("button", { name: "Close dialog" }).click();
    if (method === "escape") await page.keyboard.press("Escape");
    if (method === "backdrop") await page.mouse.click(2, 2);
    if (method === "return") await dialog.getByRole("button", { name: "Find childcare", exact: true }).click();
    await expect(dialog).toHaveAttribute("data-closing", "true");
    const sample = await dialog.evaluate(el => {
      for (const a of document.getAnimations().filter(a => a.animationName?.endsWith("disappear"))) {
        a.pause(); a.currentTime = Number(a.effect.getTiming().duration) / 2;
      }
      return { opacity: Number(getComputedStyle(el).opacity), backdrop: Number(getComputedStyle(el, "::backdrop").opacity), open: el.open, inert: el.querySelector(".dialog-content").inert };
    });
    expect(sample.open).toBe(true); expect(sample.inert).toBe(true);
    expect(sample.opacity).toBeGreaterThan(.1); expect(sample.opacity).toBeLessThan(.9);
    expect(sample.backdrop).toBeGreaterThan(.1); expect(sample.backdrop).toBeLessThan(.9);
    if (["close", "backdrop"].includes(method)) await page.screenshot({ path: `${out}/dialog-exit-${method}.png` });
    // Repeated dismissal must not release the modal or activate anything behind it early.
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(1);
    if (method === "return") {
      // Even a cancelled CSS animation must not leave an invisible modal behind.
      await page.clock.runFor(500);
    } else {
      await page.evaluate(() => document.getAnimations().filter(a => a.animationName?.endsWith("disappear")).forEach(a => a.finish()));
      await page.clock.runFor(32);
    }
    await expect(dialog).toHaveCount(0);
    await expect(saved, `Restore opener after ${method}`).toBeFocused();
  }
  expect(calls.filter(x => x === "search")).toHaveLength(0);
});

test("quick dismissal does not flash opaque, and reduced motion closes immediately", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await start(page);
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 1000));
  // Freeze both phases and the removal fallback while sampling their boundary.
  // A slower worker must not remove the dialog between the two assertions.
  await page.addStyleTag({ content: 'dialog[open], dialog[open]::backdrop { animation-play-state: paused !important; }' });
  await page.getByRole("button", { name: /^Saved(?: \d+)?$/ }).click();
  const dialog = page.locator("dialog");
  const enteringOpacity = await dialog.evaluate(el => {
    const a = el.getAnimations().find(a => a.animationName === "care-surface-appear");
    a.pause(); a.currentTime = 60;
    return Number(getComputedStyle(el).opacity);
  });
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveAttribute("data-closing", "true");
  expect(await dialog.evaluate(el => Number(el.style.getPropertyValue("--dialog-exit-opacity")))).toBeCloseTo(enteringOpacity, 3);
  await page.evaluate(() => document.getAnimations().filter(a => a.animationName?.endsWith("disappear")).forEach(a => a.finish()));
  await page.clock.fastForward(500);
  await expect(dialog).toHaveCount(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: /^Saved(?: \d+)?$/ }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  expect(await dialog.count()).toBe(0);
});
