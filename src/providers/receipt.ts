import type {Execution,DeliveryReceipt} from '../shared/contracts.ts';
import {record,address} from './http.ts';import {quantity} from './proof.ts';
import {RpcClient} from './rpc.ts';
export async function confirmedReceipt(rpc:RpcClient,hash:string):Promise<Record<string,unknown>|null>{
 const raw=await rpc.call('eth_getTransactionReceipt',[hash]);if(raw===null)return null;
 const receipt=record(raw);
 if(String(receipt.transactionHash).toLowerCase()!==hash.toLowerCase()||!receipt.blockNumber||typeof receipt.blockHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(receipt.blockHash))throw Error('Receipt identity mismatch.');
 if(quantity(receipt.status)!==0n&&quantity(receipt.status)!==1n)throw Error('Receipt status is invalid.');
 const head=quantity(await rpc.call('eth_blockNumber'));
 if(head<quantity(receipt.blockNumber)+1n)return null;
 return receipt;
}
export function deliveryReceipt(e:Execution,source:Record<string,unknown>,destination:Record<string,unknown>|null,outcome:DeliveryReceipt['outcome'],receivedAtoms:string,warnings:readonly string[]=[]):DeliveryReceipt{
 const q=e.candidate.quote,d=destination;
 return {executionId:e.id,outcome,recipient:e.intent.recipient,asset:e.intent.targetAsset,requestedAtoms:q.minimumOutputAtoms,receivedAtoms,sourceHash:e.sourceHash??String(source.transactionHash),destinationHash:d?String(d.transactionHash):null,destinationBlockHash:d?String(d.blockHash):null,destinationBlockNumber:d?quantity(d.blockNumber).toString():null,proofLevel:d?'onchain':outcome==='reverted'?'onchain':'unverified',routeAttribution:q.provider,networkFeeAtoms:(quantity(source.gasUsed)*quantity(source.effectiveGasPrice)).toString(),networkFeeAsset:q.fees.find(f=>f.kind==='network')?.asset??null,observedAt:new Date().toISOString(),warnings};
}
export function routeMatches(status:Record<string,unknown>,e:Execution):boolean{
 try{
  const q=e.candidate.quote,s=record(status.sending);
  const validHash=(value:unknown):value is string=>typeof value==='string'&&/^0x[0-9a-fA-F]{64}$/.test(value);
  if(!validHash(s.txHash)||!validHash(e.sourceHash))return false;
  return address(status.fromAddress)===e.owner.toLowerCase()&&address(status.toAddress)===e.intent.recipient.toLowerCase()&&s.txHash.toLowerCase()===e.sourceHash.toLowerCase()&&s.chainId===q.sourceAsset.chainId;
 }catch{return false;}
}
