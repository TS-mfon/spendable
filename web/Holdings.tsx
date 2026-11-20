import {Decimal} from 'decimal.js';
import type {WalletContext} from '../src/shared/contracts.ts';
import {displayAtoms,usd} from './model.ts';
export function Holdings({context,loading,refresh}:{context:WalletContext|null;loading:boolean;refresh:()=>void}){
 const prices=new Map(context?.prices.map(p=>[p.assetKey,p]));
 const chains=context?.chains.filter(c=>context.holdings.some(h=>h.asset.chainId===c.id))??[];
 return <aside className="holdings panel" aria-labelledby="holdings-title">
  <div className="section-heading"><h2 id="holdings-title">Your funding sources</h2><button className="text-button" onClick={refresh} disabled={!context||loading}>{loading?'Refreshing…':'Refresh'}</button></div>
  <p className="quiet">A payment uses one asset on one network. Available value depends on the destination and fees.</p>
  {!context?<div className="empty-holdings"><div className="wallet-outline" aria-hidden="true"></div><h3>{loading?'Reading your wallet…':'Your crypto, across networks'}</h3><p>{loading?'Checking directly held assets and reference prices.':'Connect your wallet to see which holdings can fund a payment.'}</p></div>:null}
  {context&&context.holdings.length===0?<p className="empty-copy">No supported directly held assets were found. Add an asset on a supported EVM network, then refresh.</p>:null}
  {chains.map(chain=><section className="chain-group" key={chain.id}>
   <div className="chain-heading"><h3>{chain.name}</h3><span className={chain.feeEstimation&&chain.verification?'availability':'quiet'}>{chain.feeEstimation&&chain.verification?'Fee checks available':'Limited support'}</span></div>
   {context?.holdings.filter(h=>h.asset.chainId===chain.id).map(h=>{
    const price=prices.get(h.asset.key);const amount=displayAtoms(h.balanceAtoms,h.asset.decimals);
    const value=price?usd(new Decimal(amount).mul(price.usd).toString()):'Price unavailable';
    return <div className="holding-row" key={h.asset.key}><span className={'token-icon token-'+h.asset.symbol.toLowerCase()} aria-hidden="true">{h.asset.symbol.slice(0,1)}</span><div className="holding-name"><strong title={h.asset.address??'Native gas token'}>{h.asset.symbol}</strong><small>{h.asset.name}</small>{h.asset.address?<small><code title={h.asset.address}>{h.asset.address.slice(0,6)+'…'+h.asset.address.slice(-4)}</code></small>:null}{h.warning?<small className="warning-text">{h.warning}</small>:null}</div><div className="holding-amount"><strong title={amount}>{amount}</strong><small>{value}</small></div></div>;
   })}
  </section>)}
  {context?<details className="evidence"><summary>Price and discovery evidence</summary><p>Wallet checked {new Date(context.observedAt).toLocaleString()}.</p>{context.prices.map(p=><p key={p.assetKey}>{p.assetKey}: {usd(p.usd)}, CMC at {new Date(p.observedAt).toLocaleString()}<br/><code>{p.endpoint}</code></p>)}{context.warnings.map(w=><p key={w} className="warning-text">{w}</p>)}</details>:null}
 </aside>;
}
