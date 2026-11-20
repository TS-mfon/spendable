import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {SpendableService,Address} from '../../src/shared/contracts.ts';
const origin='http://localhost:3000';
const account=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`);
function setup(overrides:Partial<SpendableService>={}){
 const auth=createAuth({secret:testSessionSecret(),origin,store:createMemoryAuthStore()});
 const service={getCapabilities:async()=>[],getWalletContext:async(owner:Address)=>({wallet:owner}),...overrides} as SpendableService;
 return {auth,app:createApp({auth,service,origin})};
}
async function login(app:ReturnType<typeof createApp>){
 const c=await request(app).post('/api/auth/challenge').set('Origin',origin).send({wallet:account.address});
 assert.equal(c.status,200);
 const v=await request(app).post('/api/auth/verify').set('Origin',origin).send({wallet:account.address,message:c.body.data.message,signature:await account.signMessage({message:c.body.data.message})});
 assert.equal(v.status,200);const raw=v.headers['set-cookie'];return {token:v.body.data.token,cookie:Array.isArray(raw)?raw:[raw]};
}
test('private HTTP resources require sign-in and never accept another wallet scope',async()=>{
 const {app}=setup();assert.equal((await request(app).get('/api/wallet')).status,401);
 const {token,cookie}=await login(app);
 assert.ok(cookie.join(';').includes('HttpOnly'));
 const wallet=await request(app).get('/api/wallet').set('Authorization','Bearer '+token).query({wallet:'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'});
 assert.equal(wallet.status,200);assert.equal(wallet.body.data.wallet,account.address.toLowerCase());
});
test('cookie writes require same-origin; sign-out revokes the bearer token',async()=>{
 const {app}=setup();const {token,cookie}=await login(app);
 assert.equal((await request(app).post('/api/plans').set('Cookie',cookie).send({})).status,403);
 assert.equal((await request(app).post('/api/auth/logout').set('Cookie',cookie).set('Origin','http://evil.example').send({})).status,403);
 assert.equal((await request(app).post('/api/auth/logout').set('Cookie',cookie).set('Origin',origin).send({})).status,200);
 assert.equal((await request(app).get('/api/wallet').set('Authorization','Bearer '+token)).status,401);
});
test('HTTP validates identifiers and sanitizes internal errors',async()=>{
 const {app}=setup({getWalletContext:async()=>{throw Error('secret-provider-key');}});
 const {token}=await login(app);
 const r=await request(app).get('/api/wallet').set('Authorization','Bearer '+token);
 assert.equal(r.status,500);assert.ok(!JSON.stringify(r.body).includes('secret-provider-key'));
 const bad=await request(app).post('/api/actions').set('Authorization','Bearer '+token).send({planId:'x',candidateId:'y',version:0,idempotencyKey:''});
 assert.equal(bad.status,422);
});
test('reconciliation requires its own secret and bounded scheduler callback',async()=>{
 let calls=0;
 const {auth}=setup();
 const app=createApp({auth,service:{getCapabilities:async()=>[]} as unknown as SpendableService,origin,reconcileSecret:'cron-secret-'.repeat(4),reconcile:async()=>{calls++;return {processed:2};}});
 assert.equal((await request(app).post('/api/reconcile').send({})).status,401);
 const r=await request(app).post('/api/reconcile').set('Authorization','Bearer '+ 'cron-secret-'.repeat(4)).send({});
 assert.equal(r.status,200);assert.equal(calls,1);assert.equal(r.body.data.processed,2);
});

test('OAuth bearer REST preparation requires explicit agent spending caps',async()=>{
 const {auth,app}=setup({getPlan:async()=>({intent:{policy:{maxSourceSpendAtoms:null,maxFeeUsd:null}}}) as never,prepareAction:async()=>({prepared:true}) as never});
 const {cookie}=await login(app);
 const agent=await auth.issueSession(account.address,{scopes:['execution:write','wallet:read'],clientId:'oauth-agent'});
 const input={planId:'plan1',candidateId:'candidate1',version:1,idempotencyKey:'request001'};
 const denied=await request(app).post('/api/actions').set('Authorization','Bearer '+agent.token).send(input);
 assert.equal(denied.status,422);assert.equal(denied.body.error.code,'SPENDING_CAP_REQUIRED');
 const converted=await request(app).post('/api/actions').set('Cookie','spendable_session='+agent.token).set('Origin',origin).send(input);
 assert.equal(converted.status,401);assert.equal(converted.body.error.code,'INVALID_SESSION');
 const human=await request(app).post('/api/actions').set('Cookie',cookie).set('Origin',origin).send(input);
 assert.equal(human.status,200);
});
