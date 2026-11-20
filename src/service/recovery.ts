import {verifyMessage} from 'viem';
import type {Address,Execution} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {recoveryMessage} from '../shared/recovery.ts';
import {terminalStates} from '../storage/index.ts';
import type {Dependencies} from './types.ts';
export const recoveryWarning='Owner acknowledged that no unsubmitted prepared transaction was signed or broadcast and requested reservation release. A previously signed transaction remains valid; a late broadcast may still spend funds.';
export async function recoverAction(deps:Dependencies,owner:Address,id:string,version:number,signature:string,acknowledgeLateBroadcastRisk:boolean):Promise<Execution>{
 if(acknowledgeLateBroadcastRisk!==true)throw new SpendableError('RECOVERY_ACK_REQUIRED','Acknowledge the risk of a late broadcast before releasing this commitment.');
 const e=await deps.repository.getExecution(owner,id);
 if(!e)throw new SpendableError('NOT_FOUND','Payment was not found.',404);
 const repeated=e.state==='canceled'&&e.warnings.includes(recoveryWarning);
 if(version!==(repeated?e.version-1:e.version))throw new SpendableError('VERSION_CONFLICT','Refresh the action and sign its current recovery version.',409);
 if(terminalStates.includes(e.state)&&!repeated)throw new SpendableError('RECOVERY_UNAVAILABLE','This action already has a final outcome.',409);
 if(e.sourceHash!==null||e.steps.some(s=>s.kind==='funding'&&s.submittedHash!==null))throw new SpendableError('RECOVERY_UNAVAILABLE','Funding was broadcast. Reconcile its outcome before releasing reservations.',409);
 if(e.steps.some(s=>s.kind!=='funding'&&s.submittedHash!==null&&s.confirmedBlockNumber===null))throw new SpendableError('RECOVERY_UNAVAILABLE','A submitted approval is still pending. Confirm its outcome before recovery.',409);
 let valid=false;
 try{valid=await verifyMessage({address:e.owner,message:recoveryMessage(repeated?{...e,version}:e),signature:signature as `0x${string}`});}catch{valid=false;}
 if(!valid)throw new SpendableError('INVALID_RECOVERY_SIGNATURE','The recovery signature does not match this wallet and commitment.',401);
 if(repeated)return e;
 const next:Execution={...e,state:'canceled',version:e.version+1,nextCheckAt:null,receipt:null,warnings:[...e.warnings,recoveryWarning],updatedAt:new Date().toISOString()};
 return deps.repository.updateExecution(next,e.version);
}
