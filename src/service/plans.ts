import {randomUUID} from 'node:crypto';
import {Decimal} from 'decimal.js';
const D=Decimal.clone({precision:256});
import type {Address,FundingCandidate,FundingPlan,WalletContext,WalletHolding} from '../shared/contracts.ts';
import {atoms,decimal,parseIntent,rankCandidate,sameAsset,livePrice} from '../domain/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {quoteAmounts,fiatBudget} from './amounts.ts';
import type {Dependencies} from './types.ts';
async function candidate(deps:Dependencies,intent:FundingPlan['intent'],context:WalletContext,holding:WalletHolding):Promise<FundingCandidate>{
 const request={intent,source:holding.asset,...quoteAmounts(intent,holding.asset,context)};
 const reserved=await deps.repository.reserved(intent.owner);
 let quote=await deps.providers.quote(request);
 let result=rankCandidate(quote,context,intent,reserved);
 if(!sameAsset(quote.sourceAsset,holding.asset))return {...result,eligible:false,reasons:[...result.reasons,'Quote source does not match the selected funding asset.']};
 if(intent.amountMode==='spend_fiat'){
  const budget=fiatBudget(intent,context);
  if(decimal(result.totalSpendUsd).gt(budget)){
   const excess=decimal(result.totalSpendUsd).sub(budget).div(livePrice(context,holding.asset.key)).mul(new D(10).pow(holding.asset.decimals)).ceil();
   const reduced=atoms(quote.fromAmountAtoms)-BigInt(excess.toFixed(0));
   if(reduced>0n){quote=await deps.providers.quote({...request,fromAmountAtoms:reduced.toString()});result=rankCandidate(quote,context,intent,reserved);}
  }
  if(decimal(result.totalSpendUsd).gt(budget))return {...result,eligible:false,reasons:[...result.reasons,'Total source and fees exceed the spending budget.']};
 }
 if(request.targetAmountAtoms&&atoms(quote.minimumOutputAtoms)<atoms(request.targetAmountAtoms))return {...result,eligible:false,reasons:[...result.reasons,'Minimum delivery is below the requested amount.']};
 if(intent.amountMode==='spend_token'&&(atoms(quote.fromAmountAtoms)+quote.fees.filter(f=>!f.includedInInput&&f.asset.key===quote.sourceAsset.key).reduce((n,f)=>n+atoms(f.maxAmountAtoms),0n))>atoms(request.fromAmountAtoms))return {...result,eligible:false,reasons:[...result.reasons,'Source spend exceeds the requested token amount.']};
 return result;
}
export async function createPlan(deps:Dependencies,owner:Address,input:unknown):Promise<FundingPlan>{
 let intent=parseIntent(owner,input);
 let context=await deps.providers.wallet(owner);
 if(context.wallet.toLowerCase()!==owner.toLowerCase())throw new SpendableError('OWNER_MISMATCH','Wallet discovery belongs to another wallet.',403);
 const known=context.holdings.map(h=>h.asset).concat(context.chains.map(c=>c.nativeAsset));
 const target=deps.providers.resolveAsset?await deps.providers.resolveAsset(intent.targetAsset):known.find(a=>sameAsset(a,intent.targetAsset));
 if(!target||!sameAsset(target,intent.targetAsset))throw new SpendableError('UNVERIFIED_ASSET','The target token identity or decimals could not be verified.');
 intent={...intent,targetAsset:target};
 const targetChain=context.chains.find(c=>c.id===target.chainId);
 if(!targetChain?.verification)throw new SpendableError('UNSUPPORTED_CHAIN','This destination lacks delivery verification.');
 if(deps.providers.prices){
  const extra=await deps.providers.prices([target]);
  context={...context,prices:[...context.prices.filter(p=>p.assetKey!==target.key),...extra.prices],rates:extra.rates.length?extra.rates:context.rates};
 }
 if(intent.interpretationId){
  const interpretation=await deps.repository.getInterpretation(owner,intent.interpretationId);
  if(interpretation?.status!=='accepted')throw new SpendableError('INTERPRETATION_UNCONFIRMED','Confirm an accepted interpretation or use the structured form.');
 }
 const holdings=context.holdings.filter(h=>atoms(h.balanceAtoms)>0n&&(!intent.sourceAssetKey||h.asset.key===intent.sourceAssetKey)&&!(sameAsset(h.asset,target)&&intent.recipient.toLowerCase()===owner.toLowerCase()));
 const results=await Promise.allSettled(holdings.map(h=>candidate(deps,intent,context,h)));
 const candidates=results.flatMap(r=>r.status==='fulfilled'?[r.value]:[]).toSorted((a,b)=>Number(b.eligible)-Number(a.eligible)||decimal(a.totalSpendUsd).comparedTo(decimal(b.totalSpendUsd)));
 const warnings=[...context.warnings,...results.flatMap(r=>r.status==='rejected'?[r.reason instanceof SpendableError?r.reason.message:'A funding route is currently unavailable.']:[])];
 const now=new Date().toISOString();
 const plan:FundingPlan={id:randomUUID(),owner:intent.owner,intent,version:1,state:candidates.some(c=>c.eligible)?'quoted':candidates.length?'insufficient_funds':'unavailable',candidates,prices:context.prices,rates:context.rates,warnings,createdAt:now,expiresAt:candidates.length?candidates.reduce((t,c)=>Date.parse(c.quote.expiresAt)<Date.parse(t)?c.quote.expiresAt:t,candidates[0].quote.expiresAt):now};
 await deps.repository.putPlan(plan);return plan;
}
