import { test, expect } from '@playwright/test';
import { mkdirSync } from 'node:fs';
import { createAPI } from '../../server/api.mjs';
import { chooseAge, openSearch, openResults } from './ui-helpers.mjs';
const out = process.env.QA_EVIDENCE_DIR || '.build/recommendations';
mkdirSync(out,{recursive:true});
const key = 'equalpath:interests:v1:demo';
async function start(page) {
  const api = createAPI(), calls = [], errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api',async route=>{
    const b = route.request().postDataJSON(); calls.push(b);
    try { await route.fulfill({json:{ok:true,...await api(b)}}); }
    catch(e) { await route.fulfill({status:e.status??422,json:{ok:false,code:e.code,fields:e.fields}}); }
  });
  await page.goto('/?mode=demo#discover');
  await openSearch(page); await chooseAge(page);
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect(page.locator('.map-quick-actions button').first()).toContainText(/^All/);
  return {calls,errors};
}
const openForYou = async page => {
  await page.getByRole('navigation', {name:'Main navigation'}).getByRole('button', {name:/Saved/}).click();
  await page.getByRole('dialog').getByRole('button', {name:'For you',exact:true}).click();
  await expect(page.getByRole('heading',{name:'You may also like'})).toBeVisible();
  await expect(page.locator('.recommendation-card')).toHaveCount(3);
};
test('comparison only records after viewing; suggestions explain history, save, dismiss and clear without losing saved items',async({page})=>{
  const {calls,errors}=await start(page);
  await openResults(page);
  const cards=page.locator('.provider-row');
  await cards.nth(0).getByRole('button',{name:/^Compare /}).click();
  await cards.nth(1).getByRole('button',{name:/^Compare /}).click();
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Compare/}).click();
  await expect(page.locator('.compare-view')).toBeVisible();
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').visits?.length,key)).toBe(2);
  await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  // Return to the map from the optional list.
  await page.getByRole('button',{name:'Close search panel'}).click();
  await openForYou(page);
  const seen=calls.filter(c=>c.action==='compare').at(-1).ids;
  expect(calls.filter(c=>c.action==='recommendations').at(-1).seedIds.sort()).toEqual([...seen].sort());
  expect(calls.filter(c=>c.action==='recommendations').at(-1)).not.toHaveProperty('history');
  await expect(page.locator('.recommendations')).toContainText(/You compared this centre before|Similar to a centre you viewed/);
  await page.locator('.recommendation-card').first().getByRole('button',{name:'Save',exact:true}).click();
  await expect.poll(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('equalpath:saved:v1:demo')).favourites.length)).toBe(1);
  await expect(page.locator('.recommendation-card')).toHaveCount(3);
  const hidden = await page.locator('.recommendation-card h4').first().textContent();
  await page.locator('.recommendation-card').first().getByRole('button',{name:/Not interested/}).click();
  await expect(page.locator('.recommendation-card h4').filter({hasText:hidden})).toHaveCount(0);
  await page.getByText('How suggestions work',{exact:true}).click();
  await page.getByRole('checkbox',{name:'Use viewing history for suggestions'}).uncheck();
  await page.getByRole('button',{name:'Clear viewing history'}).click();
  const h=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(h).toMatchObject({enabled:false,visits:[],hidden:[]});
  expect(await page.evaluate(()=>JSON.parse(localStorage.getItem('equalpath:saved:v1:demo')).favourites.length)).toBe(1);
  expect(errors).toEqual([]);
});
for(const width of [390,1440]) test(`${width}px recommendations have readable cards, visible actions and current detail navigation`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  const {errors}=await start(page);
  await openForYou(page);
  await page.screenshot({path:`${out}/for-you-${width}.png`,fullPage:true});
  const bounds=await page.locator('.recommendation-card').evaluateAll(es=>es.map(e=>({width:e.clientWidth,scroll:e.scrollWidth,x:e.getBoundingClientRect().x,right:e.getBoundingClientRect().right})));
  for(const b of bounds){expect(b.scroll).toBeLessThanOrEqual(b.width+1);expect(b.x).toBeGreaterThanOrEqual(0);expect(b.right).toBeLessThanOrEqual(width);}
  const title=await page.locator('.recommendation-card h4').first().textContent();
  await page.locator('.recommendation-card').first().getByRole('button',{name:'View centre'}).click();
  await expect(page.locator('.dialog-body')).toContainText(title);
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').visits?.[0]?.viewCount,key)).toBe(1);
  expect(errors).toEqual([]);
});
test('returning visitor must make a current search; old history survives reload and request details are absent',async({page})=>{
  await start(page);await openForYou(page);
  await page.locator('.recommendation-card').first().getByRole('button',{name:'View centre'}).click();
  await expect.poll(()=>page.evaluate(k=>JSON.parse(localStorage.getItem(k)||'{}').visits?.length,key)).toBe(1);
  await page.reload();
  await page.getByRole('navigation', {name:'Main navigation'}).getByRole('button', {name:/Saved/}).click();
  await page.getByRole('dialog').getByRole('button', {name:'For you',exact:true}).click();
  await expect(page.getByRole('heading',{name:'What care do you need this time?'})).toBeVisible();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).visits.length,key)).toBe(1);
  const value=await page.evaluate(k=>localStorage.getItem(k),key);
  for(const word of ['pickup','deadline','age','snapshot','address'])expect(value).not.toContain(`"${word}"`);
});
