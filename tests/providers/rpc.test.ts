import test from 'node:test';import assert from 'node:assert/strict';
import {RpcClient} from '../../src/providers/rpc.ts';
import {context,owner,token,native} from '../domain/fixtures.ts';
const chain={...context.chains[0],rpcUrls:['https://rpc.example']};
test('RPC validates chain namespace, retains atomic balances and token decimals',async()=>{
 const client=new RpcClient(chain,{fetch:(async(_url,init)=>{
  const body=JSON.parse(String(init?.body));
  const result=body.method==='eth_chainId'?'0x1':body.method==='eth_blockNumber'?'0x64':body.method==='eth_getBalance'?'0x123':body.method==='eth_call'?(body.params[0].data.startsWith('0x313ce567')?'0x6':'0x2faf080'):'0x0';
  return Response.json({jsonrpc:'2.0',id:1,result});
 }) as typeof fetch});
 assert.deepEqual(await client.balance(owner,native),{balanceAtoms:'291',blockNumber:'100'});
 assert.deepEqual(await client.balance(owner,token),{balanceAtoms:'50000000',blockNumber:'100'});
});
test('RPC rejects wrong chains and never exposes transport errors',async()=>{
 const client=new RpcClient(chain,{fetch:(async()=>Response.json({jsonrpc:'2.0',id:1,result:'0x38'})) as typeof fetch});
 await assert.rejects(client.balance(owner,native),/chain/i);
 const failed=new RpcClient(chain,{fetch:(async()=>{throw Error('secret-provider-body')}) as typeof fetch});
 await assert.rejects(failed.balance(owner,native),(e:unknown)=>e instanceof Error&&!e.message.includes('secret-provider-body'));
});
