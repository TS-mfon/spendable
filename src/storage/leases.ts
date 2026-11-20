import {randomUUID} from 'node:crypto';
import type {Address,Execution} from '../shared/contracts.ts';
import type {Database} from './db.ts';
import {copy,fail,terminalStates} from './utils.ts';
export interface ExecutionClaim {readonly execution:Execution;readonly leaseToken:string}
export function leases(db:Database){
 return {
 async claimExecution(owner:Address,id:string,leaseMs=120000):Promise<string|null>{
  if(!Number.isInteger(leaseMs)||leaseMs<100||leaseMs>300000)throw fail('INVALID_BATCH','Invalid execution lease.');
  const token=randomUUID(),now=Date.now();
  const r=await db.query('UPDATE spendable_executions SET lease_token=$1,lease_until=$2 WHERE id=$3 AND owner=$4 AND (lease_until IS NULL OR lease_until<=$5) AND NOT(state=ANY($6::text[])) RETURNING id',[token,now+leaseMs,id,owner.toLowerCase(),now,terminalStates]);
  return r.rows.length?token:null;
 },
 async claimDue(limit:number,now=Date.now(),leaseMs=30000):Promise<readonly ExecutionClaim[]>{
  if(!Number.isInteger(limit)||limit<1||limit>100||!Number.isFinite(now)||leaseMs<100||leaseMs>300000)throw fail('INVALID_BATCH','Invalid reconciliation lease.');
  return db.transaction(async tx=>{
   const lock=db.remote?' FOR UPDATE SKIP LOCKED':'';
   const r=await tx.query('SELECT id,payload FROM spendable_executions WHERE next_check_at<=$1 AND (lease_until IS NULL OR lease_until<=$1) AND NOT(state=ANY($2::text[])) ORDER BY next_check_at LIMIT $3'+lock,[now,terminalStates,limit]);
   return Promise.all(r.rows.map(async row=>{
    const token=randomUUID();
    await tx.query('UPDATE spendable_executions SET lease_token=$1,lease_until=$2 WHERE id=$3',[token,now+leaseMs,row.id]);
    return {execution:copy(row.payload as Execution),leaseToken:token};
   }));
  });
 },
 async releaseLease(id:string,token:string){
  const r=await db.query('UPDATE spendable_executions SET lease_token=NULL,lease_until=NULL WHERE id=$1 AND lease_token=$2 RETURNING id',[id,token]);
  if(!r.rows.length)throw fail('LEASE_CONFLICT','Reconciliation lease has changed.');
 }
 };
}
