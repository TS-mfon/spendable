import type {Execution,PreparedStep} from '../shared/contracts.ts';
import {atoms} from '../domain/index.ts';
import {fail,terminalStates} from './utils.ts';
function consumed(record:Execution,step:PreparedStep):boolean{
 if(step.confirmedBlockNumber!==null)return true;
 return step.kind==='funding'&&record.state!=='canceled'&&terminalStates.includes(record.state)&&record.sourceHash!==null&&record.receipt?.proofLevel==='onchain'&&record.receipt.sourceHash.toLowerCase()===record.sourceHash.toLowerCase();
}
export function assertCommitments(incoming:Execution,history:readonly Execution[]):void{
 if(!incoming.steps.length)throw fail('INVALID_COMMITMENT','Prepared transaction steps are required.');
 const slots=incoming.steps.map(step=>{
  const tx=step.transaction;
  if(tx.nonce===null||!Number.isSafeInteger(tx.nonce)||tx.nonce<0||tx.from.toLowerCase()!==incoming.owner.toLowerCase())throw fail('INVALID_COMMITMENT','Signing requires a valid wallet and nonce.');
  return tx.chainId+':'+tx.nonce;
 });
 if(new Set(slots).size!==slots.length)throw fail('INVALID_COMMITMENT','Prepared transactions have overlapping nonces.');
 for(const step of incoming.steps){
  for(const prior of history){
   for(const old of prior.steps){
    if(old.transaction.chainId!==step.transaction.chainId||old.transaction.nonce===null)continue;
    if(consumed(prior,old)&&step.transaction.nonce!<=old.transaction.nonce)throw fail('STALE_NONCE','Refresh the wallet nonce after its confirmed transaction.');
    if(!terminalStates.includes(prior.state)&&!consumed(prior,old)&&old.transaction.nonce===step.transaction.nonce)throw fail('NONCE_RESERVED','Another payment already uses this wallet nonce. Submit or reconcile it before preparing another action.');
   }
  }
 }
 const confirmations=history.flatMap(record=>{
  const steps=record.steps.flatMap(step=>step.confirmedBlockNumber===null?[]:[{chainId:step.transaction.chainId,block:atoms(step.confirmedBlockNumber)}]);
  const receipt=record.receipt;
  return receipt?.proofLevel==='onchain'&&receipt.destinationBlockNumber!==null?[...steps,{chainId:receipt.asset.chainId,block:atoms(receipt.destinationBlockNumber)}]:steps;
 });
 const assets=[incoming.candidate.quote.sourceAsset,...incoming.candidate.quote.fees.map(f=>f.asset)];
 for(const debit of incoming.debits){
  const asset=assets.find(a=>a.key===debit.assetKey);
  if(!asset)throw fail('INVALID_RESERVATION','A debit does not match a quoted source or fee asset.');
  const latest=confirmations.filter(c=>c.chainId===asset.chainId).reduce((n,c)=>c.block>n?c.block:n,0n);
  if(latest>0n&&(debit.observedBlockNumber===null||atoms(debit.observedBlockNumber)<latest))throw fail('STALE_BALANCE','Refresh balances after the confirmed transaction before preparing another action.');
 }
}
