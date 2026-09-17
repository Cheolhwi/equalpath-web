import { chooseAge, openResults, openSearch, revealPreferences } from "./ui-helpers.mjs";
import {test,expect} from '@playwright/test';
import {createAPI,errorResponse} from '../../server/api.mjs';
import {fixtureCatalog,demoPickup} from '../../server/fixtures.mjs';
import {mkdirSync} from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR||'.build/sort-availability';mkdirSync(out,{recursive:true});
const origin={...demoPickup,label:'Original pickup'},other={id:'other',label:'New pickup',lat:3.239,lng:101.6869};
const provider=(id,i,quoted=false,location=origin)=>({...structuredClone(fixtureCatalog.items[0]),id,name:`Test ${id}`,location:{lat:location.lat+i*.001,lng:location.lng},feeRule:null,fees:[{amount:quoted?30-i:500,basis:quoted?'hour':'month',currency:'MYR',kind:'care'}]});
async function setup(page,items){
  const calls=[];
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items})},placeSearch:async()=>({items:[other]}),drivingRoutes:async(_,rows)=>rows});
  await page.route('**/api',async route=>{const body=route.request().postDataJSON();calls.push(body);try{await route.fulfill({json:{ok:true,...await api(body)}});}catch(e){const r=errorResponse(e);await route.fulfill({status:r.status,json:r.body});}});
  await page.addInitScript(pickup=>{localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,center:pickup,pickup,zoom:13}));},origin);
  await page.goto('/?care=short_term#discover');await openSearch(page);await page.locator('#service-date').fill('2026-09-21');await page.locator('#deadline').fill('13:00');await page.locator('#care-end').fill('17:00');await revealPreferences(page); await page.locator('#transport').selectOption('self');
  await chooseAge(page); await page.getByRole('button',{name:'Find childcare',exact:true}).click();await openResults(page);await expect(page.locator('.provider-row').first()).toBeVisible();return calls;
}
const sortMenu=page=>page.getByRole('combobox',{name:'Order search results',exact:true});
const price=page=>page.getByRole('option',{name:/^Lowest fee/});
async function choosePrice(page,menu=sortMenu(page)){await menu.click();await price(page).click();await expect(menu).toHaveText('Lowest fee');}

for(const width of [1440,390])test(`${width}px: changing to an area without quotes clears price order and explains the disabled choice`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const calls=await setup(page,[provider('quoted',0,true),provider('near',1),provider('unquoted-a',0,false,other),provider('unquoted-b',1,false,other)]);
  await choosePrice(page);
  await page.getByRole('button',{name:'Change search',exact:true}).click();
  await page.locator('#pickup-search').fill('New pickup');await page.locator('#pickup-search').press('Enter');
  await page.locator('.place-results').getByRole('button',{name:/New pickup/}).click();
  await chooseAge(page); await page.getByRole('button',{name:'Find childcare',exact:true}).click();await openResults(page);
  await expect(sortMenu(page)).toHaveText('Nearest first');
  await expect(page.locator('.provider-row')).toHaveCount(2);await expect(page.locator('.provider-row').filter({hasText:'Ask the centre'})).toHaveCount(2);
  await sortMenu(page).click();
  await expect(price(page)).toBeDisabled();await expect(price(page)).toHaveAttribute('aria-selected','false');
  await expect(price(page)).toContainText('No fees listed nearby.');
  await expect(price(page)).not.toContainText('Unavailable');
  const before=calls.filter(c=>c.action==='search').length;await price(page).click({force:true});
  await expect(sortMenu(page)).toHaveText('Nearest first');expect(calls.filter(c=>c.action==='search')).toHaveLength(before);
  const box=await page.getByRole('listbox').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width);expect(box.y+box.height).toBeLessThanOrEqual(900);
  await page.screenshot({path:`${out}/missing-fee-${width}.png`});await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Change search',exact:true}).click();await page.getByRole('button',{name:'Update results',exact:true}).click();
  await expect(sortMenu(page)).toHaveText('Nearest first');expect(calls.filter(c=>c.action==='search').at(-1).request.sort).toBe('distance');
});

test('removing the last quoted comparison centre resets its priority and gives a comparison-specific reason',async({page})=>{
  await setup(page,[provider('quoted',0,true),provider('unquoted-a',1),provider('unquoted-b',2)]);
  for(const id of ['quoted','unquoted-a','unquoted-b'])await page.getByRole('button',{name:`Compare Test ${id}`,exact:true}).click();
  await page.getByRole('navigation',{name:'Main navigation'}).getByRole('button',{name:/Compare/}).click();
  const priority=page.getByRole('combobox',{name:'Comparison priority',exact:true});await choosePrice(page,priority);
  await page.getByRole('button',{name:'Remove Test quoted from comparison',exact:true}).click();
  await expect(priority).toHaveText('Nearest first');await priority.click();
  await expect(price(page)).toBeDisabled();await expect(price(page)).toHaveAttribute('aria-selected','false');
  await expect(price(page)).toContainText('No fees listed.');
  await page.screenshot({path:`${out}/missing-fee-comparison.png`});
});

test('sorting a quoted later page stays on that page; returning to an unquoted page resets and names the correct scope',async({page})=>{
  await setup(page,Array.from({length:12},(_,i)=>provider(`page-${i}`,i,i>=10)));
  await sortMenu(page).click();await expect(price(page)).toContainText('No fees on this page.');await page.keyboard.press('Escape');
  await page.getByRole('button',{name:'Next',exact:true}).click();await expect(page.locator('.pagination')).toContainText('11–12 / 12');
  await choosePrice(page);await expect(page.locator('.pagination')).toContainText('11–12 / 12');
  await expect(page.locator('.provider-row').first()).toHaveAttribute('data-provider-id','page-11');
  await page.getByRole('button',{name:'Previous',exact:true}).click();await expect(sortMenu(page)).toHaveText('Nearest first');
  await sortMenu(page).click();await expect(price(page)).toContainText('No fees on this page.');
});
