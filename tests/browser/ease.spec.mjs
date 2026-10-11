import { chooseAge, openSearch, openResults, returningVisitor, setTime, setTimes, submitSearch } from "./ui-helpers.mjs";
import { test, expect } from '@playwright/test';
import { createAPI } from '../../server/api.mjs';
import { fixtureCatalog, demoPickup } from '../../server/fixtures.mjs';
import { mkdirSync } from 'node:fs';
const out = process.env.QA_EVIDENCE_DIR || '.build/ease';
mkdirSync(out, { recursive: true });
// EqualPath is short-term care only (2 Oct 2026); search runs from the map dock.
async function setup(page, path = '/#discover') {
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  const api = createAPI({store:{catalog:async()=>fixtureCatalog}, drivingRoutes:async(_, rows)=>rows.map(p=>({...p,driving:{state:'unavailable'}}))});
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    await route.fulfill({json:{ok:true,...await api(body)}});
  });
  await returningVisitor(page);
  await page.addInitScript(p => {
    localStorage.setItem('equalpath:map:v1:live', JSON.stringify({version:1,zoom:13,center:p,pickup:p}));
  }, {...demoPickup,id:null,label:'KL Sentral'});
  await page.goto(path);
  await openSearch(page);
  return {errors,calls};
}
const find = page => page.locator('.map-search-dock .search-actions button[type="submit"]');

for (const width of [320,390,1440]) test(`${width}px: a new visitor can search with only age and times and recover from a failed search`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const {errors,calls}=await setup(page);
  await expect(page.locator('.map-search-dock [data-field="date"] strong')).not.toHaveText('');
  await expect(find(page)).toHaveText(/Find childcare/);
  await expect(find(page)).toBeInViewport();
  await page.screenshot({path:`${out}/simple-search-${width}.png`});
  let fail=true;
  await page.route('**/api', async route => {
    if(fail && route.request().postDataJSON().action==='search') {
      fail=false; await route.fulfill({status:503,json:{ok:false,code:'SOURCE_UNAVAILABLE'}});
    } else await route.fallback();
  });
  await chooseAge(page); await setTimes(page,'13:00','17:00'); await submitSearch(page);
  await expect(page.locator('.map-search-dock [role="alert"]')).toContainText('We couldn’t load centres');
  await expect(page.locator('#pickup-search')).toHaveValue('KL Sentral');
  await page.getByRole('button',{name:'Retry search',exact:true}).click();
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  const request=calls.filter(c=>c.action==='search').at(-1).request;
  expect(request).toMatchObject({careType:'short_term',age:'4',transport:'',deadline:'13:00',end:'17:00'});
  expect(request.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${out}/simple-results-${width}.png`});
  expect(errors).toEqual([]);
});

test('phone: time errors keep the action visible and point to the right time',async({page})=>{
  await page.setViewportSize({width:390,height:844}); const {calls}=await setup(page);
  await chooseAge(page); await submitSearch(page);
  await expect(page.locator('#deadline-error')).toContainText('Choose a start time');
  await expect(find(page)).toBeInViewport();
  await setTimes(page,'17:00','16:00'); await submitSearch(page);
  await expect(page.locator('#care-end-error')).toContainText('end time after the start time');
  await page.screenshot({path:`${out}/out-of-order-times.png`});
  await setTime(page,'care-end','18:00');
  await expect(page.locator('#care-end-error')).toHaveCount(0);
  await expect(page.locator('.map-search-dock #deadline strong')).toHaveText('17:00');
  await expect(find(page)).toBeInViewport();
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
});

for (const width of [390, 1440]) test(`${width}px: short care is the only search, even from an old regular-care link`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const {calls,errors}=await setup(page, '/?care=regular#discover');
  await expect(page.getByRole('radio',{name:'Regular',exact:true})).toHaveCount(0);
  for (const field of ['date','age']) await expect(page.locator(`.map-search-dock [data-field="${field}"]`)).toBeVisible();
  await expect(page.locator('.map-search-dock #deadline')).toBeVisible();
  await expect(page.locator('.map-search-dock #care-end')).toBeVisible();
  await page.screenshot({path:`${out}/default-short-search-${width}.png`});
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
  await chooseAge(page); await setTimes(page,'13:00','17:00'); await submitSearch(page);
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  const request=calls.filter(c=>c.action==='search').at(-1).request;
  expect(request.careType).toBe('short_term'); expect(request.radius).toBe(5);
  expect(request.age).toBe('4'); expect(request.transport).toBe('');
  expect(errors).toEqual([]);
});

test('age is required and never hidden behind optional choices', async ({page}) => {
  const {calls}=await setup(page);
  await setTimes(page,'13:00','17:00'); await submitSearch(page);
  await expect(page.locator('.map-search-dock [data-field="age"]')).toHaveClass(/invalid/);
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
  await chooseAge(page,'2'); await submitSearch(page);
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  expect(calls.filter(c=>c.action==='search').at(-1).request.age).toBe('2');
});
