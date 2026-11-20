import type {AssetRef,Address,ChainCapability,WalletContext} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';import {CmcClient} from './cmc.ts';import {LifiClient} from './lifi.ts';import {ZerionClient} from './zerion.ts';import {RpcClient} from './rpc.ts';
import {parseChains,joinAssets,chainIdForName} from './registry.ts';
export class ProviderContext{
 private cached:{at:number,chains:readonly ChainCapability[]}|null=null;
 constructor(readonly cmc:CmcClient,readonly lifi:LifiClient,readonly zerion:ZerionClient,readonly rpcFor:(c:ChainCapability)=>RpcClient){}
 async capabilities():Promise<readonly ChainCapability[]>{
  if(this.cached&&Date.now()-this.cached.at<86400000)return structuredClone(this.cached.chains);
  let chains=parseChains(await this.lifi.chains());let complete=true;
  try{chains=joinAssets(chains,await this.cmc.metadata(),await this.lifi.tokens(chains));}
  catch{complete=false;chains=chains.map(c=>({...c,reasons:[...c.reasons,'CMC deployment metadata unavailable; only verified native assets exposed.']}));}
  try{
   const names=await this.zerion.chains(),ids=new Set(names.map(chainIdForName));
   chains=chains.map(c=>({...c,discovery:ids.has(c.id)}));
  }catch{complete=false;chains=chains.map(c=>({...c,discovery:false,reasons:[...c.reasons,'Zerion discovery unavailable.']}));}
  this.cached=complete?{at:Date.now(),chains}:null;return structuredClone(chains);
 }
 async resolveAsset(input:AssetRef):Promise<AssetRef>{
  const chain=(await this.capabilities()).find(c=>c.id===input.chainId);
  const asset=chain?.assets?.find(a=>a.key===input.key&&a.address===(input.address?.toLowerCase()??null));
  if(!asset||asset.decimals!==input.decimals||asset.kind!==input.kind||asset.cmcId!==input.cmcId)throw new SpendableError('UNVERIFIED_ASSET','Asset deployment is not in the CMC-verified registry.',422);
  await this.rpcFor(chain!).decimals(asset);return structuredClone(asset);
 }
 async wallet(owner:Address):Promise<WalletContext>{
  const chains=await this.capabilities(),discovered=await this.zerion.positions(owner,chains);
  const activeIds=[...new Set(discovered.holdings.map(h=>h.asset.chainId))];
  const gas=await Promise.all(activeIds.map(async id=>{
   const c=chains.find(x=>x.id===id)!;
   try{return {asset:c.nativeAsset,...await this.rpcFor(c).balance(owner,c.nativeAsset),observedAt:new Date().toISOString(),discoveredBy:'rpc' as const,warning:null};}
   catch{return null;}
  }));
  const holdings=[...discovered.holdings.filter(h=>!gas.some(g=>g?.asset.key===h.asset.key)),...gas.filter((g):g is NonNullable<typeof g>=>g!==null)];
  const warnings=[...discovered.warnings,...gas.flatMap(g=>g?[]:['A native gas balance could not be verified.'])];
  const assets=chains.flatMap(c=>c.assets??[c.nativeAsset]).filter(a=>a.cmcId!==null);
  const prices=await this.cmc.prices(assets);
  return {wallet:owner,holdings,chains,...prices,observedAt:new Date().toISOString(),complete:discovered.complete&&!warnings.length,warnings};
 }
}
