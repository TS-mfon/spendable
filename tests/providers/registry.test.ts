import test from 'node:test';import assert from 'node:assert/strict';
import {parseChains,joinAssets} from '../../src/providers/registry.ts';
const raw={chains:[{id:1,key:'eth',name:'Ethereum',chainType:'EVM',nativeToken:{address:'0x0000000000000000000000000000000000000000',chainId:1,symbol:'ETH',name:'Ether',decimals:18},metamask:{rpcUrls:['https://rpc.example'],blockExplorerUrls:['https://scan.example']}},{id:8453,key:'bas',name:'Base',chainType:'EVM',nativeToken:{address:'0x0000000000000000000000000000000000000000',chainId:8453,symbol:'ETH',name:'Ether',decimals:18},metamask:{rpcUrls:['https://base.example'],blockExplorerUrls:[]}},{id:1151111081099710,key:'sol',name:'Solana',chainType:'SVM'}]};
test('chain discovery separates EVM IDs and fails closed on missing fee components',()=>{
 const chains=parseChains(raw);assert.equal(chains.length,2);assert.equal(chains[0].nativeAsset.cmcId,1027);
 assert.equal(chains[0].feeEstimation,true);assert.equal(chains[1].feeEstimation,false);assert.ok(chains[1].reasons.length);
});
test('trusted tokens join CMC platform name and LI.FI exact address without trusting symbol',()=>{
 const chains=parseChains(raw);const address='0x1111111111111111111111111111111111111111';
 const metadata=[{id:3408,symbol:'USDC',name:'USD Coin',deployments:[{platform:'Ethereum',address}]}];
 const tokens={'1':[{chainId:1,address,symbol:'USDC',name:'USD Coin',decimals:6},{chainId:1,address:'0x2222222222222222222222222222222222222222',symbol:'USDC',name:'Fake USD Coin',decimals:6}]};
 const result=joinAssets(chains,metadata,tokens);assert.equal(result[0].assets?.length,2);
 assert.equal(result[0].assets?.[1].address,address);assert.equal(result[0].assets?.[1].cmcId,3408);
 assert.equal(result[1].assets?.length,1);
});
