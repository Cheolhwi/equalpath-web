import { chooseAge, openResults, openSearch, returningVisitor, setTimes, submitSearch } from "./ui-helpers.mjs";
import {test,expect} from '@playwright/test';
import {createAPI} from '../../server/api.mjs';
import {fixtureCatalog} from '../../server/fixtures.mjs';
// Short-term care only (2 Oct 2026): monthly budgets are never shown as a short-stay price.
test('listed KPM codes retain their source and monthly fees are not short-stay prices',async({page})=>{
  const careType='short_term';
  const base=fixtureCatalog.items[0],source={label:'School-reported fees on CariSchool',url:'https://www.carischools.com/school/test',retrievedAt:'2026-09-13T09:00:00Z',sourceDate:'2026-09-01'};
  const fees=[['programme',350,'Half day'],['programme',490,'Full day'],['meal',80,'Meal plan']].map(([kind,amount,programme])=>({kind,amount,programme,basis:'month',currency:'MYR',conditions:programme+'. School-reported on CariSchool.',source}));
  const p={...base,mode:'live',feeRule:null,fees,registration:{...base.registration,authority:'KPM',number:'W5L0048',official:false,from:null,until:null,matchBasis:'CariSchool lists this KPM code for the named branch. The current official registration status has not been independently checked.',source:{...source,label:'KPM code listed by CariSchool'}}};
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[p]})},drivingRoutes:async(_,rows)=>rows});
  await page.route('**/api',async route=>route.fulfill({json:{ok:true,...await api(route.request().postDataJSON())}}));
  await returningVisitor(page);
  await page.addInitScript(()=>{
    localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,center:{lat:3.139,lng:101.6869},zoom:13,pickup:{id:null,label:'KL centre',lat:3.139,lng:101.6869}}));
  });
  await page.goto('/#discover');await openSearch(page);
  await chooseAge(page); await setTimes(page, '13:00', '17:00');
  await submitSearch(page);await openResults(page);
  await expect(page.locator('.provider-row')).toContainText('Ask the centre');
  await expect(page.locator('.provider-row')).not.toContainText('/ month');
  await expect(page.locator('.provider-row')).not.toContainText('MYR 80');
  await page.getByRole('button',{name:/View details for/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('.centre-evidence > summary').click();
  await expect(dialog.getByRole('heading',{name:'KPM code listed',exact:true})).toBeVisible();
  await expect(dialog).toContainText('W5L0048');
  await expect(dialog.locator('.centre-fees')).toContainText('Ask the centre for the price');
  await expect(dialog.locator('.fee-line')).toHaveCount(0);
  await expect(dialog.locator('.centre-metrics')).not.toContainText('/ month');
});
