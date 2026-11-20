import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createInterpreter} from '../../src/ai/index.ts';
import {createGenLayerTransport} from '../../src/ai/transport.ts';
import {createSponsorStore} from '../../src/ai/sponsor-store.ts';
const sponsor='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const owner='0xcccccccccccccccccccccccccccccccccccccccc' as const;
const recipient='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
test('a concurrent queued poll stays retryable and recovers the paid signing hash',async()=>{
 const store=await createSponsorStore('memory://');let signCount=0;
 let entered!:()=>void;let release!:()=>void;
 const waiting=new Promise<void>(resolve=>{entered=resolve;});
 const signing=new Promise<void>(resolve=>{release=resolve;});
 const transport=createGenLayerTransport({genlayerContractAddress:recipient},{store,signer:{address:sponsor,sign:async()=>{signCount++;entered();await signing;return '0x1234';}},rpc:{
  chainId:async()=>4221,balance:async()=>1000000000000000000n,estimate:async()=>100000n,gasPrice:async()=>100000n,nonce:async()=>0,
  code:async()=>readFileSync('contracts/spendable_interpreter.py','utf8'),sponsor:async()=>sponsor,broadcast:async()=>{throw new Error('Lost acknowledgement.');},
  receipt:async()=>null,consensus:async()=>({status:'pending',execution:'pending',sender:sponsor,recipient}),result:async()=>null
 }});
 const interpreter=createInterpreter({transport,candidateAssets:[{chainId:8453,chainName:'Base',symbol:'USDC'}]});
 const queued=await interpreter.request(owner,'Send 5 USDC on Base to '+recipient);
 const first=interpreter.poll(queued);
 try{
  await waiting;
  const concurrent=await interpreter.poll(queued);
  assert.equal(concurrent.status,'queued');
  release();const submitted=await first;
  assert.equal(submitted.status,'submitted');
  const recovered=await interpreter.poll(concurrent);
  assert.equal(recovered.status,'submitted');assert.equal(recovered.transactionHash,submitted.transactionHash);
  assert.equal(signCount,1);
 }finally{release();await first;await interpreter.close();}
});
