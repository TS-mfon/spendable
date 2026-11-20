import test from 'node:test';
import assert from 'node:assert/strict';
import { parseIntent, candidateDebits, rankCandidate } from '../../src/domain/index.ts';
import { context, intent, quote } from './fixtures.ts';
test('canonical intent rejects imprecise amounts and wrong owners',()=>{
 assert.equal(parseIntent(intent.owner,intent).amount,'50');
 assert.throws(()=>parseIntent(intent.owner,{...intent,amount:'1e3'}));
 assert.throws(()=>parseIntent(intent.owner,{...intent,owner:'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}));
 assert.throws(()=>parseIntent(intent.owner,{...intent,amountMode:'spend_token',sourceAssetKey:null}));
});
test('candidate reserves source and native fees without double-counting included fees',()=>{
 const c=rankCandidate(quote,context,intent,[]);
 assert.equal(c.totalSpendUsd,'50.002');
 assert.equal(c.eligible,true);
 assert.deepEqual(candidateDebits(c,context).map(x=>[x.assetKey,x.amountAtoms]),[['1:usdc','50000000'],['1:native','1000000000000']]);
});
test('candidate rejects insufficient funds after active reservations and missing fee prices',()=>{
 const c=rankCandidate(quote,context,intent,[{assetKey:'1:usdc',amountAtoms:'60000000',observedBalanceAtoms:'100000000',observedBlockNumber:null}]);
 assert.equal(c.eligible,false);assert.ok(c.reasons.some(x=>x.includes('balance')));
 assert.equal(rankCandidate(quote,{...context,prices:[]},intent,[]).eligible,false);
});
