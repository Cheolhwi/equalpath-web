import { readFileSync } from 'node:fs';
const payload=JSON.parse(readFileSync(new URL('./data/review-profiles.json',import.meta.url),'utf8'));
export function applyReviewProfiles(catalog) {
  return {...catalog,items:catalog.items.map(p=>payload.providers[p.id]?{...p,reviewProfile:{...payload.providers[p.id],asOf:payload.asOf,classifier:payload.classifier}}:p)};
}
