import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {SpendableService} from '../../src/shared/contracts.ts';
import {SpendableError} from '../../src/shared/errors.ts';
const origin='http://localhost:3000';
const account=privateKeyToAccount(('0x'+'77'.repeat(32)) as `0x${string}`);
async function setup(recoverAction:SpendableService['recoverAction']){
 const auth=createAuth({secret:testSessionSecret(),origin,store:createMemoryAuthStore()});
 const app=createApp({auth,origin,service:{getCapabilities:async()=>[],recoverAction} as unknown as SpendableService});
 const session=await auth.issueSession(account.address,{clientId:'recovery-agent'});
 return {app,auth,session};
}
function rpc(app:ReturnType<typeof createApp>,token:string,method:string,params:unknown){
 return request(app).post('/mcp').set('Authorization','Bearer '+token).set('Accept','application/json, text/event-stream').send({jsonrpc:'2.0',id:1,method,params});
}
test('MCP recovery exposes the owner-signed recovery contract and enforces write scope',async()=>{
 let calls=0;
 const {app,auth,session}=await setup(async(owner,id,version,signature,acknowledgeLateBroadcastRisk)=>{calls++;return {owner,id,version,signature,acknowledgeLateBroadcastRisk,state:'canceled'} as never;});
 const metadata=await rpc(app,session.token,'tools/list',{});
 assert.equal(metadata.body.result.tools.length,11);
 const tool=metadata.body.result.tools.find((x:{name:string})=>x.name==='recover_action');
 assert.ok(tool);assert.equal(tool.annotations.destructiveHint,true);
 const signature=await account.signMessage({message:'recovery adapter test'});
 const arguments_={executionId:'action1',version:3,signature,acknowledgeLateBroadcastRisk:true};
 const reader=await auth.issueSession(account.address,{scopes:['wallet:read'],clientId:'reader'});
 const denied=await rpc(app,reader.token,'tools/call',{name:'recover_action',arguments:arguments_});
 assert.equal(denied.body.result.isError,true);assert.match(denied.body.result.content[0].text,/INSUFFICIENT_SCOPE/);
 for(const invalid of [{executionId:'action1',version:3,signature},{...arguments_,acknowledgeLateBroadcastRisk:false},{...arguments_,signature:'0xabc'},{...arguments_,signature:'0x'+'aa'.repeat(1100)}]){
  const result=await rpc(app,session.token,'tools/call',{name:'recover_action',arguments:invalid});
  assert.equal(result.body.result.isError,true);
 }
 assert.equal(calls,0);
 const result=await rpc(app,session.token,'tools/call',{name:'recover_action',arguments:arguments_});
 assert.ok(!result.body.result.isError);assert.equal(calls,1);
 const data=result.body.result.structuredContent.data;
 assert.equal(data.owner,account.address.toLowerCase());assert.equal(data.id,'action1');assert.equal(data.version,3);assert.equal(data.signature,signature);assert.equal(data.acknowledgeLateBroadcastRisk,true);
});
test('MCP recovery propagates a failed owner signature instead of releasing a reservation',async()=>{
 const {app,session}=await setup(async()=>{throw new SpendableError('INVALID_RECOVERY_SIGNATURE','Recovery needs the owner signature.',401);});
 const result=await rpc(app,session.token,'tools/call',{name:'recover_action',arguments:{executionId:'action1',version:1,signature:'0x'+'ab'.repeat(65),acknowledgeLateBroadcastRisk:true}});
 assert.equal(result.body.result.isError,true);assert.match(result.body.result.content[0].text,/INVALID_RECOVERY_SIGNATURE/);
});
