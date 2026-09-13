import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
const out=process.env.QA_EVIDENCE_DIR || '.build/landing-qa';mkdirSync(out,{recursive:true});
test.beforeEach(async({page})=>{
  await page.route('**/api',route=>route.fulfill({json:{ok:true,mode:'live',items:[],available:0,total:0,regions:['Kuala Lumpur','Selangor']}}));
  await page.addInitScript(()=>{
    localStorage.setItem('equalpath:tour:v1','{"version":1,"status":"skipped"}');
    window.landingStates=[];
    new MutationObserver(()=>{
      const el=document.querySelector('.care-scene');
      if(el?.dataset.sceneStatus==='ready'){
        const state=el.dataset.opening;
        if(window.landingStates.at(-1)?.state!==state)window.landingStates.push({state,at:performance.now(),view:el.dataset.sceneView});
      }
    }).observe(document,{subtree:true,attributes:true,childList:true});
  });
});
test('landing starts as a collection, automatically raises a care card, and never forces an initial button outline',async({page})=>{
  test.setTimeout(90000);await page.emulateMedia({reducedMotion:'no-preference'});
  await page.goto('/');
  const enter=page.getByRole('button',{name:'FIND CHILDCARE',exact:true});
  await expect(enter).not.toBeFocused();
  expect(await enter.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('none');
  const scene=page.locator('.care-scene');
  await expect(scene).toHaveAttribute('data-scene-status','ready',{timeout:60000});
  await page.screenshot({path:out+'/landing-collection.png'});
  await expect(scene).toHaveAttribute('data-opening','complete',{timeout:15000});
  await expect(scene).toHaveAttribute('data-scene-view','detail');
  await expect(scene).toHaveAttribute('data-artwork','read');
  await page.screenshot({path:out+'/landing-raised.png'});
  const states=await page.evaluate(()=>window.landingStates);
  expect(states.map(x=>x.state)).toEqual(['collection','lifting','complete']);
  expect(states[1].at-states[0].at).toBeGreaterThanOrEqual(250);
  expect(states[1].at-states[0].at).toBeLessThan(1500);
  await page.getByRole('button',{name:'Next artwork'}).click();
  await expect(scene).toHaveAttribute('data-artwork','play');
  await expect(scene).toHaveAttribute('data-autoplay','paused');
  await enter.click();await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','ready');
  await page.getByRole('button',{name:'EqualPath home',exact:true}).click();
  await expect(scene).toHaveAttribute('data-opening','complete');
  await expect(scene).toHaveAttribute('data-scene-view','detail');
});
test('reduced-motion mobile landing opens raised, with visible controls and keyboard focus preserved',async({page})=>{
  test.setTimeout(90000);await page.setViewportSize({width:390,height:844});
  await page.goto('/');const scene=page.locator('.care-scene');
  await expect(scene).toHaveAttribute('data-scene-status','ready',{timeout:60000});
  await expect(scene).toHaveAttribute('data-opening','complete');
  await expect(scene).toHaveAttribute('data-scene-view','detail');
  const enter=page.getByRole('button',{name:'FIND CHILDCARE',exact:true});
  await expect(enter).not.toBeFocused();await expect(enter).toBeInViewport();
  await expect(page.getByRole('button',{name:'Next artwork'})).toBeInViewport();
  await page.screenshot({path:out+'/landing-mobile.png'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let i=0;i<8&&!await enter.evaluate(el=>el===document.activeElement);i++)await page.keyboard.press('Tab');
  await expect(enter).toBeFocused();expect(await enter.evaluate(el=>getComputedStyle(el).outlineStyle)).toBe('solid');
  await page.keyboard.press('Enter');await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','ready');
});
