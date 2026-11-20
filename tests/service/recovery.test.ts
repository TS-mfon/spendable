import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,erc20Abi} from 'viem';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {Execution} from '../../src/shared/contracts.ts';
import {context,intent,owner,quote,execution} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
const spender='0xdddddddddddddddddddddddddddddddddddddddd' as const;
test('changed or unavailable post-approval terms stay blocked across successive observations',async()=>{
 for(const failure of ['changed','unavailable']){
 const repository=await createRepository('memory://');try{
  let changed=false,outage=false;
  const routed={...providers,
   async quote(){if(outage)throw Error('Provider unavailable');return {...quote,provider:'lifi' as const,approvalAddress:spender,minimumOutputAtoms:changed?'50000001':'50000000',fees:[...quote.fees,{...quote.fees[0],kind:'approval' as const,name:'Approval gas'}]};},
   async prepareSteps(q:typeof quote){return [{id:'approval',kind:'approval' as const,transaction:{...q.transaction,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[spender,50000000n]}),nonce:0},submittedHash:null,confirmedBlockNumber:null},{id:'funding',kind:'funding' as const,transaction:{...q.transaction,nonce:1},submittedHash:null,confirmedBlockNumber:null}];},
   async reconcile(e:Execution){return {state:'awaiting_signature' as const,receipt:null,warnings:[],steps:e.steps.map(s=>s.kind==='approval'&&s.submittedHash?{...s,confirmedBlockNumber:'111'}:s)};}
  };
  const s=createService({repository,providers:routed,interpreter});
  const plan=await s.createPlan(owner,intent),c=plan.candidates.find(c=>c.eligible)!;
  const e=await s.prepareAction(owner,plan.id,c.id,1,'approval-refresh');
  await s.reportSubmission(owner,e.id,'approval','0x'+'a'.repeat(64),1);changed=failure==='changed';outage=failure==='unavailable';
  assert.equal((await s.observeExecution(owner,e.id)).state,'reconciliation_required');
  assert.equal((await s.observeExecution(owner,e.id)).state,'reconciliation_required');
  assert.equal((await repository.reserved(owner)).length,2);
 }finally{await repository.close();}
 }
});
test('client and scheduler observations share leases and do not duplicate provider checks',async()=>{
 const repository=await createRepository('memory://');try{
  await repository.reserve(execution(),'due');
  let calls=0;
  const slow={...providers,async reconcile(){calls++;await new Promise(resolve=>setTimeout(resolve,100));return {state:'reconciliation_required' as const,receipt:null,warnings:[]};}};
  const s=createService({repository,providers:slow,interpreter});
  await Promise.all([s.observeExecution(owner,'execution1'),s.observeExecution(owner,'execution1')]);
  assert.equal(calls,1);
  await assert.rejects(s.reconcileDue(0));
  assert.equal((await s.reconcileDue(2)).checked,0);
  const due={...execution('due2',1),debits:execution().debits.map(d=>({...d,amountAtoms:'1'}))};
  await repository.reserve(due,'due2');
  assert.equal((await s.reconcileDue(2)).checked,1);assert.equal(calls,2);
  const unavailable=createService({repository:{...repository,claimDue:undefined},providers,interpreter});
  await assert.rejects(unavailable.reconcileDue(1),/lease/);
 }finally{await repository.close();}
});
