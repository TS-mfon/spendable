import test from 'node:test';
import assert from 'node:assert/strict';
import { createInterpreter } from '../../src/ai/index.ts';
import type { GenLayerTransport } from '../../src/ai/types.ts';
const owner='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const recipient='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const candidateAssets=[{chainId:8453,chainName:'Base',symbol:'USDC'}];
const hash='0x'+'1'.repeat(64);
const fields={operation:'pay',targetChainId:8453,targetSymbol:'USDC',recipientAlias:'recipient_1',amountMode:'receive_token',amount:'50',currency:'USD',sourceSymbol:null,constraints:{}};
const completed=(request: {digest:string})=>({status:'finalized' as const,execution:'success' as const,result:{requestDigest:request.digest,status:'accepted',fields,questions:[]}});
test('unconfigured interpretation redacts wallet addresses and offers structured input',async()=>{
 const interpreter=createInterpreter({});
 const request=await interpreter.request(owner,'Send 50 USDC on Base to '+recipient);
 assert.equal(request.status,'unavailable');
 assert.ok(request.redactedText.includes('recipient_1'));
 assert.equal(request.redactedText.includes(recipient),false);
 assert.equal(request.addressAliases.recipient_1,recipient);
 assert.equal(request.fields,null);
 assert.equal((await interpreter.poll(request)).version,request.version);
 await assert.rejects(interpreter.request(owner,'a'.repeat(2001)),/2000|long/i);
 await assert.rejects(interpreter.request(owner,'My private key is 0x'+'f'.repeat(64)),/secret|key/i);
});
test('request queues without signing; poll submits once and waits for finalized successful consensus',async()=>{
 let sends=0;let submitted:any;
 const transport:GenLayerTransport={
  submit:async(r)=>{sends++;submitted=r;return {hash};},
  status:async()=>({status:'pending',execution:'pending',result:null})
 };
 const interpreter=createInterpreter({transport,candidateAssets});
 const request=await interpreter.request(owner,'Send 50 USDC on Base to '+recipient);
 assert.equal(request.status,'queued');assert.equal(sends,0);
 const sent=await interpreter.poll(request);
 assert.equal(sent.status,'submitted');assert.equal(sends,1);assert.equal(sent.transactionHash,hash);
 assert.equal(JSON.stringify(submitted).includes(recipient),false);
 const waiting=await interpreter.poll(sent);
 assert.equal(waiting.status,'submitted');assert.equal(waiting.fields,null);assert.equal(sends,1);
});
test('finalized result requires request binding, allowed IDs and exact decimal amount',async()=>{
 let submitted:any;
 const transport:GenLayerTransport={submit:async(r)=>{submitted=r;return {hash};},status:async()=>completed(submitted)};
 const interpreter=createInterpreter({transport,candidateAssets});
 const queued=await interpreter.request(owner,'Send 50 USDC on Base to '+recipient);
 const sent=await interpreter.poll(queued);
 const result=await interpreter.poll(sent);
 assert.equal(result.status,'accepted');assert.equal(result.fields?.amount,'50');
 assert.equal(result.fields?.targetChainId,8453);
 assert.equal(queued.status,'queued');assert.equal(sent.status,'submitted');
 transport.status=async()=>({...completed(submitted),result:{...completed(submitted).result,requestDigest:'tampered'}});
 assert.equal((await interpreter.poll(sent)).status,'clarification');
 transport.status=async()=>({...completed(submitted),result:{...completed(submitted).result,fields:{...fields,amount:'500'}}});
 assert.equal((await interpreter.poll(sent)).status,'clarification');
 transport.status=async()=>({...completed(submitted),result:{...completed(submitted).result,fields:{...fields,targetChainId:1}}});
 assert.equal((await interpreter.poll(sent)).status,'clarification');
});
