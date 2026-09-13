import {test,expect} from '@playwright/test';
import {mkdirSync} from 'node:fs';
import {ENTRANCE_COVER_MS,ENTRANCE_DURATION_MS} from '../../src/entrance.js';
const out=process.env.QA_EVIDENCE_DIR || '.build/landing-qa';mkdirSync(out,{recursive:true});

async function captureEntry(page, artwork = 'play', suffix = '') {
  // Pause JS completion while sampling the actual CSS animations at their key stages.
  await page.clock.install();
  await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.getByRole('button',{name:/^(FIND CHILDCARE|BACK TO YOUR OPTIONS)$/}).click();
  await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','entering');
  await expect(page.locator('.equalpath')).toHaveAttribute('inert','');
  await expect(page.locator('.entrance-curtain')).toHaveAttribute('data-artwork',artwork);
  await expect.poll(()=>page.locator('.entrance-art img').evaluate(el=>el.complete && el.naturalWidth>0)).toBe(true);
  const sample=async(time)=>page.evaluate(time=>{
    for(const animation of document.getAnimations()){
      if(['curtain-cover','curtain-reveal','landing-exit','app-entry'].includes(animation.animationName)){
        animation.pause();animation.currentTime=time;
      }
    }
    const curtain=document.querySelector('.entrance-curtain');
    const insets=getComputedStyle(curtain).clipPath.match(/[\d.]+/g).map(Number);
    return {left:insets[3]??insets[1]??insets[0],right:insets[1]??insets[0],
      landingOpacity:Number(getComputedStyle(document.querySelector('.landing')).opacity),
      overflow:document.documentElement.scrollWidth>innerWidth};
  },time);
  const cover=await sample(120);
  expect(cover.left).toBeGreaterThan(0);expect(cover.left).toBeLessThan(100);
  expect(cover.landingOpacity).toBe(1);expect(cover.overflow).toBe(false);
  await page.screenshot({path:out+`/entry-cover${suffix}.png`});
  await sample(ENTRANCE_COVER_MS);
  const composition=await page.locator('.entrance-art').boundingBox();
  expect(composition.x).toBeGreaterThanOrEqual(0);expect(composition.x+composition.width).toBeLessThanOrEqual(page.viewportSize().width);
  expect(composition.y).toBeGreaterThanOrEqual(0);expect(composition.y+composition.height).toBeLessThanOrEqual(page.viewportSize().height);
  await page.screenshot({path:out+`/entry-composition${suffix}.png`});
  const reveal=await sample(ENTRANCE_COVER_MS+110);
  expect(reveal.right).toBeGreaterThan(0);expect(reveal.right).toBeLessThan(100);
  expect(reveal.landingOpacity).toBe(0);expect(reveal.overflow).toBe(false);
  await page.screenshot({path:out+`/entry-reveal${suffix}.png`});
  await page.clock.runFor(ENTRANCE_DURATION_MS+32);
  await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','ready');
  await expect(page.locator('.entrance-curtain')).toHaveCount(0);
  await expect(page.locator('.equalpath')).not.toHaveAttribute('inert','');
  await page.screenshot({path:out+`/entry-ready${suffix}.png`});
  await page.clock.resume();
}
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
  const originalApp=await page.locator('.equalpath').elementHandle();
  await captureEntry(page);
  expect(await originalApp.evaluate(el=>el===document.querySelector('.equalpath'))).toBe(true);
  await expect(page.locator('#pickup-search')).toBeFocused();
  await page.getByRole('button',{name:'EqualPath home',exact:true}).click();
  await expect(scene).toHaveAttribute('data-opening','complete');
  await expect(scene).toHaveAttribute('data-scene-view','detail');
  await page.getByRole('button',{name:'Next artwork'}).click();
  await page.getByRole('button',{name:'Next artwork'}).click();
  await page.getByRole('button',{name:'Next artwork'}).click();
  await expect(scene).toHaveAttribute('data-artwork','grow');
  await page.setViewportSize({width:390,height:844});
  await captureEntry(page,'grow','-mobile');
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
  await expect(page.locator('.entrance-curtain')).toHaveCount(0);
});

test('Escape finishes entry on mobile and returning home preserves the current request',async({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:'no-preference'});
  // Entry must remain usable even while the optional 3D scene has not loaded.
  await page.route('**/CareScene.jsx',route=>route.abort());
  await page.goto('/');
  await page.clock.install();await page.clock.pauseAt(await page.evaluate(()=>Date.now()+1000));
  await page.getByRole('button',{name:'FIND CHILDCARE',exact:true}).click();
  await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','entering');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('.experience')).toHaveAttribute('data-intro-phase','ready');
  await expect(page.locator('.entrance-curtain')).toHaveCount(0);
  await page.locator('#pickup-search').fill('Petaling Jaya');
  await page.getByRole('button',{name:'EqualPath home',exact:true}).click();
  await page.getByRole('button',{name:'BACK TO YOUR OPTIONS',exact:true}).click();
  await page.clock.runFor(ENTRANCE_DURATION_MS+32);
  await expect(page.locator('#pickup-search')).toHaveValue('Petaling Jaya');
  await page.clock.resume();
  await expect(page.locator('#pickup-search')).toBeFocused();
  await expect(page.locator('.entrance-curtain')).toHaveCount(0);
  await page.screenshot({path:out+'/entry-mobile-ready.png'});
});
