import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const photos=JSON.parse(readFileSync(new URL('../src/surroundings.json',import.meta.url)));
const evidence=JSON.parse(readFileSync(new URL('../evidence/surroundings-capture-dates.json',import.meta.url)));
test('each published capture date matches its observed panorama, including all directions',()=>{
 assert.equal(evidence.records.length,92);
 for(const record of evidence.records){
  const photo=photos[record.provider_id];
  assert.match(record.captureDate,/^\d{4}-(0[1-9]|1[0-2])$/);
  assert.equal(photo.captureDate,record.captureDate);
  assert.equal(photo.panoramaId,record.panorama_id);
  assert.ok(decodeURIComponent(photo.captureDateSource).includes(record.panorama_id));
  assert.equal(photo.images.length,3);
  for(const image of photo.images)assert.equal(image.captureDate,record.captureDate);
 }
});
