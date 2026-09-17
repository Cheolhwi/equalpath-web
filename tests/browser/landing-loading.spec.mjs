import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
const out = process.env.QA_EVIDENCE_DIR || ".build/landing-loading";
mkdirSync(out, { recursive: true });
test.beforeEach(async ({ page }) => {
  await page.route("**/api", route => route.fulfill({ json: { ok: true, mode: "live", items: [], available: 0, total: 0, regions: ["Kuala Lumpur", "Selangor"] } }));
  await page.addInitScript(() => localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}'));
});

test("cold artwork stays behind the animated loader until the first drawn frame; the opening then runs visibly", async ({ page }) => {
  test.setTimeout(90000);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route("**/images/care-gallery/robin-v3/read.webp", async route => { await gate; await route.continue(); });
  await page.addInitScript(() => {
    window.prematureLandingReveal = false;
    let checkedReady = false;
    new MutationObserver(() => {
      const landing = document.querySelector(".landing");
      const sceneReady = document.querySelector(".care-scene")?.dataset.sceneStatus === "ready";
      if (landing?.dataset.loadState === "ready" && !sceneReady) window.prematureLandingReveal = true;
      if (sceneReady && !checkedReady) {
        checkedReady = true;
        requestAnimationFrame(() => requestAnimationFrame(() => {
          window.loaderRemainsAfterReady = Boolean(document.querySelector(".landing-loader"));
        }));
      }
    }).observe(document, { childList: true, subtree: true, attributes: true });
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("status")).toHaveText("Loading…");
  await expect(page.locator(".landing")).toHaveAttribute("data-load-state", "loading");
  await expect(page.locator(".landing-header")).toBeHidden();
  await expect(page.locator(".landing-loader-wordmark")).toHaveText("EQUALPATH");
  expect(await page.locator(".landing-loader-wordmark").evaluate(el => getComputedStyle(el).animationName)).toBe("loading-wordmark");
  await expect(page.getByRole("button", { name: "FIND CHILDCARE", exact: true })).toBeEnabled();
  await page.screenshot({ path: `${out}/loading-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/loading-mobile.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1000 });
  release();
  await expect(page.locator(".landing")).toHaveAttribute("data-load-state", "ready", { timeout: 60000 });
  await expect(page.locator(".landing-loader")).toHaveCount(0);
  await expect(page.locator(".care-scene")).toHaveAttribute("data-opening", "complete", { timeout: 15000 });
  expect(await page.evaluate(() => window.prematureLandingReveal)).toBe(false);
  expect(await page.evaluate(() => window.loaderRemainsAfterReady)).toBe(false);
  await page.screenshot({ path: `${out}/loaded-gallery.png` });
  const typography = await page.evaluate(() => [".landing-brand h1", ".wordmark strong"].map(selector => {
    const style = getComputedStyle(document.querySelector(selector));
    return { family: style.fontFamily, weight: style.fontWeight, tracking: Number.parseFloat(style.letterSpacing) / Number.parseFloat(style.fontSize) };
  }));
  expect(typography[0].family).toBe(typography[1].family);
  expect(typography[0].weight).toBe(typography[1].weight);
  expect(typography[0].tracking).toBeCloseTo(typography[1].tracking, 3);
  const loadedCanvas = await page.locator(".care-scene canvas").elementHandle();
  await page.getByRole("button", { name: "FIND CHILDCARE", exact: true }).click();
  await expect(page.locator(".experience")).toHaveAttribute("data-intro-phase", "ready");
  await expect(page.locator(".care-scene")).toHaveAttribute("data-autoplay", "paused");
  await page.screenshot({ path: `${out}/header-desktop.png` });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: `${out}/header-mobile.png` });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  // Returning home must reuse the ready scene even if the image network is now unavailable.
  let repeatedImages = 0;
  await page.route("**/images/care-gallery/robin-v3/*.webp", route => { repeatedImages++; return route.abort(); });
  await page.getByRole("button", { name: "EqualPath home", exact: true }).click();
  await expect(page.locator(".landing")).toHaveAttribute("data-load-state", "ready");
  await expect(page.locator(".landing-loader")).toHaveCount(0);
  expect(await loadedCanvas.evaluate(el => el === document.querySelector(".care-scene canvas"))).toBe(true);
  await expect(page.locator(".care-scene")).toHaveAttribute("data-artwork", "read");
  await page.screenshot({ path: `${out}/ready-return-mobile.png` });
  expect(repeatedImages).toBe(0);
});

test("failed artwork has a retry, and reduced-motion loading stays still", async ({ page }) => {
  test.setTimeout(90000);
  const pattern = "**/images/care-gallery/robin-v3/*.webp";
  await page.route(pattern, route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  expect(await page.locator(".landing-loader-wordmark").evaluate(el => getComputedStyle(el).animationName)).toBe("none");
  await expect(page.getByRole("alert")).toHaveText("Something didn’t load. Please try again.", { timeout: 60000 });
  await page.screenshot({ path: `${out}/loading-error.png` });
  await page.unroute(pattern);
  await page.getByRole("button", { name: "Try again", exact: true }).click();
  await expect(page.locator(".landing")).toHaveAttribute("data-load-state", "ready", { timeout: 60000 });
  await expect(page.locator(".care-scene")).toHaveAttribute("data-scene-view", "detail");
  await page.getByRole("button", { name: "FIND CHILDCARE", exact: true }).click();
  await expect(page.locator(".experience")).toHaveAttribute("data-intro-phase", "ready");
});

test("waiting is optional and a direct search link never mounts the artwork loader", async ({ page }) => {
  await page.route("**/CareScene.jsx", route => route.abort());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.getByRole("button", { name: "FIND CHILDCARE", exact: true }).click();
  await expect(page.locator(".experience")).toHaveAttribute("data-intro-phase", "ready");
  await expect(page.locator(".landing-loader")).toHaveCount(0);
  // Assert the app's DOM focus separately from the virtual display's active
  // window. Linux headed workers can leave this newly created page unfocused.
  await expect.poll(() => page.evaluate(() => ({
    target: document.activeElement?.tagName,
    inApp: document.activeElement?.matches('.equalpath'),
  }))).toEqual({ target: 'MAIN', inApp: true });
  await page.bringToFront();
  await expect(page.locator(".equalpath")).toBeFocused();
  await expect(page.locator("#pickup-search")).not.toBeFocused();
  await page.reload();
  await expect(page.locator(".landing")).toHaveCount(0);
  await expect(page.locator("#pickup-search")).toBeVisible();
});
