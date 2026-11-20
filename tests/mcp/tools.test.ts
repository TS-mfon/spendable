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
test('all MCP tools use the authenticated wallet and preserve canonical payment units',async()=>{
 const {app,session}=await setup({
  interpretRequest:async(owner,text)=>({owner,text,status:'queued'}) as never,
  getInterpretation:async(owner,id)=>({owner,id,status:'accepted'}) as never,
  createPlan:async(owner,input)=>({owner,input}) as never,
  getPlan:async()=>({intent:{policy:{maxSourceSpendAtoms:'100000000',maxFeeUsd:'2'}}}) as never,
  prepareAction:async(owner,_plan,_candidate,_version,_key,requireCaps)=>({owner,requireCaps}) as never,
  reportSubmission:async(owner,_execution,step,hash)=>({owner,step,hash}) as never,
  observeExecution:async(owner,id)=>({owner,id,state:'delivery_pending'}) as never,
  getReceipt:async(owner,id)=>({owner,id,outcome:'unresolved'}) as never,
  getActionableUpdates:async(owner)=>[{owner,kind:'needs_signature'}] as never
 });
 const recipient='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
 const intent={recipient,targetAsset:{key:'1:usdc',chainId:1,address:'0xcccccccccccccccccccccccccccccccccccccccc',kind:'erc20',symbol:'USDC',name:'USD Coin',decimals:6,cmcId:3408},sourceAssetKey:null,amountMode:'receive_token',amount:'50',currency:'USD',policy:{maxSlippageBps:50,maxPriceImpactBps:300,maxSourceSpendAtoms:'100000000',maxFeeUsd:'2',gasReserveAtoms:null},interpretationId:null};
 const call=async(name:string,args:unknown)=>{
  const result=await rpc(app,session.token,'tools/call',{name,arguments:args});
  assert.equal(result.status,200);assert.ok(!result.body.result.isError,JSON.stringify(result.body));
  return result.body.result.structuredContent.data;
 };
 assert.equal((await call('interpret_request',{text:'send 50 USDC'})).status,'queued');
 assert.equal((await call('get_interpretation',{id:'interpretation1'})).owner,account.address.toLowerCase());
 const payment=await call('plan_payment',{intent});
 assert.equal(payment.owner,account.address.toLowerCase());assert.equal(payment.input.operation,'pay');assert.equal(payment.input.recipient,recipient);assert.equal(payment.input.amountMode,'receive_token');assert.equal(payment.input.amount,'50');
 const swap=await call('plan_swap',{intent});assert.equal(swap.input.operation,'swap');assert.equal(swap.input.recipient,account.address.toLowerCase());
 assert.equal((await call('prepare_action',{planId:'p1',candidateId:'c1',version:1,idempotencyKey:'request002'})).requireCaps,true);
 const hash='0x'+'ab'.repeat(32);
 assert.equal((await call('report_submission',{executionId:'e1',stepId:'funding',hash,version:1})).hash,hash);
 assert.equal((await call('get_action_status',{executionId:'e1'})).state,'delivery_pending');
 assert.equal((await call('get_receipt',{executionId:'e1'})).outcome,'unresolved');
 assert.equal((await call('get_actionable_updates',{}))[0].kind,'needs_signature');
 const impersonation=await rpc(app,session.token,'tools/call',{name:'get_wallet_context',arguments:{wallet:recipient}});
 assert.equal(impersonation.body.result.isError,true);
});
test('MCP internal failure messages never expose provider credentials',async()=>{
 const {app,session}=await setup({getWalletContext:async()=>{throw Error('private-provider-key');}});
 const result=await rpc(app,session.token,'tools/call',{name:'get_wallet_context',arguments:{}});
 assert.equal(result.body.result.isError,true);assert.ok(!JSON.stringify(result.body).includes('private-provider-key'));
});
