import type {ActionUpdate,Execution} from '../src/shared/contracts.ts';
import {displayAtoms,nextSigningStep,progressLabel,shortAddress} from './model.ts';
import {RecoverAction} from './RecoverAction.tsx';
import {isSigningExpired,signingExpiredMessage} from './action-signing.ts';
import type {BroadcastRecord} from './recovery.ts';
interface Props {execution:Execution|null;updates:readonly ActionUpdate[];busy:string;pendingBroadcast:BroadcastRecord|null;sign:(stepId:string)=>void;retryReport:()=>void;observe:()=>void;openAction:(id:string)=>void;recover:(acknowledged:boolean)=>void;}
export function Activity(p:Props){
 const e=p.execution;const awaiting=e&&['awaiting_signature','reserved'].includes(e.state);const expired=Boolean(e&&awaiting&&isSigningExpired(e));
 const step=e&&awaiting&&!expired?nextSigningStep(e):null;
 return <section className="activity panel" aria-labelledby="activity-title">
  <div className="section-heading"><h2 id="activity-title">Payment activity</h2>{e?<button className="text-button" disabled={Boolean(p.busy)} onClick={p.observe}>{p.busy==='observe'?'Checking…':'Check status'}</button>:null}</div>
  {!e?<div className="empty-copy">Prepare a funding plan to review its wallet transaction and track delivery.</div>:null}
  {e?<><div className={'status-banner status-'+e.state}><span className="status-dot" aria-hidden="true"></span><strong>{progressLabel(e.state)}</strong></div>
   <div className="payment-summary"><strong>{displayAtoms(e.candidate.quote.minimumOutputAtoms,e.intent.targetAsset.decimals)} {e.intent.targetAsset.symbol}</strong><span>To <code title={e.intent.recipient}>{shortAddress(e.intent.recipient)}</code> on chain {e.intent.targetAsset.chainId}</span></div>
   <ol className="execution-steps">{e.steps.map(s=><li key={s.id} className={s.confirmedBlockNumber?'complete':s.submittedHash?'pending':''}><span className="step-marker" aria-hidden="true">{s.confirmedBlockNumber?'✓':s.submittedHash?'…':'○'}</span><div><strong>{s.kind==='approval_reset'?'Reset token approval':s.kind==='approval'?'Approve the required token amount':'Send funding transaction'}</strong><p>{s.confirmedBlockNumber?'Confirmed at block '+s.confirmedBlockNumber:s.submittedHash?'Waiting for transaction confirmation.':'Awaiting your wallet signature'}</p>{s.submittedHash?<code className="hash">{s.submittedHash}</code>:null}</div></li>)}</ol>
   {p.pendingBroadcast?<div className="report-recovery"><p>Your wallet returned a transaction hash. Record this hash before taking another action.</p><code className="hash">{p.pendingBroadcast.hash}</code><button className="primary" onClick={p.retryReport} disabled={Boolean(p.busy)}>Retry transaction report</button></div>:step?<div className="signing">
    <h3>Review in your wallet</h3><dl><div><dt>Transaction recipient</dt><dd><code className="hash">{step.transaction.to}</code></dd></div><div><dt>Network</dt><dd>{step.transaction.chainId}</dd></div><div><dt>Gas limit</dt><dd>{step.transaction.gasLimit}</dd></div></dl>
    <button className="primary full" onClick={()=>p.sign(step.id)} disabled={Boolean(p.busy)}>{p.busy==='sign'?'Waiting for your wallet…':step.kind==='funding'?'Sign funding transaction':step.kind==='approval_reset'?'Sign approval reset':'Sign token approval'}</button>
   </div>:null}
   {expired&&!p.pendingBroadcast?<p className="warning-text" role="status">{signingExpiredMessage}</p>:null}
   {e.sourceHash&&!e.receipt?<p className="field-note">Source submission does not prove recipient delivery. Spendable is checking the outcome.</p>:null}
   {e.receipt?<div className="receipt"><h3>Delivery receipt</h3><dl><div><dt>Outcome</dt><dd>{e.receipt.outcome}</dd></div><div><dt>Received</dt><dd>{displayAtoms(e.receipt.receivedAtoms,e.receipt.asset.decimals)} {e.receipt.asset.symbol}</dd></div><div><dt>Evidence</dt><dd>{e.receipt.proofLevel==='onchain'?'Verified on chain':e.receipt.proofLevel==='provider'?'Reported by route provider':'Not verified'}</dd></div></dl>{e.receipt.destinationHash?<code className="hash">{e.receipt.destinationHash}</code>:null}{e.receipt.warnings.map(w=><p className="warning-text" key={w}>{w}</p>)}</div>:null}
   <RecoverAction execution={e} pendingBroadcast={Boolean(p.pendingBroadcast)} busy={p.busy} recover={p.recover}/>
   {e.warnings.map(w=><p className="warning-text" key={w}>{w}</p>)}
  </>:null}
  {p.updates.length?<div className="updates"><h3>Needs attention</h3>{p.updates.map(u=><button className="update-row" key={u.id} disabled={!u.executionId||Boolean(p.busy)} onClick={()=>u.executionId&&p.openAction(u.executionId)}>{u.title}</button>)}</div>:null}
 </section>;
}
