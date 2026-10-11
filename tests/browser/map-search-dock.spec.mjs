import { test, expect } from '@playwright/test';
import { chooseAge, hideOptionsPanel } from './ui-helpers.mjs';
import { createAPI } from '../../server/api.mjs';
import { fixtureCatalog } from '../../server/fixtures.mjs';
import { mkdirSync } from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR || '.build/map-search-dock';
mkdirSync(out,{recursive:true});
async function setup(page) {
  const calls=[], errors=[]; page.on('pageerror',e=>errors.push(e.message));
  const api=createAPI({store:{catalog:async()=>fixtureCatalog},placeSearch:async()=>({items:[{id:'demo-pickup',label:'KL Sentral',lat:3.139,lng:101.6869}]}),drivingRoutes:async(_,ps)=>ps.map(p=>({...p,driving:{state:'available',minutes:8,traffic:false}}))});
  await page.route('**/api',async route=>{ const b=route.request().postDataJSON();calls.push(b);await route.fulfill({json:{ok:true,...await api(b)}}); });
  await page.addInitScript(() => { localStorage.setItem('equalpath:interests:v1:live', JSON.stringify({version:1,enabled:true,visits:[],hidden:[],preferences:[],preferenceSetup:'skipped'})); localStorage.setItem('equalpath:tour:v1', JSON.stringify({version:1,status:'skipped'})); });
  await page.goto('/#discover'); return {calls,errors};
}
async function selectTime(page,id,h,m) {
  await page.locator(id).click(); const pop=page.locator('.time-picker');
  await pop.getByRole('listbox',{name:'Hour',exact:true}).getByRole('option',{name:h,exact:true}).click();
  await pop.getByRole('listbox',{name:'Minute',exact:true}).getByRole('option',{name:m,exact:true}).click();
  await pop.getByRole('button',{name:'Done',exact:true}).click();
}
async function fillMapSearch(page) {
  await page.locator('#pickup-search').fill('KL Sentral');await page.getByRole('button',{name:'Find address',exact:true}).click();
  await page.locator('.place-results').getByRole('button',{name:/KL Sentral/}).click();
  await page.locator('[data-field="date"]').click();await page.locator('#service-date').fill('2026-09-22');await page.getByRole('button',{name:'Close options'}).click();
  await page.locator('[data-field="age"]').click();await page.getByRole('radio',{name:'Your child: 4 years',exact:true}).click();
  await selectTime(page,'#deadline','16','00');await selectTime(page,'#care-end','18','00');
}
for(const [width,height] of [[320,568],[390,844],[1440,900]]) test(`${width}x${height}: a complete search stays on the map and all controls remain reachable`,async({page})=>{
  await page.setViewportSize({width,height});const {calls,errors}=await setup(page);
  await expect(page.locator('.discovery-panel')).not.toBeVisible();
  await expect(page.locator('.map-search-dock')).toBeVisible();
  await expect(page.locator('#deadline small')).toHaveText('Start');
  await expect(page.locator('#care-end small')).toHaveText('End');
  await fillMapSearch(page);
  await page.locator('[data-field="more"]').click();
  const box=await page.locator('.dock-popover').boundingBox();expect(box.x).toBeGreaterThanOrEqual(0);expect(box.y+box.height).toBeLessThanOrEqual(height);
  await page.getByRole('button',{name:'Close options'}).click();
  await page.locator('[data-field="transport"]').click();await page.getByRole('radio',{name:'The centre picks my child up',exact:true}).click();
  await expect(page.locator('[data-field="transport"] strong')).toHaveText('Centre pickup');
  await page.screenshot({path:`${out}/map-controls-${width}.png`});
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  // After a search the suggestions panel (a sheet on phones) opens; fold it to see the map cards.
  await expect(page.locator('.one-child-panel')).toBeVisible();
  await hideOptionsPanel(page);
  await expect(page.locator('.map-centre-card:not(.leaving)')).toHaveCount(3);
  await expect(page.locator('.discovery-panel')).not.toBeVisible();
  expect(calls.filter(c=>c.action==='search').at(-1).request).toMatchObject({careType:'short_term',age:'4',date:'2026-09-22',deadline:'16:00',end:'18:00',transport:'institution'});
  const cards=await page.locator('.map-centre-card:not(.leaving)').evaluateAll(es=>es.map(el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom};}));
  for(const a of cards){expect(a.x).toBeGreaterThanOrEqual(0);expect(a.bottom).toBeLessThanOrEqual(height-25);for(const b of cards.filter(b=>b!==a))expect(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y).toBe(true);}
  if (width > 760) await expect(page.locator('.dock-form')).toBeVisible();
  else await expect(page.locator('.mobile-search-summary')).toBeVisible();
  await page.screenshot({path:`${out}/map-results-${width}.png`});
  await page.locator('.map-centre-card:not(.leaving)').first().getByRole('button',{name:/View details/}).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button',{name:'Add to compare',exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

// Short-term care only (2 Oct 2026): the dock always asks for date, age and times.
test('required fields open on the map, and filters do not submit',async({page})=>{
  const {calls}=await setup(page);
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect(page.locator('#pickup-search')).toBeFocused();
  await page.locator('#pickup-search').fill('KL Sentral');await page.getByRole('button',{name:'Find address',exact:true}).click();await page.locator('.place-results').getByRole('button',{name:/KL Sentral/}).click();
  await expect(page.locator('[data-field="care"]')).toHaveCount(0);
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect(page.locator('#deadline-error')).toBeVisible();
  await expect(page.locator('[data-field="age"]')).toHaveClass(/invalid/);
  await chooseAge(page,'2');
  await page.locator('[data-field="more"]').click();await page.locator('.dock-popover-more').getByRole('radio',{name:'Within 10 km',exact:true}).check();
  await page.keyboard.press('Escape');await expect(page.locator('.dock-popover')).toHaveCount(0);
  expect(calls.filter(c=>c.action==='search')).toHaveLength(0);
  await selectTime(page,'#deadline','13','00');await selectTime(page,'#care-end','15','30');
  await page.getByRole('button',{name:'Find childcare',exact:true}).click();
  await expect.poll(()=>calls.filter(c=>c.action==='search').length).toBe(1);
  expect(calls.filter(c=>c.action==='search')[0].request).toMatchObject({careType:'short_term',age:'2',radius:10,deadline:'13:00',end:'15:30'});
});

test('map time chips save on outside click, cancel with Escape and support dark/reduced motion',async({page})=>{
  await page.setViewportSize({width:390,height:844});await page.addInitScript(() => localStorage.setItem('equalpath:motion:v1','reduce'));await setup(page);await selectTime(page,'#deadline','13','00');
  await page.locator('#deadline').click();await page.locator('.time-picker').getByRole('listbox',{name:'Hour',exact:true}).getByRole('option',{name:'15',exact:true}).click();
  await page.locator('[data-field="age"]').click();await expect(page.locator('#deadline')).toContainText('15:00');
  await page.keyboard.press('Escape');await page.locator('#deadline').click();
  await page.locator('.time-picker').getByRole('listbox',{name:'Hour',exact:true}).getByRole('option',{name:'16',exact:true}).click();await page.keyboard.press('Escape');
  await expect(page.locator('#deadline')).toContainText('15:00');
  await page.getByRole('button',{name:'Display and data settings'}).click();await page.getByRole('button',{name:'Dark',exact:true}).click();await page.getByRole('button',{name:'Close dialog',exact:true}).click();
  await page.locator('[data-field="age"]').click();await expect(page.locator('.dock-popover')).toHaveCSS('animation-name','none');
  await page.screenshot({path:`${out}/map-options-dark.png`});
});

for (const width of [320, 390, 1440]) test(`${width}px: choices open as anchored menus inside the screen`, async ({page}) => {
  await page.setViewportSize({width, height: 844}); await setup(page);
  // Getting there is a small menu; the age menu also asks one or two children.
  for (const [field, choice, chip, small] of [['transport', 'I’ll bring my child', 'I’ll bring', true], ['age', 'Your child: 4 years', '4 yrs', false]]) {
    const trigger = page.locator(`[data-field="${field}"]`);
    await trigger.click();
    const box = await page.locator('.dock-popover').boundingBox(), anchor = await trigger.boundingBox();
    if (small) { expect(box.width).toBeLessThanOrEqual(280); expect(box.height).toBeLessThanOrEqual(160); }
    expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(width);
    expect(box.y+box.height).toBeLessThanOrEqual(844);
    expect(Math.abs(box.y - (anchor.y + anchor.height))).toBeLessThan(16);
    expect(await page.getByRole('radio', {name: choice, exact: true}).locator('..').evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.height >= 40 && el.contains(document.elementFromPoint(r.x+r.width/2, r.y+r.height/2));
    })).toBe(true);
    await page.screenshot({path:`${out}/${field}-menu-${width}.png`});
    await page.getByRole('radio', {name: choice, exact: true}).click();
    await expect(page.locator('.dock-popover')).toHaveCount(0); await expect(trigger).toBeFocused();
    await expect(trigger).toContainText(chip);
    await trigger.click(); await page.keyboard.press('Escape');
    await expect(page.locator('.dock-popover')).toHaveCount(0); await expect(trigger).toBeFocused();
  }
});

for (const width of [320, 390]) test(`${width}px: search collapses to a summary, editing keeps choices and re-search collapses again`, async ({page}) => {
  await page.setViewportSize({width, height: width === 320 ? 568 : 844});
  const {calls, errors} = await setup(page); await fillMapSearch(page);
  const before = await page.locator('.map-tools-overlay').boundingBox();
  await page.getByRole('button', {name:'Find childcare', exact:true}).click();
  const summary = page.getByRole('button', {name:'Change search', exact:true});
  await expect(summary).toBeVisible();
  await expect(summary).toContainText('KL Sentral');
  await expect(summary).toContainText('22 Sept');
  await expect(summary).toContainText('Results up to date');
  await expect(page.locator('.dock-form')).not.toBeVisible();
  const after = await page.locator('.map-tools-overlay').boundingBox();
  expect(after.height).toBeLessThan(140); expect(before.height - after.height).toBeGreaterThan(140);
  await page.screenshot({path:`${out}/collapsed-${width}.png`});
  await summary.click();
  await expect(page.locator('#pickup-search')).toBeFocused();
  await expect(page.locator('#deadline')).toContainText('16:00');
  await expect(page.locator('#care-end')).toContainText('18:00');
  await expect(page.locator('[data-field="age"]')).toContainText('4 yrs');
  await expect(page.getByRole('button', {name:'Pick on map', exact:true})).toBeVisible();
  await expect(page.getByRole('button', {name:'Use my location', exact:true})).toBeVisible();
  await page.getByRole('button', {name:'Hide search', exact:true}).click();
  await expect(summary).toBeFocused();
  await summary.click(); await selectTime(page, '#care-end', '19', '15');
  await page.getByRole('button', {name:'Update results', exact:true}).click();
  await expect(summary).toBeVisible();
  expect(calls.filter(c=>c.action==='search').at(-1).request.end).toBe('19:15');
  // On phones the navigation folds after a search; its grip brings it back (6 Oct 2026).
  const reveal = page.getByRole('button', {name:'Show menu', exact:true});
  if (await reveal.isVisible()) await reveal.click();
  await page.getByRole('navigation').getByRole('button', {name:'Find care', exact:true}).click();
  await expect(page.locator('#pickup-search')).toBeFocused();
  await expect(page.locator('.dock-form')).toBeVisible();
  await page.locator('[data-field="age"]').click();
  await page.getByRole('radio', {name:'Your child: 2 years', exact:true}).click();
  await expect(page.locator('.dock-form')).toBeVisible();
  expect(errors).toEqual([]);
});

test('mobile search stays expanded for no results, failures and edits made while waiting', async ({page}) => {
  await page.setViewportSize({width:390, height:844});
  await setup(page); await fillMapSearch(page);
  let release, started;
  const gate = new Promise(r=>release=r), seen = new Promise(r=>started=r);
  await page.route('**/api', async route => {
    if (route.request().postDataJSON().action === 'search') { started(); await gate; }
    await route.fallback();
  });
  await page.getByRole('button',{name:'Find childcare',exact:true}).click(); await seen;
  await page.locator('[data-field="age"]').click(); await page.getByRole('radio',{name:'Your child: 2 years',exact:true}).click();
  release();
  await expect(page.locator('.search-actions')).toHaveAttribute('data-state', 'pending');
  await expect(page.locator('.search-apply-status')).toContainText('Changes not applied');
  await expect(page.locator('.dock-form')).toBeVisible();
  await expect(page.locator('[data-field="age"]')).toContainText('2 yrs');
  await page.route('**/api', async route => {
    if (route.request().postDataJSON().action !== 'search') return route.fallback();
    await route.fulfill({status:503,json:{ok:false,code:'unavailable'}});
  });
  await page.getByRole('button',{name:'Update results',exact:true}).click();
  await expect(page.getByRole('button',{name:'Retry search',exact:true})).toBeVisible();
  await expect(page.locator('.search-apply-status')).toContainText('Results not updated');
  await expect(page.locator('[data-field="age"]')).toHaveAttribute('data-pending', 'true');
  await expect(page.locator('.dock-form')).toBeVisible();
  await page.route('**/api', async route => {
    const b=route.request().postDataJSON(); if(b.action!=='search')return route.fallback();
    const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[]})}});
    await route.fulfill({json:{ok:true,...await api(b)}});
  });
  await page.getByRole('button',{name:'Retry search',exact:true}).click();
  await expect(page.locator('.dock-feedback')).toContainText('No centres found');
  await expect(page.locator('.short-care-map-alternatives')).toBeVisible();
  await expect(page.locator('.short-care-map-links a')).toHaveCount(2);
  await page.locator('.map-quick-actions button').first().click();
  await expect(page.locator('.short-care-alternatives')).toBeVisible();
  await expect(page.locator('.short-care-alternative')).toHaveCount(2);
  await expect(page.locator('.short-care-alternatives-note')).toContainText('outside EqualPath');
});

for (const width of [390, 1440]) test(`${width}px: chosen filters stay visibly pending until Update succeeds, and reverting clears the pending state`, async ({page}) => {
  await page.setViewportSize({width, height: 900});
  const {calls, errors} = await setup(page);
  await expect(page.locator('.search-apply-status')).toContainText('Then select Find childcare');
  await fillMapSearch(page);
  await page.getByRole('button', {name:'Find childcare', exact:true}).click();
  await expect.poll(() => calls.filter(c => c.action === 'search').length).toBe(1);
  if (width < 760) await page.getByRole('button', {name:'Change search', exact:true}).click();
  await expect(page.locator('.search-apply-status')).toHaveText('Results up to date');
  await page.locator('[data-field="age"]').click();
  await page.getByRole('radio', {name:'Your child: 2 years', exact:true}).click();
  await expect(page.locator('[data-field="age"]')).toHaveAttribute('data-pending', 'true');
  await expect(page.locator('.search-apply-status')).toContainText('Changes not applied');
  await expect(page.locator('[data-field="date"]')).not.toHaveAttribute('data-pending');
  await page.locator('[data-field="age"]').click();
  await page.getByRole('radio', {name:'Your child: 4 years', exact:true}).click();
  await expect(page.locator('.search-apply-status')).toHaveText('Results up to date');
  await expect(page.locator('[data-pending]')).toHaveCount(0);
  await page.locator('[data-field="transport"]').click();
  await page.getByRole('radio', {name:'I’ll bring my child', exact:true}).click();
  await expect(page.locator('.dock-popover')).toHaveCount(0);
  await expect(page.locator('.selected-filter-summary')).toHaveCount(0);
  await expect(page.locator('[data-field="transport"]')).toHaveAttribute('data-pending', 'true');
  await expect(page.locator('[data-field="more"]')).not.toHaveAttribute('data-pending');
  await selectTime(page, '#care-end', '19', '15');
  await expect(page.locator('#care-end')).toHaveAttribute('data-pending', 'true');
  expect(calls.filter(c => c.action === 'search')).toHaveLength(1);
  const action = await page.locator('.search-actions').boundingBox();
  const filters = await page.locator('.dock-options').boundingBox();
  expect(action.y).toBeGreaterThanOrEqual(filters.y + filters.height);
  expect(action.y + action.height).toBeLessThan(900);
  if (width >= 760) {
    const button = await page.locator('.search-actions .dock-find').boundingBox();
    expect(button.width).toBeLessThanOrEqual(260);
  }
  await page.screenshot({path:`${out}/filters-pending-${width}.png`});
  let release, started;
  const gate = new Promise(r => release = r), seen = new Promise(r => started = r);
  await page.route('**/api', async route => {
    if (route.request().postDataJSON().action === 'search') { started(); await gate; }
    await route.fallback();
  });
  await page.locator('[data-field="more"]').click();
  await expect(page.locator('.filter-review')).toContainText('Changes apply when you select Update results');
  await page.locator('.filter-review').getByRole('button', {name:'Update results', exact:true}).click();
  await seen;
  await expect(page.locator('.search-actions')).toHaveAttribute('data-state', 'loading');
  await expect(page.locator('.search-actions button')).toBeDisabled();
  release();
  if (width < 760) await page.getByRole('button', {name:'Change search', exact:true}).click();
  await expect(page.locator('.search-apply-status')).toHaveText('Results up to date');
  await expect(page.locator('[data-pending]')).toHaveCount(0);
  await expect(page.locator('.selected-filter-summary')).toHaveCount(0);
  expect(calls.filter(c => c.action === 'search').at(-1).request).toMatchObject({transport:'self', end:'19:15'});
  await page.screenshot({path:`${out}/filters-applied-${width}.png`});
  expect(errors).toEqual([]);
});
