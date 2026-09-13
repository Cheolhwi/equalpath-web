import {test,expect} from '@playwright/test';
import {createAPI} from '../../server/api.mjs';
import {fixtureCatalog} from '../../server/fixtures.mjs';
import {mkdirSync} from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR||'.build/centre-details';mkdirSync(out,{recursive:true});
const source={label:'Published branch information',url:'https://example.com/centre',retrievedAt:'2026-09-13',sourceDate:'2026-09-01'};
async function openDetails(page,{conflict=true,missing=false}={}){
  const base=fixtureCatalog.items[0],p={...structuredClone(base),id:'centre-test',name:'Little Garden Childcare, Kota Damansara',mode:'live',age:{...base.age,rangeLabel:'2–6 years'},address:'12 Jalan Sepah Puteri, Kota Damansara, Selangor',feeRule:null,
    careWindows:[{days:['MON'],start:480,end:conflict?1020:1140,source}],lateRule:null,phone:missing?null:{display:'03-1234 5678',source},sourcePage:source.url,
    fees:missing?[]:[{amount:650,basis:'month',kind:'programme',currency:'MYR',conditions:'Full-day programme. Meals charged separately.',source}],
    registration:{...base.registration,authority:'KPM',number:'TEST-123',official:false,until:null,from:null,source}};
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[p]})},drivingRoutes:async(_,rows)=>rows.map(x=>({...x,driving:missing?{state:'unavailable'}:{state:'available',minutes:8,distanceKm:3.2,source}}))});
  await page.route('**/api',async route=>route.fulfill({json:{ok:true,...await api(route.request().postDataJSON())}}));
  await page.addInitScript(()=>{localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,zoom:13,center:{lat:3.139,lng:101.6869},pickup:{id:null,label:'KL Sentral',lat:3.139,lng:101.6869}}));});
  await page.goto('/#discover');await page.locator('#service-date').fill('2026-09-14');await page.locator('#deadline').fill('13:00');await page.locator('#care-end').fill('18:00');await page.locator('#age').selectOption('4');await page.locator('#transport').selectOption('self');await page.getByRole('button',{name:'Find care options',exact:true}).click();await page.getByRole('button',{name:'View details for '+p.name,exact:true}).click();
  return page.getByRole('dialog');
}
test('details put useful facts and next action first, retain evidence and prioritise mismatches',async({page})=>{
  const dialog=await openDetails(page);
  await expect(dialog.locator('.centre-metrics dt')).toHaveText(['Care end time','Age','Drive from pickup','Fee']);
  await expect(dialog.locator('.centre-request')).toContainText('18:00');await expect(dialog.locator('.centre-metrics')).toContainText('MYR 650 / month');
  await expect(dialog.locator('.fit-check').first()).toHaveAttribute('data-condition-id','care');await expect(dialog.locator('.fit-check').first()).toHaveAttribute('open','');
  await expect(dialog.locator('.fit-check').first()).toContainText('17:00 · you need 18:00');
  await expect(dialog.getByRole('button',{name:'Prepare questions',exact:true})).toHaveCount(1);
  const within=await dialog.getByRole('button',{name:'Prepare questions',exact:true}).evaluate(el=>{const r=el.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight;});expect(within).toBe(true);
  await expect(dialog.locator('.centre-evidence')).not.toHaveAttribute('open','');
  await dialog.locator('.fit-check').first().getByText('View source',{exact:true}).click();await expect(dialog.locator('.fit-check').first().getByRole('link')).toHaveAttribute('href',source.url);
  await dialog.locator('.centre-evidence > summary').click();await expect(dialog).toContainText('TEST-123');await expect(dialog.getByRole('heading',{name:'KPM code listed',exact:true})).toBeVisible();
  await dialog.locator('.centre-evidence > summary').click();await dialog.getByRole('heading',{level:2}).scrollIntoViewIfNeeded();await page.screenshot({path:out+'/details-desktop.png'});
  await dialog.getByRole('button',{name:'Compare',exact:true}).click();await expect(dialog.getByRole('button',{name:'Compare',exact:true})).toHaveAttribute('aria-pressed','true');
  await dialog.getByRole('button',{name:'Prepare questions',exact:true}).click();await expect(page.getByRole('heading',{name:'Questions for the centre',exact:true})).toBeVisible();
});
test('mobile details keep long names, missing fees and contacts usable with keyboard disclosures',async({page})=>{
  await page.setViewportSize({width:390,height:844});const dialog=await openDetails(page,{conflict:false,missing:true});
  await expect(dialog.locator('.centre-metrics')).toContainText('Unavailable');await expect(dialog.locator('.centre-metrics')).toContainText('Ask the centre');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:out+'/details-mobile.png'});
  await dialog.locator('.fit-check').first().locator('summary').focus();await page.keyboard.press('Enter');await expect(dialog.locator('.fit-check').first()).toHaveAttribute('open','');
  await dialog.locator('.centre-next').scrollIntoViewIfNeeded();await expect(dialog.locator('.centre-contact')).toContainText('couldn’t find a contact number');await expect(dialog.getByRole('link',{name:'View centre listing'})).toHaveAttribute('href',source.url);
  await page.screenshot({path:out+'/details-mobile-actions.png'});
  await dialog.getByRole('button',{name:'Create preparation sheet',exact:true}).click();await expect(page.getByRole('heading',{name:'Pickup & handover checklist',exact:true})).toBeVisible();
});
