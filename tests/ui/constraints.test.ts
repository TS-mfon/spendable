import test from 'node:test';import assert from 'node:assert/strict';
import {createIntentInput} from '../../web/model.ts';import {token,owner,recipient} from '../../e2e/fixtures.ts';
test('accepted interpretation retains every deterministic spending constraint',()=>{
 const fields={operation:'pay' as const,recipient,amount:'50',amountMode:'receive_token' as const,currency:'USD',sourceAssetKey:token.key,maxFeeUsd:'1.25',maxSlippageBps:'35',maxSourceSpendAtoms:'55000000',maxPriceImpactBps:'125',gasReserveAtoms:'1000'};
 const intent=createIntentInput(fields,token,owner,'consensus1');
 assert.deepEqual(intent.policy,{maxSlippageBps:35,maxPriceImpactBps:125,maxSourceSpendAtoms:'55000000',maxFeeUsd:'1.25',gasReserveAtoms:'1000'});
 assert.equal(intent.interpretationId,'consensus1');
});
test('invalid canonical caps do not silently become unlimited',()=>{
 const fields={operation:'pay' as const,recipient,amount:'50',amountMode:'receive_token' as const,currency:'USD',sourceAssetKey:token.key,maxFeeUsd:'1',maxSlippageBps:'50'};
 assert.throws(()=>createIntentInput({...fields,maxSourceSpendAtoms:'-1'},token,owner));
 assert.throws(()=>createIntentInput({...fields,maxPriceImpactBps:'Infinity'},token,owner));
 assert.throws(()=>createIntentInput({...fields,gasReserveAtoms:'1e3'},token,owner));
});
