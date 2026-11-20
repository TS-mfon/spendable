import {randomUUID} from 'node:crypto';import {Decimal} from 'decimal.js';import {encodeFunctionData} from 'viem';
import type {RouteQuote,QuoteFee} from '../shared/contracts.ts';import type {QuoteRequest} from '../shared/ports.ts';
import {SpendableError} from '../shared/errors.ts';import {ProviderContext} from './context.ts';import {RpcClient,tokenAbi} from './rpc.ts';import {buildSteps} from './steps.ts';
export async function quote(request:QuoteRequest,context:ProviderContext):Promise<RouteQuote>{
 const source=await context.resolveAsset(request.source),target=await context.resolveAsset(request.intent.targetAsset);
 const chains=await context.capabilities(),chain=chains.find(c=>c.id===source.chainId)!;
 if(!chain.feeEstimation)throw new SpendableError('UNSUPPORTED_FEES','Source-chain fee components are not bounded.',422);
 const rpc=context.rpcFor(chain);let q:RouteQuote;
 if(source.key===target.key){
  const amount=request.targetAmountAtoms??request.fromAmountAtoms;
  if(BigInt(amount)<=0n)throw new SpendableError('INVALID_AMOUNT','Transfer amount must be positive.',422);
  const to=source.kind==='native'?request.intent.recipient:source.address!;
  const value=source.kind==='native'?amount:'0';
  const data=source.kind==='native'?'0x' as const:encodeFunctionData({abi:tokenAbi,functionName:'transfer',args:[request.intent.recipient,BigInt(amount)]});
  const transaction=await rpc.prepare(request.intent.owner,to,value,data);
  const fee=(BigInt(transaction.gasLimit)*BigInt(transaction.gasPrice!)).toString(),now=Date.now();
  q={id:randomUUID(),provider:'direct',owner:request.intent.owner,recipient:request.intent.recipient,sourceAsset:source,targetAsset:target,fromAmountAtoms:amount,toAmountAtoms:amount,minimumOutputAtoms:amount,fees:[{kind:'network',name:'Network gas cap',asset:chain.nativeAsset,amountAtoms:fee,maxAmountAtoms:fee,includedInInput:false}],approvalAddress:null,transaction,estimatedSeconds:30,priceImpactBps:0,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),providerData:{}};
 }else{
  if(target.kind==='native')throw new SpendableError('UNSUPPORTED_NATIVE_ROUTE','Native routed delivery requires a verified trace path. Choose a verified wrapped token.',422);
  q=await context.lifi.quote({...request,source,intent:{...request.intent,targetAsset:target}},chain);
  const priced=await context.cmc.prices([source,target]);
  const p=(key:string)=>{const value=priced.prices.find(x=>x.assetKey===key);if(!value)throw new SpendableError('MISSING_PRICE','CMC route valuation is unavailable.',502);return new Decimal(value.usd);};
  const cost=new Decimal(q.fromAmountAtoms).div(new Decimal(10).pow(source.decimals)).mul(p(source.key));
  const minimum=new Decimal(q.minimumOutputAtoms).div(new Decimal(10).pow(target.decimals)).mul(p(target.key));
  const loss=Decimal.max(0,cost.sub(minimum).div(cost).mul(10000)).ceil().toNumber();
  q={...q,priceImpactBps:loss,providerData:{...q.providerData,impactMethod:'CMC minimum-output reference value loss including route fees and slippage'}};
 }
 const steps=await buildSteps(q,rpc);
 const approval:QuoteFee[]=steps.filter(s=>s.kind!=='funding').map(s=>{const amount=(BigInt(s.transaction.gasLimit)*BigInt(s.transaction.gasPrice!)).toString();return {kind:'approval',name:s.kind==='approval_reset'?'Allowance reset gas cap':'Approval gas cap',asset:chain.nativeAsset,amountAtoms:amount,maxAmountAtoms:amount,includedInInput:false};});
 return {...q,transaction:steps.at(-1)!.transaction,fees:[...q.fees.filter(f=>f.kind!=='approval'),...approval]};
}
