import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import {testSessionSecret} from '../helpers/credentials.ts';
import type {SpendableService} from '../../src/shared/contracts.ts';
const origin='http://localhost:3000';
function setup(){
 const auth=createAuth({secret:testSessionSecret(),origin,store:createMemoryAuthStore()});
 return {auth,app:createApp({auth,origin,service:{getCapabilities:async()=>[]} as unknown as SpendableService})};
}
test('wallet proof bootstraps a bearer session and revocation prevents reuse',async()=>{
 const {app,auth}=setup(),account=privateKeyToAccount(generatePrivateKey());
 try{
  const challenge=await request(app).post('/api/auth/challenge').send({wallet:account.address});
  assert.equal(challenge.status,200);assert.match(challenge.body.data.message,/Sign in to Spendable/);
  const signature=await account.signMessage({message:challenge.body.data.message});
  const verified=await request(app).post('/api/auth/verify').send({wallet:account.address,message:challenge.body.data.message,signature});
  assert.equal(verified.status,200);
  const header='Bearer '+verified.body.data.token;
  const session=await request(app).get('/api/auth/session').set('Authorization',header);
  assert.equal(session.body.data.wallet,account.address.toLowerCase());
  assert.equal((await request(app).post('/api/auth/verify').send({wallet:account.address,message:challenge.body.data.message,signature})).status,401);
  assert.equal((await request(app).post('/api/auth/logout').set('Authorization',header).send({})).status,200);
  assert.equal((await request(app).get('/api/auth/session').set('Authorization',header)).status,401);
 }finally{await auth.close();}
});
test('authentication validates inputs, JSON sizes and supplied origins',async()=>{
 const {app,auth}=setup();
 try{
  assert.equal((await request(app).post('/api/auth/challenge').send({wallet:'invalid'})).status,422);
  assert.equal((await request(app).post('/api/auth/challenge').set('Origin','https://attacker.example').send({wallet:'0x'+'a'.repeat(40)})).status,403);
  const malformed=await request(app).post('/api/auth/challenge').set('Content-Type','application/json').send('{');
  assert.equal(malformed.status,400);assert.equal(malformed.body.error.code,'INVALID_BODY');
  assert.equal((await request(app).post('/api/auth/challenge').send({wallet:'x'.repeat(40000)})).status,400);
  assert.equal((await request(app).get('/api/auth/session')).status,401);
 }finally{await auth.close();}
});
test('scheduler authentication and batch bounds are separate from wallet tokens',async()=>{
 const {auth}=setup();let calls=0;
 const secret=testSessionSecret();
 const app=createApp({auth,origin,service:{} as SpendableService,reconcileSecret:secret,reconcile:async()=>{calls++;return {processed:2};}});
 try{
  assert.equal((await request(app).post('/api/internal/reconcile').send({limit:20})).status,401);
  const header='Bearer '+secret;
  assert.equal((await request(app).post('/api/internal/reconcile').set('Authorization',header).send({limit:51})).status,422);
  const result=await request(app).post('/api/internal/reconcile').set('Authorization',header).send({limit:20});
  assert.equal(result.status,200);assert.equal(result.body.data.processed,2);assert.equal(calls,1);
 }finally{await auth.close();}
});
