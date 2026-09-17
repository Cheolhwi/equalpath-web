import { chooseAge, openSearch, openResults } from "./ui-helpers.mjs";
import { test, expect } from '@playwright/test';
import { createAPI } from '../../server/api.mjs';
import { fixtureCatalog, demoPickup } from '../../server/fixtures.mjs';
import { mkdirSync } from 'node:fs';
const out = process.env.QA_EVIDENCE_DIR || '.build/ease';
mkdirSync(out, { recursive: true });
async function setup(page, care = "regular") {
  const errors = [], calls = [];
  page.on('pageerror', e => errors.push(e.message));
  const api = createAPI({store:{catalog:async()=>fixtureCatalog}, drivingRoutes:async(_, rows)=>rows.map(p=>({...p,driving:{state:'unavailable'}}))});
  await page.route('**/api', async route => {
    const body = route.request().postDataJSON(); calls.push(body);
    await route.fulfill({json:{ok:true,...await api(body)}});
  });
  await page.addInitScript(p => {
    localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:map:v1:live', JSON.stringify({version:1,zoom:13,center:p,pickup:p}));
  }, {...demoPickup,id:null,label:'KL Sentral'});
  await page.goto(care ? '/?care=regular#discover' : '/#discover');
  await openSearch(page);
  return {errors,calls};
}
for (const width of [320,390,1440]) test(`${width}px: a new visitor can search without optional fields and recover from a failed search`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const {errors,calls}=await setup(page);
  await expect(page.getByRole('radio',{name:'Long term',exact:true})).toBeChecked();
  await expect(page.getByRole('group',{name:'Child’s age',exact:true})).toBeVisible();
  const find=page.getByRole('button',{name:'Find childcare',exact:true});
  await expect(find).toBeInViewport();
  expect((await find.boundingBox()).height).toBeGreaterThanOrEqual(48);
  await page.screenshot({path:`${out}/simple-search-${width}.png`});
  let fail=true;
  await page.route('**/api', async route => {
    if(fail && route.request().postDataJSON().action==='search') {
      fail=false; await route.fulfill({status:503,json:{ok:false,code:'SOURCE_UNAVAILABLE'}});
    } else await route.fallback();
  });
  await chooseAge(page); await find.click();
  await expect(page.getByRole('alert')).toContainText('We couldn’t load centres');
  await expect(page.locator('#pickup-search')).toHaveValue('KL Sentral');
  await page.getByRole('button',{name:'Retry search',exact:true}).click();
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  const request=calls.find(c=>c.action==='search').request;
  expect(request.age).toBe('4-6'); expect(request.transport).toBe(''); expect(request.date).toBe('');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`${out}/simple-results-${width}.png`});
  expect(errors).toEqual([]);
});
test('phone: short-stay errors keep the action visible and point to the correct time',async({page})=>{
  await page.setViewportSize({width:390,height:844}); await setup(page);
  await page.getByRole('radio',{name:'Short time',exact:true}).check();
  const find=page.getByRole('button',{name:'Find childcare',exact:true});
  await chooseAge(page); await find.click();
  await expect(page.locator('#deadline')).toBeFocused();
  await expect(page.locator('#deadline-error')).toBeVisible();
  await expect(find).toBeInViewport();
  await page.locator('#deadline').fill('17:00'); await page.locator('#care-end').fill('16:00');
  await chooseAge(page); await find.click(); await expect(page.locator('#care-end')).toBeFocused();
  await expect(page.locator('#care-end-error')).toContainText('later pickup time');
  await page.screenshot({path:`out-of-order-times.png`.replace(/^/,`${out}/`)});
  await page.locator('#care-end').fill('18:00');
  await expect(page.locator('#deadline')).toHaveValue('17:00');
  await expect(find).toBeInViewport();
});

for (const width of [390, 1440]) test(`${width}px: short care opens directly, with weekly care as a secondary search`, async ({page}) => {
  await page.setViewportSize({width,height:844});
  const {calls,errors}=await setup(page, "");
  await expect(page.getByRole('radio',{name:'Short time',exact:true})).toBeChecked();
  await expect(page.locator('.care-type-choice input').first()).toHaveValue('short_term');
  await expect(page.locator('#deadline')).toBeVisible();
  await expect(page.locator('#care-end')).toBeVisible();
  await expect(page.getByRole('group',{name:'Child’s age',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Find childcare',exact:true})).toBeInViewport();
  await page.screenshot({path:`${out}/default-short-search-${width}.png`});
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:'Saved',exact:true}).click();
  await page.getByRole('dialog').getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.locator('#age-error, #deadline-error, #care-end-error')).toHaveCount(0);
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
  await chooseAge(page);
  await page.locator('#deadline').fill('13:00');
  await page.locator('#care-end').fill('17:00');
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  const request=calls.filter(c=>c.action==='search').at(-1).request;
  expect(request.careType).toBe('short_term'); expect(request.radius).toBe(5);
  expect(request.age).toBe('4-6'); expect(request.transport).toBe('');
  await page.getByRole('button',{name:'Change search',exact:true}).click();
  await page.getByRole('radio',{name:'Long term',exact:true}).check();
  await expect(page.locator('#service-date, #deadline, #care-end')).toHaveCount(0);
  await expect(page.locator('.provider-row')).toHaveCount(0);
  expect(errors).toEqual([]);
});

for (const care of ["", "regular"]) test(`${care || "short care"}: age is required and never hidden with optional pickup help`, async ({page}) => {
  const {calls}=await setup(page, care);
  if (!care) { await page.locator('#deadline').fill('13:00'); await page.locator('#care-end').fill('17:00'); }
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect(page.locator('#age-error')).toContainText('Choose 1–3 years or 4–6 years');
  await expect(page.locator('#age')).toBeFocused();
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
  await chooseAge(page,'1-3');
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await openResults(page);
  await expect(page.locator('.provider-row').first()).toBeVisible();
  expect(calls.filter(c=>c.action==='search').at(-1).request.age).toBe('1-3');
});
