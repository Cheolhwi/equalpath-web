import { chooseAge, openSearch, returningVisitor, setTime, setTimes, submitSearch } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";

const out = process.env.QA_EVIDENCE_DIR || ".build/time-picker";
mkdirSync(out, { recursive: true });
// Search times are chips in the map dock that open the app's own hour/minute
// picker; there is no free typing in the chip itself.
async function start(page) {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  const searches = [];
  const api = createAPI({ store: { catalog: async () => fixtureCatalog } });
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "search") searches.push(body.request);
    await route.fulfill({ json: { ok: true, ...await api(body) } });
  });
  await returningVisitor(page);
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await openSearch(page);
  await setTimes(page, "13:00", "18:00");
  return searches;
}
const startChip = page => page.locator(".map-search-dock #deadline");
const endChip = page => page.locator(".map-search-dock #care-end");
const shown = chip => chip.locator("strong");
const choose = async (popup, hour, minute) => {
  await popup.getByRole("listbox", { name: "Hour", exact: true }).getByRole("option", { name: hour, exact: true }).click();
  // The list shows 5-minute steps; other minutes are typed on the minute list.
  const minutes = popup.getByRole("listbox", { name: "Minute", exact: true });
  if (Number(minute) % 5) { await minutes.focus(); await minutes.pressSequentially(minute); }
  else await minutes.getByRole("option", { name: minute, exact: true }).click();
};

test("themed time selection preserves exact minutes, commits explicitly and keeps request validation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const searches = await start(page);
  const trigger = startChip(page);
  const popup = page.getByRole("dialog", { name: "Start time", exact: true });
  await trigger.click();
  const hour = popup.getByRole("listbox", { name: "Hour", exact: true });
  const minute = popup.getByRole("listbox", { name: "Minute", exact: true });
  await expect(hour).toBeFocused();
  await choose(popup, "14", "27");
  await expect(shown(trigger)).toHaveText("13:00");
  const selected = hour.getByRole("option", { selected: true });
  await expect(selected).toHaveText("14");
  await page.screenshot({ path: `${out}/time-desktop.png` });
  await popup.getByRole("button", { name: /^Done/ }).click();
  await expect(shown(trigger)).toHaveText("14:27");
  await expect(trigger).toBeFocused();
  expect(searches).toHaveLength(0);
  await trigger.press("Enter");
  await hour.press("End"); await hour.press("Enter");
  await expect(minute).toBeFocused(); await minute.press("End"); await minute.press("Enter");
  await expect(shown(trigger)).toHaveText("23:59");
  await trigger.click(); await hour.press("Home"); await hour.press("Escape");
  await expect(shown(trigger)).toHaveText("23:59");
  await expect(popup).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await popup.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(shown(trigger)).toHaveText("Set time");
  await setTimes(page, "09:30", "09:00");
  await chooseAge(page); await submitSearch(page);
  await expect(page.getByText("Choose an end time after the start time, on the same day.", { exact: true })).toBeVisible();
  expect(searches).toHaveLength(0);
  await setTime(page, "care-end", "17:45");
  await submitSearch(page);
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0]).toMatchObject({ deadline: "09:30", end: "17:45" });
});

test("mobile pickers fit the viewport, respect dark mode and dismiss without closing their parent", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.addInitScript(() => localStorage.setItem('equalpath:motion:v1', 'reduce'));
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  await endChip(page).click();
  const popup = page.locator(".time-picker");
  let box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(568);
  expect(await popup.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: `${out}/time-mobile.png` });
  await page.keyboard.press("Escape");
  await startChip(page).click();
  await choose(popup, "03", "05"); await page.keyboard.press("Escape");
  await expect(page.locator(".map-search-dock .dock-form")).toBeVisible();
  await expect(shown(startChip(page))).toHaveText("13:00");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Display and data settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await startChip(page).click();
  const darkFill = await popup.evaluate((el) => getComputedStyle(el).backgroundColor);
  const channels = darkFill.match(/[\d.]+/g).map(Number);
  expect(Math.max(...channels.slice(0, 3))).toBeLessThan(90);
  expect(channels[3] ?? 1).toBeGreaterThanOrEqual(.85);
  await page.screenshot({ path: `${out}/time-dark.png` });
  // Hour → Minute → Clear → Done → the next control after the Start chip.
  await popup.getByRole("listbox", { name: "Hour", exact: true }).press("Tab");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(endChip(page)).toBeFocused(); await expect(popup).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [390,1440]) test(`${width}px: clicking outside saves the latest time without searching; Escape cancels`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const searches=await start(page);
  const trigger=startChip(page);
  await trigger.click();
  const popup=page.locator('.time-picker');
  await choose(popup,'15','37');
  await page.locator('#pickup-search').click();
  await expect(popup).toHaveCount(0);
  await expect(shown(trigger)).toHaveText('15:37');
  expect(searches).toHaveLength(0);
  await trigger.click(); await choose(popup,'16','42'); await page.keyboard.press('Escape');
  await expect(shown(trigger)).toHaveText('15:37');
  // Opening an empty picker without selecting a time does not fill it silently.
  await trigger.click(); await popup.getByRole('button', { name: 'Clear', exact: true }).click();
  await expect(shown(trigger)).toHaveText('Set time');
  await trigger.click();
  await page.locator('#pickup-search').click();
  await expect(popup).toHaveCount(0);
  await expect(shown(trigger)).toHaveText('Set time');
  expect(searches).toHaveLength(0);
});
