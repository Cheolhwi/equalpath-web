import test from "node:test";
import assert from "node:assert/strict";
import { TOUR_KEY, tourSeen, saveTour, tourPlacement } from "../shared/tour.mjs";
test("only completion/skip suppress first-visit tour, without persisting example inputs", () => {
  let data;
  const storage = { getItem: () => data, setItem: (key, value) => { assert.equal(key, TOUR_KEY); data = value; } };
  assert.equal(tourSeen(storage),false);
  assert.equal(saveTour(storage,"completed"),true);assert.equal(tourSeen(storage),true);
  assert.deepEqual(JSON.parse(data),{version:1,status:"completed"});
  assert.equal(saveTour(storage,"skipped"),true);assert.equal(tourSeen(storage),true);
  data='bad';assert.equal(tourSeen(storage),false);
  data=JSON.stringify({version:2,status:"completed"});assert.equal(tourSeen(storage),false);
  assert.equal(saveTour(storage,"pending"),false);
  assert.equal(saveTour({setItem:()=>{throw Error();}},"skipped"),false);
});
test("tour cards remain inside small screens, zoomed layouts, and tall content", () => {
  for(const viewport of [{width:320,height:568},{width:390,height:844},{width:720,height:500},{width:1440,height:1000}]) {
    for (const h of [250,410,820]) for(const target of [null,{left:30,top:130,right:400,bottom:350},{left:15,top:90,right:1200,bottom:900}]) {
      const p=tourPlacement(target,viewport,h);
      assert.ok(p.left>=16 && p.top>=16);assert.ok(p.left+p.width<=viewport.width-16);
      assert.ok(p.top+Math.min(h,viewport.height-32)<=viewport.height-16);
    }
  }
});
