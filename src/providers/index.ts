import type {MarketProviders} from '../shared/ports.ts';
import type {ChainCapability} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {CmcClient,type CmcConfig} from './cmc.ts';import {LifiClient,type LifiConfig} from './lifi.ts';import {ZerionClient,type ZerionConfig} from './zerion.ts';
import {RpcClient} from './rpc.ts';import {ProviderContext} from './context.ts';import {quote} from './quote.ts';import {buildSteps} from './steps.ts';import {reconcile} from './reconcile.ts';import {validateTransaction} from './proof.ts';
export {CmcClient,LifiClient,ZerionClient,RpcClient};
export interface ProviderConfig extends CmcConfig,LifiConfig,ZerionConfig{readonly rpcFactory?:(chain:ChainCapability)=>RpcClient}
export function createProviders(config:ProviderConfig={}):MarketProviders{
 const cmc=new CmcClient(config),lifi=new LifiClient(config),zerion=new ZerionClient(config),clients=new Map<number,RpcClient>();
 const rpcFor=(chain:ChainCapability)=>{
  const cached=clients.get(chain.id);if(cached)return cached;
  const client=config.rpcFactory?.(chain)??new RpcClient(chain,config);clients.set(chain.id,client);return client;
 };
 const context=new ProviderContext(cmc,lifi,zerion,rpcFor);
 return {
  capabilities:()=>context.capabilities(),
  resolveAsset:asset=>context.resolveAsset(asset),
  prices:assets=>cmc.prices(assets),
  wallet:owner=>context.wallet(owner),
  quote:request=>quote(request,context),
  async refreshBalance(owner,input){const asset=await context.resolveAsset(input);const chain=(await context.capabilities()).find(c=>c.id===asset.chainId)!;return rpcFor(chain).balance(owner,asset);},
  async prepareSteps(q){const chain=(await context.capabilities()).find(c=>c.id===q.sourceAsset.chainId);if(!chain)throw new SpendableError('UNKNOWN_CHAIN','Source chain unavailable.',422);return buildSteps(q,rpcFor(chain));},
  async validateSubmission(e,stepId,hash){
   if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new SpendableError('INVALID_HASH','A complete transaction hash is required.',422);
   const step=e.steps.find(s=>s.id===stepId);if(!step)throw new SpendableError('UNKNOWN_STEP','Prepared transaction step not found.',404);
   const chain=(await context.capabilities()).find(c=>c.id===step.transaction.chainId);if(!chain)throw new SpendableError('UNKNOWN_CHAIN','Source chain unavailable.',422);
   const rpc=rpcFor(chain);await rpc.ensureChain();const tx=await rpc.call('eth_getTransactionByHash',[hash]);
   if(tx===null)throw new SpendableError('SUBMISSION_PENDING','Transaction is not indexed yet. Keep its hash and report it again.',409);
   validateTransaction(step.transaction,tx);
  },
  async reconcile(e){return reconcile(e,await context.capabilities(),rpcFor,lifi);}
 };
}
