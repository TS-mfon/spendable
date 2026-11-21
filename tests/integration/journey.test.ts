import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {setup} from './helpers.ts';
import type {Execution,FundingPlan,DeliveryReceipt} from '../../src/shared/contracts.ts';
function call(ctx:Awaited<ReturnType<typeof setup>>,name:string,args:unknown={}){
 return request(ctx.app).post('/mcp').set('Authorization','Bearer '+ctx.token).set('Accept','application/json, text/event-stream').send({jsonrpc:'2.0',id:1,method:'tools/call',params:{name,arguments:args}});
}
test('MCP payment planning reserves funds, accepts a reported fixture hash and verifies fixture delivery',async()=>{
 const ctx=await setup();
 async function data<T>(name:string,args:unknown={}):Promise<T>{
  const response=await call(ctx,name,args);assert.equal(response.status,200);
  assert.equal(response.body.result.isError,undefined,JSON.stringify(response.body));
  return response.body.result.structuredContent.data as T;
 }
 try{
  const plan=await data<FundingPlan>('plan_payment',{intent:ctx.input});
  const candidate=plan.candidates.find(c=>c.eligible);assert.ok(candidate);
  assert.equal((await data<FundingPlan>('get_plan',{planId:plan.id})).owner,ctx.owner);
  const foreignSession=await ctx.auth.issueSession(ctx.input.recipient);
  const foreign={...ctx,token:foreignSession.token};
  const hiddenPlan=await call(foreign,'get_plan',{planId:plan.id});
  assert.equal(hiddenPlan.body.result.isError,true);assert.match(hiddenPlan.body.result.content[0].text,/NOT_FOUND/);
  const action=await data<Execution>('prepare_action',{planId:plan.id,candidateId:candidate.id,version:plan.version,idempotencyKey:'integration-payment'});
  assert.equal(action.state,'awaiting_signature');assert.equal((await ctx.repository.reserved(ctx.owner)).length,2);
  assert.equal((await data<Execution>('get_action',{executionId:action.id})).steps[0].submittedHash,null);
  const hiddenAction=await call(foreign,'get_action',{executionId:action.id});
  assert.equal(hiddenAction.body.result.isError,true);assert.match(hiddenAction.body.result.content[0].text,/NOT_FOUND/);
  const submitted=await data<Execution>('report_submission',{executionId:action.id,stepId:'funding',hash:'0x'+'a'.repeat(64),version:action.version});
  assert.equal(submitted.state,'submitted');
  const observed=await data<Execution>('get_action_status',{executionId:action.id});
  assert.equal(observed.state,'delivered');
  const receipt=await data<DeliveryReceipt>('get_receipt',{executionId:action.id});
  assert.equal(receipt.proofLevel,'onchain');assert.equal(receipt.receivedAtoms,'50000000');
  assert.equal((await ctx.repository.reserved(ctx.owner)).length,0);
 }finally{await ctx.close();}
});
test('anonymous MCP access, foreign origins and uncapped preparation are rejected',async()=>{
 const ctx=await setup();
 try{
  assert.equal((await request(ctx.app).post('/mcp').send({jsonrpc:'2.0',id:1,method:'tools/list'})).status,401);
  assert.equal((await request(ctx.app).post('/mcp').set('Authorization','Bearer '+ctx.token).set('Origin','https://attacker.example').send({jsonrpc:'2.0',id:1,method:'tools/list'})).status,403);
  const planned=await call(ctx,'plan_payment',{intent:{...ctx.input,policy:{...ctx.input.policy,maxSourceSpendAtoms:null}}});
  const plan=planned.body.result.structuredContent.data as FundingPlan;
  const result=await call(ctx,'prepare_action',{planId:plan.id,candidateId:plan.candidates[0].id,version:plan.version,idempotencyKey:'uncapped-payment'});
  assert.equal(result.body.result.isError,true);assert.match(result.body.result.content[0].text,/SPENDING_CAP_REQUIRED/);
  assert.equal((await request(ctx.app).post('/api/internal/reconcile').send({limit:20})).status,401);
 }finally{await ctx.close();}
});
