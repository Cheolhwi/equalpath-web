import { chooseAge, openSearch } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";

const out = process.env.QA_EVIDENCE_DIR || ".build/time-picker";
mkdirSync(out, { recursive: true });
async function start(page) {
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, (route) => route.abort());
  const searches = [];
  const api = createAPI({ store: { catalog: async () => fixtureCatalog } });
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "search") searches.push(body.request);
    await route.fulfill({ json: { ok: true, ...await api(body) } });
  });
  await page.addInitScript(() => localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}'));
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await openSearch(page);
  await page.locator("#deadline").fill("13:00");
  await page.locator("#care-end").fill("18:00");
  return searches;
}
const choose = async (popup, hour, minute) => {
  await popup.getByRole("listbox", { name: "Hour", exact: true }).getByRole("option", { name: hour, exact: true }).click();
  await popup.getByRole("listbox", { name: "Minute", exact: true }).getByRole("option", { name: minute, exact: true }).click();
};

test("themed time selection preserves exact minutes, commits explicitly and keeps request validation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const searches = await start(page);
  const trigger = page.getByRole("button", { name: "Choose when will your child leave? time", exact: true });
  const popup = page.getByRole("dialog", { name: "When will your child leave? time", exact: true });
  await trigger.click();
  const hour = popup.getByRole("listbox", { name: "Hour", exact: true });
  const minute = popup.getByRole("listbox", { name: "Minute", exact: true });
  await expect(hour).toBeFocused();
  await choose(popup, "14", "27");
  await expect(page.locator("#deadline")).toHaveValue("13:00");
  const selected = hour.getByRole("option", { selected: true });
  expect(await selected.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe("rgb(233, 235, 225)");
  await page.screenshot({ path: `${out}/time-desktop.png` });
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#deadline")).toHaveValue("14:27");
  await expect(trigger).toBeFocused();
  expect(searches).toHaveLength(0);
  await page.locator("#deadline").press("ArrowDown");
  await hour.press("End"); await hour.press("Enter");
  await expect(minute).toBeFocused(); await minute.press("End"); await minute.press("Enter");
  await expect(page.locator("#deadline")).toHaveValue("23:59");
  await trigger.click(); await hour.press("Home"); await hour.press("Escape");
  await expect(page.locator("#deadline")).toHaveValue("23:59");
  await expect(popup).toHaveCount(0); await expect(trigger).toBeFocused();
  await trigger.click(); await popup.getByRole("button", { name: "Clear", exact: true }).click();
  await expect(page.locator("#deadline")).toHaveValue("");
  await page.locator("#deadline").fill("930"); await page.locator("#deadline").press("Tab");
  await expect(page.locator("#deadline")).toHaveValue("09:30");
  await page.locator("#care-end").fill("09:00");
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect(page.getByText("Choose a later pickup time on the same day.", { exact: true })).toBeVisible();
  expect(searches).toHaveLength(0);
  await page.locator("#care-end").fill("17:45");
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();
  await expect.poll(() => searches.length).toBe(1);
  expect(searches[0]).toMatchObject({ deadline: "09:30", end: "17:45" });
});

test("mobile and template pickers fit the viewport, respect dark mode and dismiss without closing their parent", async ({ page }) => {
  const errors = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 568 });
  await start(page);
  await page.getByRole("button", { name: "Choose when will you pick up your child? time", exact: true }).click();
  const popup = page.locator(".time-picker");
  let box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(320);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(568);
  expect(await popup.evaluate((el) => getComputedStyle(el).animationName)).toBe("none");
  await page.screenshot({ path: `${out}/time-mobile.png` });
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Save this search", exact: true }).click();
  await page.getByRole("button", { name: "Choose template when will your child leave? time", exact: true }).click();
  await choose(popup, "03", "05"); await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Save this search", exact: true })).toBeVisible();
  await expect(page.getByLabel("Template when will your child leave?", { exact: true })).toHaveValue("13:00");
  await page.getByRole("button", { name: "Choose template when will you pick up your child? time", exact: true }).click();
  await choose(popup, "19", "43");
  box = await popup.boundingBox(); expect(box.y + box.height).toBeLessThanOrEqual(568);
  await page.screenshot({ path: `${out}/time-template-mobile.png` });
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.getByLabel("Template when will you pick up your child?", { exact: true })).toHaveValue("19:43");
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Display and data settings", exact: true }).click();
  await page.getByRole("button", { name: "Dark", exact: true }).click();
  await page.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: "Choose when will your child leave? time", exact: true }).click();
  const darkFill = await popup.evaluate((el) => getComputedStyle(el).backgroundColor);
  const channels = darkFill.match(/[\d.]+/g).map(Number);
  expect(Math.max(...channels.slice(0, 3))).toBeLessThan(90);
  expect(channels[3] ?? 1).toBeGreaterThanOrEqual(.85);
  await page.screenshot({ path: `${out}/time-dark.png` });
  await popup.getByRole("listbox", { name: "Hour", exact: true }).press("Tab");
  await page.keyboard.press("Tab"); await page.keyboard.press("Tab"); await page.keyboard.press("Tab");
  await expect(page.locator("#care-end")).toBeFocused(); await expect(popup).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const width of [390,1440]) test(`${width}px: clicking outside saves the latest time without searching; Escape cancels`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const searches=await start(page);
  const trigger=page.locator('#deadline').locator('..').getByRole('button');
  await trigger.click();
  const popup=page.locator('.time-picker');
  await choose(popup,'15','37');
  await page.getByRole('heading',{name:'Find childcare',exact:true}).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator('#deadline')).toHaveValue('15:37');
  expect(searches).toHaveLength(0);
  await trigger.click(); await choose(popup,'16','42'); await page.keyboard.press('Escape');
  await expect(page.locator('#deadline')).toHaveValue('15:37');
  // Opening an empty picker without selecting a time does not fill it silently.
  await page.locator('#deadline').fill(''); await trigger.click();
  await page.getByRole('heading',{name:'Find childcare',exact:true}).click();
  await expect(page.locator('#deadline')).toHaveValue('');
  // The same outside-save behaviour works inside the saved-search dialog.
  await page.locator('#deadline').fill('13:00');
  await page.getByRole('button',{name:'Save this search',exact:true}).click();
  await page.locator('#template-deadline').locator('..').getByRole('button').click();
  await choose(popup,'14','26');
  await page.getByRole('textbox',{name:'Search name',exact:true}).click();
  await expect(popup).toHaveCount(0);
  await expect(page.locator('#template-deadline')).toHaveValue('14:26');
  await expect(page.getByRole('dialog',{name:'Save this search',exact:true})).toBeVisible();
});
