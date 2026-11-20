import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {MarketProviders,Interpreter} from '../../src/shared/ports.ts';
import {context,owner,intent,quote,recipient} from '../domain/fixtures.ts';
const providers:MarketProviders={
 async capabilities(){return context.chains;},async wallet(){return context;},
 async quote(){return {...quote,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120000).toISOString()};},
 async refreshBalance(_owner,asset){return {balanceAtoms:context.holdings.find(h=>h.asset.key===asset.key)?.balanceAtoms??'0',blockNumber:'101'};},
 async prepareSteps(q){return [{id:'funding',kind:'funding',transaction:q.transaction,submittedHash:null,confirmedBlockNumber:null}];},
 async validateSubmission(){},async reconcile(){return {state:'reconciliation_required',receipt:null,warnings:['No confirmed receipt yet.']};}
};
const interpreter:Interpreter={async request(){throw new Error('unavailable');},async poll(r){return r;}};
test('payment plan reserves one source atomically and duplicate preparation returns the same action',async()=>{
 const repository=await createRepository('memory://');
 try{
  const s=createService({repository,providers,interpreter});
  const plan=await s.createPlan(owner,intent);
  const candidate=plan.candidates.find(c=>c.eligible)!;
  assert.equal(candidate.quote.minimumOutputAtoms,'50000000');
  const e=await s.prepareAction(owner,plan.id,candidate.id,1,'request');
  assert.equal(e.state,'awaiting_signature');
  assert.equal((await s.prepareAction(owner,plan.id,candidate.id,1,'request')).id,e.id);
  assert.equal(await s.getExecution(recipient,e.id),null);
  const submitted=await s.reportSubmission(owner,e.id,e.steps[0].id,'0x'+'a'.repeat(64),e.version);
  assert.equal(submitted.state,'submitted');
  const checked=await s.observeExecution(owner,e.id);
  assert.equal(checked.state,'reconciliation_required');
  assert.equal((await repository.reserved(owner)).length,2);
 }finally{await repository.close();}
});
test('a stale quote, spoofed token metadata or under-delivering route cannot be prepared',async()=>{
 const repository=await createRepository('memory://');try{
  const s=createService({repository,providers,interpreter});
  await assert.rejects(s.createPlan(owner,{...intent,targetAsset:{...intent.targetAsset,decimals:18}}));
  const bad=createService({repository,providers:{...providers,async quote(){return {...quote,minimumOutputAtoms:'1'};}},interpreter});
  assert.equal((await bad.createPlan(owner,intent)).candidates.some(c=>c.eligible),false);
 }finally{await repository.close();}
});
