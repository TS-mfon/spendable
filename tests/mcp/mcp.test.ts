import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {Address,SpendableService} from '../../src/shared/contracts.ts';
const origin='http://localhost:3000';
const account=privateKeyToAccount(('0x'+'44'.repeat(32)) as `0x${string}`);
async function setup(overrides:Partial<SpendableService>={}){
 const auth=createAuth({origin,secret:testSessionSecret(),store:createMemoryAuthStore()});
 const service={getCapabilities:async()=>[],getWalletContext:async(wallet:Address)=>({wallet,holdings:[]}),...overrides} as SpendableService;
 const app=createApp({auth,service,origin}),challenge=await auth.challenge(account.address);
 const session=await auth.verify({wallet:account.address,message:challenge.message,signature:await account.signMessage({message:challenge.message})});
 return {app,auth,session};
}
function rpc(app:ReturnType<typeof createApp>,token:string,method:string,params:unknown={}){
 return request(app).post('/mcp').set('Authorization','Bearer '+token).set('Accept','application/json, text/event-stream').send({jsonrpc:'2.0',id:1,method,params});
}
test('MCP requires bearer ownership and advertises complete tools',async()=>{
 const {app,session}=await setup();
 const unauthorized=await request(app).post('/mcp').send({jsonrpc:'2.0',id:1,method:'tools/list'});
 assert.equal(unauthorized.status,401);assert.match(unauthorized.headers['www-authenticate'],/resource_metadata/);
 const result=await rpc(app,session.token,'tools/list');
 assert.equal(result.status,200);
 const names=result.body.result.tools.map((x:{name:string})=>x.name);
 for(const name of ['get_wallet_context','interpret_request','plan_payment','plan_swap','prepare_action','report_submission','get_action_status','get_receipt','get_actionable_updates','get_interpretation'])assert.ok(names.includes(name),name);
 const wallet=await rpc(app,session.token,'tools/call',{name:'get_wallet_context',arguments:{}});
 assert.equal(wallet.body.result.structuredContent.data.wallet,account.address.toLowerCase());
});
test('MCP scopes cannot be escalated and agent preparation needs an explicit cap',async()=>{
 const {app,auth,session}=await setup({getPlan:async()=>({intent:{policy:{maxSourceSpendAtoms:null,maxFeeUsd:null}}}) as never});
 const restricted=await auth.issueSession(account.address,{scopes:['wallet:read'],clientId:'reader'});
 const denied=await rpc(app,restricted.token,'tools/call',{name:'interpret_request',arguments:{text:'send one ETH'}});
 assert.equal(denied.body.result.isError,true);assert.match(denied.body.result.content[0].text,/INSUFFICIENT_SCOPE/);
 const prepared=await rpc(app,session.token,'tools/call',{name:'prepare_action',arguments:{planId:'p1',candidateId:'c1',version:1,idempotencyKey:'request001'}});
 assert.equal(prepared.body.result.isError,true);assert.match(prepared.body.result.content[0].text,/SPENDING_CAP_REQUIRED/);
});
