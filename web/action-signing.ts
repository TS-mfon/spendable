import type {Address,Execution} from '../src/shared/contracts.ts';
import {requestApi} from './api.ts';
import {nextSigningStep} from './model.ts';
import {signPreparedStep,type WalletProvider} from './wallet.ts';
export const signingExpiredMessage='This quote expired. Keep its reservations until you confirm no unsubmitted transaction was signed or broadcast, then release the reservation and compare a fresh plan.';
export function signingDeadline(execution:Execution):string{return execution.signingExpiresAt??execution.candidate.quote.expiresAt;}
export function isSigningExpired(execution:Execution,now=Date.now()):boolean{
 const deadline=Date.parse(signingDeadline(execution));return !Number.isFinite(deadline)||deadline<=now;
}
export async function signExecutionStep(provider:WalletProvider,execution:Execution,stepId:string,owner:Address,fetcher:typeof fetch=fetch,now:()=>number=Date.now,onRefresh?:(current:Execution)=>void):Promise<{hash:string;execution:Execution;stepId:string}>{
 const current=await requestApi<Execution>('/api/actions/'+encodeURIComponent(execution.id),{},fetcher);
 if(current.id!==execution.id||current.owner.toLowerCase()!==owner.toLowerCase()||current.commitmentHash!==execution.commitmentHash)throw new Error('The action changed. Review its current terms before signing.');
 onRefresh?.(current);
 if(!['awaiting_signature','reserved'].includes(current.state))throw new Error('This action is not ready for a new signature. Check its current status.');
 const step=nextSigningStep(current),original=execution.steps.find(s=>s.id===stepId);
 if(!step||step.id!==stepId||!original||original.kind!==step.kind)throw new Error('The next signing step changed. Review the current action before signing.');
 const fields=['chainId','from','to','value','data','gasLimit','maxFeePerGas','maxPriorityFeePerGas','gasPrice','nonce'] as const;
 if(fields.some(key=>step.transaction[key]!==original.transaction[key]))throw new Error('The prepared transaction changed. Compare a fresh plan before signing.');
 if(isSigningExpired(current,now()))throw new Error(signingExpiredMessage);
 const hash=await signPreparedStep(provider,step.transaction,owner,{expiresAt:signingDeadline(current),now});
 return {hash,execution:current,stepId};
}
