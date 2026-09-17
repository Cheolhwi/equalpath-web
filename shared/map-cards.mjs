const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const overlap = (a, b, gap = 10) => Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width) - Math.max(a.x - gap, b.x)) * Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height) - Math.max(a.y - gap, b.y));

// Keep the chosen side/offset while the camera moves. Clamp at viewport edges
// instead of choosing a different candidate on every animation frame.
export function followMapCard(previous, point, { width, height, top, bottom, cardWidth, cardHeight }) {
  const x = clamp(point.x + previous.x - previous.point.x, 12, Math.max(12, width - cardWidth - 12));
  const y = clamp(point.y + previous.y - previous.point.y, top, Math.max(top, height - bottom - cardHeight));
  return { x, y, width: cardWidth, height: cardHeight, point,
    anchor: { x: clamp(point.x, x, x + cardWidth), y: clamp(point.y, y, y + cardHeight) } };
}

// Cards remain tied to geographic points. Try nearby positions before using
// free space elsewhere in the viewport; leader lines keep dense points clear.
export function placeMapCards(points, { width, height, top = 126, bottom = 50, cardWidth = 252, cardHeight = 128, pins = points }) {
  const left = 12, right = Math.max(left, width - cardWidth - 12);
  const maxY = Math.max(top, height - bottom - cardHeight);
  const orders = points.length === 3 ? [[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]] : points.length === 2 ? [[0,1],[1,0]] : [points.map((_, i) => i)];
  let result = [], resultScore = Infinity;
  for (const order of orders) {
    const placed = [];
    let total = 0;
    for (const index of order) {
    const point = points[index];
    const candidates = [
      [point.x - cardWidth / 2, point.y - cardHeight - 28],
      [point.x + 30, point.y - cardHeight / 2],
      [point.x - cardWidth - 30, point.y - cardHeight / 2],
      [point.x - cardWidth / 2, point.y + 30],
    ];
    // Fill gaps near cards that are already placed, as well as the viewport grid.
    for (const rect of placed) {
      candidates.push([rect.x, rect.y + cardHeight + 10], [rect.x, rect.y - cardHeight - 10]);
    }
    for (let row = 0; row <= 4; row++)
      for (let col = 0; col <= 4; col++) candidates.push([left + (right - left) * col / 4, top + (maxY - top) * row / 4]);
    let best, bestScore = Infinity;
    for (const [x, y] of candidates) {
      const rect = { x: clamp(x, left, right), y: clamp(y, top, maxY), width: cardWidth, height: cardHeight };
      const anchor = { x: clamp(point.x, rect.x, rect.x + rect.width), y: clamp(point.y, rect.y, rect.y + rect.height) };
      const hidesOwnPin = point.x > rect.x - 23 && point.x < rect.x + rect.width + 23 && point.y > rect.y - 23 && point.y < rect.y + rect.height + 23;
      const obscuredPins = pins.filter(p => p.x > rect.x - 23 && p.x < rect.x + rect.width + 23 && p.y > rect.y - 23 && p.y < rect.y + rect.height + 23).length;
      const score = placed.reduce((n, p) => n + overlap(rect, p), 0) * 10000 + (hidesOwnPin ? 1000000 : 0) + obscuredPins * 1800 + Math.hypot(anchor.x - point.x, anchor.y - point.y);
      if (score < bestScore) { best = { ...rect, anchor, point }; bestScore = score; }
    }
    placed.push(best);
    total += bestScore;
    }
    if (total < resultScore) { result = placed; resultScore = total; }
  }
  // Dense points can make a greedy first choice block the only three usable
  // rows. Fall back to a complete stack when there is room for all cards.
  if (result.some((a, i) => result.slice(i + 1).some(b => overlap(a, b, 0) > 0)) && maxY - top >= (points.length - 1) * (cardHeight + 10)) {
    result = [...points].sort((a, b) => a.y - b.y).map((point, i) => {
      const x = clamp(point.x - cardWidth / 2, left, right);
      const y = top + (maxY - top) * i / Math.max(1, points.length - 1);
      return { x, y, width: cardWidth, height: cardHeight, point, anchor: { x: clamp(point.x, x, x + cardWidth), y: clamp(point.y, y, y + cardHeight) } };
    });
  }
  // Wider action cards may fit across a short desktop viewport even when a
  // vertical stack cannot. Retain point anchors instead of overlapping cards.
  const columns = Math.min(points.length, Math.floor((width - 14) / (cardWidth + 10)));
  const rows = columns ? Math.ceil(points.length / columns) : 0;
  if (rows && result.some((a, i) => result.slice(i + 1).some(b => overlap(a, b, 0) > 0)) && height - bottom - top >= rows * cardHeight + (rows - 1) * 10) {
    const ordered = [...points].sort((a, b) => a.y - b.y);
    result = [];
    for (let row = 0; row < rows; row++) {
      const group = ordered.slice(row * columns, (row + 1) * columns).sort((a, b) => a.x - b.x);
      const y = rows === 1 ? clamp(group.reduce((n, p) => n + p.y, 0) / group.length - cardHeight - 28, top, maxY) : top + (maxY - top) * row / (rows - 1);
      group.forEach((point, i) => {
        const x = group.length === 1 ? clamp(point.x - cardWidth / 2, left, right) : left + (right - left) * i / (group.length - 1);
        result.push({ x, y, width: cardWidth, height: cardHeight, point, anchor: { x: clamp(point.x, x, x + cardWidth), y: clamp(point.y, y, y + cardHeight) } });
      });
    }
  }
  return points.map(point => result.find(p => p.point === point));
}
