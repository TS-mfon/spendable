import test from 'node:test';import assert from 'node:assert/strict';
import {canRecoverExecution,recoverUnsignedAction} from '../../web/action-recovery.ts';import {recoveryMessage} from '../../src/shared/recovery.ts';
import type {WalletProvider} from '../../web/wallet.ts';import {fixtures,owner} from '../../e2e/fixtures.ts';
test('recovery excludes known broadcasts, pending approvals and finalized actions',()=>{
 const {execution}=fixtures();
 assert.equal(canRecoverExecution(execution),true);
 assert.equal(canRecoverExecution({...execution,state:'reconciliation_required'}),true);
 assert.equal(canRecoverExecution(execution,true),false);
 assert.equal(canRecoverExecution({...execution,steps:execution.steps.map(s=>({...s,submittedHash:'0xabc'}))}),false);
 assert.equal(canRecoverExecution({...execution,steps:[{...execution.steps[0],kind:'approval',submittedHash:'0xabc'},...execution.steps]}),false);
 assert.equal(canRecoverExecution({...execution,state:'submitted'}),false);
 assert.equal(canRecoverExecution({...execution,state:'canceled'}),false);
});
test('recovery requires acknowledgement and a fresh canonical owner signature',async()=>{
 const {execution}=fixtures();const current={...execution,version:3};let message='';let posted:unknown;
 const provider:WalletProvider={request:async({method,params})=>{
  if(method==='eth_accounts')return [owner];
  if(method==='personal_sign'){message=new TextDecoder().decode(Uint8Array.from(String(params?.[0]).slice(2).match(/../g)??[],x=>Number.parseInt(x,16)));return '0x'+'a'.repeat(130);}
  throw Error('Unexpected method');
 }};
 const fetcher:typeof fetch=async(_input,init)=>{
  if(init?.method==='POST'){posted=JSON.parse(String(init.body));return Response.json({success:true,data:{...current,state:'canceled'},error:null});}
  return Response.json({success:true,data:current,error:null});
 };
 await assert.rejects(recoverUnsignedAction(provider,execution,owner,false,fetcher),/confirm/i);
 const result=await recoverUnsignedAction(provider,execution,owner,true,fetcher);
 assert.equal(result.state,'canceled');assert.equal(message,recoveryMessage(current));
 assert.deepEqual(posted,{version:3,signature:'0x'+'a'.repeat(130),acknowledgeLateBroadcastRisk:true});
});
test('a funding hash learned after opening recovery prevents signing',async()=>{
 const {execution}=fixtures();let signed=false;
 const provider:WalletProvider={request:async()=>{signed=true;throw Error('Must not sign');}};
 const fetcher:typeof fetch=async()=>Response.json({success:true,data:{...execution,sourceHash:'0x'+'a'.repeat(64)},error:null});
 await assert.rejects(recoverUnsignedAction(provider,execution,owner,true,fetcher),/broadcast|recover/i);assert.equal(signed,false);
});
