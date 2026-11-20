import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {MarketProviders,Interpreter} from '../../src/shared/ports.ts';
import type {Execution,DeliveryReceipt} from '../../src/shared/contracts.ts';
import {context,owner,intent,quote,recipient} from '../domain/fixtures.ts';
const interpreter:Interpreter={async request(){throw Error('disabled');},async poll(r){return r;}};
const base:MarketProviders={
 async capabilities(){return context.chains;},async wallet(){return context;},async quote(){return {...quote,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120000).toISOString()};},
 async refreshBalance(_o,a){return {balanceAtoms:context.holdings.find(h=>h.asset.key===a.key)?.balanceAtoms??'0',blockNumber:'101'};},
 async prepareSteps(q){return [{id:'funding',kind:'funding',transaction:q.transaction,submittedHash:null,confirmedBlockNumber:null}];},async validateSubmission(){},
 async reconcile(){return {state:'reconciliation_required',receipt:null,warnings:['No evidence']};}
};
function proof(e:Execution):DeliveryReceipt{return {executionId:e.id,outcome:'delivered',recipient:e.intent.recipient,asset:e.intent.targetAsset,requestedAtoms:'50000000',receivedAtoms:'50000000',sourceHash:e.sourceHash!,destinationHash:e.sourceHash,destinationBlockHash:'0x'+'b'.repeat(64),destinationBlockNumber:'123',proofLevel:'onchain',routeAttribution:'direct',networkFeeAtoms:'1000',networkFeeAsset:context.chains[0].nativeAsset,observedAt:new Date().toISOString(),warnings:[]};}
test('delivery requires matching recipient evidence and releases reservations only after proof',async()=>{
 const repository=await createRepository('memory://');
 try{
  let wrong=true;
  const providers={...base,async reconcile(e:Execution){return {state:'delivered' as const,receipt:{...proof(e),recipient:wrong?owner:recipient},warnings:[]};}};
  const s=createService({repository,providers,interpreter});
  const plan=await s.createPlan(owner,{...intent,policy:{...intent.policy,maxSourceSpendAtoms:'50000000'}});
  const candidate=plan.candidates.find(c=>c.eligible)!;
  const e=await s.prepareAction(owner,plan.id,candidate.id,1,'delivered',true);
  await assert.rejects(s.reportSubmission(owner,e.id,'funding','0x123',e.version));
  await assert.rejects(s.reportSubmission(owner,e.id,'funding','0x'+'a'.repeat(64),99));
  const sent=await s.reportSubmission(owner,e.id,'funding','0x'+'a'.repeat(64),e.version);
  assert.equal((await s.reportSubmission(owner,e.id,'funding',sent.sourceHash!,1)).version,sent.version);
  assert.equal((await s.observeExecution(owner,e.id)).state,'reconciliation_required');
  assert.equal((await repository.reserved(owner)).length,2);
  wrong=false;
  assert.equal((await s.observeExecution(owner,e.id)).state,'delivered');
  assert.equal((await repository.reserved(owner)).length,0);
  assert.equal((await s.getReceipt(owner,e.id))?.receivedAtoms,'50000000');
  assert.equal((await s.observeExecution(owner,e.id)).state,'delivered');
  assert.equal((await s.getActionableUpdates(owner)).length,0);
  await assert.rejects(s.observeExecution(recipient,e.id));
 }finally{await repository.close();}
});
test('agent caps, quote expiry and missing current funds fail before signing',async()=>{
 const repository=await createRepository('memory://');try{
  const s=createService({repository,providers:base,interpreter});
  const plan=await s.createPlan(owner,intent);const c=plan.candidates.find(c=>c.eligible)!;
  await assert.rejects(s.prepareAction(owner,plan.id,c.id,1,'agent',true),/cap/i);
  await assert.rejects(s.prepareAction(owner,'missing',c.id,1,'x'));
  await assert.rejects(s.prepareAction(owner,plan.id,c.id,99,'x'));
  const noFunds=createService({repository,providers:{...base,async refreshBalance(){return {balanceAtoms:'0',blockNumber:'102'};}},interpreter});
  await assert.rejects(noFunds.prepareAction(owner,plan.id,c.id,1,'no-funds'));
  const expired=createService({repository,providers:{...base,async quote(){return {...quote,expiresAt:'2020-01-01T00:00:00Z'};}},interpreter});
  const old=await expired.createPlan(owner,intent);
  await assert.rejects(expired.prepareAction(owner,old.id,old.candidates[0].id,1,'old'));
 }finally{await repository.close();}
});
