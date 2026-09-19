import { revealPreferences, chooseAge, openSearch, openResults } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { readFileSync, mkdirSync } from "node:fs";
const evidenceDir = process.env.QA_EVIDENCE_DIR || "evidence/phase4-5";
mkdirSync(evidenceDir, { recursive: true });
test.beforeEach(async ({ page }) => {
  await page.route(
    /https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com)\//,
    (r) => r.abort(),
  );
});
const institution = "Demo · Garden Learning House";
const key = "equalpath:saved:v1:demo";
const start = async (page) => {
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await openSearch(page);
  await chooseAge(page); await page
    .getByRole("button", { name: "Find childcare", exact: true })
    .click();
  await openResults(page);
  await expect(
    page.getByRole("button", { name: `Select ${institution}`, exact: true }),
  ).toBeVisible();
};
const save = async (page) => {
  await page
    .getByRole("button", { name: `Save ${institution}`, exact: true })
    .click();
  await page
    .getByPlaceholder("For example: near work")
    .fill("Convenient public pickup");
  await page
    .getByRole("button", { name: "Save centre", exact: true })
    .click();
};
const details = async (page) =>
  page
    .getByRole("button", {
      name: `View details for ${institution}`,
      exact: true,
    })
    .click();
const close = async (page) =>
  page.getByRole("button", { name: "Close dialog", exact: true }).click();
const saved = async (page) => {
  await page.getByRole("button", { name: /^Saved(?: \d+)?$/ }).click();
  await page.getByRole("button", { name: /^Childcare / }).click();
};
const preparation = async (page) => {
  await details(page);
  await page
    .getByRole("button", { name: "Get ready for child care", exact: true })
    .click();
};

test("questions belong to a selected centre and never appear in main navigation", async ({ page }) => {
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  await openSearch(page);
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("button")).toHaveCount(4);
  await expect(nav.getByRole("button", { name: /enquir|questions/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Find childcare", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Contact the centre", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${evidenceDir}/discovery-copy.png` });
  await chooseAge(page); await page.getByRole("button", { name: "Find childcare", exact: true }).click();
  await openResults(page);
  await details(page);
  await page.getByRole("button", { name: "Contact the centre", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Contact the centre", exact: true })).toBeVisible();
  await expect(page.locator(".request-context")).toContainText(institution);
  const question = page.locator(".question-list input").first();
  await question.uncheck();
  await page.screenshot({ path: `${evidenceDir}/centre-questions-copy.png` });
  await close(page);
  await details(page);
  await page.getByRole("button", { name: "Contact the centre", exact: true }).first().click();
  await expect(page.locator(".question-list input:not(:checked)")).toHaveCount(1);
  await close(page);
  await expect(nav.getByRole("button", { name: /enquir|questions/i })).toHaveCount(0);
});

test("save a centre, reload, edit its note, recheck, download preparation, and remove", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await save(page);
  await expect(page.getByRole("button", { name: "Save this search", exact: true })).toHaveCount(0);
  await page.reload({ waitUntil: "domcontentloaded" });
  await saved(page);
  await expect(
    page.getByText("Convenient public pickup", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit ${institution}`, exact: true })
    .click();
  await page
    .getByPlaceholder("For example: near work")
    .fill("Near the usual centre");
  await page
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await expect(
    page.getByText("Near the usual centre", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/saved-desktop.png` });
  await expect(page.getByRole("button", { name: /^Searches / })).toHaveCount(0);
  await page
    .getByRole("button", { name: "Check for a new date", exact: true })
    .click();
  await openSearch(page);
  await expect(page.locator("#service-date")).toHaveValue("");
  await page.locator("#service-date").fill("2026-09-19");
  await page
    .getByRole("button", { name: "Check saved centre", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "The details we checked haven’t changed",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Update saved details", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Get ready for child care", exact: true })
    .click();
  await page.locator(".ready-addresses > summary").click();
  await expect(
    page.getByText(/Confirm the arrival time with the centre/),
  ).toBeVisible();
  await page.locator(".ready-support > summary").click();
  await expect(
    page.getByRole("heading", { name: "At the pickup address", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "With the childcare centre", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "With the person driving", exact: true }),
  ).toBeVisible();
  await page.getByText("At the pickup address", { exact: true }).click();
  await expect(page.getByText("What ID and permission does the person picking up my child need?", { exact: true })).toBeVisible();
  await page.getByText("At the pickup address", { exact: true }).click();
  await page.getByText("With the person driving", { exact: true }).click();
  await expect(page.getByText("Who will pick up my child, and in which car?", { exact: true })).toBeVisible();
  await page.getByText("With the person driving", { exact: true }).click();
  await page.locator(".ready-support > summary").click();
  await page.locator(".ready-addresses > summary").click();
  await page.locator("dialog").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: `${evidenceDir}/preparation-desktop.png` });
  await page
    .getByRole("checkbox", {
      name: "Pack a bag with your child’s name.",
      exact: true,
    })
    .check();
  await expect(page.getByRole("progressbar", { name: "Packing checklist progress" })).toHaveAttribute("value", "1");
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download checklist", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs(`${evidenceDir}/preparation-demo.html`);
  const html = readFileSync(`${evidenceDir}/preparation-demo.html`, "utf8");
  expect(html).toContain("☑ Pack a bag with your child’s name.");
  expect(html).toContain("2026-09-19");
  expect(html).not.toContain("Near the usual centre");
  expect(html).not.toContain("<input");
  const exportPage = await page.context().newPage();
  await exportPage.setContent(html);
  await exportPage.pdf({
    path: `${evidenceDir}/preparation-demo.pdf`,
    format: "A4",
    printBackground: true,
  });
  await exportPage.close();
  await close(page);
  await saved(page);
  await page
    .getByRole("button", { name: `Remove ${institution}`, exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Save childcare you like",
      exact: true,
    }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});

test("failed local writes preserve candidate, previous reason and saved list", async ({
  page,
}) => {
  await start(page);
  await save(page);
  await page.evaluate(() => {
    Storage.prototype.setItem = function () {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await saved(page);
  await page
    .getByRole("button", { name: `Edit ${institution}`, exact: true })
    .click();
  await page
    .getByPlaceholder("For example: near work")
    .fill("Unsaved reason");
  await page
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "previous saved details are unchanged",
  );
  await page.getByRole("button", { name: "Back", exact: true }).click();
  await expect(
    page.getByText("Convenient public pickup", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Remove ${institution}`, exact: true })
    .click();
  await expect(page.locator(".saved-row")).toHaveCount(1);
  await page.screenshot({ path: `${evidenceDir}/storage-failure.png` });
  await close(page);
  await expect(
    page.getByRole("button", { name: `Select ${institution}`, exact: true }),
  ).toBeVisible();
});

test("an unselected address and conflicting times require correction", async ({ page }) => {
  await start(page);
  await page.getByRole("button", { name: "Change search", exact: true }).click();
  await page.locator("#pickup-search").fill("An address not selected yet");
  await page.getByRole("button", { name: "Update results", exact: true }).click();
  await expect(page.locator("#pickup-search")).toHaveAttribute("aria-invalid", "true");
  await page.locator("#pickup-search").fill("Demo usual");
  await page.getByRole("button", { name: "Find address", exact: true }).click();
  await page.getByRole("button", { name: /Demo usual centre/ }).click();
  await page.locator("#care-end").fill("15:00");
  await chooseAge(page); await page
    .getByRole("button", { name: "Find childcare", exact: true })
    .click();
  await expect(
    page.getByText("Choose a later pickup time on the same day.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/search-correction.png` });
});

test("reopened favourite reports changed source facts and preserves snapshot after refresh failure", async ({
  page,
}) => {
  await start(page);
  await save(page);
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON();
    if (body.action === "details") {
      const response = await route.fetch();
      const data = await response.json();
      data.items[0].businessHours.windows[0].end = 1260;
      data.items[0].businessHours.source.sourceDate = "2026-09-13";
      await route.fulfill({ json: data });
    } else await route.continue();
  });
  await saved(page);
  await page
    .getByRole("button", { name: "Check for a new date", exact: true })
    .click();
  await openSearch(page);
  await page.locator("#service-date").fill("2026-09-18");
  await page
    .getByRole("button", { name: "Check saved centre", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: /detail.*changed/ }),
  ).toBeVisible();
  await expect(
    page.locator(".fact-change").getByText("Opening hours", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/changed-facts.png` });
  await close(page);
  await page.unroute("**/api");
  await saved(page);
  await page
    .getByRole("button", { name: "Check for a new date", exact: true })
    .click();
  await openSearch(page);
  await page.locator("#service-date").fill("2026-09-20");
  await page.route("**/api", (route) => route.abort());
  await page
    .getByRole("button", { name: "Check saved centre", exact: true })
    .click();
  await expect(
    page.getByText("We couldn’t check the latest details", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/we can’t tell whether they’ve changed/)).toBeVisible();
  const data = await page.evaluate(
    (k) => JSON.parse(localStorage.getItem(k)),
    key,
  );
  expect(data.favourites[0].snapshot.facts.businessHours.windows[0].end).toBe(
    1140,
  );
});

test("preparation remains dated until explicitly regenerated for new times and transport", async ({
  page,
}) => {
  await start(page);
  await preparation(page);
  await close(page);
  await page.getByRole("button", { name: "Change search", exact: true }).click();
  await page.locator("#care-end").fill("21:00");
  await revealPreferences(page); await page.locator("#transport").selectOption("self");
  await page
    .getByRole("button", { name: "Update results", exact: true })
    .click();
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await openResults(page);
  await expect(
    page.getByRole("button", { name: "Change search", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Checklist/ }).click();
  await expect(
    page.getByText(/This checklist still uses your earlier date and times/),
  ).toBeVisible();
  await expect(page.locator(".preparation-sequence")).toContainText("18:00");
  await page
    .getByRole("button", { name: "Update checklist", exact: true })
    .click();
  await expect(page.locator(".preparation-sequence")).toContainText("21:00");
  await expect(page.getByRole("heading", { name: "Check before you go", exact: true })).toBeVisible();
  await expect(page.locator(".preparation-conflicts details[open]")).not.toHaveCount(0);
  await expect(
    page.getByRole("checkbox", {
      name: "Agree dinner and evening pickup arrangements.",
      exact: true,
    }),
  ).toBeVisible();
  await page.locator(".ready-addresses > summary").click();
  await expect(
    page.getByText("I’ll handle pickup", { exact: true }),
  ).toBeVisible();
});

for (const width of [390, 1440]) test(`${width}px: checklist times save in place, keep ticks and update checks, messages and downloads`, async ({ page }) => {
  await page.setViewportSize({ width, height: 844 });
  await page.addInitScript(() => Object.defineProperty(navigator, "clipboard", { configurable: true, value: {
    writeText: async text => { window.checklistMessage = text; },
  } }));
  const searches = [];
  page.on("request", request => { if (request.url().endsWith("/api") && request.postDataJSON()?.action === "search") searches.push(request.postDataJSON()); });
  await start(page);
  await preparation(page);
  const searchCount = searches.length;
  const leave = page.getByRole("button", { name: /^Change go to childcare time:/ });
  const pickup = page.getByRole("button", { name: /^Change pick up child time:/ });
  const bag = page.getByRole("checkbox", { name: "Pack a bag with your child’s name.", exact: true });
  await bag.check();
  await leave.click();
  const popup = page.locator(".time-picker");
  const chooseTime = async (hour, minute) => {
    await popup.getByRole("listbox", { name: "Hour", exact: true }).getByRole("option", { name: hour, exact: true }).click();
    await popup.getByRole("listbox", { name: "Minute", exact: true }).getByRole("option", { name: minute, exact: true }).click();
  };
  await chooseTime("14", "27");
  const box = await popup.boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(width);
  expect(box.y).toBeGreaterThanOrEqual(0); expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.screenshot({ path: `${evidenceDir}/edit-checklist-time-${width}.png` });
  await page.getByRole("heading", { name: "Get ready for child care", exact: true }).click();
  await expect(popup).toHaveCount(0);
  await expect(leave).toContainText("14:27");
  await expect(bag).toBeChecked();
  await expect(page.getByText("Showing previous results", { exact: true })).toHaveCount(0);

  await pickup.click(); await chooseTime("21", "15");
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(pickup).toContainText("21:15");
  await expect(bag).toBeChecked();
  await expect(page.locator(".preparation-conflicts")).toContainText("21:15");
  await expect(page.getByRole("checkbox", { name: "Agree dinner and evening pickup arrangements.", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download checklist", exact: true }).click();
  const download = await downloadPromise;
  const path = `${evidenceDir}/edited-checklist-${width}.html`;
  await download.saveAs(path);
  const html = readFileSync(path, "utf8");
  expect(html).toContain("By 14:27"); expect(html).toContain("At 21:15");
  expect(html).toContain("☑ Pack a bag with your child’s name.");

  await pickup.click(); await chooseTime("13", "00");
  await popup.getByRole("button", { name: "Done", exact: true }).click();
  await expect(page.locator("#preparation-time-error")).toContainText("later pickup time");
  await expect(pickup).toContainText("21:15");
  await leave.click(); await chooseTime("12", "00"); await page.keyboard.press("Escape");
  await expect(leave).toContainText("14:27");
  await expect(page.getByRole("heading", { name: "Get ready for child care", exact: true })).toBeVisible();
  await pickup.click(); await chooseTime("18", "05");
  await page.getByRole("heading", { name: "Get ready for child care", exact: true }).click();
  await expect(page.locator("#preparation-time-error")).toHaveCount(0);
  await expect(page.getByRole("checkbox", { name: "Agree dinner and evening pickup arrangements.", exact: true })).toHaveCount(0);
  await expect(bag).toBeChecked();
  expect(searches).toHaveLength(searchCount);
  expect(await page.locator(".preparation-sequence").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.locator("dialog").evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: `${evidenceDir}/edited-checklist-${width}.png` });

  await page.locator(".ready-plan-note").getByRole("button", { name: "Contact the centre", exact: true }).click();
  await page.getByRole("button", { name: "Copy message to send", exact: true }).click();
  const copied = await page.evaluate(() => window.checklistMessage);
  expect(copied).toContain("Leave pickup address by: 14:27");
  expect(copied).toContain("Pick up from childcare at: 18:05");
  await page.getByRole("button", { name: "Get ready for child care", exact: true }).click();
  await expect(leave).toContainText("14:27"); await expect(pickup).toContainText("18:05");
  await expect(page.getByText("Showing previous results", { exact: true })).toHaveCount(0);
});

test("mobile navigation, modal layout, checkboxes and keyboard close remain usable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await start(page);
  await save(page);
  await saved(page);
  await page.screenshot({ path: `${evidenceDir}/saved-mobile.png` });
  await page.keyboard.press("Escape");
  await details(page);
  await page
    .getByRole("button", { name: "Get ready for child care", exact: true })
    .click();
  await page.screenshot({ path: `${evidenceDir}/preparation-mobile.png` });
  const box = await page.locator("dialog").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const check = page.getByRole("checkbox", {
    name: "Pack a bag with your child’s name.",
    exact: true,
  });
  await check.check();
  const clothes = page.getByRole("checkbox", { name: "Pack spare clothes.", exact: true });
  const water = page.getByRole("checkbox", { name: "Pack a water bottle.", exact: true });
  await clothes.check();
  await expect(water).not.toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Packing checklist progress" })).toHaveAttribute("value", "2");
  await check.uncheck();
  await expect(check).not.toBeChecked();
  await expect(clothes).toBeChecked();
  await expect(page.getByRole("progressbar", { name: "Packing checklist progress" })).toHaveAttribute("value", "1");
  await check.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/packing-mobile.png` });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: `${evidenceDir}/preparation-320.png` });
  await page.locator(".ready-addresses > summary").click();
  await expect(page.getByText(/Confirm the arrival time with the centre/)).toBeVisible();
  await page.locator(".ready-addresses > summary").click();
  await page.locator(".equalpath").evaluate(el => el.classList.add("dark"));
  await page.locator("dialog").evaluate(el => el.scrollTop = 0);
  await page.screenshot({ path: `${evidenceDir}/preparation-dark-320.png` });
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
});

test("print action creates the standalone sheet and compact zoom keeps controls usable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.body.dataset.printRequested = "true";
    };
  });
  await start(page);
  await preparation(page);
  await page
    .getByRole("button", { name: "Print / Save PDF", exact: true })
    .first()
    .click();
  await expect(
    page
      .frameLocator('iframe[title="Printable preparation sheet"]')
      .locator("body"),
  ).toHaveAttribute("data-print-requested", "true");
  await expect(
    page
      .frameLocator('iframe[title="Printable preparation sheet"]')
      .getByText(/does not give permission to pick up/)
      .first(),
  ).toBeAttached();
  await page.setViewportSize({ width: 720, height: 500 });
  await page.locator("dialog").evaluate((el) => (el.scrollTop = 0));
  await expect(
    page.getByRole("button", { name: "Close dialog", exact: true }),
  ).toBeInViewport();
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({
    path: `${evidenceDir}/preparation-200-percent-equivalent.png`,
  });
  await close(page);
  await page.setViewportSize({ width: 320, height: 700 });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  for (const button of await nav.getByRole("button").all()) {
    const b = await button.boundingBox();
    expect(b.x + b.width).toBeLessThanOrEqual(321);
  }
  await page.screenshot({ path: `${evidenceDir}/navigation-320.png` });
  await page.getByRole("button", { name: /^Saved(?: \d+)?$/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Saved for later", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.locator("dialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: `${evidenceDir}/keyboard-saved.png` });
});
