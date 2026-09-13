import test from 'node:test';
import assert from 'node:assert/strict';
import {listingFeeFacts} from '../shared/listing-fees.mjs';
import {feeSummary,formatFee} from '../shared/result-summary.mjs';
const evidence={source_url:'https://www.kiddy123.com/listing/test/',source_retrieved_at:'2026-09-13T00:00:00Z'};
test('listing fees split registration from term fees and retain the published period',()=>{
  const fees=listingFeeFacts('Registration: RM1,000\nFrom RM5,850 - RM7,800 per term',evidence);
  assert.equal(fees.length,2);assert.equal(fees[0].kind,'registration');assert.equal(fees[0].basis,'one_off');
  assert.equal(fees[1].basis,'term');assert.equal(feeSummary({fees}).label,'MYR 5,850–7,800 / term');
});
test('starting prices remain open ended, including Malay fee wording',()=>{
  for(const wording of ['Starting from RM1,600','Yuran bulanan bermula RM1,600']){
    const [f]=listingFeeFacts(wording,evidence);assert.equal(f.min,1600);assert.equal(f.amount,null);assert.equal(f.max,null);
    assert.match(formatFee(f),/^From MYR 1,600/);assert.match(feeSummary({fees:[f]}).label,/^From MYR 1,600/);
  }
  assert.equal(feeSummary({fees:[{min:600,basis:'month'},{min:700,basis:'month'}]}).label,'From MYR 600 / month');
});
test('a range without a billing period does not become a monthly fee',()=>{
  const [f]=listingFeeFacts('RM800 - RM1,000',evidence);assert.equal(f.basis,'unspecified');
  assert.equal(formatFee(f),'MYR 800–1,000 · period not listed');assert.match(f.conditions,/Billing period is not stated/);
});
test('placeholder, non-currency amounts and reversed ranges are excluded',()=>{
  for(const s of ['<input placeholder="RM450">','W5L0048','Phone 012-3456789','RM900 - RM300'])assert.deepEqual(listingFeeFacts(s,evidence),[]);
});
test('MAIWP eligibility rates are a range and registration is additional',()=>{
  const fees=[20,50,80].map(amount=>({amount,basis:'month',programme:'Eligibility category'}));
  fees.push({amount:50,basis:'one_off',kind:'registration'});
  assert.equal(feeSummary({fees}).label,'MYR 20–80 / month');
});
