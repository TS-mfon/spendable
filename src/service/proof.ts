import type {DeliveryReceipt,Execution} from '../shared/contracts.ts';
import {atoms,sameAsset} from '../domain/index.ts';
export function receiptSupports(e:Execution,r:DeliveryReceipt,state:Execution['state']):boolean{
 if(r.executionId!==e.id||!e.sourceHash||r.sourceHash.toLowerCase()!==e.sourceHash.toLowerCase()||r.proofLevel!=='onchain')return false;
 if(state==='source_reverted')return r.outcome==='reverted';
 if(!r.destinationHash||!r.destinationBlockHash||!r.destinationBlockNumber)return false;
 if(state==='refunded')return r.outcome==='refunded'&&r.recipient.toLowerCase()===e.owner.toLowerCase()&&sameAsset(r.asset,e.candidate.quote.sourceAsset);
 if(r.recipient.toLowerCase()!==e.intent.recipient.toLowerCase()||!sameAsset(r.asset,e.intent.targetAsset))return false;
 if(state==='delivered')return r.outcome==='delivered'&&atoms(r.receivedAtoms)>=atoms(e.candidate.quote.minimumOutputAtoms);
 return state==='partial_delivery'&&r.outcome==='partial'&&atoms(r.receivedAtoms)>0n;
}
function identity(asset:Execution['candidate']['quote']['sourceAsset']){
 return {key:asset.key,chainId:asset.chainId,kind:asset.kind,address:asset.address?.toLowerCase()??null,decimals:asset.decimals,cmcId:asset.cmcId};
}
export function materialQuote(q:Execution['candidate']['quote']):string{
 const fees=q.fees.filter(f=>f.kind!=='approval').map(f=>({kind:f.kind,asset:identity(f.asset),amount:f.amountAtoms,maximum:f.maxAmountAtoms,included:f.includedInInput})).toSorted((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return JSON.stringify({source:identity(q.sourceAsset),target:identity(q.targetAsset),owner:q.owner.toLowerCase(),recipient:q.recipient.toLowerCase(),input:q.fromAmountAtoms,minimum:q.minimumOutputAtoms,approval:q.approvalAddress?.toLowerCase()??null,fees,transaction:{to:q.transaction.to.toLowerCase(),value:q.transaction.value,data:q.transaction.data.toLowerCase()}});
}
