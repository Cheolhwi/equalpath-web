import {test,expect} from '@playwright/test';
import {createAPI} from '../../server/api.mjs';
import {fixtureCatalog} from '../../server/fixtures.mjs';
for (const careType of ['regular', 'short_term']) test(`${careType}: listed KPM codes retain their source and monthly fees belong only to regular care`,async({page})=>{
  const base=fixtureCatalog.items[0],source={label:'School-reported fees on CariSchool',url:'https://www.carischools.com/school/test',retrievedAt:'2026-09-13T09:00:00Z',sourceDate:'2026-09-01'};
  const fees=[['programme',350,'Half day'],['programme',490,'Full day'],['meal',80,'Meal plan']].map(([kind,amount,programme])=>({kind,amount,programme,basis:'month',currency:'MYR',conditions:programme+'. School-reported on CariSchool.',source}));
  const p={...base,mode:'live',feeRule:null,fees,registration:{...base.registration,authority:'KPM',number:'W5L0048',official:false,from:null,until:null,matchBasis:'CariSchool lists this KPM code for the named branch. The current official registration status has not been independently checked.',source:{...source,label:'KPM code listed by CariSchool'}}};
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[p]})},drivingRoutes:async(_,rows)=>rows});
  await page.route('**/api',async route=>route.fulfill({json:{ok:true,...await api(route.request().postDataJSON())}}));
  await page.addInitScript(()=>{
    localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,center:{lat:3.139,lng:101.6869},zoom:13,pickup:{id:null,label:'KL centre',lat:3.139,lng:101.6869}}));
  });
  await page.goto(`/?care=${careType}#discover`);
  if (careType === 'short_term') { await page.locator('#deadline').fill('13:00'); await page.locator('#care-end').fill('17:00'); }await page.getByRole('button',{name:'Find care options',exact:true}).click();
  await expect(page.locator('.provider-row')).toContainText(careType === 'regular' ? 'MYR 350–490 / month' : 'Ask the centre');
  if (careType === 'short_term') await expect(page.locator('.provider-row')).not.toContainText('/ month');
  await expect(page.locator('.provider-row')).not.toContainText('MYR 80');
  await page.getByRole('button',{name:/View details for/}).click();
  const dialog=page.getByRole('dialog');
  await dialog.locator('.centre-evidence > summary').click();
  await expect(dialog.getByRole('heading',{name:'KPM code listed',exact:true})).toBeVisible();
  await expect(dialog).toContainText('W5L0048');
  if (careType === 'short_term') {
    await expect(dialog.getByRole('heading', {name:'Ask the centre for a quote', exact:true})).toBeVisible();
    await expect(dialog.locator('.fee-line')).toHaveCount(0);
    await expect(dialog.locator('.centre-metrics')).not.toContainText('/ month');
    return;
  }
  await expect(dialog.getByRole('heading',{name:'Published fees',exact:true})).toBeVisible();
  await expect(dialog.locator('.fee-line')).toHaveCount(3);
  await expect(dialog.locator('.fee-line').last()).toContainText('MYR 80 / month');
  await expect(dialog.locator('.fee-line').last()).toContainText('Meal plan');
  await dialog.locator('.fee-line').first().getByText('View source',{exact:true}).click();
  await expect(dialog.locator('.fee-line').first().getByRole('link')).toHaveAttribute('href',source.url);
});
test('area budget references stay labelled in search and details',async({page})=>{
  const source={label:'Budget reference source',url:'https://example.com/reference-fees',retrievedAt:'2026-09-13'};
  const fee={min:600,max:900,basis:'month',currency:'MYR',verification:'area_estimate',conditions:"Estimated monthly budget based on 5 TASKA centres in Petaling. This is an area reference, not this centre's quote.",source};
  const p={...fixtureCatalog.items[0],mode:'live',feeRule:null,fees:[fee]};
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[p]})},drivingRoutes:async(_,rows)=>rows});
  await page.route('**/api',async route=>route.fulfill({json:{ok:true,...await api(route.request().postDataJSON())}}));
  await page.addInitScript(()=>{
    localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');
    localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,center:{lat:3.139,lng:101.6869},zoom:13,pickup:{id:null,label:'KL centre',lat:3.139,lng:101.6869}}));
  });
  await page.goto('/#discover');await page.getByRole('button',{name:'Find care options',exact:true}).click();
  await expect(page.locator('.provider-row')).toContainText('Estimated MYR 600–900 / month');
  await page.getByRole('button',{name:/View details for/}).click();
  const dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:'Estimated budget',exact:true})).toBeVisible();
  await expect(dialog.locator('.fee-line')).toContainText('Estimated MYR 600–900 / month');
  await expect(dialog.locator('.fee-line')).toContainText("not this centre's quote");
});
