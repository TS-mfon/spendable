import type {Execution} from '../shared/contracts.ts';
import {atoms} from '../domain/index.ts';
import type {MongoStore} from './mongo-types.ts';
import {assertCommitments} from './commitments.ts';
import {aggregate,copy,fail,terminalStates} from './utils.ts';
const duplicate=(error:unknown)=>typeof error==='object'&&error!==null&&'code' in error&&error.code===11000;
export async function reserveMongo(store:MongoStore,execution:Execution,key:string):Promise<Execution>{
 if(!key||key.length>160||!execution.debits.length||execution.version!==1)throw fail('INVALID_RESERVATION','Invalid payment reservation.');
 const owner=execution.owner.toLowerCase();
 try{await store.guards.updateOne({_id:owner},{$setOnInsert:{revision:0}},{upsert:true});}
 catch(error){if(!duplicate(error))throw error;}
 return store.transaction(async session=>{
  await store.guards.updateOne({_id:owner},{$inc:{revision:1}},{session});
  const old=await store.executions.findOne({owner,idempotencyKey:key},{session});
  if(old){
   if(old.payload.planId!==execution.planId||old.payload.commitmentHash!==execution.commitmentHash)throw fail('IDEMPOTENCY_CONFLICT','This request key belongs to another payment.');
   return copy(old.payload);
  }
  const records=await store.executions.find({owner},{session}).toArray();
  const history=records.map(record=>record.payload);
  assertCommitments(execution,history);
  const reserved=aggregate(history.filter(record=>!terminalStates.includes(record.state)));
  if(new Set(execution.debits.map(d=>d.assetKey)).size!==execution.debits.length)throw fail('INVALID_RESERVATION','Duplicate debit asset.');
  for(const debit of execution.debits){
   const used=reserved.find(x=>x.assetKey===debit.assetKey)?.amountAtoms??'0';
   if(atoms(used)+atoms(debit.amountAtoms)>atoms(debit.observedBalanceAtoms))throw fail('INSUFFICIENT_FUNDS','Funds are already reserved or no longer available.');
  }
  await store.executions.insertOne({_id:execution.id,owner,idempotencyKey:key,version:execution.version,state:execution.state,payload:copy(execution),nextCheckAt:execution.nextCheckAt?Date.parse(execution.nextCheckAt):null,leaseToken:null,leaseUntil:null},{session});
  return copy(execution);
 });
}
export async function updateMongo(store:MongoStore,execution:Execution,expected:number):Promise<Execution>{
 if(execution.version!==expected+1)throw fail('VERSION_CONFLICT','Refresh the payment before continuing.');
 return store.transaction(async session=>{
 await store.guards.updateOne({_id:execution.owner.toLowerCase()},{$inc:{revision:1}},{session});
 const document=await store.executions.findOneAndUpdate({_id:execution.id,owner:execution.owner.toLowerCase(),version:expected},{$set:{payload:copy(execution),version:execution.version,state:execution.state,nextCheckAt:execution.nextCheckAt?Date.parse(execution.nextCheckAt):null}},{returnDocument:'after',session});
 if(!document)throw fail('VERSION_CONFLICT','This payment changed. Refresh before continuing.');
 return copy(document.payload);
 });
}
