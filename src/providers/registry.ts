import type {AssetRef,ChainCapability} from '../shared/contracts.ts';
import type {CmcMetadata} from './metadata.ts';
import {record,array,address} from './http.ts';
const nativeIds:Readonly<Record<number,number>>={1:1027,10:1027,56:1839,137:28321,8453:1027,42161:1027,43114:5805,534352:1027,59144:1027,324:1027,7777777:1027,81457:1027};
const feeChains=new Set([1,56,137,43114]);
export const chainAliases:Readonly<Record<string,number>>={'ethereum':1,'base':8453,'arbitrum':42161,'arbitrum one':42161,'optimism':10,'polygon':137,'polygon pos':137,'bnb smart chain (bep20)':56,'bnb smart chain':56,'binance-smart-chain':56,'avalanche c-chain':43114,'avalanche':43114,'gnosis':100,'scroll':534352,'linea':59144,'zksync era':324,'zksync-era':324,'zora':7777777,'blast':81457};
export function chainIdForName(name:string):number|null{return chainAliases[name.toLowerCase()]??null;}
function urls(input:unknown):readonly string[]{return Array.isArray(input)?input.filter((x):x is string=>typeof x==='string'&&/^https:\/\//.test(x)&&!/^https:\/\/(localhost|127\.|10\.|192\.168\.|169\.254\.)/i.test(x)):[];}
export function parseChains(input:unknown):readonly ChainCapability[]{
 return array(record(input).chains).filter(x=>record(x).chainType==='EVM').map(raw=>{
  const c=record(raw),n=record(c.nativeToken),m=record(c.metamask??{});
  if(!Number.isSafeInteger(c.id)||Number(c.id)<=0||typeof c.name!=='string'||typeof c.key!=='string'||typeof n.symbol!=='string'||typeof n.name!=='string'||!Number.isInteger(n.decimals)||Number(n.decimals)<0||Number(n.decimals)>36)throw Error('Invalid LI.FI chain registry.');
  const id=Number(c.id),rpcUrls=urls(m.rpcUrls),fees=feeChains.has(id)&&rpcUrls.length>0;
  const nativeAsset:AssetRef={key:id+':native',chainId:id,address:null,kind:'native',symbol:n.symbol,name:n.name,decimals:Number(n.decimals),cmcId:nativeIds[id]??null};
  return {id,name:c.name,key:c.key,rpcUrls,explorerUrl:urls(m.blockExplorerUrls)[0]??null,nativeAsset,assets:[nativeAsset],discovery:false,routing:fees,feeEstimation:fees,verification:rpcUrls.length>0,reasons:fees?[]:['Execution disabled until network-specific fee components are bounded and tested.']};
 });
}
export function joinAssets(chains:readonly ChainCapability[],metadata:readonly CmcMetadata[],input:unknown):readonly ChainCapability[]{
 const tokens=record(input,'LI.FI token registry');
 return chains.map(chain=>{
  const listed=Array.isArray(tokens[String(chain.id)])?tokens[String(chain.id)] as unknown[]:[];
  const assets=metadata.flatMap(m=>m.deployments.flatMap(d=>{
   if(chainIdForName(d.platform)!==chain.id||!/^0x[0-9a-f]{40}$/.test(d.address))return [];
   const entry=listed.map(x=>record(x)).find(x=>typeof x.address==='string'&&x.address.toLowerCase()===d.address&&x.chainId===chain.id);
   if(!entry||!Number.isInteger(entry.decimals)||Number(entry.decimals)<0||Number(entry.decimals)>36)return [];
   return [{key:chain.id+':'+d.address,chainId:chain.id,address:address(d.address),kind:'erc20' as const,symbol:m.symbol,name:m.name,decimals:Number(entry.decimals),cmcId:m.id}];
  }));
  return {...chain,assets:[chain.nativeAsset,...assets]};
 });
}
