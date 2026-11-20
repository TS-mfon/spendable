import type {Execution,FundingCandidate,PreparedStep} from '../shared/contracts.ts';
import {atoms} from '../domain/index.ts';
import {validateCall} from './calls.ts';
import {SpendableError} from '../shared/errors.ts';
export function validateSteps(candidate:FundingCandidate,steps:readonly PreparedStep[]):void{
 const q=candidate.quote;
 if(!steps.length||steps.filter(s=>s.kind==='funding').length!==1||steps.at(-1)?.kind!=='funding')throw new SpendableError('INVALID_TRANSACTION','Funding steps are incomplete.');
 const networkBudget=q.fees.filter(f=>['network','approval','l1'].includes(f.kind)&&!f.includedInInput).reduce((n,f)=>n+atoms(f.maxAmountAtoms),0n);
 let gas=0n;
 for(const step of steps){
  const t=step.transaction;
  validateCall(q,step);
  if(t.from.toLowerCase()!==q.owner.toLowerCase()||t.chainId!==q.sourceAsset.chainId||!/^0x[0-9a-fA-F]{40}$/.test(t.to)||!/^0x(?:[0-9a-fA-F]{2})*$/.test(t.data)||t.nonce===null||!Number.isSafeInteger(t.nonce)||t.nonce<0)throw new SpendableError('INVALID_TRANSACTION','Transaction sender, chain or nonce is invalid.');
  if(t.maxFeePerGas!==null&&t.gasPrice!==null)throw new SpendableError('UNBOUNDED_FEE','Transaction fee models conflict.');
  const rate=t.maxFeePerGas??t.gasPrice;
  if(rate===null||atoms(t.gasLimit)===0n||atoms(rate)===0n)throw new SpendableError('UNBOUNDED_FEE','The transaction has no usable gas bound.');
  if(t.maxPriorityFeePerGas!==null&&atoms(t.maxPriorityFeePerGas)>atoms(rate))throw new SpendableError('UNBOUNDED_FEE','Priority fee exceeds the transaction fee bound.');
  gas+=atoms(t.gasLimit)*atoms(rate);
  if(step.kind==='funding'&&(t.to.toLowerCase()!==q.transaction.to.toLowerCase()||t.data.toLowerCase()!==q.transaction.data.toLowerCase()||t.value!==q.transaction.value))throw new SpendableError('CHANGED_TRANSACTION','Funding transaction changed. Review a new quote.');
  if(step.kind!=='funding'&&(q.sourceAsset.kind!=='erc20'||t.to.toLowerCase()!==q.sourceAsset.address?.toLowerCase()||atoms(t.value)!==0n))throw new SpendableError('INVALID_APPROVAL','Approval does not match the funding token.');
 }
 if(gas>networkBudget)throw new SpendableError('UNBOUNDED_FEE','Prepared transaction fees exceed the reserved quote bound.');
}
export function nextStep(execution:Execution):PreparedStep|null{
 for(const s of execution.steps){if(s.submittedHash&&!s.confirmedBlockNumber)return null;if(!s.submittedHash)return s;}
 return null;
}
