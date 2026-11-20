import type {Address,Execution,FundingPlan,InterpretationRequest} from '../shared/contracts.ts';
import type {SpendableRepository} from './index.ts';
import {openMongoStore} from './mongo-types.ts';
import {reserveMongo,updateMongo} from './mongo-reserve.ts';
import {mongoLeases} from './mongo-leases.ts';
import {aggregate,copy,fail,terminalStates} from './utils.ts';
import {openMongo} from '../shared/mongo.ts';
export async function createMongoRepository(uri:string,connect=()=>openMongo(uri)):Promise<SpendableRepository>{
 const store=await openMongoStore(uri,connect);
 return {
 async putPlan(plan:FundingPlan){
  await store.plans.insertOne({_id:plan.id,owner:plan.owner.toLowerCase(),payload:copy(plan)});
 },
 async getPlan(owner:Address,id:string){const r=await store.plans.findOne({_id:id,owner:owner.toLowerCase()});return r?copy(r.payload):null;},
 async putInterpretation(request:InterpretationRequest){
  const owner=request.owner.toLowerCase();
  const prior=await store.interpretations.findOne({_id:request.id});
  if(prior&&prior.owner!==owner)throw fail('OWNER_MISMATCH','Interpretation belongs to another wallet.');
  if(!prior){await store.interpretations.insertOne({_id:request.id,owner,version:request.version,payload:copy(request)});return;}
  const statuses=['queued','unavailable','clarification','submitted','accepted'];
  const lower=statuses.slice(0,statuses.indexOf(request.status));
  await store.interpretations.updateOne({_id:request.id,owner,$or:[{version:{$lt:request.version}},{version:request.version,'payload.status':{$in:lower}}]},{$set:{version:request.version,payload:copy(request)}});
 },
 async getInterpretation(owner:Address,id:string){const r=await store.interpretations.findOne({_id:id,owner:owner.toLowerCase()});return r?copy(r.payload):null;},
 async findByIdempotency(owner:Address,key:string){const r=await store.executions.findOne({owner:owner.toLowerCase(),idempotencyKey:key});return r?copy(r.payload):null;},
 reserve:(execution:Execution,key:string)=>reserveMongo(store,execution,key),
 async getExecution(owner:Address,id:string){const r=await store.executions.findOne({_id:id,owner:owner.toLowerCase()});return r?copy(r.payload):null;},
 updateExecution:(execution:Execution,version:number)=>updateMongo(store,execution,version),
 async listExecutions(owner:Address){return (await store.executions.find({owner:owner.toLowerCase()}).sort({_id:1}).toArray()).map(r=>copy(r.payload));},
 async reserved(owner:Address){const records=await store.executions.find({owner:owner.toLowerCase(),state:{$nin:terminalStates as Execution['state'][]}}).sort({_id:1}).toArray();return aggregate(records.map(r=>r.payload));},
 async due(limit:number){
  if(!Number.isInteger(limit)||limit<1||limit>100)throw fail('INVALID_BATCH','Reconciliation batch must be between 1 and 100.');
  const rows=await store.executions.find({nextCheckAt:{$ne:null,$lte:Date.now()},state:{$nin:terminalStates as Execution['state'][]}}).sort({nextCheckAt:1}).limit(limit).toArray();
  return rows.map(r=>copy(r.payload));
 },
 ...mongoLeases(store),
 close:()=>store.close()
 };
}
