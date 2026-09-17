import test from "node:test";
import assert from "node:assert/strict";
import { followMapCard, placeMapCards } from "../shared/map-cards.mjs";

for (const [width, height] of [[1280, 720], [700, 850]]) test(`${width}px: full action cards remain separate when a vertical stack cannot fit`, () => {
  const points = [1, 2, 3].map(id => ({ id, x: width / 2, y: height * .75 }));
  const cards = placeMapCards(points, { width, height, top: 296, bottom: 96, cardWidth: 304, cardHeight: 190 });
  for (const a of cards) {
    assert.ok(a.x >= 12 && a.x + a.width <= width - 12);
    assert.ok(a.y >= 296 && a.y + a.height <= height - 96);
    for (const b of cards.filter(b => b !== a)) assert.ok(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
});

for (const [width, height, cardWidth, cardHeight] of [[320, 730, 222, 116], [390, 730, 222, 116], [1440, 812, 264, 132]]) {
  test(`${width}px: three coincident points keep readable cards on screen`, () => {
    const points = [1, 2, 3].map(id => ({ id, x: width / 2, y: height / 2 }));
    const cards = placeMapCards(points, { width, height, cardWidth, cardHeight });
    for (const card of cards) {
      assert.ok(card.x >= 12 && card.x + card.width <= width - 12);
      assert.ok(card.y >= 126 && card.y + card.height <= height - 50);
      assert.equal(card.point, points[cards.indexOf(card)]);
      for (const other of cards.filter(c => c !== card))
        assert.ok(card.x + card.width <= other.x || other.x + other.width <= card.x || card.y + card.height <= other.y || other.y + other.height <= card.y);
    }
  });
}

test("a tall search dock and coincident points leave three separate card rows", () => {
  const points = [1, 2, 3].map(id => ({ id, x: 195, y: 510 }));
  const cards = placeMapCards(points, { width: 330, height: 780, top: 272, bottom: 96, cardWidth: 238, cardHeight: 124 });
  for (const a of cards) for (const b of cards.filter(b => b !== a)) {
    assert.ok(a.y + a.height <= b.y || b.y + b.height <= a.y);
  }
});

test("a selected card keeps its side as closely spaced pins move through the viewport", () => {
  const options = { width: 927, height: 895, top: 216, bottom: 96, cardWidth: 284, cardHeight: 142 };
  const start = { id: 1, x: 340, y: 620 };
  const offsets = [[0,0],[37,-32],[-14,-200],[73,-254],[-487,-67],[-486,-171],[-503,-166],[-130,370],[-613,-52]];
  const origin = placeMapCards([start], { ...options, pins: offsets.map(([x,y]) => ({ x: start.x+x, y: start.y+y })) })[0];
  for (let i = 0; i < 100; i++) {
    const point = { id: 1, x: start.x+i*1.235, y: start.y-i*1.275 };
    const card = followMapCard(origin, point, options);
    assert.ok(Math.abs((card.x-point.x) - (origin.x-start.x)) < .001);
    assert.ok(Math.abs((card.y-point.y) - (origin.y-start.y)) < .001);
  }
  const edge = followMapCard(origin, { id: 1, x: 10, y: 220 }, options);
  assert.equal(edge.x, 12); assert.equal(edge.y, options.top);
});
