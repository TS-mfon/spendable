import test from 'node:test';import assert from 'node:assert/strict';
import {ZerionClient} from '../../src/providers/zerion.ts';
import {parseChains} from '../../src/providers/registry.ts';
const owner='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
const tokenAddress='0x1111111111111111111111111111111111111111';
const base=parseChains({chains:[{id:1,key:'eth',name:'Ethereum',chainType:'EVM',nativeToken:{symbol:'ETH',name:'Ether',decimals:18},metamask:{rpcUrls:['https://rpc.example']}}]})[0];
const chain={...base,assets:[base.nativeAsset,{key:'1:'+tokenAddress,chainId:1,address:tokenAddress as `0x${string}`,kind:'erc20' as const,symbol:'USDC',name:'USD Coin',decimals:6,cmcId:3408}]};
test('Zerion retains atomic amounts and ignores provider USD valuations',async()=>{
 const client=new ZerionClient({zerionApiKey:'test',fetch:(async(input,init)=>{
  assert.equal(new Headers(init?.headers).get('Authorization'),'Basic '+Buffer.from('test:').toString('base64'));
  assert.ok(String(input).includes('only_simple'));
  return Response.json({data:[{attributes:{quantity:{int:'50000001',decimals:6},value:999999,fungible_info:{symbol:'USDC',name:'USD Coin',implementations:[{chain_id:'ethereum',address:tokenAddress}]}},relationships:{chain:{data:{id:'ethereum'}}}}],links:{next:null}});
 }) as typeof fetch});
 const result=await client.positions(owner,[chain]);assert.equal(result.holdings[0].balanceAtoms,'50000001');assert.equal(result.holdings[0].asset.cmcId,3408);assert.equal(result.complete,true);
});
test('unknown networks and unsupported assets produce visible discovery warnings',async()=>{
 const client=new ZerionClient({zerionApiKey:'test',fetch:(async()=>Response.json({data:[{attributes:{quantity:{int:'5',decimals:6},fungible_info:{symbol:'FAKE',name:'Fake',implementations:[]}},relationships:{chain:{data:{id:'unknown-chain'}}}}]})) as typeof fetch});
 const result=await client.positions(owner,[chain]);assert.equal(result.complete,false);assert.ok(result.warnings.length);
});
