import { test, expect } from "@playwright/test";
import { createAPI, errorResponse } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const evidence = process.env.QA_EVIDENCE_DIR || ".build/map-qa";
mkdirSync(evidence, { recursive: true });
test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("equalpath:tour:v1", JSON.stringify({ version: 1, status: "skipped" })));
});
const place = { id: "osm:N:1", label: "KL Sentral", address: "Jalan Stesen Sentral, Kuala Lumpur", region: "Kuala Lumpur", lat: 3.1341, lng: 101.6865 };
async function mockAPI(page, calls) {
  const api = createAPI({ store: { catalog: async () => fixtureCatalog }, placeSearch: async () => ({ items: [place] }), drivingRoutes: async (_,items) => items.map(p=>({...p,driving:{state:"unavailable"}})) });
  await page.route("**/api", async (route) => {
    const body = route.request().postDataJSON(); calls.push(body);
    try { await route.fulfill({ json: { ok: true, ...await api(body) } }); }
    catch (e) { const r = errorResponse(e); await route.fulfill({status:r.status,json:r.body}); }
  });
}
test("first visit shows nearby childcare without a request; partial place search is explicit and restores on reload", async ({ page }) => {
  const calls = []; await mockAPI(page,calls);
  await page.goto("/#discover");
  await expect(page.locator(".nearby-card").first()).toBeVisible();
  await expect(page.locator(".provider-pin").first()).toBeVisible();
  expect(calls.some((c)=>c.action === "search")).toBe(false);
  await expect(page.locator("#deadline")).toHaveValue("");
  await expect(page.locator(".map-region")).toHaveAttribute("data-map-lat",/^3\.139/);
  await page.locator("#pickup-search").fill("KL sentrl");
  expect(calls.some((c)=>c.action === "places")).toBe(false);
  await page.locator("#pickup-search").press("Enter");
  await page.getByRole("button",{name:/KL Sentral Jalan Stesen/}).click();
  await expect.poll(()=>calls.some((c)=>c.action==="nearby" && c.center.lat===place.lat)).toBe(true);
  await expect(page.locator("#pickup-search")).toHaveValue("KL Sentral");
  await page.reload();
  await expect(page.locator("#pickup-search")).toHaveValue("KL Sentral");
  await expect(page.locator("#deadline")).toHaveValue("");
  await expect(page.locator(".nearby-card").first()).toBeVisible();
  await expect(page.locator(".pickup-pin")).toBeVisible();
  await expect.poll(async()=>Number(await page.locator(".map-region").getAttribute("data-map-lat"))).toBeCloseTo(3.1341,4);
  await page.screenshot({path:`${evidence}/map-return.png`});
  // Replacing a selected label must keep the newly typed text.
  await page.locator("#pickup-search").fill("Bukit Bint");
  await expect(page.locator("#pickup-search")).toHaveValue("Bukit Bint");
  await page.locator("#pickup-search").press("Enter");
  await expect(page.locator(".place-results")).toContainText("KL Sentral");
});
test("drag map, confirm pickup, reload and keep the same point; cancellation leaves the pickup unchanged", async ({page})=>{
  const calls=[]; await mockAPI(page,calls); await page.goto("/#discover");
  await expect(page.locator(".provider-pin").first()).toBeVisible();
  await page.getByRole("button",{name:"Choose pickup here"}).click();
  const map=page.locator(".map-region"); const oldLng=Number(await map.getAttribute("data-map-lng"));
  const box=await page.locator(".map-canvas").boundingBox();
  await page.mouse.move(box.x+box.width*.55,box.y+box.height*.52);
  await page.mouse.down(); await page.mouse.move(box.x+box.width*.55-100,box.y+box.height*.52+35,{steps:18}); await page.mouse.up();
  await expect.poll(async()=>Math.abs(Number(await map.getAttribute("data-map-lng"))-oldLng)).toBeGreaterThan(.001);
  await page.screenshot({path:`${evidence}/map-drag-desktop.png`});
  await page.getByRole("button",{name:"Use this location",exact:true}).click();
  await expect(page.locator("#pickup-search")).toHaveValue(/^Map point/);
  const pickup=await page.locator("#pickup-search").inputValue();
  await page.reload(); await expect(page.locator("#pickup-search")).toHaveValue(pickup);
  await page.getByRole("button",{name:"Choose pickup here"}).click();
  await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  await page.getByRole("button",{name:"Cancel",exact:true}).click();
  await expect(page.locator("#pickup-search")).toHaveValue(pickup);
  await expect(page.locator(".map-center-pin")).toHaveCount(0);
});
test("mobile pickup confirmation is visible, map stays flat and blocked storage does not stop selection", async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.addInitScript(()=>{ Storage.prototype.setItem=()=>{throw Error("blocked");}; });
  const calls=[]; await mockAPI(page,calls); await page.goto("/#discover");
  await page.getByRole("button",{name:"Choose on map",exact:true}).click();
  await expect(page.locator(".map-center-pin")).toBeVisible();
  await expect(page.getByRole("button",{name:"Use this location",exact:true})).toBeInViewport();
  await expect(page.locator(".map-region")).toHaveAttribute("data-map-pitch","0");
  await page.screenshot({path:`${evidence}/map-drag-mobile.png`});
  await page.getByRole("button",{name:"Use this location",exact:true}).click();
  await expect(page.locator("#pickup-search")).toHaveValue(/^Map point/);
  await expect.poll(()=>calls.filter(c=>c.action==="nearby").length).toBeGreaterThan(0);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
test("dragging remembers the viewport but only an explicit area search refreshes nearby centres", async ({page})=>{
  const calls=[];await mockAPI(page,calls);await page.goto("/#discover");
  await expect(page.locator(".provider-pin").first()).toBeVisible();
  const before=calls.filter(c=>c.action==="nearby").length;
  const box=await page.locator(".map-canvas").boundingBox();
  await page.mouse.move(box.x+box.width*.7,box.y+box.height*.4);await page.mouse.down();
  await page.mouse.move(box.x+box.width*.7-180,box.y+box.height*.4+50,{steps:20});await page.mouse.up();
  await expect(page.getByRole("button",{name:"Search this area",exact:true})).toBeEnabled();
  await page.waitForTimeout(700);
  expect(calls.filter(c=>c.action==="nearby").length).toBe(before);
  await page.getByRole("button",{name:"Search this area",exact:true}).click();
  await expect.poll(()=>calls.filter(c=>c.action==="nearby").length).toBe(before+1);
  await expect(page.getByRole("button",{name:"Search this area",exact:true})).toBeDisabled();
  const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem("equalpath:map:v1:live")));
  expect(saved.pickup).toBeNull();expect(saved.center.lng).not.toBe(101.6869);
  await page.reload();await expect(page.locator(".provider-pin").first()).toBeVisible();
  await expect.poll(async()=>Number(await page.locator(".map-region").getAttribute("data-map-lng"))).toBeCloseTo(saved.center.lng,4);
  await expect(page.locator("#pickup-search")).toHaveValue("");
});
test("a nearby marker can lead to a dated condition check without pretending discovery was assessed",async({page})=>{
  const calls=[]; await mockAPI(page,calls); await page.goto("/#discover");
  await expect(page.locator(".provider-pin").first()).toBeVisible();
  await page.locator(".provider-pin").first().click();
  await expect(page.locator(".map-preview .state-pill")).toHaveCount(0);
  await page.getByRole("button",{name:"Check this centre",exact:true}).click();
  await page.locator("#pickup-search").fill("KL sentrl");await page.locator("#pickup-search").press("Enter");
  await page.getByRole("button",{name:/KL Sentral Jalan Stesen/}).click();
  // Re-select the centre after choosing a different search location.
  await expect(page.locator(".provider-pin").first()).toBeVisible();await page.locator(".provider-pin").first().click();
  await page.getByRole("button",{name:"Check this centre",exact:true}).click();
  await page.locator("#service-date").fill("2026-09-22"); await page.locator("#deadline").fill("13:00");await page.locator("#care-end").fill("17:00");
  await page.getByRole("button",{name:"Find care options",exact:true}).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(calls.filter(c=>c.action==="details").at(-1).request.end).toBe("17:00");
});
