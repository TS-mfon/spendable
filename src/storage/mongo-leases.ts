import {randomUUID} from 'node:crypto';
import type {Address,Execution} from '../shared/contracts.ts';
import type {MongoStore} from './mongo-types.ts';
import type {ExecutionClaim} from './leases.ts';
import {copy,fail,terminalStates} from './utils.ts';
function validate(limit:number,ms:number):void{
 if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isInteger(ms)||ms<100||ms>300000)throw fail('INVALID_BATCH','Invalid reconciliation batch or lease.');
}
export function mongoLeases(store:MongoStore){
 return {
 async claimExecution(owner:Address,id:string,leaseMs=120000):Promise<string|null>{
  validate(1,leaseMs);const token=randomUUID(),now=Date.now();
  const r=await store.executions.findOneAndUpdate({_id:id,owner:owner.toLowerCase(),$or:[{leaseUntil:null},{leaseUntil:{$lte:now}}],state:{$nin:terminalStates as Execution['state'][]}},{$set:{leaseToken:token,leaseUntil:now+leaseMs}},{returnDocument:'after'});
  return r?token:null;
 },
 async claimDue(limit:number,now=Date.now(),leaseMs=30000):Promise<readonly ExecutionClaim[]>{
  validate(limit,leaseMs);if(!Number.isFinite(now))throw fail('INVALID_BATCH','Invalid reconciliation time.');
  let claims:readonly ExecutionClaim[]=[];
  for(let i=0;i<limit;i++){
   const token=randomUUID();
   const r=await store.executions.findOneAndUpdate({nextCheckAt:{$ne:null,$lte:now},$or:[{leaseUntil:null},{leaseUntil:{$lte:now}}],state:{$nin:terminalStates as Execution['state'][]}},{$set:{leaseToken:token,leaseUntil:now+leaseMs}},{sort:{nextCheckAt:1},returnDocument:'after'});
   if(!r)break;
   claims=[...claims,{execution:copy(r.payload),leaseToken:token}];
  }
  return claims;
 },
 async releaseLease(id:string,token:string):Promise<void>{
  const r=await store.executions.updateOne({_id:id,leaseToken:token},{$set:{leaseToken:null,leaseUntil:null}});
  if(!r.matchedCount)throw fail('LEASE_CONFLICT','Reconciliation lease has changed.');
 }
 };
}
