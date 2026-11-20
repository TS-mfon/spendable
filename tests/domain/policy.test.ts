import test from 'node:test';
import assert from 'node:assert/strict';
import {amountToAtoms,atoms,decimal,formatAtoms,rankCandidate,livePrice,fresh} from '../../src/domain/index.ts';
import {context,intent,quote,token} from './fixtures.ts';
test('a source spending cap includes excluded fees in that same token',()=>{
 const q={...quote,fees:[...quote.fees,{kind:'protocol' as const,name:'Route fee',asset:token,amountAtoms:'1000000',maxAmountAtoms:'1000000',includedInInput:false}]};
 const c=rankCandidate(q,context,{...intent,policy:{...intent.policy,maxFeeUsd:'2',maxSourceSpendAtoms:'50000000'}},[]);
 assert.equal(c.eligible,false);assert.ok(c.reasons.includes('Source spend exceeds your limit.'));
});
test('decimal and atomic boundaries reject negative, exponential and unsupported precision',()=>{
 for(const x of ['-1','1e2','01','NaN',''])assert.throws(()=>decimal(x));
 for(const x of ['-1','1.0','01','1e5'])assert.throws(()=>atoms(x));
 assert.throws(()=>amountToAtoms('1',37));assert.throws(()=>amountToAtoms('0',18));
 assert.equal(amountToAtoms('123456789012345678901234567890.123456789012345678',18),'123456789012345678901234567890123456789012345678');
 assert.equal(formatAtoms('1',0),'1');assert.equal(formatAtoms('0',18),'0');
 assert.equal(fresh('invalid'),false);assert.equal(fresh('2020-01-01T00:00:00Z'),false);
 assert.throws(()=>livePrice({...context,prices:context.prices.map(p=>({...p,usd:'0'}))},token.key));
});
test('candidate rejects identity mismatches, expired quotes and fee bounds below estimates',()=>{
 for(const q of [{...quote,recipient:intent.owner},{...quote,transaction:{...quote.transaction,chainId:8453}},{...quote,expiresAt:'2020-01-01T00:00:00Z'},{...quote,fees:quote.fees.map(f=>({...f,maxAmountAtoms:'0'}))},{...quote,provider:'lifi' as const,priceImpactBps:null},{...quote,priceImpactBps:999}]){
  assert.equal(rankCandidate(q,context,intent,[]).eligible,false);
 }
});
