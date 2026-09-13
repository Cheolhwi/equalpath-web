import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parsePublishedAge,referenceAgeFor} from '../shared/published-ages.mjs';
import {checkAge} from '../shared/conditions.mjs';
import {normalizeProvider} from '../server/providers.mjs';
import {applyServicesEvidence} from '../server/services-overlay.mjs';
const raw={id:'age-test',display_name:'Test',official_name:'Test',state:'Selangor',district:'Petaling',registration:{authority:'KPM',source_url:'https://example.com/branch'},operating_hours:{},fees:[]};
const hash=rows=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
const record={provider_id:raw.id,base_release:'test',match:{status:'matched'},source_url:'https://www.kiddy123.com/listing/test',source_kind:'kiddy123_directory',observed_on:'2026-09-13T00:00:00Z',whatsapp:[],age:{raw:'2 bulan - 6 tahun',min_months:2,max_months:72}};
test('Malay and English admission fields convert years and months without confusing mixed units',()=>{
 for(const [text,min,max] of [['3-6 tahun',36,72],['2 bulan - 6 tahun',2,72],['3.5 tahun hingga 6 tahun',42,72],['Umur: 5 bulan sehingga 6 tahun',5,72],['18 months - 6 years old',18,72],['3 months - 6 years old (Infant Care: 3 - 18 months old)',3,72]]){
  const p=parsePublishedAge(text);assert.equal(p.min,min,text);assert.equal(p.max,max,text);assert.equal(p.raw,text);
 }
 assert.equal(parsePublishedAge('di bawah umur 4 tahun').maxInclusive,false);
 for(const text of ['RM 300 - 600','2020 - 2026','6 - 2 tahun','2 - 30 tahun','3 tahun; 7 tahun','ages unknown','phone 0123456789'])assert.equal(parsePublishedAge(text),null,text);
});
test('type references fill missing display ranges but never claim branch age acceptance or rejection',()=>{
 for(const category of ['TASKA','TADIKA'])for(const age of ['', '0', '3','4','6','12']){
  const p=referenceAgeFor(category),c=checkAge(p,{age});
  assert.equal(c.state,'unknown');assert.match(c.reason,/Type reference/);assert.equal(c.source.kind,'type_reference');
 }
 const p=normalizeProvider(raw,'test').provider;
 assert.equal(p.age.rangeLabel,'4–6 years');assert.equal(p.age.basis,'type_reference');
});
test('matched admission evidence takes precedence over type defaults and retains its original source',()=>{
 const updated=applyServicesEvidence([raw],[record],'test',hash([record]))[0];
 const p=normalizeProvider(updated,'test').provider;
 assert.equal(p.age.min,2);assert.equal(p.age.max,72);assert.equal(p.age.basis,'published');
 assert.equal(p.age.wording,'2 months–6 years');assert.equal(p.age.originalWording,record.age.raw);
 assert.equal(p.age.source.url,record.source_url);assert.equal(p.age.source.retrievedAt,record.observed_on);
 assert.match(checkAge(p.age,{age:''}).reason,/2 months–6 years/);
 const bad={...record,age:{...record.age,min_months:24}};
 assert.throws(()=>applyServicesEvidence([raw],[bad],'test',hash([bad])),/Invalid admission age/);
});
test('different branch age sources are preserved and cannot silently replace one another',()=>{
 const original={...raw,age_min_months:48,age_max_months:72,age_source:{raw:'4-6 tahun',source_url:'https://example.com/branch'}};
 const p=normalizeProvider(applyServicesEvidence([original],[record],'test',hash([record]))[0],'test').provider;
 assert.equal(p.age.min,48);assert.equal(p.age.alternative.min,2);
 assert.equal(checkAge(p.age,{age:'4'}).state,'unknown');
 assert.match(checkAge(p.age,{age:'4'}).reason,/another source/);
});
