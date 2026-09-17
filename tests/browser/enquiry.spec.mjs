import { chooseAge, openResults, openSearch, revealPreferences } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog, demoPickup } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const out = process.env.QA_EVIDENCE_DIR || ".build/enquiry";
mkdirSync(out, { recursive: true });
const source = { label: "Published branch information", url: "https://example.com/centre", retrievedAt: "2026-09-13" };
const name = "Little Garden Childcare, Kota Damansara";
async function openQuestions(page, { missing = false, clipboard = true, transport = "institution", edit = true } = {}) {
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
  if (edit && !(await page.locator(".question-editor").getAttribute("open") !== null)) await page.locator(".question-editor > summary").click();
  return page.getByRole("dialog");
}
for (const width of [390, 1440]) test(`${width}px: search details open by default; contact and the optional message stay usable`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  const dialog = await openQuestions(page, { edit: false });
  const call = dialog.getByRole("link", { name: `Call ${name}`, exact: true });
  await expect(call).toBeVisible();
  await expect(call).toHaveAttribute("href", "tel:0312345678");
  await expect(dialog.getByRole("heading", { name: "Ask if your child can come", exact: true })).toHaveCount(0);
  await expect(dialog.locator(".question-tags, .question-tag")).toHaveCount(0);
  await expect(dialog.locator(".question-editor")).not.toHaveAttribute("open");
  await expect(dialog.locator(".contact-request")).toHaveAttribute("open", "");
  await expect(dialog.locator(".message-sample")).toContainText("Hello, I need childcare for a few hours.");
  await page.screenshot({ path: `${out}/contact-first-${width}.png` });
  const feeText = await dialog.locator('[data-question-id="fees"] label span').textContent();
  const careText = await dialog.locator('[data-question-id="care"] label span').textContent();
  await dialog.locator(".question-editor > summary").click();
  const fee = dialog.locator('[data-question-id="fees"]').getByRole("checkbox");
  await fee.uncheck();
  await dialog.locator(".enquiry-preview > summary").click();
  await expect(dialog.locator(".enquiry-preview > div")).not.toContainText(feeText);
  await expect(dialog.locator(".enquiry-preview > div")).toContainText(careText);
  await dialog.getByRole("button", { name: "Copy message to send", exact: true }).click();
  const copied = await page.evaluate(() => window.copiedQuestions);
  expect(copied).not.toContain(feeText);
  expect(copied).toContain(careText);
  expect(copied).toContain("Pickup address: KL Sentral");
  await expect(dialog.getByRole("status")).toContainText("Now paste it into WhatsApp or a text message.");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Contact the centre", exact: true }).click();
  await dialog.locator(".question-editor > summary").click();
  await expect(fee).not.toBeChecked();
  await fee.focus(); await page.keyboard.press("Space");
  await expect(fee).toBeChecked();
  await dialog.getByRole("button", { name: "Remove all questions", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copy message to send", exact: true })).toBeDisabled();
  await expect(call).toBeEnabled();
  await dialog.getByRole("button", { name: "Use suggested message", exact: true }).click();
  await expect(fee).toBeChecked();
  await expect(dialog.getByRole("button", { name: "Copy message to send", exact: true })).toBeEnabled();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
});
test("questions show their exact check and source; copy reflects selection and reorder, with contact actions alongside", async ({ page }) => {
  const dialog = await openQuestions(page);
  const care = dialog.locator('[data-question-id="care"]');
  await expect(dialog.locator(".enquiry-question").first()).toHaveAttribute("data-question-id", "care");
  await expect(care.locator("summary")).toHaveText("Time to go home · Doesn’t match");
  await expect(care).toContainText("18:00");
  await care.locator("summary").click();
  await expect(care).toContainText("Published care hours: 08:00–17:00. Your pickup from childcare: 18:00.");
  await expect(care.getByRole("link")).toHaveAttribute("href", source.url);
  await expect(dialog.locator('[data-question-id="capacity"]')).toContainText("Can they take your child? · Ask for every visit");
  await expect(dialog.locator('[data-question-id="fees"]')).toContainText("Fee · Ask for every visit");
  await expect(dialog.locator('[data-question-id="age"]')).toHaveCount(0);
  const copy = dialog.getByRole("button", { name: "Copy message to send", exact: true });
  await copy.scrollIntoViewIfNeeded();
  await expect(copy).toBeInViewport();
  await page.screenshot({ path: `${out}/enquiry-desktop.png` });
  await care.locator("summary").click();
  const capacity = dialog.locator('[data-question-id="capacity"]');
  const excluded = await capacity.locator("label span").innerText();
  await capacity.getByRole("checkbox").uncheck();
  await dialog.getByRole("button", { name: "Move care question down", exact: true }).click();
  const expected = await dialog.locator(".enquiry-question:has(input:checked) label span").allTextContents();
  await copy.click();
  const message = await page.evaluate(() => window.copiedQuestions);
  expect(message).toContain(name); expect(message).toContain("Pickup address: KL Sentral");
  expect(message).toContain("Leave pickup address by: 13:00\nPick up from childcare at: 18:00");
  expect(message).not.toContain(excluded);
  expected.forEach((q, i) => expect(message).toContain(`${i + 1}. ${q}`));
  await expect(dialog.getByRole("link", { name: `Open WhatsApp for ${name}` })).toHaveAttribute("href", "https://wa.me/60312345678");
  await expect(dialog.locator(".enquiry-contact")).toContainText("Website number · ask for this centre");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Contact the centre", exact: true }).click();
  if (!(await page.locator(".question-editor").getAttribute("open") !== null)) await page.locator(".question-editor > summary").click();
  await expect(dialog.locator(".enquiry-question:has(input:checked) label span")).toHaveText(expected);
  await expect(dialog.locator(".enquiry-question input:not(:checked)")).toHaveCount(1);
});
test("mobile preserves relationships, manual copy, missing contacts and the next-step checklist", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await openQuestions(page, { missing: true, clipboard: false, transport: "self" });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.screenshot({ path: `${out}/enquiry-mobile-top.png` });
  const care = dialog.locator('[data-question-id="care"]');
  await care.locator("summary").focus(); await page.keyboard.press("Enter");
  await expect(care.locator("details")).toHaveAttribute("open", "");
  await care.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/enquiry-mobile-linked-check.png` });
  await expect(dialog.locator('[data-question-id="transport"]')).toHaveCount(0);
  await dialog.getByRole("button", { name: "Remove all questions", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copy message to send", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Use all questions", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy message to send", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Message to copy" })).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "Message to copy" })).toContainText("Pick up from childcare at: 18:00");
  const contact = dialog.locator(".enquiry-contact");
  await expect(contact).toContainText("No phone number listed");
  await contact.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/enquiry-mobile-contact.png` });
  await dialog.getByRole("button", { name: "Get ready for child care", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Get ready for child care", exact: true })).toBeVisible();
});
test("narrow dark view has readable states and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  const dialog = await openQuestions(page);
  await page.locator(".equalpath").evaluate(el => el.classList.add("dark"));
  await expect(dialog).toHaveCSS("background-color", "rgb(37, 43, 39)");
  const care = dialog.locator('[data-question-id="care"]');
  await care.locator("summary").click(); await care.scrollIntoViewIfNeeded();
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await page.screenshot({ path: `${out}/enquiry-dark-320.png` });
});
