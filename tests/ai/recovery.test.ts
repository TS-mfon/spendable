import test from 'node:test';
import assert from 'node:assert/strict';
import {createInterpreter} from '../../src/ai/index.ts';
import type {GenLayerTransport} from '../../src/ai/types.ts';
const owner='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const recipient='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const hash='0x'+'1'.repeat(64);
test('RPC outage after broadcast retains the submitted request for recovery',async()=>{
 const transport:GenLayerTransport={submit:async()=>({hash}),status:async()=>{throw new Error('private upstream diagnostic');}};
 const interpreter=createInterpreter({transport,candidateAssets:[{chainId:8453,chainName:'Base',symbol:'USDC'}]});
 const r=await interpreter.request(owner,'Send 5 USDC on Base to '+recipient);
 const sent=await interpreter.poll(r);
 const recovery=await interpreter.poll(sent);
 assert.equal(recovery.status,'submitted');assert.equal(recovery.transactionHash,hash);
 assert.equal(recovery.fields,null);assert.equal(recovery.error?.includes('private upstream'),false);
});
