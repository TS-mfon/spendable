import {randomUUID} from 'node:crypto';
import {Decimal} from 'decimal.js';
const D=Decimal.clone({precision:256});
import type {AssetDebit,AssetRef,FundingCandidate,RouteQuote,SpendableIntent,WalletContext} from '../shared/contracts.ts';
import {atoms,decimal,valueUsd} from './money.ts';
import {SpendableError} from '../shared/errors.ts';
export function sameAsset(a:AssetRef,b:AssetRef):boolean{return a.key===b.key&&a.chainId===b.chainId&&a.kind===b.kind&&a.decimals===b.decimals&&a.address?.toLowerCase()===b.address?.toLowerCase()&&a.cmcId===b.cmcId;}
export function fresh(time:string,maxAgeMs=120000):boolean{const t=Date.parse(time);return Number.isFinite(t)&&t<=Date.now()+10000&&Date.now()-t<=maxAgeMs;}
export function livePrice(context:WalletContext,key:string):string{
 const p=context.prices.find(x=>x.assetKey===key&&x.source==='cmc');
 if(!p||!fresh(p.observedAt)||!decimal(p.usd).gt(0))throw new SpendableError('MISSING_PRICE','A fresh CMC price is unavailable for '+key+'.');
 return p.usd;
}
export function feeDebits(q:RouteQuote):ReadonlyMap<string,bigint>{
 return q.fees.filter(f=>!f.includedInInput).reduce<ReadonlyMap<string,bigint>>((m,f)=>new Map([...m,[f.asset.key,(m.get(f.asset.key)??0n)+atoms(f.maxAmountAtoms)]]),new Map());
}
export function candidateDebits(candidate:FundingCandidate,context:WalletContext):readonly AssetDebit[]{
 const q=candidate.quote,fees=feeDebits(q);
 const all=new Map([[q.sourceAsset.key,(fees.get(q.sourceAsset.key)??0n)+atoms(q.fromAmountAtoms)],...[...fees].filter(([key])=>key!==q.sourceAsset.key)]);
 return [...all].map(([assetKey,n])=>{
 const h=context.holdings.find(x=>x.asset.key===assetKey);
 if(!h)throw new SpendableError('MISSING_BALANCE','A fee or source balance is unavailable.');
 return {assetKey,amountAtoms:n.toString(),observedBalanceAtoms:h.balanceAtoms,observedBlockNumber:h.blockNumber};
 });
}
function remaining(context:WalletContext,key:string,reserved:readonly AssetDebit[],spend:bigint):bigint{
 const balance=atoms(context.holdings.find(x=>x.asset.key===key)?.balanceAtoms??'0');
 const active=reserved.filter(x=>x.assetKey===key).reduce((n,x)=>n+atoms(x.amountAtoms),0n);
 return balance-active-spend;
}
export function rankCandidate(q:RouteQuote,context:WalletContext,intent:SpendableIntent,reserved:readonly AssetDebit[]):FundingCandidate{
 let reasons:readonly string[]=[];
 let inputUsd=new D(0),feesUsd=new D(0),outsideUsd=new D(0);
 if(q.owner.toLowerCase()!==intent.owner.toLowerCase()||q.recipient.toLowerCase()!==intent.recipient.toLowerCase()||!sameAsset(q.targetAsset,intent.targetAsset))reasons=[...reasons,'Quote does not match the request.'];
 if(q.transaction.from.toLowerCase()!==intent.owner.toLowerCase()||q.transaction.chainId!==q.sourceAsset.chainId)reasons=[...reasons,'Transaction sender or chain does not match.'];
 if(!fresh(q.createdAt)||Date.parse(q.expiresAt)<=Date.now())reasons=[...reasons,'Quote expired.'];
 if(q.priceImpactBps===null&&q.provider!=='direct')reasons=[...reasons,'Price impact is unknown.'];
 if((q.priceImpactBps??0)>intent.policy.maxPriceImpactBps)reasons=[...reasons,'Price impact exceeds your limit.'];
 if(intent.sourceAssetKey&&q.sourceAsset.key!==intent.sourceAssetKey)reasons=[...reasons,'Quote source does not match your selected asset.'];
 if(intent.policy.maxSourceSpendAtoms&&(atoms(q.fromAmountAtoms)+(feeDebits(q).get(q.sourceAsset.key)??0n))>atoms(intent.policy.maxSourceSpendAtoms))reasons=[...reasons,'Source spend exceeds your limit.'];
 try{
 inputUsd=valueUsd(q.fromAmountAtoms,q.sourceAsset.decimals,livePrice(context,q.sourceAsset.key));
 for(const f of q.fees){
 if(atoms(f.maxAmountAtoms)<atoms(f.amountAtoms))reasons=[...reasons,'Fee bound is below its estimate.'];
 const amount=valueUsd(f.maxAmountAtoms,f.asset.decimals,livePrice(context,f.asset.key));
 feesUsd=feesUsd.add(amount);
 if(!f.includedInInput)outsideUsd=outsideUsd.add(amount);
 }
 }catch(e){reasons=[...reasons,e instanceof Error?e.message:'A required price is unavailable.'];}
 if(intent.policy.maxFeeUsd&&feesUsd.gt(decimal(intent.policy.maxFeeUsd)))reasons=[...reasons,'Fees exceed your limit.'];
 const fees=feeDebits(q);
 const sourceRemaining=remaining(context,q.sourceAsset.key,reserved,atoms(q.fromAmountAtoms)+(fees.get(q.sourceAsset.key)??0n));
 const native=context.chains.find(c=>c.id===q.sourceAsset.chainId)?.nativeAsset;
 const nativeSpend=native?((fees.get(native.key)??0n)+(q.sourceAsset.key===native.key?atoms(q.fromAmountAtoms):0n)):0n;
 const nativeRemaining=native?remaining(context,native.key,reserved,nativeSpend):0n;
 if(sourceRemaining<0n)reasons=[...reasons,'Source balance is insufficient after reservations.'];
 if(!native||nativeRemaining<atoms(intent.policy.gasReserveAtoms??'0'))reasons=[...reasons,'Native gas balance is insufficient.'];
 for(const [key,n] of fees)if(remaining(context,key,reserved,n+(key===q.sourceAsset.key?atoms(q.fromAmountAtoms):0n))<0n)reasons=[...reasons,'Fee asset balance is insufficient.'];
 if(!q.fees.some(f=>f.kind==='network'&&!f.includedInInput&&native&&f.asset.key===native.key))reasons=[...reasons,'Bounded native network fee is unavailable.'];
 return {id:randomUUID(),quote:q,totalSpendUsd:inputUsd.add(outsideUsd).toFixed(),feesUsd:feesUsd.toFixed(),sourceRemainingAtoms:sourceRemaining.toString(),nativeRemainingAtoms:nativeRemaining.toString(),eligible:reasons.length===0,reasons};
}
