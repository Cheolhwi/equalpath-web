import { chooseAge, openNearby, openResults, openSearch, returningVisitor, setDate, setTime, setTimes, submitSearch } from "./ui-helpers.mjs";
import {test,expect} from '@playwright/test';
import {createAPI} from '../../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../../server/fixtures.mjs';
import {mkdirSync} from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR||'.build/care-types';mkdirSync(out,{recursive:true});
// EqualPath is short-term care only (2 Oct 2026). Regular-only centres stay in
// the API's catalogue but must never reach the map, lists or comparison, even
// from an old ?care=regular link.
const items=fixtureCatalog.items.slice(0,4).map((p,i)=>({...structuredClone(p),mode:'live',id:`care-${i}`,name:`${i<2?'Short Stay':'Regular Care'} ${i+1}`,location:{lat:demoPickup.lat+i*.001,lng:demoPickup.lng}}));
async function setup(page,path='/#discover'){
  const calls=[],errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items,shortCareReady:true,shortCareIds:items.slice(0,2).map(p=>p.id)})},drivingRoutes:async(_,rows)=>rows.map(p=>({...p,driving:{state:'available',minutes:5,distanceKm:1.4}}))});
  await page.route('**/api',async route=>{const body=route.request().postDataJSON();calls.push(body);try{await route.fulfill({json:{ok:true,...await api(body)}});}catch(e){await route.fulfill({status:e.status??500,json:{ok:false,error:{code:e.code,fields:e.fields}}});}});
  await returningVisitor(page);
  await page.addInitScript(pickup=>{localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,zoom:13,center:pickup,pickup}));},demoPickup);
  await page.goto(path);await openSearch(page);
  await expect(page.locator('#pickup-search')).toHaveValue(demoPickup.label);
  return {calls,errors};
}
const close=page=>page.getByRole('button',{name:'Close dialog',exact:true}).click();
for(const mobile of [false,true])test(`${mobile?'mobile':'desktop'}: only short-care centres appear in nearby, results and comparison, even from an old regular link`,async({page})=>{
  if(mobile)await page.setViewportSize({width:390,height:844});
  const {calls,errors}=await setup(page,'/?care=regular#discover');
  await expect(page.getByRole('radio',{name:'Regular'})).toHaveCount(0);
  await openNearby(page);
  await expect(page.locator('.nearby-card')).toHaveCount(2);
  await expect(page.locator('.nearby-card').filter({hasText:'Regular Care'})).toHaveCount(0);
  await page.screenshot({path:`${out}/nearby-${mobile?'mobile':'desktop'}.png`});
  await setDate(page,'2026-09-21');await chooseAge(page,'4');await setTimes(page,'13:00','17:00');
  await submitSearch(page);await openResults(page);
  await expect(page.getByRole('button',{name:'View details for Short Stay 1',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:/View details for Regular Care/})).toHaveCount(0);
  expect(calls.filter(x=>x.action==='search').every(x=>x.request.careType==='short_term')).toBe(true);
  for(const name of ['Short Stay 1','Short Stay 2'])await page.getByRole('button',{name:`Compare ${name}`,exact:true}).click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Compare/}).click();
  await expect(page.locator('.comparison-scroll table')).toContainText('Short Stay 1');
  await expect(page.locator('.comparison-scroll table')).not.toContainText('Regular Care');
  await expect(page.getByRole('dialog')).not.toContainText('Invalid Date');
  await close(page);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('while a search is loading, the action waits and an edit stays pending once results arrive',async({page})=>{
  await setup(page);
  let release,started,first=true;const gate=new Promise(r=>release=r),seen=new Promise(r=>started=r);
  await page.route('**/api',async route=>{
    const b=route.request().postDataJSON();
    if(b.action==='search'&&first){first=false;started();await gate;}
    await route.fallback().catch(()=>{});
  });
  await setDate(page,'2026-09-21');await chooseAge(page);await setTimes(page,'13:00','17:00');
  await submitSearch(page);await seen;
  const action=page.locator('.map-search-dock .search-actions button[type="submit"]');
  await expect(action).toBeDisabled();
  await setTime(page,'care-end','18:00');
  release();
  await expect(action).toBeEnabled();
  await expect(action).toContainText('Update results');
  await expect(page.locator('.map-search-dock #care-end')).toHaveAttribute('data-pending','true');
  await openResults(page);
  await expect(page.locator('.compact-request')).toContainText('13:00–17:00');
  await expect(page.getByRole('button',{name:'View details for Short Stay 1',exact:true})).toBeVisible();
});
