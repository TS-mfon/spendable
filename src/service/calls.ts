import {decodeFunctionData,erc20Abi} from 'viem';
import type {PreparedStep,RouteQuote} from '../shared/contracts.ts';
import {atoms} from '../domain/index.ts';
import {SpendableError} from '../shared/errors.ts';
export function validateCall(q:RouteQuote,step:PreparedStep):void{
 const t=step.transaction;
 if(step.kind!=='funding'){
  if(q.sourceAsset.kind!=='erc20'||t.to.toLowerCase()!==q.sourceAsset.address?.toLowerCase()||atoms(t.value)!==0n||!q.approvalAddress)throw new SpendableError('INVALID_APPROVAL','Approval does not match the funding token.');
  try{
   const decoded=decodeFunctionData({abi:erc20Abi,data:t.data});
   const expected=step.kind==='approval_reset'?0n:atoms(q.fromAmountAtoms);
   if(decoded.functionName!=='approve'||decoded.args[0].toLowerCase()!==q.approvalAddress.toLowerCase()||decoded.args[1]!==expected)throw Error();
  }catch{throw new SpendableError('INVALID_APPROVAL','Approval spender or amount differs from the route commitment.');}
  return;
 }
 if(q.provider!=='direct')return;
 if(q.sourceAsset.kind==='native'){
  if(t.to.toLowerCase()!==q.recipient.toLowerCase()||t.data!=='0x'||atoms(t.value)!==atoms(q.fromAmountAtoms))throw new SpendableError('INVALID_TRANSACTION','Direct transfer recipient or amount differs from the request.');
 }else{
  try{
   const d=decodeFunctionData({abi:erc20Abi,data:t.data});
   if(t.to.toLowerCase()!==q.sourceAsset.address?.toLowerCase()||atoms(t.value)!==0n||d.functionName!=='transfer'||d.args[0].toLowerCase()!==q.recipient.toLowerCase()||d.args[1]!==atoms(q.fromAmountAtoms))throw Error();
  }catch{throw new SpendableError('INVALID_TRANSACTION','Token transfer recipient or amount differs from the request.');}
 }
}
