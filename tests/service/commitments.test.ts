import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {Execution,DeliveryReceipt} from '../../src/shared/contracts.ts';
import {context,intent,owner} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
test('simultaneous preparations cannot sign competing nonces or reuse a balance predating settlement',async()=>{
 const repository=await createRepository('memory://');
 try{
  let hold=false;let entered:()=>void=()=>{};let release:()=>void=()=>{};
  const started=new Promise<void>(r=>{entered=r;}),finish=new Promise<void>(r=>{release=r;});
  const p={...providers,
   async prepareSteps(q:Parameters<typeof providers.prepareSteps>[0]){
    if(hold){entered();await finish;}
    return [{id:'funding',kind:'funding' as const,transaction:{...q.transaction,nonce:hold?1:0},submittedHash:null,confirmedBlockNumber:null}];
   },
   async reconcile(e:Execution){
    const receipt:DeliveryReceipt={executionId:e.id,outcome:'delivered',recipient:e.intent.recipient,asset:e.intent.targetAsset,requestedAtoms:'50000000',receivedAtoms:'50000000',sourceHash:e.sourceHash!,destinationHash:e.sourceHash,destinationBlockHash:'0x'+'b'.repeat(64),destinationBlockNumber:'102',proofLevel:'onchain',routeAttribution:'direct',networkFeeAtoms:'1000',networkFeeAsset:context.chains[0].nativeAsset,observedAt:new Date().toISOString(),warnings:[]};
    return {state:'delivered' as const,receipt,warnings:[],steps:e.steps.map(s=>({...s,confirmedBlockNumber:'102'}))};
   }
  };
  const s=createService({repository,providers:p,interpreter});
  const plan=await s.createPlan(owner,intent),c=plan.candidates.find(c=>c.eligible)!;
  const results=await Promise.allSettled(['a','b'].map(key=>s.prepareAction(owner,plan.id,c.id,1,key)));
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);
  const rejected=results.find(r=>r.status==='rejected')! as PromiseRejectedResult;
  assert.equal(rejected.reason.code,'NONCE_RESERVED');
  const index=results.findIndex(r=>r.status==='fulfilled'),first=(results[index] as PromiseFulfilledResult<Execution>).value;
  assert.equal((await s.prepareAction(owner,plan.id,c.id,1,['a','b'][index])).id,first.id);
  await s.reportSubmission(owner,first.id,'funding','0x'+'a'.repeat(64),1);
  hold=true;
  const stale=s.prepareAction(owner,plan.id,c.id,1,'late-snapshot');
  const rejectedStale=assert.rejects(stale,(error:unknown)=>error instanceof Error&&'code'in error&&error.code==='STALE_BALANCE');
  await started;
  assert.equal((await s.observeExecution(owner,first.id)).state,'delivered');
  release();await rejectedStale;
 }finally{await repository.close();}
});
