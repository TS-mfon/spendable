import type {Execution,FundingPlan,InterpretationRequest} from '../shared/contracts.ts';
import {atoms} from '../domain/money.ts';
import type {Database} from './db.ts';
import {assertCommitments} from './commitments.ts';
import {aggregate,copy,dueTime,fail,terminalStates} from './utils.ts';
export function mutations(db:Database){
 return {
 async putPlan(plan:FundingPlan){
  await db.query('INSERT INTO spendable_plans(id,owner,payload) VALUES($1,$2,$3)',[plan.id,plan.owner.toLowerCase(),JSON.stringify(plan)]);
 },
 async putInterpretation(request:InterpretationRequest){
  await db.query(`INSERT INTO spendable_interpretations(id,owner,payload) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET payload=EXCLUDED.payload WHERE spendable_interpretations.owner=EXCLUDED.owner AND ((spendable_interpretations.payload->>'version')::integer < (EXCLUDED.payload->>'version')::integer OR ((spendable_interpretations.payload->>'version')::integer = (EXCLUDED.payload->>'version')::integer AND (CASE EXCLUDED.payload->>'status' WHEN 'accepted' THEN 4 WHEN 'submitted' THEN 3 WHEN 'clarification' THEN 2 WHEN 'unavailable' THEN 1 ELSE 0 END) > (CASE spendable_interpretations.payload->>'status' WHEN 'accepted' THEN 4 WHEN 'submitted' THEN 3 WHEN 'clarification' THEN 2 WHEN 'unavailable' THEN 1 ELSE 0 END)))`,[request.id,request.owner.toLowerCase(),JSON.stringify(request)]);
 },
 async reserve(execution:Execution,key:string){
  if(!key||key.length>160||!execution.debits.length||execution.version!==1)throw fail('INVALID_RESERVATION','Invalid payment reservation.');
  const owner=execution.owner.toLowerCase();
  return db.transaction(async tx=>{
   if(db.remote)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[owner]);
   const old=await tx.query('SELECT payload FROM spendable_executions WHERE owner=$1 AND idempotency_key=$2',[owner,key]);
   if(old.rows[0]){
    const previous=old.rows[0].payload as Execution;
    if(previous.planId!==execution.planId||previous.commitmentHash!==execution.commitmentHash)throw fail('IDEMPOTENCY_CONFLICT','This request key belongs to another payment.');
    return copy(previous);
   }
   const rows=await tx.query('SELECT payload FROM spendable_executions WHERE owner=$1 ORDER BY id',[owner]);
   const history=rows.rows.map(row=>row.payload as Execution);
   assertCommitments(execution,history);
   const reserved=aggregate(history.filter(record=>!terminalStates.includes(record.state)));
   const keys=execution.debits.map(d=>d.assetKey);
   if(new Set(keys).size!==keys.length)throw fail('INVALID_RESERVATION','Duplicate debit asset.');
   for(const debit of execution.debits){
    const used=reserved.find(x=>x.assetKey===debit.assetKey)?.amountAtoms??'0';
    if(atoms(used)+atoms(debit.amountAtoms)>atoms(debit.observedBalanceAtoms))throw fail('INSUFFICIENT_FUNDS','Funds are already reserved or no longer available.');
   }
   await tx.query('INSERT INTO spendable_executions(id,owner,idempotency_key,version,state,payload,next_check_at) VALUES($1,$2,$3,$4,$5,$6,$7)',[execution.id,owner,key,execution.version,execution.state,JSON.stringify(execution),dueTime(execution)]);
   return copy(execution);
  });
 },
 async updateExecution(execution:Execution,expected:number){
  if(execution.version!==expected+1)throw fail('VERSION_CONFLICT','Refresh the payment before continuing.');
  return db.transaction(async tx=>{
  if(db.remote)await tx.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[execution.owner.toLowerCase()]);
  const r=await tx.query('UPDATE spendable_executions SET payload=$1,version=$2,state=$3,next_check_at=$4 WHERE id=$5 AND owner=$6 AND version=$7 RETURNING payload',[JSON.stringify(execution),execution.version,execution.state,dueTime(execution),execution.id,execution.owner.toLowerCase(),expected]);
  if(!r.rows[0])throw fail('VERSION_CONFLICT','This payment changed. Refresh before continuing.');
  return copy(r.rows[0].payload as Execution);
  });
 }
 };
}
