import type {FormEvent} from 'react';
import type {AssetRef,ChainCapability,InterpretationRequest} from '../src/shared/contracts.ts';
import {describeAsset,displayAtoms,type ComposeFields} from './model.ts';
interface Props {
 fields:ComposeFields;change:(next:ComposeFields)=>void;assets:readonly AssetRef[];sourceAssets:readonly AssetRef[];chains:readonly ChainCapability[];targetKey:string;setTargetKey:(key:string)=>void;
 enabled:boolean;busy:string;compare:()=>void;interpret:(text:string)=>void;interpretation:InterpretationRequest|null;applyInterpretation:()=>void;
 text:string;setText:(text:string)=>void;
}
const amountModes=[['receive_token','Recipient receives tokens'],['receive_fiat','Recipient receives a fiat reference value'],['spend_token','Spend a source-token amount'],['spend_fiat','Spend a total fiat budget']] as const;
export function Compose(p:Props){
 const set=(key:keyof ComposeFields,value:string)=>p.change({...p.fields,[key]:value});
 const network=(id:number)=>p.chains.find(c=>c.id===id)?.name??String(id);
 const source=p.sourceAssets.find(a=>a.key===p.fields.sourceAssetKey);
 const native=source?p.assets.find(a=>a.chainId===source.chainId&&a.kind==='native'):undefined;
 const submit=(e:FormEvent)=>{e.preventDefault();p.compare();};
 return <section className="compose panel" aria-labelledby="compose-title">
  <div className="section-heading"><h2 id="compose-title">Create a payment</h2><span className="quiet">You sign in your wallet</span></div>
  <div className="operation-switch" role="group" aria-label="Action type">
   <button type="button" aria-pressed={p.fields.operation==='pay'} onClick={()=>p.change({...p.fields,operation:'pay'})}>Pay or send</button>
   <button type="button" aria-pressed={p.fields.operation==='swap'} onClick={()=>p.change({...p.fields,operation:'swap'})}>Buy or swap</button>
  </div>
  <form onSubmit={submit}>
   {p.fields.operation==='pay'?<label>Recipient address<input autoComplete="off" placeholder="0x…" value={p.fields.recipient} onChange={e=>set('recipient',e.target.value)} disabled={!p.enabled}/></label>:<p className="field-note">Swap output returns to your connected wallet.</p>}
   <div className="form-grid">
    <label>Destination token<select value={p.targetKey} onChange={e=>p.setTargetKey(e.target.value)} disabled={!p.enabled}><option value="">Choose token and network</option>{p.assets.map(a=><option key={a.key} value={a.key} title={a.address??'Native gas token'}>{describeAsset(a,p.assets,network(a.chainId))}</option>)}</select></label>
    <label>Amount<input inputMode="decimal" placeholder="0.00" value={p.fields.amount} onChange={e=>set('amount',e.target.value)} disabled={!p.enabled}/></label>
   </div>
   <label>Amount meaning<select value={p.fields.amountMode} onChange={e=>set('amountMode',e.target.value)} disabled={!p.enabled}>{amountModes.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
   {p.fields.amountMode.endsWith('fiat')?<label>Reference currency<select value={p.fields.currency} onChange={e=>set('currency',e.target.value)} disabled={!p.enabled}>{['USD','EUR','GBP','NGN'].map(c=><option key={c}>{c}</option>)}</select></label>:null}
   <label>Funding source<select value={p.fields.sourceAssetKey} onChange={e=>set('sourceAssetKey',e.target.value)} disabled={!p.enabled}><option value="">Compare available sources</option>{p.sourceAssets.map(a=><option key={a.key} value={a.key} title={a.address??'Native gas token'}>{describeAsset(a,p.sourceAssets,network(a.chainId))}</option>)}</select></label>
   <details className="limits" open={Boolean(p.fields.maxSourceSpendAtoms||p.fields.gasReserveAtoms)}><summary>Spending limits</summary><div className="form-grid">
    <label>Maximum fees (USD)<input inputMode="decimal" value={p.fields.maxFeeUsd} onChange={e=>set('maxFeeUsd',e.target.value)} disabled={!p.enabled}/></label>
    <label>Slippage (basis points)<input inputMode="numeric" value={p.fields.maxSlippageBps} onChange={e=>set('maxSlippageBps',e.target.value)} disabled={!p.enabled}/></label>
   </div><p className="field-note">Maximum price impact: {p.fields.maxPriceImpactBps??'300'} basis points.{p.fields.maxSourceSpendAtoms?<><br/>Maximum source amount: {source?displayAtoms(p.fields.maxSourceSpendAtoms,source.decimals)+' '+source.symbol:'Choose the capped source asset.'}</>:null}{p.fields.gasReserveAtoms?<><br/>Gas reserve: {native?displayAtoms(p.fields.gasReserveAtoms,native.decimals)+' '+native.symbol:'Applies to the selected source network.'}</>:null}</p></details>
   <p className="field-note">{p.fields.amountMode==='receive_token'?'A direct send uses an exact token amount. A route must meet the minimum receipt.':p.fields.amountMode==='receive_fiat'?'The token amount uses a recorded CMC price. Its value can change before delivery.':p.fields.amountMode==='spend_fiat'?'The reference budget includes estimated fees. Review the quoted minimum output.':'Review the source amount, fees and quoted minimum output.'}</p>
   <button className="primary full" type="submit" disabled={!p.enabled||Boolean(p.busy)}>{p.busy==='plan'?'Finding funding sources…':'Compare funding sources'}</button>
  </form>
  <details className="natural-request"><summary>Describe the payment in your own words</summary>
   <p className="field-note">Interpretation text is public on GenLayer. Wallet addresses are replaced with aliases.</p>
   <label>Payment request<textarea placeholder="Send 50 USDC to 0x… on Base" maxLength={2000} value={p.text} onChange={e=>p.setText(e.target.value)} disabled={!p.enabled}/></label>
   <button type="button" className="secondary" disabled={!p.enabled||Boolean(p.busy)||!p.text.trim()} onClick={()=>p.interpret(p.text)}>{p.busy==='interpret'?'Submitting request…':'Interpret request'}</button>
   {p.interpretation?<div className="interpretation" role="status"><strong>{p.interpretation.status==='accepted'?'Interpretation ready to review':p.interpretation.status==='unavailable'?'Interpretation unavailable':p.interpretation.status==='clarification'?'More detail needed':'Interpretation in progress'}</strong>{p.interpretation.error?<p>{p.interpretation.error}</p>:null}{p.interpretation.questions.map(q=><p key={q}>{q}</p>)}{p.interpretation.fields?<><p>{p.interpretation.fields.amount} {p.interpretation.fields.targetSymbol} on {network(p.interpretation.fields.targetChainId)}</p><button type="button" className="secondary" onClick={p.applyInterpretation}>Use these fields</button></>:null}</div>:null}
  </details>
 </section>;
}
