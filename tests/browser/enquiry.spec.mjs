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
    admission: null, transport: { exists: null }, pickupWindows: [],
    careWindows: [{ days: ["MON"], start: 480, end: 1020, source }],
    phone: missing ? null : { display: "03-1234 5678", source },
    whatsapp: missing ? [] : [{ href: "https://wa.me/60312345678", display: "03-1234 5678", source, scope: "website" }],
    sourcePage: source.url,
    fees: [{ amount: 650, currency: "MYR", basis: "month", kind: "programme", source }],
  };
  const api = createAPI({ store: { catalog: async () => ({ ...fixtureCatalog, items: [p] }) } });
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
  await page.goto("/#discover", { waitUntil: "domcontentloaded" });
  await page.locator("#service-date").fill("2026-09-14");
  await page.locator("#deadline").fill("13:00"); await page.locator("#care-end").fill("18:00");
  await page.locator("#age").selectOption("4"); await page.locator("#transport").selectOption(transport);
  await page.getByRole("button", { name: "Find care options", exact: true }).click();
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Prepare questions", exact: true }).click();
  return page.getByRole("dialog");
}
test("questions show their exact check and source; copy reflects selection and reorder, with contact actions alongside", async ({ page }) => {
  const dialog = await openQuestions(page);
  const care = dialog.locator('[data-question-id="care"]');
  await expect(dialog.locator(".enquiry-question").first()).toHaveAttribute("data-question-id", "care");
  await expect(care.locator("summary")).toHaveText("Care end time · Doesn’t match");
  await expect(care).toContainText("18:00");
  await care.locator("summary").click();
  await expect(care).toContainText("Published care hours: 08:00–17:00. Requested final collection: 18:00.");
  await expect(care.getByRole("link")).toHaveAttribute("href", source.url);
  await expect(dialog.locator('[data-question-id="capacity"]')).toContainText("Availability · Ask for every visit");
  await expect(dialog.locator('[data-question-id="fees"]')).toContainText("Fee · Ask for every visit");
  await expect(dialog.locator('[data-question-id="age"]')).toHaveCount(0);
  const copy = dialog.getByRole("button", { name: "Copy questions", exact: true });
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
  expect(message).toContain(name); expect(message).toContain("Pickup from: KL Sentral");
  expect(message).toContain("Collect by: 13:00\nCare until: 18:00");
  expect(message).not.toContain(excluded);
  expected.forEach((q, i) => expect(message).toContain(`${i + 1}. ${q}`));
  await expect(dialog.getByRole("link", { name: `Open WhatsApp for ${name}` })).toHaveAttribute("href", "https://wa.me/60312345678");
  await expect(dialog.locator(".enquiry-contact")).toContainText("may cover more than one branch");
  await dialog.getByRole("button", { name: "Close dialog", exact: true }).click();
  await page.getByRole("button", { name: `View details for ${name}`, exact: true }).click();
  await page.getByRole("button", { name: "Prepare questions", exact: true }).click();
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
  await dialog.getByRole("button", { name: "Clear selection", exact: true }).click();
  await expect(dialog.getByRole("button", { name: "Copy questions", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "Select all", exact: true }).click();
  await dialog.getByRole("button", { name: "Copy questions", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Questions to copy" })).toBeFocused();
  await expect(dialog.getByRole("textbox", { name: "Questions to copy" })).toContainText("Care until: 18:00");
  const contact = dialog.locator(".enquiry-contact");
  await expect(contact).toContainText("couldn’t find a contact number");
  await contact.scrollIntoViewIfNeeded(); await page.screenshot({ path: `${out}/enquiry-mobile-contact.png` });
  await dialog.getByRole("button", { name: "Create checklist", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Get ready for care", exact: true })).toBeVisible();
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
