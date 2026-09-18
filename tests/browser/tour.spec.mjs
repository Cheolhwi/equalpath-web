import { chooseAge, openSearch, openResults } from "./ui-helpers.mjs";
import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const evidence = process.env.QA_EVIDENCE_DIR || ".build/tour-qa";
mkdirSync(evidence,{recursive:true});
async function mock(page, calls=[]) {
  const api=createAPI({store:{catalog:async()=>fixtureCatalog}});
  await page.route("**/api",async(route)=>{const b=route.request().postDataJSON();calls.push(b);await route.fulfill({json:{ok:true,...await api(b)}});});
}
const tour=(page)=>page.locator(".tour-dialog");
const next=async(page)=>{await tour(page).getByRole("button",{name:"Next",exact:true}).click();};
async function start(page) {
  if (!(await tour(page).isVisible())) await page.getByRole("button",{name:"Quick tour",exact:true}).click();
  await expect(tour(page)).toBeVisible();
  await tour(page).getByRole("button",{name:"Show me around",exact:true}).click();
  await expect(page.locator("#pickup-search")).toHaveValue("KL Sentral · tutorial");
}
test("first entry opens the map without a tutorial; optional Quick tour can be skipped and replayed",async({page})=>{
  await mock(page);await page.goto("/#discover");
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await openSearch(page);
  await expect(page.getByRole("radio",{name:"Short time",exact:true})).toBeChecked();
  await expect(tour(page)).toHaveCount(0);
  await page.getByRole("button",{name:"Quick tour",exact:true}).click();
  await expect(tour(page)).toBeVisible();
  await expect(tour(page).getByRole("button",{name:"Skip",exact:true})).toBeVisible();
  await page.screenshot({path:`${evidence}/tour-welcome.png`});
  await tour(page).getByRole("button",{name:"Skip",exact:true}).click();
  await expect(tour(page)).toHaveCount(0);await expect(page.locator("#pickup-search")).toHaveValue("");
  await page.reload();await page.getByRole("button",{name:"Quick tour",exact:true}).click();
  await expect(tour(page)).toBeVisible();await page.keyboard.press("Escape");
  await expect(tour(page)).toHaveCount(0);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("equalpath:tour:v1")))).toEqual({version:1,status:"skipped"});
});
test("guided sample uses map controls, cards, checks, comparison and contact, then restores existing input",async({page})=>{
  const calls=[];await mock(page,calls);
  const memory={version:1,center:{lat:3.15,lng:101.7},zoom:12,pickup:{id:null,label:"My pickup point",lat:3.15,lng:101.7}};
  await page.addInitScript((m)=>{localStorage.setItem("equalpath:map:v1:live",JSON.stringify(m));navigator.geolocation.getCurrentPosition=()=>{throw Error("Tour must not request location");};},memory);
  await page.goto("/#discover");await start(page);
  await expect(tour(page).locator(".tour-spotlight")).toBeVisible();
  await next(page);await expect(page.locator("#deadline")).toContainText("13:00");await expect(page.locator("#care-end")).toContainText("18:00");
  await next(page);await expect(page.locator(".map-centre-card:not(.leaving)")).not.toHaveCount(0);
  await expect(page.locator(".discovery-panel")).not.toBeVisible();
  await expect(tour(page).getByRole("button",{name:"Next",exact:true})).toBeEnabled();
  expect(calls.filter(b=>b.action==="search")).toEqual([expect.objectContaining({mode:"demo",request:expect.objectContaining({end:"18:00"})})]);
  await next(page);await expect(page.locator(".map-card-actions").first()).toBeVisible();
  await expect(tour(page)).toContainText("Tap Save to keep a centre in Saved");
  await next(page);await expect(page.locator(".tour-behind .condition-list")).toBeVisible();
  await page.screenshot({path:`${evidence}/tour-checks.png`});
  await next(page);await expect(page.locator(".tour-behind .comparison-scroll")).toContainText("Garden Learning House");
  await expect(page.locator(".tour-behind .comparison-scroll")).toContainText("Riverside Care");
  await next(page);await expect(page.locator(".tour-behind .question-list")).toBeVisible();
  await page.screenshot({path:`${evidence}/tour-questions.png`});
  await tour(page).getByRole("button",{name:"Back to my map",exact:true}).click();
  await expect(tour(page)).toHaveCount(0);await expect(page.locator(".tour-behind")).toHaveCount(0);
  await expect(page.locator("#pickup-search")).toHaveValue("My pickup point");await openSearch(page);await expect(page.locator("#deadline")).toHaveValue("");await expect(page.getByRole("radio",{name:"Short time"})).toBeChecked();
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("equalpath:map:v1:live")))).toEqual(memory);
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem("equalpath:tour:v1")))).toEqual({version:1,status:"completed"});
  await page.reload();await openSearch(page);await expect(page.locator(".nearby-card").first()).toBeVisible();
  await expect(tour(page)).toHaveCount(0);
});
for (const [width,height] of [[320,568],[390,844]]) test(`${width}: mobile walkthrough highlights the current map control and stays on screen`,async({page})=>{
  await page.setViewportSize({width,height});await page.emulateMedia({reducedMotion:"no-preference"});
  await mock(page);await page.goto("/#discover");await start(page);
  expect(await tour(page).evaluate(el=>getComputedStyle(el,"::backdrop").backdropFilter)).toBe("none");
  for(let step=1;step<=7;step++) {
    await expect(tour(page)).toHaveAttribute("data-step",String(step));
    await expect(tour(page).locator(".tour-spotlight")).toBeVisible();
    await expect(tour(page).getByRole("button",{name:step===7?"Back to my map":"Next",exact:true})).toBeEnabled();
    await expect.poll(async()=>{const b=await tour(page).locator(".tour-card").boundingBox();return b.y+b.height;}).toBeLessThanOrEqual(height+1);
    if (step===2) await expect.poll(async()=>{
      const b=await tour(page).locator(".tour-card").boundingBox(), r=await page.locator(".dock-options").boundingBox();
      return b.y>=r.y+r.height+8 || b.y+b.height<=r.y-8;
    }).toBe(true);
    if (step===3 || step===4) {
      await expect(page.locator(".mobile-search-summary")).toBeVisible();
      await expect(page.locator(".dock-form")).not.toBeVisible();
      const target=step===3?".mobile-search-summary":".map-card-actions";
      await expect.poll(async()=>{
        const r=await page.locator(target).first().boundingBox(), s=await tour(page).locator(".tour-spotlight").boundingBox();
        return Math.abs(s.y-(r.y-5))+Math.abs(s.height-(r.height+10));
      }).toBeLessThan(3);
    }
    await tour(page).evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished.catch(()=>{}))));
    const box=await tour(page).locator(".tour-card").boundingBox();
    expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);expect(box.y+box.height).toBeLessThanOrEqual(height+1);
    await page.screenshot({path:`${evidence}/tour-mobile-${width}-${step}.png`});
    if(step===6) {
      await expect(page.locator('.tour-behind .comparison-scroll thead th[data-provider-id]:visible')).toHaveCount(2);
      await page.screenshot({path:`${evidence}/tour-mobile-compare-pair.png`});
    }
    if(step<7)await next(page);
  }
  await page.emulateMedia({reducedMotion:"reduce"});
  await expect(tour(page)).toHaveAttribute("data-reduced","true");
  expect(await tour(page).locator(".tour-spotlight").evaluate(el=>parseFloat(getComputedStyle(el).transitionDuration))).toBeLessThanOrEqual(.001);
  await tour(page).getByRole("button",{name:"Back to my map",exact:true}).click();
  expect(await page.evaluate(()=>localStorage.getItem("equalpath:interests:v1:live"))).toBeNull();
  await page.setViewportSize({width:320,height:568});
  await page.getByRole("button",{name:"Quick tour",exact:true}).click();
  await expect(tour(page).getByRole("button",{name:"Skip",exact:true})).toBeInViewport();
  await page.keyboard.press("Escape");await expect(tour(page)).toHaveCount(0);
});
test("skip during an in-flight example restores results and cannot be overwritten by the late response",async({page})=>{
  await mock(page);await page.goto("/?mode=demo#discover");await openSearch(page);
  await chooseAge(page); await page.getByRole("button",{name:"Find childcare",exact:true}).click();
  await openResults(page);
  await expect(page.locator(".provider-row").first()).toBeVisible();
  const before=await page.locator(".provider-row").allTextContents();
  let release;const held=new Promise(r=>{release=r;});
  const api=createAPI();
  await page.route("**/api",async(route)=>{const b=route.request().postDataJSON();if(b.action==="search"){await held;await route.fulfill({json:{ok:true,...await api(b)}});}else await route.fallback();});
  await page.getByRole("button",{name:"Quick tour",exact:true}).click();await start(page);await next(page);await next(page);
  await expect(tour(page)).toContainText("Running the example");
  await tour(page).getByRole("button",{name:"Skip tour",exact:true}).click();release();
  await page.getByRole("button",{name:"Change search",exact:true}).click();
  await expect(page.getByRole("button",{name:"Update results",exact:true})).toBeEnabled();
  await expect(page.locator("#deadline")).toHaveValue("16:00");
  await expect.poll(()=>page.locator(".provider-row").allTextContents()).toEqual(before);
});
test("failed example can be retried; blocked storage and keyboard skip keep the page usable",async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=()=>{throw Error("blocked");};});
  await mock(page);let fail=true;
  await page.route("**/api",async(route)=>{if(fail && route.request().postDataJSON().action==="search")await route.fulfill({status:503,json:{ok:false,code:"SERVICE_UNAVAILABLE"}});else await route.fallback();});
  await page.goto("/#discover");await start(page);await next(page);await next(page);
  await expect(tour(page).getByRole("alert")).toContainText("couldn’t load");fail=false;
  await tour(page).getByRole("button",{name:"Retry example",exact:true}).click();
  await expect(tour(page).getByRole("button",{name:"Next",exact:true})).toBeEnabled();
  await page.keyboard.press("Escape");await expect(tour(page)).toHaveCount(0);
  await openSearch(page);await expect(page.locator("#deadline")).toHaveValue("");await expect(page.getByRole("radio",{name:"Short time"})).toBeChecked();
  await expect(page.locator("#pickup-search")).toHaveValue("");
  await expect(page.getByRole("button",{name:"Find childcare",exact:true})).toBeEnabled();
});
