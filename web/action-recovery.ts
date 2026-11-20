import type {Address,Execution} from '../src/shared/contracts.ts';
import {recoveryMessage} from '../src/shared/recovery.ts';
import {requestApi} from './api.ts';import {signInMessage,type WalletProvider} from './wallet.ts';
export function canRecoverExecution(execution:Execution,pendingBroadcast=false):boolean{
 return !pendingBroadcast&&['awaiting_signature','reconciliation_required'].includes(execution.state)&&!execution.sourceHash
  &&execution.steps.some(s=>s.kind==='funding')
  &&!execution.steps.some(s=>s.kind==='funding'?Boolean(s.submittedHash):Boolean(s.submittedHash&&!s.confirmedBlockNumber));
}
export async function recoverUnsignedAction(provider:WalletProvider,execution:Execution,owner:Address,acknowledged:boolean,fetcher:typeof fetch=fetch):Promise<Execution>{
 if(!acknowledged)throw new Error('Confirm that no unsubmitted transaction, including approvals and funding, was signed or broadcast before releasing its reservation.');
 if(!canRecoverExecution(execution))throw new Error('This action cannot be recovered while a transaction broadcast or approval is unresolved.');
 const path='/api/actions/'+encodeURIComponent(execution.id);
 const current=await requestApi<Execution>(path,{},fetcher);
 if(current.owner.toLowerCase()!==owner.toLowerCase()||current.id!==execution.id||current.commitmentHash!==execution.commitmentHash)throw new Error('The action changed. Review its latest status before requesting recovery.');
 if(!canRecoverExecution(current))throw new Error('This action cannot be recovered while a transaction broadcast or approval is unresolved.');
 const signature=await signInMessage(provider,recoveryMessage(current),owner);
 const released=await requestApi<Execution>(path+'/recover',{method:'POST',body:{version:current.version,signature,acknowledgeLateBroadcastRisk:true}},fetcher);
 if(released.id!==current.id||released.owner.toLowerCase()!==owner.toLowerCase()||released.state!=='canceled')throw new Error('The reservation has not been released. Check the action status before creating another plan.');
 return released;
}
