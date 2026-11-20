import test from 'node:test';
import assert from 'node:assert/strict';
import {encodeFunctionData,erc20Abi} from 'viem';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {MarketProviders,Interpreter} from '../../src/shared/ports.ts';
import {context,intent,owner,quote,recipient} from '../domain/fixtures.ts';
const spender='0xdddddddddddddddddddddddddddddddddddddddd' as const;
test('approval spender and amount must match the bounded route commitment',async()=>{
 const r=await createRepository('memory://');try{
  const providers:MarketProviders={
   async capabilities(){return context.chains;},async wallet(){return context;},
   async quote(){return {...quote,approvalAddress:spender,fees:[...quote.fees,{...quote.fees[0],kind:'approval',name:'Approval gas'}]};},
   async refreshBalance(_o,a){return {balanceAtoms:context.holdings.find(h=>h.asset.key===a.key)?.balanceAtoms??'0',blockNumber:'100'};},
   async prepareSteps(q){return [{id:'approve',kind:'approval',transaction:{...q.transaction,to:q.sourceAsset.address!,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[recipient,50000000n]}),nonce:0},submittedHash:null,confirmedBlockNumber:null},{id:'funding',kind:'funding',transaction:{...q.transaction,nonce:1},submittedHash:null,confirmedBlockNumber:null}];},
   async validateSubmission(){},async reconcile(){return {state:'reconciliation_required',receipt:null,warnings:[]};}
  };
  const interpreter:Interpreter={async request(){throw Error('disabled');},async poll(x){return x;}};
  const s=createService({repository:r,providers,interpreter});
  const plan=await s.createPlan(owner,intent),candidate=plan.candidates.find(c=>c.eligible)!;
  await assert.rejects(s.prepareAction(owner,plan.id,candidate.id,1,'approval'),/approval/i);
 }finally{await r.close();}
});
