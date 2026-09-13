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
  await page.goto("/#discover");
  return calls;
}
async function search(page) {
  await page.locator("#service-date").fill("2026-09-14");
  await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("17:00");
  await page.getByRole("button", { name: "Find care options", exact: true }).click();
  await expect(page.locator(".provider-row")).toHaveCount(8);
}

test("circle pointer works above dialogs without blocking clicks and restores native input/map cursors", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = []; page.on("pageerror", e => errors.push(e.message));
  await start(page);
  const pointer = page.locator(".care-pointer");
  const saved = page.getByRole("button", { name: /03.*SAVED/ });
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

test("touch screens retain native interaction and reduced motion leaves all cards readable", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, reducedMotion: "reduce", baseURL: "http://127.0.0.1:4191" });
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
