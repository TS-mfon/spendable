import type {Execution,PreparedStep,ChainCapability} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {RpcClient} from './rpc.ts';import {LifiClient} from './lifi.ts';
import {record,address,atom} from './http.ts';import {validateTransaction,transferAmount,quantity} from './proof.ts';
import {confirmedReceipt,deliveryReceipt,routeMatches} from './receipt.ts';import {verifyRefund} from './refund.ts';
export async function reconcile(e:Execution,chains:readonly ChainCapability[],rpcFor:(c:ChainCapability)=>RpcClient,lifi:LifiClient){
 const q=e.candidate.quote,chain=chains.find(c=>c.id===q.sourceAsset.chainId);
 if(!chain)throw new SpendableError('UNKNOWN_CHAIN','Source chain is unavailable.',503);
 const rpc=rpcFor(chain);await rpc.ensureChain();
 const steps:PreparedStep[]=[];
 for(const step of e.steps){
  if(step.kind==='funding'||!step.submittedHash||step.confirmedBlockNumber){steps.push(step);continue;}
  validateTransaction(step.transaction,await rpc.call('eth_getTransactionByHash',[step.submittedHash]));
  const receipt=await confirmedReceipt(rpc,step.submittedHash);
  if(receipt&&quantity(receipt.status)===0n)return {state:'reconciliation_required' as const,receipt:null,warnings:['Approval reverted. Funding has not been sent.'],steps:e.steps};
  steps.push(receipt?{...step,confirmedBlockNumber:quantity(receipt.blockNumber).toString()}:step);
 }
 const pending={steps,warnings:[] as readonly string[],receipt:null};
 if(!e.sourceHash)return {...pending,state:steps.some(s=>s.submittedHash&&!s.confirmedBlockNumber)?'submitted' as const:'awaiting_signature' as const};
 const funding=e.steps.find(s=>s.kind==='funding')!;
 const sourceTx=await rpc.call('eth_getTransactionByHash',[e.sourceHash]);
 if(sourceTx===null)return {...pending,state:'reconciliation_required' as const,warnings:['Submitted hash is not indexed. Keep the reservation and check again.']};
 validateTransaction(funding.transaction,sourceTx);
 const source=await confirmedReceipt(rpc,e.sourceHash);
 if(!source)return {...pending,state:'submitted' as const};
 const confirmed=steps.map(s=>s.kind==='funding'?{...s,confirmedBlockNumber:quantity(source.blockNumber).toString()}:s);
 if(quantity(source.status)===0n)return {steps:confirmed,state:'source_reverted' as const,receipt:deliveryReceipt(e,source,null,'reverted','0'),warnings:[]};
 if(q.provider==='direct'){
  const amount=q.targetAsset.kind==='native'?quantity(record(sourceTx).value).toString():transferAmount(source.logs,q.targetAsset,e.intent.recipient);
  const complete=BigInt(amount)>=BigInt(q.minimumOutputAtoms);
  return {steps:confirmed,state:complete?'delivered' as const:'partial_delivery' as const,receipt:deliveryReceipt(e,source,source,complete?'delivered':'partial',amount),warnings:[]};
 }
 const status=await lifi.status(e.sourceHash,q.sourceAsset.chainId,q.targetAsset.chainId,typeof q.providerData.tool==='string'?q.providerData.tool:undefined);
 if(!routeMatches(status,e))return {...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Route attribution could not be verified.']};
 if(status.status!=='DONE')return {...pending,steps:confirmed,state:status.status==='PENDING'?'delivery_pending' as const:'reconciliation_required' as const,warnings:status.status==='PENDING'?[]:['Route status is unresolved; no automatic resubmission.']};
 if(status.substatus==='REFUNDED'){
  const refund=await verifyRefund(e,source,status,rpc);
  return refund?{steps:confirmed,state:'refunded' as const,receipt:refund,warnings:refund.warnings}:{...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Provider reports a refund. Source-chain return evidence needs review before releasing funds.']};
 }
 if(status.substatus!=='COMPLETED'&&status.substatus!=='PARTIAL')return {...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Provider completion substatus is unsupported.']};
 const receiving=record(status.receiving),token=record(receiving.token),target=chains.find(c=>c.id===q.targetAsset.chainId);
 if(!target||receiving.chainId!==target.id||address(token.address)!==q.targetAsset.address||token.decimals!==q.targetAsset.decimals) return {...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Destination token or network differs from the request.']};
 const destRpc=rpcFor(target);await destRpc.ensureChain();
 if(typeof receiving.txHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(receiving.txHash))throw new SpendableError('LIFI_PROOF','Destination transaction hash is invalid.',502);
 const dest=await confirmedReceipt(destRpc,receiving.txHash);
 if(!dest)return {...pending,steps:confirmed,state:'delivery_pending' as const};
 if(quantity(dest.status)!==1n)return {...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Destination receipt reverted.']};
 const moved=BigInt(transferAmount(dest.logs,q.targetAsset,e.intent.recipient)),attributed=BigInt(atom(receiving.amount));
 if(attributed<=0n||moved<attributed)return {...pending,steps:confirmed,state:'reconciliation_required' as const,warnings:['Attributed destination amount is not supported by on-chain token movement.']};
 const amount=attributed.toString(),complete=attributed>=BigInt(q.minimumOutputAtoms)&&status.substatus==='COMPLETED';
 return {steps:confirmed,state:complete?'delivered' as const:'partial_delivery' as const,receipt:deliveryReceipt(e,source,dest,complete?'delivered':'partial',amount),warnings:[]};
}
