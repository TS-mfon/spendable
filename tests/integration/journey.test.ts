import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {setup} from './helpers.ts';
test('signed wallet session completes HTTP plan, reservation, submission and verified receipt',async()=>{
 const ctx=await setup();
 try{
  const client=request(ctx.app);
  const planResponse=await client.post('/api/plans').set('Cookie',ctx.cookie).set('Origin','http://localhost:3000').send(ctx.input);
  assert.equal(planResponse.status,200);
  const plan=planResponse.body.data;
  const candidate=plan.candidates.find((c:{eligible:boolean})=>c.eligible);
  assert.ok(candidate);
  const actionResponse=await client.post('/api/actions').set('Cookie',ctx.cookie).set('Origin','http://localhost:3000').send({planId:plan.id,candidateId:candidate.id,version:1,idempotencyKey:'integration-payment'});
  assert.equal(actionResponse.status,200);
  const action=actionResponse.body.data;
  assert.equal(action.state,'awaiting_signature');
  assert.equal((await ctx.repository.reserved(ctx.owner)).length,2);
  const submitted=await client.post('/api/actions/'+action.id+'/submissions').set('Cookie',ctx.cookie).set('Origin','http://localhost:3000').send({stepId:'funding',hash:'0x'+'a'.repeat(64),version:1});
  assert.equal(submitted.status,200);
  const observed=await client.post('/api/actions/'+action.id+'/observe').set('Cookie',ctx.cookie).set('Origin','http://localhost:3000').send({});
  assert.equal(observed.body.data.state,'delivered');
  const receipt=await client.get('/api/actions/'+action.id+'/receipt').set('Cookie',ctx.cookie);
  assert.equal(receipt.body.data.proofLevel,'onchain');
  assert.equal(receipt.body.data.receivedAtoms,'50000000');
  assert.equal((await ctx.repository.reserved(ctx.owner)).length,0);
 }finally{await ctx.close();}
});
test('HTTP rejects anonymous funds access and cross-origin preparation',async()=>{
 const ctx=await setup();try{
  assert.equal((await request(ctx.app).get('/api/wallet')).status,401);
  assert.equal((await request(ctx.app).post('/api/plans').set('Cookie',ctx.cookie).set('Origin','https://attacker.example').send(ctx.input)).status,403);
  assert.equal((await request(ctx.app).post('/api/internal/reconcile').send({limit:20})).status,401);
 }finally{await ctx.close();}
});
