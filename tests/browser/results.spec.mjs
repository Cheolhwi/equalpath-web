import { test, expect } from "@playwright/test";
import { createAPI } from "../../server/api.mjs";
import { fixtureCatalog } from "../../server/fixtures.mjs";
import { mkdirSync } from "node:fs";
const dir=process.env.QA_EVIDENCE_DIR || ".build/results-qa";mkdirSync(dir,{recursive:true});
async function setup(page, calls, routing=true, coLocated=false, extraItems=[]){
  await page.addInitScript(()=>localStorage.setItem("equalpath:tour:v1",'{"version":1,"status":"skipped"}'));
  const catalog=coLocated?{...fixtureCatalog,items:fixtureCatalog.items.map(p=>({...p,location:p.location?{lat:3.139,lng:101.6869}:null}))}:fixtureCatalog;
  const api=createAPI({store:{catalog:async()=>({...catalog,items:[...catalog.items,...extraItems]})},drivingRoutes:async(_,items)=>items.map(p=>({...p,driving:routing&&p.location?{state:"available",minutes:8,distanceKm:5.5,traffic:false}:{state:"unavailable"}}))});
  await page.route("**/api",async route=>{const b=route.request().postDataJSON();calls.push(b);await route.fulfill({json:{ok:true,...await api(b)}});});
}
test("zooming and repeated dragging never query; reopening loads the saved neighbourhood once",async({page})=>{
  const calls=[];await setup(page,calls);await page.goto("/#discover");await expect(page.locator(".nearby-card").first()).toBeVisible();
  const before=calls.filter(c=>c.action==="nearby").length;
  for(let i=0;i<4;i++)await page.getByRole("button",{name:"Zoom out",exact:true}).click();
  await expect.poll(async()=>Number(await page.locator(".map-region").getAttribute("data-map-zoom"))).toBeLessThan(12);
  const box=await page.locator(".map-canvas").boundingBox();
  for(let i=0;i<3;i++){await page.mouse.move(box.x+box.width*.6,box.y+box.height*.55);await page.mouse.down();await page.mouse.move(box.x+box.width*.6-45,box.y+box.height*.55+15,{steps:10});await page.mouse.up();}
  await page.waitForTimeout(750);
  expect(calls.filter(c=>c.action==="nearby").length).toBe(before);
  await expect(page.getByText("Zoom in to search this area",{exact:true})).toHaveCount(0);
  await expect(page.getByRole("button",{name:"Search this area",exact:true})).toHaveCount(0);
  await page.screenshot({path:dir+"/zoomed-out.png"});
  // Reopening loads one bounded neighbourhood, independent of map zoom.
  await page.reload();
  await expect.poll(()=>calls.filter(c=>c.action==="nearby").length).toBe(before+1);
  for(let i=0;i<5;i++)await page.getByRole("button",{name:"Zoom in",exact:true}).click();
  await page.waitForTimeout(750);
  await expect(page.getByRole("button",{name:"Search this area",exact:true})).toHaveCount(0);
  expect(calls.filter(c=>c.action==="nearby").length).toBe(before+1);
});
async function search(page){
  await page.addInitScript(()=>localStorage.setItem("equalpath:map:v1:live",JSON.stringify({version:1,center:{lat:3.139,lng:101.6869},zoom:13,pickup:{id:"demo-pickup",label:"KL Sentral",lat:3.139,lng:101.6869}})));
  await page.goto("/#discover");await page.locator("#service-date").fill("2026-09-22");await page.locator("#deadline").fill("16:00");await page.locator("#care-end").fill("18:00");await page.locator("#age").selectOption("4");await page.locator("#transport").selectOption("institution");await page.getByRole("button",{name:"Find care options",exact:true}).click();
  await expect(page.locator(".provider-row").first()).toBeVisible();
}
test("search offers only 5 or 10 km and the map and count exclude distant or unlocated centres",async({page})=>{
  const base=fixtureCatalog.items[0];
  const at=(id,km)=>({...base,id,name:id,location:{lat:3.139+km/6371*180/Math.PI,lng:101.6869}});
  const calls=[];await setup(page,calls,true,false,[at("Inside radius",9.99),at("Outside radius",10.01)]);await search(page);
  expect(calls.find(c=>c.action==="search").request.radius).toBe(10);
  await expect(page.locator(".results-toolbar strong")).toHaveText("10");
  await expect(page.locator(".results-toolbar > div > span")).toHaveText("centres within 10 km");
  await expect(page.locator(".provider-row")).toHaveCount(10);
  await expect(page.locator(".provider-pin")).toHaveCount(10);
  await expect(page.locator(".provider-row").filter({hasText:"Outside radius"})).toHaveCount(0);
  await expect(page.locator(".provider-row").filter({hasText:"Cloud Care"})).toHaveCount(0);
  await page.screenshot({path:dir+"/radius-desktop.png"});
  await page.setViewportSize({width:390,height:844});await page.locator(".results-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/radius-mobile.png"});
  await page.getByRole("button",{name:/Edit request/}).click();
  await page.locator(".search-refinements summary").click();
  await expect(page.locator("#radius option")).toHaveText(["Within 5 km","Within 10 km"]);
  await page.locator("#radius").selectOption("5");
  await page.getByRole("button",{name:/Update results/}).click();
  await expect(page.locator(".results-toolbar strong")).toHaveText("9");
  await expect(page.locator(".results-toolbar > div > span")).toHaveText("centres within 5 km");
  await expect(page.locator(".provider-row")).toHaveCount(9);
  await expect(page.locator(".provider-pin")).toHaveCount(9);
  await expect(page.locator(".provider-row").filter({hasText:"Inside radius"})).toHaveCount(0);
});
test("result cards show drive time and fee basis, while conflicts stay below other results on desktop and mobile",async({page})=>{
  const calls=[];await setup(page,calls);await search(page);
  const row=page.locator(".provider-row").first();await expect(row).toContainText("About 8 min by car");await expect(row).toContainText("estimated total");
  await expect(row.locator(".row-facts > span")).toHaveText(["Age","Drive from pickup","Fee"]);
  await expect(row.locator(".row-kicker > span").last()).toHaveText("5.5 km by road");
  await expect(row.locator(".suggestion-tag")).toHaveText("Suggested first");
  await expect(row.locator(".state-pill")).toBeVisible();
  await expect(row).not.toContainText("Care end time");
  await expect(row).not.toContainText("straight-line");
  await expect(row).not.toContainText("without live traffic");
  await expect(row.locator(".row-note")).toHaveCount(0);
  const priorities=await page.locator(".provider-row").evaluateAll(rows=>rows.map(r=>r.classList.contains("lower-priority")));
  expect(priorities.indexOf(true)).toBeGreaterThan(0);expect(priorities.slice(priorities.indexOf(true)).every(Boolean)).toBe(true);
  await expect(page.locator(".provider-pin.suggested")).toHaveCount(3);
  const mapIds=await page.locator(".provider-pin.suggested").evaluateAll(pins=>pins.map(p=>p.dataset.providerId).sort());
  const listIds=await page.locator(".provider-row.suggested").evaluateAll(rows=>rows.map(p=>p.dataset.providerId).sort());
  expect(mapIds).toEqual(listIds);await expect(page.locator(".provider-row.suggested.lower-priority")).toHaveCount(0);
  const other=page.locator(".provider-pin:not(.suggested)").first();await other.click();await expect(other).toHaveAttribute("aria-pressed","true");await expect(page.locator(".provider-pin.suggested")).toHaveCount(3);
  await page.locator(".discovery-panel").evaluate(el=>el.scrollTop=el.querySelector(".provider-row").offsetTop-el.offsetTop-24);
  await page.screenshot({path:dir+"/results-desktop.png"});
  await page.setViewportSize({width:390,height:844});await row.scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/results-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole("button",{name:"Map",exact:true}).click();
  await expect.poll(async()=>page.locator(".provider-pin.suggested").evaluateAll(pins=>pins.every(pin=>{const r=pin.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=105&&r.bottom<innerHeight-65;}))).toBe(true);
  await page.screenshot({path:dir+"/suggestions-mobile.png"});
  await page.getByRole("button",{name:"Search & results",exact:true}).click();
  await expect(page.locator(".provider-row").filter({hasText:"Demo · Cloud Care"})).toHaveCount(0);
});
test("route outage keeps results and published prices, without fake drive estimates",async({page})=>{
  const calls=[];await setup(page,calls,false);await search(page);
  await expect(page.locator(".provider-row").first()).toContainText("Driving time unavailable");
  await expect(page.locator(".provider-row").first().locator(".row-facts > span")).toHaveText(["Age","Drive from pickup","Fee"]);
  await expect(page.locator(".provider-row").first().locator(".row-kicker > span").last()).toHaveText("Distance unavailable");
  await expect(page.locator(".provider-row").first()).not.toContainText("0 min");
});
test("co-located suggested centres stay distinct and individually selectable on the mobile map",async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page,[],true,true);await search(page);
  await page.getByRole("button",{name:"Map",exact:true}).click();
  const pins=page.locator(".provider-pin.suggested");await expect(pins).toHaveCount(3);
  await expect.poll(async()=>pins.evaluateAll(xs=>xs.every((x,i)=>xs.slice(i+1).every(y=>{const a=x.getBoundingClientRect(),b=y.getBoundingClientRect();return a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top;})))).toBe(true);
  for(let i=0;i<3;i++){await pins.nth(i).click();await expect(pins.nth(i)).toHaveAttribute("aria-pressed","true");}
  await page.screenshot({path:dir+"/colocated-mobile.png"});
});
