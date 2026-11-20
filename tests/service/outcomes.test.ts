import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {DeliveryReceipt,Execution} from '../../src/shared/contracts.ts';
import {context,intent,owner,quote} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
test('receipts distinguish under-delivery, refunds and a reverted source transaction',async()=>{
 const repository=await createRepository('memory://');
 try{
  let outcome:Execution['state']='delivered',mode='unverified';
  const p={...providers,async reconcile(e:Execution){
   const receipt:DeliveryReceipt={executionId:e.id,outcome:outcome==='partial_delivery'?'partial':outcome==='refunded'?'refunded':outcome==='source_reverted'?'reverted':'delivered',recipient:outcome==='refunded'?owner:e.intent.recipient,asset:outcome==='refunded'?e.candidate.quote.sourceAsset:e.intent.targetAsset,requestedAtoms:e.candidate.quote.minimumOutputAtoms,receivedAtoms:outcome==='partial_delivery'?'1':e.candidate.quote.minimumOutputAtoms,sourceHash:e.sourceHash!,destinationHash:e.sourceHash,destinationBlockHash:'0x'+'b'.repeat(64),destinationBlockNumber:'11',proofLevel:mode==='unverified'?'provider':'onchain',routeAttribution:'direct',networkFeeAtoms:null,networkFeeAsset:null,observedAt:new Date().toISOString(),warnings:[]};
   return {state:outcome,receipt,warnings:[]};
  }};
  const s=createService({repository,providers:p,interpreter});
  for(const expected of ['partial_delivery','refunded','source_reverted'] as const){
   const plan=await s.createPlan(owner,intent),candidate=plan.candidates.find(c=>c.eligible)!;
   const e=await s.prepareAction(owner,plan.id,candidate.id,1,expected);
   await s.reportSubmission(owner,e.id,'funding','0x'+'a'.repeat(64),1);
   if(expected==='partial_delivery'){assert.equal((await s.observeExecution(owner,e.id)).state,'reconciliation_required');assert.equal((await repository.reserved(owner)).length,2);}
   outcome=expected;mode='onchain';
   assert.equal((await s.observeExecution(owner,e.id)).state,expected);
   assert.equal((await repository.reserved(owner)).length,0);
  }
  const native=context.chains[0].nativeAsset;
  const nativeProviders={...providers,async quote(req:Parameters<typeof providers.quote>[0]){
   if(req.source.key!==native.key)throw Error('No direct source');
   return {...quote,sourceAsset:native,targetAsset:native,fromAmountAtoms:req.fromAmountAtoms,toAmountAtoms:req.fromAmountAtoms,minimumOutputAtoms:req.fromAmountAtoms,transaction:{...quote.transaction,to:intent.recipient,data:'0x' as const,value:req.fromAmountAtoms,gasLimit:'21000'}};
  }};
  const n=createService({repository,providers:nativeProviders,interpreter});
  const plan=await n.createPlan(owner,{...intent,targetAsset:native,sourceAssetKey:native.key,amount:'0.001'});
  const e=await n.prepareAction(owner,plan.id,plan.candidates[0].id,1,'native');
  assert.equal(e.steps[0].transaction.value,'1000000000000000');
 }finally{await repository.close();}
});
