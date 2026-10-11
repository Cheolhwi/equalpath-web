import { chooseAge, hideOptionsPanel, includeConflicts, openNearby, openResults, openSearch, setDate, setRadius, setTime, setTransport, submitSearch } from "./ui-helpers.mjs";
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
  const calls=[];await setup(page,calls);await page.goto("/#discover");await openNearby(page);await expect(page.locator(".nearby-card").first()).toBeVisible();
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
async function search(page,regular=false,{conflicts=false}={}){
  await page.addInitScript(()=>localStorage.setItem("equalpath:map:v1:live",JSON.stringify({version:1,center:{lat:3.139,lng:101.6869},zoom:13,pickup:{id:"demo-pickup",label:"KL Sentral",lat:3.139,lng:101.6869}})));
  await page.goto(regular?"/?care=regular#discover":"/?care=short_term#discover");await openSearch(page);
  if(!regular){await setDate(page, "2026-09-22");await setTime(page, 'deadline', "16:00");await setTime(page, 'care-end', "18:00");}
  await chooseAge(page, "4");await setTransport(page, "institution");await chooseAge(page); if(conflicts)await includeConflicts(page); await submitSearch(page);await openResults(page);
  await expect(page.locator(".provider-row").first()).toBeVisible();
}
// Short-term care only (2 Oct 2026): 5 km by default, 10 km from More filters.
test("search offers only 5 or 10 km and the map and count exclude distant or unlocated centres",async({page})=>{
  const base=fixtureCatalog.items[0];
  const at=(id,km)=>({...base,id,name:id,location:{lat:3.139+km/6371*180/Math.PI,lng:101.6869}});
  const responses=[];
  page.on("response",async r=>{if(r.url().endsWith("/api")&&r.request().postDataJSON()?.action==="search")responses.push(await r.json());});
  const calls=[];await setup(page,calls,true,false,[at("Inside radius",9.99),at("Outside radius",10.01)]);await search(page,false,{conflicts:true});
  expect(calls.find(c=>c.action==="search").request.radius).toBe(5);
  await expect(page.locator(".results-toolbar > div > span")).toHaveText("centres within 5 km");
  await expect.poll(()=>responses.length).toBe(1);
  const near=responses[0];
  expect(near.items.every(p=>p.distanceKm<=5)).toBe(true);
  await expect(page.locator(".results-toolbar strong")).toHaveText(String(near.total));
  await expect(page.locator(".provider-row")).toHaveCount(near.items.length);
  await expect(page.locator(".provider-row").filter({hasText:"Inside radius"})).toHaveCount(0);
  await expect(page.locator(".provider-row").filter({hasText:"Cloud Care"})).toHaveCount(0);
  await page.screenshot({path:dir+"/radius-desktop.png"});
  await setRadius(page,10);await submitSearch(page);await openResults(page);
  await expect(page.locator(".results-toolbar > div > span")).toHaveText("centres within 10 km");
  await expect.poll(()=>responses.length).toBe(2);
  const far=responses[1];
  expect(calls.filter(c=>c.action==="search").at(-1).request.radius).toBe(10);
  expect(far.total).toBe(near.total+1);
  expect(far.items.every(p=>p.distanceKm<=10)).toBe(true);
  expect(far.items.some(p=>p.id==="Outside radius")).toBe(false);
  await expect(page.locator(".results-toolbar strong")).toHaveText(String(far.total));
  await page.setViewportSize({width:390,height:844});await page.locator(".results-toolbar").scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/radius-mobile.png"});
});
test("result cards show drive time and fee basis, while conflicts stay below other results on desktop and mobile",async({page})=>{
  const calls=[];await setup(page,calls);await search(page,false,{conflicts:true});
  const row=page.locator(".provider-row").first();await expect(row).toContainText("About 8 min by car");await expect(row).toContainText("estimated total");
  await expect(row.locator(".row-facts > span")).toHaveText(["Age","Drive","Fee"]);
  await expect(row).not.toContainText("5.5 km by road");
  await expect(row.locator(".suggestion-tag")).toHaveText("Suggested");
  await expect(row.locator(".state-pill")).toBeVisible();
  await expect(row).not.toContainText("Care ends at");
  await expect(row).not.toContainText("straight-line");
  await expect(row).not.toContainText("without live traffic");
  await expect(row.locator(".row-note")).toHaveCount(0);
  const priorities=await page.locator(".provider-row").evaluateAll(rows=>rows.map(r=>r.classList.contains("lower-priority")));
  expect(priorities.indexOf(true)).toBeGreaterThan(0);expect(priorities.slice(priorities.indexOf(true)).every(Boolean)).toBe(true);
  await expect(page.locator(".provider-pin.suggested")).toHaveCount(3);
  const mapIds=await page.locator(".provider-pin.suggested").evaluateAll(pins=>pins.map(p=>p.dataset.providerId).sort());
  const listIds=await page.locator(".provider-row.suggested").evaluateAll(rows=>rows.map(p=>p.dataset.providerId).sort());
  expect(mapIds).toEqual(listIds);await expect(page.locator(".provider-row.suggested.lower-priority")).toHaveCount(0);
  await page.getByRole("button",{name:"Close search panel",exact:true}).click();
  const other=page.locator(".provider-pin:not(.suggested)").first();await other.click();await expect(other).toHaveAttribute("aria-pressed","true");await expect(page.locator(".provider-pin.suggested")).toHaveCount(3);
  await openResults(page);
  await page.locator(".discovery-panel").evaluate(el=>el.scrollTop=el.querySelector(".provider-row").offsetTop-el.offsetTop-24);
  await page.screenshot({path:dir+"/results-desktop.png"});
  await page.setViewportSize({width:390,height:844});await row.scrollIntoViewIfNeeded();
  await page.screenshot({path:dir+"/results-mobile.png"});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.getByRole('button',{name:'Close search panel'}).click();
  await hideOptionsPanel(page);
  // Phones hide the map's fit button (6 Oct 2026); the map already frames the suggestions.
  const fit=page.getByRole("button",{name:"Show all results on the map",exact:true});
  if(await fit.isVisible())await fit.click();
  await expect.poll(async()=>page.locator(".provider-pin.suggested").evaluateAll(pins=>pins.every(pin=>{const r=pin.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=105&&r.bottom<innerHeight-65;}))).toBe(true);
  await page.screenshot({path:dir+"/suggestions-mobile.png"});
  await openResults(page);
  await expect(page.locator(".provider-row").filter({hasText:"Demo · Cloud Care"})).toHaveCount(0);
});
test("route outage keeps results and published prices, without fake drive estimates",async({page})=>{
  const calls=[];await setup(page,calls,false);await search(page);
  await expect(page.locator(".provider-row").first()).toContainText("Drive time not available");
  await expect(page.locator(".provider-row").first().locator(".row-facts > span")).toHaveText(["Age","Drive","Fee"]);
  await expect(page.locator(".provider-row").first()).not.toContainText("km by road");
  await expect(page.locator(".provider-row").first()).not.toContainText("0 min");
});
test("mobile map previews leave room for the map and open the selected centre", async ({page}) => {
  const provider = {
    ...fixtureCatalog.items[0], id: "demo-compact", name: "Demo · Little Garden Childcare Taman Seri Sentosa Learning House",
    feeRule: null, fees: [{ min: 40, max: 60, currency: "MYR", basis: "hour", verification: "provider_published" }],
  };
  const calls = []; await setup(page, calls, true, false, [provider]); await search(page);
  const pin = page.locator(`.provider-pin[data-provider-id="${provider.id}"]`);
  await pin.click();
  const preview = page.locator(`.map-centre-card[data-provider-id="${provider.id}"]:not(.leaving)`), compact = preview.getByRole("button", {name:`View details for ${provider.name}`});
  await expect(preview).toContainText(provider.name);
  await page.screenshot({path:dir+"/preview-desktop.png"});
  await page.setViewportSize({width:393,height:852});
  const searches = calls.filter(c=>["nearby","search"].includes(c.action)).length;
  for (const width of [393, 320]) {
    await page.setViewportSize({width,height:740});
    // On phones the suggestions sheet replaces the preview until it is folded away.
    await hideOptionsPanel(page);
    if (!await compact.isVisible()) await pin.click();
    await expect(compact).toBeVisible();
    await expect(compact).toHaveAccessibleName(`View details for ${provider.name}`);
    await expect(preview).toContainText("About 8 min by car");
    await expect(preview).toContainText("Fee: MYR 40–60 / hour");
    await expect(preview.locator(".map-card-actions button")).toHaveCount(3);
    // Resize swaps the desktop card for its mobile layout; measure the rendered
    // replacement rather than a node that has just been hidden or removed.
    await expect.poll(async () => {
      const box = await preview.boundingBox(), map = await page.locator(".map-wrap").boundingBox(), footer = await page.locator(".map-bottom").boundingBox();
      return !!(box && map && footer && box.height < 200 && box.height / map.height < .25 && box.x >= 0 && box.x + box.width <= width && box.y + box.height < footer.y);
    }).toBe(true);
    await page.screenshot({path:`${dir}/preview-mobile-${width}.png`});
  }
  expect(calls.filter(c=>["nearby","search"].includes(c.action))).toHaveLength(searches);
  await compact.click();
  const dialog = page.getByRole("dialog"); await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(provider.name);
  await dialog.getByRole("button", {name:"Close dialog"}).click();
  await openResults(page);
  await page.locator(`.provider-row[data-provider-id="${provider.id}"]`).getByRole("button", {name:`Compare ${provider.name}`,exact:true}).click();
  await page.getByRole('button',{name:'Close search panel'}).click();
  await expect.poll(async () => {
    const box = await preview.boundingBox(), tray = await page.locator(".compare-tray").boundingBox();
    return !!(box && tray && box.y + box.height < tray.y);
  }).toBe(true);
  await page.screenshot({path:dir+"/preview-mobile-compare.png"});
});
test("co-located suggested centres stay distinct and individually selectable on the mobile map",async({page})=>{
  await page.setViewportSize({width:390,height:844});await setup(page,[],true,true);await search(page);
  await page.getByRole('button',{name:'Close search panel'}).click();
  const pins=page.locator(".provider-pin.suggested");await expect(pins).toHaveCount(3);
  await expect.poll(async()=>pins.evaluateAll(xs=>xs.every((x,i)=>xs.slice(i+1).every(y=>{const a=x.getBoundingClientRect(),b=y.getBoundingClientRect();return a.right<b.left||b.right<a.left||a.bottom<b.top||b.bottom<a.top;})))).toBe(true);
  for(let i=0;i<3;i++){await pins.nth(i).click();await expect(pins.nth(i)).toHaveAttribute("aria-pressed","true");}
  await page.screenshot({path:dir+"/colocated-mobile.png"});
});
