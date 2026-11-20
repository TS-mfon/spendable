import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {context,intent,owner,quote,token} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
test('service distinguishes token spending, fiat receipt and all-in fiat budget',async()=>{
 const repository=await createRepository('memory://');
 try{
  const p={...providers,async quote(request:Parameters<typeof providers.quote>[0]){
   const amount=request.fromAmountAtoms;
   return {...quote,sourceAsset:request.source,fromAmountAtoms:amount,toAmountAtoms:amount,minimumOutputAtoms:amount};
  }};
  const s=createService({repository,providers:p,interpreter});
  for(const amountMode of ['receive_token','receive_fiat','spend_token'] as const){
   const plan=await s.createPlan(owner,{...intent,sourceAssetKey:token.key,amountMode});
   assert.equal(plan.state,'quoted');assert.equal(plan.candidates[0].quote.fromAmountAtoms,'50000000');
  }
  const budget=await s.createPlan(owner,{...intent,sourceAssetKey:token.key,amountMode:'spend_fiat',amount:'50.01'});
  assert.equal(budget.state,'quoted');assert.equal(budget.candidates[0].totalSpendUsd,'50.01');assert.equal(budget.candidates[0].quote.fromAmountAtoms,'50008000');
  const missingCurrency=await s.createPlan(owner,{...intent,sourceAssetKey:token.key,amountMode:'spend_fiat',currency:'EUR'});
  assert.equal(missingCurrency.state,'unavailable');assert.match(missingCurrency.warnings.join(' '),/currency/);
  const alwaysOver=createService({repository,providers:{...providers,async quote(){return {...quote,fromAmountAtoms:'100000000'};}},interpreter});
  const over=await alwaysOver.createPlan(owner,{...intent,sourceAssetKey:token.key,amountMode:'spend_fiat',amount:'50'});
  assert.equal(over.candidates[0].eligible,false);
  const fail=createService({repository,providers:{...providers,async quote(){throw Error('secret-provider-body');}},interpreter});
  const unavailable=await fail.createPlan(owner,intent);
  assert.equal(unavailable.state,'unavailable');assert.ok(!unavailable.warnings.join(' ').includes('secret-provider-body'));
  const renamed=await s.createPlan(owner,{...intent,targetAsset:{...token,symbol:'WBTC',name:'Mislabelled'}});
  assert.equal(renamed.intent.targetAsset.symbol,'USDC');assert.equal(renamed.intent.targetAsset.name,'USD Coin');
  const swap=createService({repository,providers:{...p,async quote(request){
   const out=request.targetAmountAtoms??request.fromAmountAtoms;
   return {...quote,provider:'lifi',owner,recipient:owner,sourceAsset:request.source,fromAmountAtoms:request.fromAmountAtoms,toAmountAtoms:out,minimumOutputAtoms:out};
  }},interpreter});
  const swapped=await swap.createPlan(owner,{...intent,operation:'swap',recipient:owner});
  assert.ok(swapped.candidates.some(c=>c.eligible));
  assert.ok(swapped.candidates.every(c=>c.quote.sourceAsset.key!==token.key));
  const unsupported=createService({repository,providers:{...providers,async wallet(){return {...context,chains:context.chains.map(c=>({...c,verification:false}))};}},interpreter});
  await assert.rejects(unsupported.createPlan(owner,intent),/verification/);
  const spoof=createService({repository,providers:{...providers,async wallet(){return {...context,wallet:intent.recipient};}},interpreter});
  await assert.rejects(spoof.createPlan(owner,intent),/wallet/);
 }finally{await repository.close();}
});
