import type {Address,Execution,FundingPlan,InterpretationRequest} from '../shared/contracts.ts';
import type {Sql} from './db.ts';
import {active,aggregate,copy,fail,terminalStates} from './utils.ts';
export function reads(db:Sql){
 return {
 async findByIdempotency(owner:Address,key:string){const r=await db.query('SELECT payload FROM spendable_executions WHERE owner=$1 AND idempotency_key=$2',[owner.toLowerCase(),key]);return r.rows[0]?copy(r.rows[0].payload as Execution):null;},
 async getPlan(owner:Address,id:string){const r=await db.query('SELECT payload FROM spendable_plans WHERE id=$1 AND owner=$2',[id,owner.toLowerCase()]);return r.rows[0]?copy(r.rows[0].payload as FundingPlan):null;},
 async getInterpretation(owner:Address,id:string){const r=await db.query('SELECT payload FROM spendable_interpretations WHERE id=$1 AND owner=$2',[id,owner.toLowerCase()]);return r.rows[0]?copy(r.rows[0].payload as InterpretationRequest):null;},
 async getExecution(owner:Address,id:string){const r=await db.query('SELECT payload FROM spendable_executions WHERE id=$1 AND owner=$2',[id,owner.toLowerCase()]);return r.rows[0]?copy(r.rows[0].payload as Execution):null;},
 async listExecutions(owner:Address){const r=await db.query('SELECT payload FROM spendable_executions WHERE owner=$1 ORDER BY id',[owner.toLowerCase()]);return r.rows.map(x=>copy(x.payload as Execution));},
 async reserved(owner:Address){return aggregate(await active(db,owner.toLowerCase()));},
 async due(limit:number){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('INVALID_BATCH','Reconciliation batch must be between 1 and 100.');
  const r=await db.query('SELECT payload FROM spendable_executions WHERE next_check_at<=$1 AND NOT(state=ANY($2::text[])) ORDER BY next_check_at LIMIT $3',[Date.now(),terminalStates,limit]);
  return r.rows.map(x=>copy(x.payload as Execution));
 }
 };
}
