import test from 'node:test';
import assert from 'node:assert/strict';
import {signExecutionStep} from '../../web/action-signing.ts';
import {fixtures,owner} from '../../e2e/fixtures.ts';
import type {WalletProvider} from '../../web/wallet.ts';
const now=()=>Date.parse('2026-11-20T00:00:00Z');
test('expired prepared action never opens a wallet signing request',async()=>{
 const {execution}=fixtures();const methods:string[]=[];
 const expired={...execution,candidate:{...execution.candidate,quote:{...execution.candidate.quote,expiresAt:'2026-11-19T23:59:59Z'}}};
 const provider:WalletProvider={request:async({method})=>{methods.push(method);return null;}};
 await assert.rejects(signExecutionStep(provider,execution,'funding',owner,(async()=>Response.json({success:true,data:expired,error:null})) as typeof fetch,now),/expired/i);
 assert.deepEqual(methods,[]);
 assert.equal(expired.steps[0].submittedHash,null);
 assert.equal(expired.state,'awaiting_signature');
});
test('expiry during wallet network checks still prevents a transaction request',async()=>{
 const {execution}=fixtures();let time=Date.parse('2026-11-20T00:00:00Z');const methods:string[]=[];
 const current={...execution,signingExpiresAt:'2026-11-20T00:00:10Z'};
 const provider:WalletProvider={request:async({method})=>{
  methods.push(method);if(method==='eth_accounts')return [owner];
  if(method==='eth_chainId'){time=Date.parse('2026-11-20T00:00:11Z');return '0x2105';}
  if(method==='eth_sendTransaction')return '0x'+'a'.repeat(64);
  throw Error('Unexpected wallet method');
 }};
 await assert.rejects(signExecutionStep(provider,execution,'funding',owner,(async()=>Response.json({success:true,data:current,error:null})) as typeof fetch,()=>time),/expired/i);
 assert.equal(methods.includes('eth_sendTransaction'),false);assert.equal(methods.includes('personal_sign'),false);
});
test('a broadcast returned after expiry keeps its hash and refreshed action version',async()=>{
 const {execution}=fixtures();let time=Date.parse('2026-11-20T00:00:00Z');
 const current={...execution,version:3,signingExpiresAt:'2026-11-20T00:00:10Z',candidate:{...execution.candidate,quote:{...execution.candidate.quote,expiresAt:'2026-11-19T23:59:59Z'}}};
 const provider:WalletProvider={request:async({method})=>{
  if(method==='eth_accounts')return [owner];if(method==='eth_chainId')return '0x2105';
  if(method==='eth_sendTransaction'){time=Date.parse('2026-11-20T00:00:11Z');return '0x'+'a'.repeat(64);}
  throw Error('Unexpected wallet method');
 }};
 const result=await signExecutionStep(provider,execution,'funding',owner,(async()=>Response.json({success:true,data:current,error:null})) as typeof fetch,()=>time);
 assert.equal(result.hash,'0x'+'a'.repeat(64));assert.equal(result.execution.version,3);assert.equal(result.stepId,'funding');
});
