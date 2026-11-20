import {useEffect,useState} from 'react';import type {Execution} from '../src/shared/contracts.ts';
import {canRecoverExecution} from './action-recovery.ts';
export function RecoverAction({execution,pendingBroadcast,busy,recover}:{execution:Execution;pendingBroadcast:boolean;busy:string;recover:(acknowledged:boolean)=>void}){
 const [acknowledged,setAcknowledged]=useState(false);
 useEffect(()=>setAcknowledged(false),[execution.id,execution.commitmentHash,execution.state]);
 if(!canRecoverExecution(execution,pendingBroadcast))return null;
 return <details className="action-recovery">
  <summary>Release an unsubmitted reservation</summary>
  <p>Use this only if you rejected the wallet transaction or decided to create a different plan before signing.</p>
  <p>A signed transaction can still be broadcast. Releasing this reservation cannot invalidate it. If any unsubmitted transaction was signed or broadcast, check your wallet and report its transaction hash instead.</p>
  <label className="recovery-checkbox"><input type="checkbox" checked={acknowledged} onChange={e=>setAcknowledged(e.target.checked)} disabled={Boolean(busy)}/><span>I confirm no unsubmitted transaction, including approvals and funding, was signed or broadcast</span></label>
  <button className="secondary" disabled={!acknowledged||Boolean(busy)} onClick={()=>recover(acknowledged)}>{busy==='recover'?'Waiting for recovery signature…':'Sign and release reservation'}</button>
 </details>;
}
