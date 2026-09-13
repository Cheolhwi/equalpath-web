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
  await page
    .getByRole("button", { name: "Find care options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Select ${institution}`, exact: true }),
  ).toBeVisible();
};
const save = async (page) => {
  await page
    .getByRole("button", { name: `Save ${institution}`, exact: true })
    .click();
  await page
    .getByPlaceholder("For example: convenient location")
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
  await page.getByRole("button", { name: /SAVED/ }).click();
  await page.getByRole("button", { name: /^Centres / }).click();
};
const preparation = async (page) => {
  await details(page);
  await page
    .getByRole("button", { name: "Create preparation sheet", exact: true })
    .click();
};

test("questions belong to a selected centre and never appear in main navigation", async ({ page }) => {
  await page.goto("/?mode=demo#discover", { waitUntil: "domcontentloaded" });
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await expect(nav.getByRole("button")).toHaveCount(4);
  await expect(nav.getByRole("button", { name: /enquir|questions/i })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Find childcare", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Prepare questions", exact: true })).toHaveCount(0);
  await page.screenshot({ path: `${evidenceDir}/discovery-copy.png` });
  await page.getByRole("button", { name: "Find care options", exact: true }).click();
  await details(page);
  await page.getByRole("button", { name: "Prepare questions", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Questions for the centre", exact: true })).toBeVisible();
  await expect(page.locator(".request-context")).toContainText(institution);
  const question = page.locator(".question-list input").first();
  await question.uncheck();
  await page.screenshot({ path: `${evidenceDir}/centre-questions-copy.png` });
  await close(page);
  await details(page);
  await page.getByRole("button", { name: "Prepare questions", exact: true }).first().click();
  await expect(page.locator(".question-list input:not(:checked)")).toHaveCount(1);
  await close(page);
  await expect(nav.getByRole("button", { name: /enquir|questions/i })).toHaveCount(0);
});

test("save, reload, edit, reuse fresh request, inspect preparation, download, and remove", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await start(page);
  await save(page);
  await page
    .getByRole("button", { name: "Save request template", exact: true })
    .click();
  await page.getByText("What stays in this browser?", { exact: true }).click();
  await expect(page.getByText(/Clearing browser data can remove these items/)).toBeVisible();
  await page.getByLabel("Template name").fill("Weekday pickup");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.reload({ waitUntil: "domcontentloaded" });
  await saved(page);
  await expect(
    page.getByText("Convenient public pickup", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: `Edit ${institution}`, exact: true })
    .click();
  await page
    .getByPlaceholder("For example: convenient location")
    .fill("Near the usual centre");
  await page
    .getByRole("button", { name: "Save note", exact: true })
    .click();
  await expect(
    page.getByText("Near the usual centre", { exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/saved-desktop.png` });
  await page
    .getByRole("button", { name: "Saved searches 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(page.locator("#service-date")).toHaveValue("");
  await expect(page.locator("#age")).toHaveValue("");
  await expect(page.locator("#care-end")).toHaveValue("18:00");
  await page.locator("#service-date").fill("2026-09-18");
  await page
    .getByRole("button", { name: "Find care options", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: `Select ${institution}`, exact: true }),
  ).toBeVisible();
  await saved(page);
  await page
    .getByRole("button", { name: "Check for a new date", exact: true })
    .click();
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
    .getByRole("button", { name: "Create preparation sheet", exact: true })
    .click();
  await expect(
    page.getByText(/Travel time hasn’t been calculated/),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Usual centre", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Receiving centre", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Person collecting your child", exact: true }),
  ).toBeVisible();
  await page.locator("dialog").evaluate((el) => (el.scrollTop = 0));
  await page.screenshot({ path: `${evidenceDir}/preparation-desktop.png` });
  await page
    .getByRole("checkbox", {
      name: "A labelled bag, spare clothes and a water bottle.",
      exact: true,
    })
    .check();
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Download sheet", exact: true })
    .first()
    .click();
  const download = await downloadPromise;
  await download.saveAs(`${evidenceDir}/preparation-demo.html`);
  const html = readFileSync(`${evidenceDir}/preparation-demo.html`, "utf8");
  expect(html).toContain("☑ A labelled bag");
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
      name: "No saved centres yet",
      exact: true,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Saved searches 1", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Edit Weekday pickup", exact: true })
    .click();
  await page.getByLabel("Template care until", { exact: true }).fill("19:00");
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await expect(page.getByText(/care until 19:00/)).toBeVisible();
  await page
    .getByRole("button", { name: "Remove Weekday pickup", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "No saved searches yet",
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
    .getByPlaceholder("For example: convenient location")
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

test("unmatched saved place and conflicting times require correction, not silent replacement", async ({
  page,
}) => {
  await start(page);
  await page
    .getByRole("button", { name: "Save request template", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save template", exact: true })
    .click();
  await page.route("**/api", async (route) => {
    const b = route.request().postDataJSON();
    if (b.action === "places")
      await route.fulfill({ json: { ok: true, items: [] } });
    else await route.continue();
  });
  await saved(page);
  await page
    .getByRole("button", { name: "Saved searches 1", exact: true })
    .click();
  await page.getByRole("button", { name: "Use template", exact: true }).click();
  await expect(
    page.getByText(/This saved pickup place could not be matched/).first(),
  ).toBeVisible();
  await expect(page.locator("#pickup-search")).toHaveValue(
    "Demo usual centre · Kuala Lumpur",
  );
  await page.locator("#service-date").fill("2026-09-18");
  await page
    .getByRole("button", { name: "Update results", exact: true })
    .click();
  await expect(page.locator("#pickup-search")).toHaveAttribute(
    "aria-invalid",
    "true",
  );
  await page.unroute("**/api");
  await page.locator("#pickup-search").fill("Demo usual");
  await page
    .getByRole("button", { name: "Find pickup place", exact: true })
    .click();
  await page.getByRole("button", { name: /Demo usual centre/ }).click();
  await page.locator("#care-end").fill("15:00");
  await page
    .getByRole("button", { name: "Update results", exact: true })
    .click();
  await expect(
    page.getByText("Care must end after collection on the same day.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.screenshot({ path: `${evidenceDir}/template-correction.png` });
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
  await page.getByRole("button", { name: "Edit request", exact: true }).click();
  await page.locator("#care-end").fill("21:00");
  await page.locator("#transport").selectOption("self");
  await page
    .getByRole("button", { name: "Update results", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Edit request", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /PREPARE/ }).click();
  await expect(
    page.getByText(/This sheet still uses the earlier request/),
  ).toBeVisible();
  await expect(page.locator(".dialog-context")).toContainText("18:00");
  await page
    .getByRole("button", { name: "Recheck & regenerate", exact: true })
    .click();
  await expect(page.locator(".dialog-context")).toContainText("21:00");
  await expect(
    page.getByRole("checkbox", {
      name: "Check dinner and the evening collection routine.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByText("I’ll arrange transport", { exact: true }),
  ).toBeVisible();
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
    .getByRole("button", { name: "Create preparation sheet", exact: true })
    .click();
  await page.screenshot({ path: `${evidenceDir}/preparation-mobile.png` });
  const box = await page.locator("dialog").boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(391);
  const check = page.getByRole("checkbox", {
    name: "A labelled bag, spare clothes and a water bottle.",
    exact: true,
  });
  await check.check();
  await check.uncheck();
  await expect(check).not.toBeChecked();
  await check.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${evidenceDir}/packing-mobile.png` });
  await page.setViewportSize({ width: 320, height: 700 });
  expect(
    await page
      .locator("dialog")
      .evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);
  await page.screenshot({ path: `${evidenceDir}/preparation-320.png` });
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
      .getByText(/does not authorise collection/)
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
  await page.getByRole("button", { name: /SAVED/ }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Your saved centres & searches", exact: true })).toBeVisible();
  await page.keyboard.press("Tab");
  expect(await page.locator("dialog").evaluate(el => el.contains(document.activeElement))).toBe(true);
  await page.screenshot({ path: `${evidenceDir}/keyboard-saved.png` });
});
