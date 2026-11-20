import type {Address,Execution} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {nextStep} from './steps.ts';
import type {Dependencies} from './types.ts';
export async function reportSubmission(deps:Dependencies,owner:Address,id:string,stepId:string,hash:string,version:number):Promise<Execution>{
 const e=await deps.repository.getExecution(owner,id);
 if(!e)throw new SpendableError('NOT_FOUND','Payment was not found.',404);
 if(!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new SpendableError('INVALID_HASH','Enter a complete transaction hash.');
 const previous=e.steps.find(s=>s.id===stepId);
 if(previous?.submittedHash?.toLowerCase()===hash.toLowerCase())return e;
 if(e.version!==version)throw new SpendableError('VERSION_CONFLICT','Refresh the payment before reporting a transaction.',409);
 const step=nextStep(e);
 if(!step||step.id!==stepId||(e.state!=='awaiting_signature'&&!(e.state==='reconciliation_required'&&step.kind==='funding')))throw new SpendableError('STEP_NOT_READY','Confirm earlier steps before submitting this transaction.',409);
 await deps.providers.validateSubmission(e,stepId,hash);
 const next:Execution={...e,version:e.version+1,state:'submitted',sourceHash:step.kind==='funding'?hash as `0x${string}`:e.sourceHash,steps:e.steps.map(s=>s.id===stepId?{...s,submittedHash:hash as `0x${string}`}:s),nextCheckAt:new Date(Date.now()+10000).toISOString(),updatedAt:new Date().toISOString()};
 return deps.repository.updateExecution(next,e.version);
}
