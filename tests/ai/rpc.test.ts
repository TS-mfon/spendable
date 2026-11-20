import test from 'node:test';
import assert from 'node:assert/strict';
import {ExecutionResult,TransactionStatus} from 'genlayer-js/types';
import {createSponsorRpc} from '../../src/ai/rpc.ts';
const address='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const hash=('0x'+'1'.repeat(64)) as `0x${string}`;
test('RPC adapter preserves EVM evidence and distinguishes GenLayer finality from accepted execution',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw new Error('Unexpected network access in an injected RPC test.');});
 let status=TransactionStatus.ACCEPTED;let execution=ExecutionResult.FINISHED_WITH_RETURN;let missing=false;let broken=false;
 class TransactionReceiptNotFoundError extends Error {override name='TransactionReceiptNotFoundError';}
 const evm={
  getChainId:async()=>4221,getBalance:async(input:{address:string})=>{assert.equal(input.address,address);return 42n;},
  estimateGas:async(input:{value:bigint})=>{assert.equal(input.value,0n);return 100n;},getGasPrice:async()=>2n,
  getTransactionCount:async(input:{blockTag:string})=>{assert.equal(input.blockTag,'pending');return 7;},
  sendRawTransaction:async(input:{serializedTransaction:string})=>{assert.equal(input.serializedTransaction,'0x1234');return hash;},
  getTransactionReceipt:async()=>{
   if(missing)throw new TransactionReceiptNotFoundError('Not mined.');
   if(broken)throw new Error('Network unavailable.');
   return {transactionHash:hash,from:address,to:address,status:'success' as const,logs:[]};
  }
 };
 const gen={
  getContractCode:async()=> 'reviewed source',
  readContract:async(input:{functionName:string;args?:string[];transactionHashVariant:string})=>{
   assert.equal(input.transactionHashVariant,'latest-final');
   return input.functionName==='get_sponsor'?address:{requestId:input.args?.[0]};
  },
  getTransaction:async()=>({statusName:status,txExecutionResultName:execution,sender:address,recipient:address})
 };
 const client=createSponsorRpc('https://invalid.example',{evm,gen});
 assert.equal(await client.chainId(),4221);assert.equal(await client.balance(address),42n);
 assert.equal(await client.estimate(address,address,'0x1234'),100n);assert.equal(await client.gasPrice(),2n);assert.equal(await client.nonce(address),7);
 assert.equal(await client.broadcast('0x1234'),hash);assert.equal((await client.receipt(hash))?.hash,hash);
 assert.equal(await client.code(address),'reviewed source');assert.equal(await client.sponsor(address),address);
 assert.deepEqual(await client.result(address,'request-one'),{requestId:'request-one'});
 assert.equal((await client.consensus(hash)).status,'pending');
 status=TransactionStatus.FINALIZED;assert.equal((await client.consensus(hash)).status,'finalized');
 status=TransactionStatus.CANCELED;execution=ExecutionResult.FINISHED_WITH_ERROR;
 assert.equal((await client.consensus(hash)).status,'failed');assert.equal((await client.consensus(hash)).execution,'error');
 missing=true;assert.equal(await client.receipt(hash),null);missing=false;broken=true;await assert.rejects(client.receipt(hash),/Network/);
});
