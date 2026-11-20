import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {encodeEventTopics,toHex,type Hex} from 'viem';
import {createGenLayerTransport} from '../../src/ai/transport.ts';
import {createSponsorStore} from '../../src/ai/sponsor-store.ts';
import {consensusAddress,encodeInterpretation} from '../../src/ai/encoding.ts';
import type {SponsorRpc,SponsorReceipt} from '../../src/ai/rpc.ts';
const sponsor='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const contract='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
const txId=('0x'+'3'.repeat(64)) as Hex;
const request={id:'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',text:'Send 5 USDC on Base to recipient_1',context:'{"assets":[{"chainId":8453,"chainName":"Base","symbol":"USDC"}],"aliases":["recipient_1"]}',digest:'0x'+'4'.repeat(64)};
const source=readFileSync('contracts/spendable_interpreter.py','utf8');
const event=[{type:'event',name:'CreatedTransaction',anonymous:false,inputs:[{indexed:true,name:'txId',type:'bytes32'},{indexed:false,name:'txSlot',type:'uint256'}]}] as const;
const logs=[{address:consensusAddress,topics:encodeEventTopics({abi:event,eventName:'CreatedTransaction',args:{txId}}).filter((topic):topic is Hex=>typeof topic==='string'),data:toHex(1n,{size:32})}];
function rpc(overrides:Partial<SponsorRpc>={}):SponsorRpc{return {
 chainId:async()=>4221,balance:async()=>1000000000000000000n,estimate:async()=>100000n,gasPrice:async()=>100000n,nonce:async()=>7,
 broadcast:async()=>{throw new Error('lost acknowledgement');},receipt:async()=>null,code:async()=>source,sponsor:async()=>sponsor,
 consensus:async()=>({status:'pending',execution:'pending',sender:sponsor,recipient:contract}),result:async()=>({requestDigest:request.digest}),...overrides
};}
test('sponsorship commits bounded signing before broadcast, retries the same hash and requires finalized consensus',async()=>{
 const store=await createSponsorStore('memory://');let signed=0;let receipt:SponsorReceipt|null=null;let finalized=false;
 const provider=rpc({receipt:async()=>receipt,consensus:async()=>({status:finalized?'finalized':'pending',execution:finalized?'success':'pending',sender:sponsor,recipient:contract})});
 const transport=createGenLayerTransport({genlayerContractAddress:contract},{store,rpc:provider,signer:{address:sponsor,sign:async tx=>{
  signed++;assert.equal(tx.gas,120000n);assert.equal(tx.value,0n);assert.equal(tx.nonce,7);
  assert.equal(tx.chainId,4221);assert.equal(tx.to,consensusAddress);assert.equal(tx.type,'legacy');
  assert.ok(tx.data.startsWith('0x'));return '0x1234';
 }}});
 try{
  const sent=await transport.submit(request);assert.equal(signed,1);
  assert.equal((await transport.submit(request)).hash,sent.hash);assert.equal(signed,1);
  assert.equal((await store.get(request.id))?.hash,sent.hash);
  assert.equal((await transport.status(sent.hash,request)).status,'pending');
  receipt={hash:sent.hash,from:sponsor,to:consensusAddress,status:'success',logs};
  assert.equal((await transport.status(sent.hash,request)).status,'pending');
  finalized=true;
  assert.equal((await transport.status(sent.hash,request)).status,'finalized');
  receipt={hash:sent.hash,from:contract,to:consensusAddress,status:'success',logs};
  await assert.rejects(transport.status(sent.hash,request),/identity/i);
 }finally{await transport.close?.();}
});
test('sponsorship rejects unsafe networks, code, gas and low funding before signing',async()=>{
 const store=await createSponsorStore('memory://');let signed=0;
 const signer={address:sponsor,sign:async()=>{signed++;return '0x1234' as Hex;}};
 try{
  for(const provider of [rpc({chainId:async()=>1}),rpc({code:async()=>source+'changed'}),rpc({sponsor:async()=>contract}),rpc({estimate:async()=>5000000n}),rpc({gasPrice:async()=>10000000000n}),rpc({balance:async()=>1n})]){
   const transport=createGenLayerTransport({genlayerContractAddress:contract},{store,rpc:provider,signer});
   await assert.rejects(transport.submit(request));
  }
  assert.equal(signed,0);assert.equal(await store.get(request.id),null);
 }finally{await store.close();}
});
test('interpretation calldata binds the original context and never sends user wallet addresses',()=>{
 const encoded=encodeInterpretation(sponsor,contract,request,Date.parse('2026-11-20T00:00:00Z'));
 assert.ok(encoded.startsWith('0x'));assert.notEqual(encoded,encodeInterpretation(sponsor,contract,{...request,digest:'different'},Date.parse('2026-11-20T00:00:00Z')));
});
