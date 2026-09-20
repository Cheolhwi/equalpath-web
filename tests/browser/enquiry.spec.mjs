import { chooseAge, openResults, openSearch, revealPreferences } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog, demoPickup } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const out = process.env.QA_EVIDENCE_DIR || ".build/enquiry";
mkdirSync(out, { recursive: true });
const source = { label: "Published branch information", url: "https://example.com/centre", retrievedAt: "2026-09-13" };
const name = "Little Garden Childcare, Kota Damansara";
async function openQuestions(page, { missing = false, clipboard = true, transport = "institution" } = {}) {
  const base = structuredClone(fixtureCatalog.items[0]);
  const p = { ...base, id: "enquiry-test", name, mode: "live", feeRule: null, lateRule: null,
    age: { ...base.age, min: 12, max: 84, endpointKnown: true, maxInclusive: false },
    admission: null, transport: { exists: null }, pickupWindows: [],
    careWindows: [{ days: ["MON"], start: 480, end: 1020, source }],
    phone: missing ? null : { display: "03-1234 5678", source },
    whatsapp: missing ? [] : [{ href: "https://wa.me/60312345678", display: "03-1234 5678", source, scope: "website" }],
    sourcePage: source.url,
    fees: [{ amount: 650, currency: "MYR", basis: "month", kind: "programme", source }],
  };
  const api = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items: [p] }) }, drivingRoutes: async (_, rows) => rows.map(p => ({ ...p, driving: { state: "unavailable" } })) });
  await page.route("**/api", async route => route.fulfill({ json: { ok: true, ...await api(route.request().postDataJSON()) } }));
  await page.route(/https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//, route => route.abort());
  await page.addInitScript(({ pickup, clipboard }) => {
    localStorage.setItem("equalpath:tour:v1", '{"version":1,"status":"skipped"}');
    localStorage.setItem("equalpath:map:v1:live", JSON.stringify({ version: 1, zoom: 13, center: pickup, pickup }));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: async text => {
      if (!clipboard) throw new Error("Clipboard blocked for test");
      window.copiedQuestions = text;
    } } });
  }, { pickup: { ...demoPickup, id: null, label: "KL Sentral" }, clipboard });
  await page.goto("/?care=short_term#discover", { waitUntil: "domcontentloaded" });await openSearch(page);
  await page.locator("#service-date").fill("2026-09-14");
  await page.locator("#deadline").fill("13:00"); await page.locator("#care-end").fill("18:00");
  await revealPreferences(page); await chooseAge(page, "4"); await revealPreferences(page); await page.locator("#transport").selectOption(transport);
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();await openResults(page);
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Contact the centre", exact: true }).click();
  return page.getByRole("dialog");
}
const copyButton = dialog => dialog.getByRole("button", { name: "Copy message", exact: true });
const expectedMessage = async dialog => {
  const intro = await dialog.locator(".contact-message-intro").textContent();
  const questions = await dialog.locator(".contact-question:has(input:checked) label span").allTextContents();
  return [intro, ...questions.map((q, i) => `${i + 1}. ${q}`), "Thank you!"].join("\n\n");
};
for (const width of [390, 1440]) test(`${width}px: one ready message, visible checkboxes and a direct copy action`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const dialog = await openQuestions(page);
  await expect(dialog.locator(".contact-request")).toHaveAttribute("open", "");
  await expect(dialog.getByRole("heading", { name: "Your message", exact: true })).toBeVisible();
  await expect(dialog.locator(".contact-question")).toHaveCount(3);
  await expect(dialog.locator(".contact-question input:checked")).toHaveCount(3);
  await expect(dialog.getByRole("button", { name: /Preview message|Change order|Select all/ })).toHaveCount(0);
  await expect(dialog.locator("textarea")).toHaveCount(0);
  await copyButton(dialog).click();
  expect(await page.evaluate(() => window.copiedQuestions)).toBe(await expectedMessage(dialog));
  await expect(dialog.getByRole("status")).toContainText("Paste it into WhatsApp or a text message to send.");
  const fee = dialog.locator('[data-question-id="fees"]');
  const excluded = await fee.locator("label span").textContent();
  const before = await dialog.locator(".contact-question").evaluateAll(rows => rows.map(row => row.dataset.questionId));
  await fee.getByRole("checkbox").uncheck();
  await expect(fee).toContainText("Not included");
  expect(await dialog.locator(".contact-question").evaluateAll(rows => rows.map(row => row.dataset.questionId))).toEqual(before);
  await copyButton(dialog).click();
  expect(await page.evaluate(() => window.copiedQuestions)).toBe(await expectedMessage(dialog));
  expect(await page.evaluate(() => window.copiedQuestions)).not.toContain(excluded);
  await dialog.locator(".enquiry-send").evaluate(el => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: `${out}/message-${width}.png` });
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Contact the centre", exact: true }).click();
  await expect(fee.getByRole("checkbox")).not.toBeChecked();
  await fee.getByRole("checkbox").focus(); await page.keyboard.press("Space");
  await expect(fee.getByRole("checkbox")).toBeChecked();
  for (const input of await dialog.locator(".contact-question input").all()) await input.uncheck();
  await expect(copyButton(dialog)).toBeDisabled();
  await expect(dialog.getByRole("status")).toContainText("Tick a question to include it.");
  await dialog.locator('.contact-question input').first().check();
  await expect(copyButton(dialog)).toBeEnabled();
  await expect(dialog.getByRole("link", { name: `Call ${name}`, exact: true })).toHaveAttribute("href", "tel:0312345678");
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
test("combined questions retain warnings and all their source checks without copying internal explanations", async ({ page }) => {
  const dialog = await openQuestions(page);
  await expect(dialog.locator('[data-question-id="visit"]')).toContainText("The listed hours or pickup rules don’t cover 18:00");
  await expect(dialog.locator('.contact-question-evidence')).not.toHaveAttribute('open');
  await dialog.locator('.contact-question-evidence > summary').click();
  const care = dialog.locator('[data-check-id="care"]');
  await expect(care).toContainText("Published care hours: 08:00–17:00. Your pickup from childcare: 18:00.");
  await expect(care.getByRole("link")).toHaveAttribute("href", source.url);
  await expect(dialog.locator('[data-check-id]')).toHaveCount(8);
  await copyButton(dialog).click();
  const message = await page.evaluate(() => window.copiedQuestions);
  expect(message).not.toContain("Published care hours");
  expect(message).toContain("Leave at: 13:00 · Pick up child at: 18:00");
  expect(message).toContain("Can you pick up my child from KL Sentral by 13:00?");
  await expect(dialog.getByRole("link", { name: `Open WhatsApp for ${name}` })).toHaveAttribute("href", "https://wa.me/60312345678");
});
test("mobile supports manual copy, missing contacts and the checklist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openQuestions(page, { missing: true, clipboard: false, transport: "self" });
  await expect(dialog.locator('[data-question-id="pickup"]')).toHaveCount(0);
  await expect(dialog.locator('[data-question-id="arrival"]')).toHaveCount(1);
  await copyButton(dialog).click();
  const manual = dialog.getByRole("textbox", { name: "Message to copy" });
  await expect(manual).toBeFocused();
  await expect(manual).toHaveValue(await expectedMessage(dialog));
  await expect(dialog.getByRole("status")).toContainText("Copy did not work");
  expect(await manual.evaluate(el => el.selectionEnd - el.selectionStart)).toBe((await manual.inputValue()).length);
  await expect(dialog.locator(".enquiry-contact")).toContainText("No phone number listed");
  await page.screenshot({ path: `${out}/manual-copy-390.png` });
  await dialog.getByRole("button", { name: "Get ready for child care", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Get ready for child care", exact: true })).toBeVisible();
});
test("320px dark view keeps questions and copy usable without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const dialog = await openQuestions(page);
  await page.locator(".equalpath").evaluate(el => el.classList.add("dark"));
  await expect(dialog).toHaveCSS("background-color", "rgb(37, 43, 39)");
  await dialog.locator(".enquiry-send").evaluate(el => el.scrollIntoView({ block: "start" }));
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `${out}/message-dark-320.png` });
  await copyButton(dialog).click();
  expect(await page.evaluate(() => window.copiedQuestions)).toBe(await expectedMessage(dialog));
});
