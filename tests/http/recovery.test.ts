import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {Address,SpendableService} from '../../src/shared/contracts.ts';
import {SpendableError} from '../../src/shared/errors.ts';
const origin='http://localhost:3000';
const account=privateKeyToAccount(('0x'+'66'.repeat(32)) as `0x${string}`);
function setup(recoverAction:SpendableService['recoverAction']){
 const auth=createAuth({secret:testSessionSecret(),origin,store:createMemoryAuthStore()});
 const service={getCapabilities:async()=>[],recoverAction} as unknown as SpendableService;
 return {auth,app:createApp({auth,service,origin})};
}
test('HTTP recovery requires sign-in, write scope, signature and explicit late-broadcast acknowledgement',async()=>{
 let calls=0;
 const {app,auth}=setup(async(owner:Address,id,version,signature,acknowledgeLateBroadcastRisk)=>{
  calls++;return {owner,id,version,signature,acknowledgeLateBroadcastRisk,state:'canceled'} as never;
 });
 const signature=await account.signMessage({message:'recovery adapter test'});
 const body={version:3,signature,acknowledgeLateBroadcastRisk:true};
 assert.equal((await request(app).post('/api/actions/action1/recover').send(body)).status,401);
 const reader=await auth.issueSession(account.address,{scopes:['wallet:read'],clientId:'reader'});
 assert.equal((await request(app).post('/api/actions/action1/recover').set('Authorization','Bearer '+reader.token).send(body)).status,403);
 const writer=await auth.issueSession(account.address,{scopes:['execution:write'],clientId:'agent'});
 for(const invalid of [{version:3,signature},{...body,acknowledgeLateBroadcastRisk:false},{...body,signature:'not-hex'},{...body,signature:'0xabc'},{...body,signature:'0x'+'aa'.repeat(1100)},{...body,version:0},{...body,owner:'0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'}]){
  assert.equal((await request(app).post('/api/actions/action1/recover').set('Authorization','Bearer '+writer.token).send(invalid)).status,422);
 }
 assert.equal(calls,0);
 const result=await request(app).post('/api/actions/action1/recover').set('Authorization','Bearer '+writer.token).send(body);
 assert.equal(result.status,200);assert.equal(calls,1);
 assert.equal(result.body.data.owner,account.address.toLowerCase());assert.equal(result.body.data.id,'action1');assert.equal(result.body.data.version,3);assert.equal(result.body.data.signature,signature);assert.equal(result.body.data.acknowledgeLateBroadcastRisk,true);
});
test('HTTP recovery preserves the shared service rejection for an invalid wallet signature',async()=>{
 const {app,auth}=setup(async()=>{throw new SpendableError('INVALID_RECOVERY_SIGNATURE','Recovery needs a signature from the action owner.',401);});
 const session=await auth.issueSession(account.address);
 const result=await request(app).post('/api/actions/action1/recover').set('Authorization','Bearer '+session.token).send({version:1,signature:'0x'+'aa'.repeat(65),acknowledgeLateBroadcastRisk:true});
 assert.equal(result.status,401);assert.equal(result.body.error.code,'INVALID_RECOVERY_SIGNATURE');
});
