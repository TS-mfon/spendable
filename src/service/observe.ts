import type {Address,Execution} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {terminalStates} from '../storage/index.ts';
import {materialQuote,receiptSupports} from './proof.ts';
import {validateSteps} from './steps.ts';
import type {Dependencies} from './types.ts';
async function observeClaimed(deps:Dependencies,owner:Address,id:string):Promise<Execution>{
 const e=await deps.repository.getExecution(owner,id);
 if(!e)throw new SpendableError('NOT_FOUND','Payment was not found.',404);
 if(terminalStates.includes(e.state))return e;
 let result:Awaited<ReturnType<Dependencies['providers']['reconcile']>>;
 try{result=await deps.providers.reconcile(e);}catch(error){
  result={state:'reconciliation_required',receipt:null,warnings:[error instanceof SpendableError?error.message:'Delivery verification is temporarily unavailable. Funds remain reserved.']};
 }
 const steps=result.steps??e.steps;
 validateSteps(e.candidate,steps);
 if(steps.length!==e.steps.length||steps.some((s,i)=>s.id!==e.steps[i].id||s.submittedHash!==e.steps[i].submittedHash||JSON.stringify(s.transaction)!==JSON.stringify(e.steps[i].transaction)))throw new SpendableError('CHANGED_COMMITMENT','Reconciliation cannot change the signed transaction.');
 let state=result.state,receipt=result.receipt;
 let signingExpiresAt=e.signingExpiresAt??e.candidate.quote.expiresAt;
 let warnings=[...e.warnings,...result.warnings];
 if(terminalStates.includes(state)&&(!receipt||!receiptSupports(e,receipt,state))){
  state='reconciliation_required';receipt=null;warnings=[...warnings,'A final outcome needs matching on-chain evidence.'];
 }
 const approvals=e.steps.filter(s=>s.kind!=='funding');
 const justApproved=approvals.length>0&&approvals.some(s=>!s.confirmedBlockNumber)&&steps.filter(s=>s.kind!=='funding').every(s=>s.confirmedBlockNumber);
 if(justApproved&&!e.sourceHash){
  try{
   const q=e.candidate.quote;
   const fresh=await deps.providers.quote({intent:e.intent,source:q.sourceAsset,fromAmountAtoms:q.fromAmountAtoms,targetAmountAtoms:e.intent.amountMode.startsWith('receive')?q.minimumOutputAtoms:null});
   if(!Number.isFinite(Date.parse(fresh.expiresAt))||Date.parse(fresh.expiresAt)<=Date.now())throw new SpendableError('EXPIRED_QUOTE','A current route could not be verified after approval.');
   if(materialQuote(fresh)!==materialQuote(q)){
    state='reconciliation_required';warnings=[...warnings,'Route terms changed after approval. Review and confirm a fresh plan before funding.','Route confirmation is required after approval. Review a new plan before funding.'];
   }else{state='awaiting_signature';signingExpiresAt=fresh.expiresAt;}
  }catch(error){state='reconciliation_required';warnings=[...warnings,error instanceof SpendableError?error.message:'A fresh route could not be verified after approval.','Route confirmation is required after approval. Review a new plan before funding.'];}
 }
 if(!e.sourceHash&&(warnings.includes('Route terms changed after approval. Review and confirm a fresh plan before funding.')||warnings.includes('Route confirmation is required after approval. Review a new plan before funding.')))state='reconciliation_required';
 const terminal=terminalStates.includes(state);
 const next:Execution={...e,signingExpiresAt,steps,state,receipt,version:e.version+1,retryCount:e.retryCount+1,warnings:[...new Set(warnings)],updatedAt:new Date().toISOString(),nextCheckAt:terminal?null:new Date(Date.now()+Math.min(300000,10000*2**Math.min(e.retryCount,5))).toISOString()};
 return deps.repository.updateExecution(next,e.version);
}
export async function observeExecution(deps:Dependencies,owner:Address,id:string):Promise<Execution>{
 const current=await deps.repository.getExecution(owner,id);
 if(!current)throw new SpendableError('NOT_FOUND','Payment was not found.',404);
 if(terminalStates.includes(current.state))return current;
 if(!deps.repository.claimExecution||!deps.repository.releaseLease)throw new SpendableError('SCHEDULER_UNAVAILABLE','Durable observation leases are unavailable.',503);
 const token=await deps.repository.claimExecution(owner,id,120000);
 if(!token)return (await deps.repository.getExecution(owner,id))??current;
 try{return await observeClaimed(deps,owner,id);}
 finally{await deps.repository.releaseLease(id,token);}
}
export async function reconcileDue(deps:Dependencies,limit=20):Promise<{checked:number;warnings:readonly string[]}>{
 if(!deps.repository.claimDue||!deps.repository.releaseLease)throw new SpendableError('SCHEDULER_UNAVAILABLE','Durable reconciliation leases are unavailable.',503);
 if(!Number.isInteger(limit)||limit<1||limit>100)throw new SpendableError('INVALID_BATCH','Batch must be between 1 and 100.');
 let checked=0;let warnings:readonly string[]=[];const deadline=Date.now()+45000;
 for(let index=0;index<limit&&Date.now()<deadline;index++){
  const claim=(await deps.repository.claimDue(1,Date.now(),120000))[0];
  if(!claim)break;
  try{await observeClaimed(deps,claim.execution.owner,claim.execution.id);checked++;}
  catch(error){warnings=[...warnings,error instanceof SpendableError?error.message:'A payment check must be retried.'];}
  finally{try{await deps.repository.releaseLease(claim.execution.id,claim.leaseToken);}catch{warnings=[...warnings,'A reconciliation lease changed before release.'];}}
 }
 return {checked,warnings};
}
