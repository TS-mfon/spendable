import type {ChainCapability,FundingCandidate,FundingPlan} from '../src/shared/contracts.ts';
import {describeAsset,displayAtoms,shortAddress,usd} from './model.ts';
export function Plans({plan,selected,select,prepare,busy,chains}:{plan:FundingPlan|null;selected:FundingCandidate|null;select:(candidate:FundingCandidate)=>void;prepare:()=>void;busy:string;chains:readonly ChainCapability[]}){
 if(!plan)return null;
 const network=(id:number)=>chains.find(c=>c.id===id)?.name??String(id);
 const expired=Date.parse(plan.expiresAt)<=Date.now();
 return <section className="plans panel" aria-labelledby="plans-title">
  <div className="section-heading"><h2 id="plans-title">Compare your options</h2><span className="quiet">{expired?'Quote expired':plan.state==='quoted'?'Live quote':'No eligible source'}</span></div>
  {plan.candidates.length===0?<p>No funding source could satisfy this request. Check the destination, available balance and network gas, then compare again.</p>:null}
  <div className="plan-list">{plan.candidates.map((c,index)=><article key={c.id} className={'plan-option'+(selected?.id===c.id?' selected':'')}>
   <div className="plan-source"><span className="token-icon" aria-hidden="true">{c.quote.sourceAsset.symbol.slice(0,1)}</span><div><h3 title={c.quote.sourceAsset.address??'Native gas token'}>{describeAsset(c.quote.sourceAsset,plan.candidates.map(candidate=>candidate.quote.sourceAsset),network(c.quote.sourceAsset.chainId))}</h3><small>{c.quote.provider==='direct'?'Direct transfer':'LI.FI route'}{index===0&&c.eligible?' • Lowest quoted total':''}</small></div></div>
   <dl><div><dt>Source amount</dt><dd>{displayAtoms(c.quote.fromAmountAtoms,c.quote.sourceAsset.decimals)} {c.quote.sourceAsset.symbol}</dd></div><div><dt>Minimum received</dt><dd>{displayAtoms(c.quote.minimumOutputAtoms,c.quote.targetAsset.decimals)} {c.quote.targetAsset.symbol}</dd></div><div><dt>Total reference cost</dt><dd>{usd(c.totalSpendUsd)}</dd></div><div><dt>Estimated fees</dt><dd>{usd(c.feesUsd)}</dd></div></dl>
   {c.reasons.map(r=><p className="warning-text" key={r}>{r}</p>)}
   <button type="button" className="secondary" disabled={!c.eligible||expired||Boolean(busy)} onClick={()=>select(c)}>{selected?.id===c.id?'Plan selected':'Review this plan'}</button>
  </article>)}</div>
  {selected?<div className="plan-confirm">
   <div><h3>Confirm these payment terms</h3><p>Recipient <code title={plan.intent.recipient}>{shortAddress(plan.intent.recipient)}</code> · {selected.quote.targetAsset.symbol} on {network(selected.quote.targetAsset.chainId)}</p><p>Receive at least {displayAtoms(selected.quote.minimumOutputAtoms,selected.quote.targetAsset.decimals)} {selected.quote.targetAsset.symbol}. Maximum source amount: {displayAtoms(selected.quote.fromAmountAtoms,selected.quote.sourceAsset.decimals)} {selected.quote.sourceAsset.symbol}, plus separately quoted fees.</p><p>Fee cap: {plan.intent.policy.maxFeeUsd?usd(plan.intent.policy.maxFeeUsd):'No separate USD cap'}. Slippage: {plan.intent.policy.maxSlippageBps} basis points. Price impact: {plan.intent.policy.maxPriceImpactBps} basis points.</p>{plan.intent.policy.maxSourceSpendAtoms?<p>Source spending cap: {displayAtoms(plan.intent.policy.maxSourceSpendAtoms,selected.quote.sourceAsset.decimals)} {selected.quote.sourceAsset.symbol}.</p>:null}</div>
   <button className="primary" onClick={prepare} disabled={expired||Boolean(busy)}>{busy==='prepare'?'Checking and reserving…':'Prepare action'}</button>
  </div>:null}
  {plan.warnings.map(w=><p key={w} className="warning-text">{w}</p>)}
  <details className="evidence"><summary>Quote evidence</summary><p>Plan version {plan.version}. Expires {new Date(plan.expiresAt).toLocaleString()}.</p>{plan.prices.map(p=><p key={p.assetKey}>{p.assetKey}: CMC reference {usd(p.usd)} at {new Date(p.observedAt).toLocaleString()}</p>)}</details>
 </section>;
}
