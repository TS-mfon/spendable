import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {createRepository} from '../../src/storage/index.ts';
import type {InterpretationRequest,FundingPlan} from '../../src/shared/contracts.ts';
import {execution,owner,recipient,intent,candidate,context} from '../domain/fixtures.ts';
const configured=process.env.MONGO_TEST_URI;
test('Mongo replica set preserves owner isolation, transactional reservations, CAS and durable leases',{skip:!configured},async()=>{
 const url=new URL(configured!);
 assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname),'Integration test requires a local ephemeral replica set.');
 url.pathname='/core_'+randomUUID().replaceAll('-','');
 const uri=url.toString();
 let r=await createRepository(uri);
 try{
  const stamp=new Date().toISOString();
  const plan:FundingPlan={id:'plan1',owner,intent,version:1,state:'quoted',candidates:[candidate],prices:context.prices,rates:context.rates,warnings:[],createdAt:stamp,expiresAt:new Date(Date.now()+120000).toISOString()};
  await r.putPlan(plan);assert.equal((await r.getPlan(owner,plan.id))?.id,plan.id);assert.equal(await r.getPlan(recipient,plan.id),null);
  await assert.rejects(r.putPlan(plan));
  const request:InterpretationRequest={id:'interpretation1',owner,status:'queued',redactedText:'Pay',addressAliases:{},fields:null,questions:[],transactionHash:null,contractAddress:null,version:1,createdAt:stamp,updatedAt:stamp,error:null};
  await r.putInterpretation(request);
  await Promise.all([r.putInterpretation({...request,status:'unavailable',version:2}),r.putInterpretation({...request,status:'submitted',transactionHash:'0x'+'a'.repeat(64),version:2})]);
  assert.equal((await r.getInterpretation(owner,request.id))?.status,'submitted');
  assert.equal(await r.getInterpretation(recipient,request.id),null);
  const attempts=await Promise.allSettled([1,2,3].map(i=>r.reserve(execution('mongo'+i,i),'key'+i)));
  assert.equal(attempts.filter(x=>x.status==='fulfilled').length,2);
  const records=await r.listExecutions(owner);assert.equal(records.length,2);
  const first=records[0];
  assert.equal((await r.findByIdempotency!(owner,'key'+first.id.at(-1)))?.id,first.id);
  assert.equal((await r.reserve({...first,id:'retry'},'key'+first.id.at(-1))).id,first.id);
  await assert.rejects(r.reserve({...first,id:'different',commitmentHash:'different'},'key'+first.id.at(-1)));
  assert.equal(await r.getExecution(recipient,first.id),null);
  assert.equal((await r.reserved(owner)).find(d=>d.assetKey==='1:usdc')?.amountAtoms,'100000000');
  assert.equal((await r.due(10)).length,2);await assert.rejects(r.due(0));
  const lease=await r.claimExecution!(owner,first.id,1000);assert.ok(lease);assert.equal(await r.claimExecution!(owner,first.id,1000),null);
  await assert.rejects(r.releaseLease!(first.id,'wrong'));await r.releaseLease!(first.id,lease);
  const claims=await r.claimDue!(10,Date.now()+1000,1000);assert.equal(claims.length,2);assert.equal((await r.claimDue!(10,Date.now()+1000,1000)).length,0);
  await Promise.all(claims.map(c=>r.releaseLease!(c.execution.id,c.leaseToken)));
  await assert.rejects(r.claimDue!(0));
  const next=await r.updateExecution({...first,state:'delivered',version:2},1);
  assert.equal(next.version,2);await assert.rejects(r.updateExecution({...first,version:2},1));
  assert.equal((await r.reserved(owner)).find(d=>d.assetKey==='1:usdc')?.amountAtoms,'50000000');
  await r.close();r=await createRepository(uri);
  assert.equal((await r.getExecution(owner,first.id))?.state,'delivered');
  assert.equal((await r.getPlan(owner,plan.id))?.intent.amount,'50');
  assert.equal((await r.getInterpretation(owner,request.id))?.transactionHash,'0x'+'a'.repeat(64));
 }finally{await r.close();}
});

test('Mongo owner guard serializes nonce commitments with confirmed balance watermarks',{skip:!configured},async()=>{
 const url=new URL(configured!);assert.ok(['127.0.0.1','localhost','[::1]'].includes(url.hostname));url.pathname='/nonces_'+randomUUID().replaceAll('-','');
 const r=await createRepository(url.toString());
 try{
  const first=execution('first',0);
  const results=await Promise.allSettled([r.reserve(first,'first'),r.reserve(execution('second',0),'second')]);
  assert.equal(results.filter(x=>x.status==='fulfilled').length,1);
  const failed=results.find(x=>x.status==='rejected') as PromiseRejectedResult;assert.equal(failed.reason.code,'NONCE_RESERVED');
  const stored=(await r.listExecutions(owner))[0];
  await r.updateExecution({...stored,version:2,state:'delivered',steps:stored.steps.map(s=>({...s,confirmedBlockNumber:'101'}))},1);
  await assert.rejects(r.reserve(execution('stale',1),'stale'),(error:unknown)=>error instanceof Error&&'code'in error&&error.code==='STALE_BALANCE');
  const fresh=execution('fresh',1);
  const observed={...fresh,debits:fresh.debits.map(d=>({...d,observedBlockNumber:'101',observedBalanceAtoms:d.assetKey==='1:usdc'?'50000000':'99999000000000000'}))};
  await assert.rejects(r.reserve({...observed,id:'old',steps:observed.steps.map(s=>({...s,transaction:{...s.transaction,nonce:0}}))},'old'),(error:unknown)=>error instanceof Error&&'code'in error&&error.code==='STALE_NONCE');
  assert.equal((await r.reserve(observed,'fresh')).id,'fresh');
 }finally{await r.close();}
});
