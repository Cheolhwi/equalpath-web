import { chooseAge, includeConflicts, openResults, openSearch, setDate, setTime, setTransport, submitSearch } from "./ui-helpers.mjs";
import {test,expect} from '@playwright/test';
import {createAPI} from '../../server/api.mjs';
import {fixtureCatalog} from '../../server/fixtures.mjs';
import {mkdirSync} from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR||'.build/centre-details';mkdirSync(out,{recursive:true});
const source={label:'Published branch information',url:'https://example.com/centre',retrievedAt:'2026-09-13',sourceDate:'2026-09-01'};
async function openDetails(page,{conflict=true,missing=false}={}){
  const base=fixtureCatalog.items[0],p={...structuredClone(base),id:'centre-test',name:'Little Garden Childcare, Kota Damansara',mode:'live',age:{...base.age,rangeLabel:'2–6 years'},address:'12 Jalan Sepah Puteri, Kota Damansara, Selangor',feeRule:null,
    careWindows:[{days:['MON'],start:480,end:conflict?1020:1140,source}],lateRule:null,phone:missing?null:{display:'03-1234 5678',source},sourcePage:source.url,
    fees:missing?[]:[{amount:35,basis:'hour',kind:'programme',currency:'MYR',conditions:'Full-day programme. Meals charged separately.',source}],
    registration:{...base.registration,authority:'KPM',number:'TEST-123',official:false,until:null,from:null,source}};
  const api=createAPI({store:{catalog:async()=>({...fixtureCatalog,items:[p]})},drivingRoutes:async(_,rows)=>rows.map(x=>({...x,driving:missing?{state:'unavailable'}:{state:'available',minutes:8,distanceKm:3.2,source}}))});
  await page.route('**/api',async route=>route.fulfill({json:{ok:true,...await api(route.request().postDataJSON())}}));
  await page.addInitScript(()=>{localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');localStorage.setItem('equalpath:map:v1:live',JSON.stringify({version:1,zoom:13,center:{lat:3.139,lng:101.6869},pickup:{id:null,label:'KL Sentral',lat:3.139,lng:101.6869}}));});
  await page.goto('/?care=short_term#discover');await openSearch(page);await setDate(page, '2026-09-14');await setTime(page, 'deadline', '13:00');await setTime(page, 'care-end', '18:00');await chooseAge(page, '4');await setTransport(page, 'self');if(conflict) await includeConflicts(page);await submitSearch(page);await openResults(page);await page.getByRole('button',{name:'View details for '+p.name,exact:true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toHaveCSS('opacity', '1');
  return dialog;
}
// Details is a centre profile since 6 Oct 2026: the centre, "Your search" with
// the same mismatch/ask count as the cards, Add to compare, four key facts and
// grouped sections. Condition checks and contact live in Compare.
test('details put the search line and key facts first, count mismatches and keep evidence',async({page})=>{
  const dialog=await openDetails(page);
  await expect(dialog.locator('.centre-metrics dt')).toHaveText(['Care ends at','Age','Drive','Fee']);
  await expect(dialog.locator('.centre-metrics')).toContainText('MYR 35 / hour');
  await expect(dialog.locator('.centre-metrics .metric-conflict')).toContainText('17:00');
  const line=dialog.locator('.centre-search-line');
  await expect(line).toContainText('13:00–18:00');await expect(line).toContainText('from KL Sentral');
  await expect(dialog.locator('.centre-search-status')).toHaveClass(/conflict/);
  await expect(dialog.locator('.centre-search-status')).toContainText(/details? do(es)?n’t match your search/);
  const compare=dialog.getByRole('button',{name:'Add to compare',exact:true});
  expect(await compare.evaluate(el=>{const r=el.getBoundingClientRect();return r.top>0&&r.bottom<innerHeight;})).toBe(true);
  await expect(dialog.locator('.centre-fees')).toContainText('Full-day programme. Meals charged separately.');
  await expect(dialog.locator('.centre-evidence')).not.toHaveAttribute('open','');
  await dialog.locator('.centre-evidence > summary').click();await expect(dialog.locator('.centre-evidence')).toContainText('TEST-123');
  await expect(dialog.getByRole('heading',{name:'KPM code listed',exact:true})).toBeVisible();
  await dialog.locator('.centre-evidence > summary').click();await page.screenshot({path:out+'/details-desktop.png'});
  await compare.click();
  await expect(dialog.getByRole('button',{name:'Added to compare',exact:true})).toHaveAttribute('aria-pressed','true');
});
test('mobile details keep long names, missing fees and contacts usable',async({page})=>{
  await page.setViewportSize({width:390,height:844});const dialog=await openDetails(page,{conflict:false,missing:true});
  await expect(dialog.locator('.centre-metrics .metric-fee dd')).toHaveText('Ask the centre');
  await expect(dialog.locator('.centre-metrics')).toContainText('Ask the centre');
  expect(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true);
  await page.screenshot({path:out+'/details-mobile.png'});
  const contact=dialog.locator('.centre-contact');
  await contact.locator(':scope > summary').focus();await page.keyboard.press('Enter');await expect(contact).toHaveAttribute('open','');
  await expect(contact).toContainText('No phone number listed');
  await expect(dialog.getByRole('link',{name:/More about this centre/})).toHaveAttribute('href',source.url);
  await page.keyboard.press('Enter');await expect(contact).not.toHaveAttribute('open','');
  await page.screenshot({path:out+'/details-mobile-actions.png'});
  await expect(dialog.getByRole('button',{name:'Add to compare',exact:true})).toBeVisible();
});
