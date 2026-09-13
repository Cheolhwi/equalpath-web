import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {parsePublishedAge,referenceAgeFor} from '../shared/published-ages.mjs';
import {checkAge,assess,enquiries} from '../shared/conditions.mjs';
import {demoPickup} from '../server/fixtures.mjs';
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
test('official age ranges are confirmed without counting an unselected child age as a passed fit',()=>{
 for(const category of ['TASKA','TADIKA']){
  const c=checkAge(referenceAgeFor(category),{age:''});
  assert.equal(c.state,'reference');assert.equal(c.statusLabel,'Confirmed range');assert.equal(c.requestMatch,'not_selected');assert.equal(c.question,null);
  assert.match(c.reason,/Official type age range/);assert.equal(c.source.kind,'type_reference');
 }
 const p=normalizeProvider(raw,'test').provider;
 assert.equal(p.age.rangeLabel,'4–6 years');assert.equal(p.age.basis,'type_reference');
 const request={pickup:demoPickup,date:'2026-09-14',deadline:'13:00',end:'17:00',age:'',transport:'self'};
 const fit=assess(p,request);
 assert.equal(fit.counts.reference,1);assert.equal(fit.counts.supported,3);assert.equal(fit.counts.unknown,3);
 assert.equal(enquiries(p,request,fit).some(q=>q.id==='age'),false);
 assert.equal(fit.conditions.find(c=>c.id==='admission').state,'unknown');
});
test('a selected age matches the official type range with correct TASKA and TADIKA boundaries',()=>{
 for(const [category,age,expected] of [['TASKA','0',true],['TASKA','3',true],['TASKA','4',false],['TADIKA','3',false],['TADIKA','4',true],['TADIKA','6',true],['TADIKA','7',false]]){
  const c=checkAge(referenceAgeFor(category),{age});
  assert.equal(c.state,expected?'supported':'conflict',`${category}/${age}`);
  assert.equal(c.statusLabel,expected?'Confirmed range':'Outside type range');assert.equal(c.basis,'type_reference');
  assert.equal(c.requestMatch,expected?'within_type_range':'outside_type_range');
 }
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
