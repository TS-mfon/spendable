import type {Collection,Db,ClientSession} from 'mongodb';
import type {Execution,FundingPlan,InterpretationRequest} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {openMongo} from '../shared/mongo.ts';
export interface ExecutionDocument {_id:string;owner:string;idempotencyKey:string;version:number;state:Execution['state'];payload:Execution;nextCheckAt:number|null;leaseToken:string|null;leaseUntil:number|null}
export interface PlanDocument {_id:string;owner:string;payload:FundingPlan}
export interface InterpretationDocument {_id:string;owner:string;version:number;payload:InterpretationRequest}
export interface GuardDocument {_id:string;revision:number}
export interface MongoStore {
 readonly plans:Collection<PlanDocument>;readonly interpretations:Collection<InterpretationDocument>;
 readonly executions:Collection<ExecutionDocument>;readonly guards:Collection<GuardDocument>;
 transaction<T>(fn:(session:ClientSession)=>Promise<T>):Promise<T>;close():Promise<void>;
}
export async function openMongoStore(uri:string,connect=()=>openMongo(uri)):Promise<MongoStore>{
 const connection=await connect(),db:Db=connection.db;
 const plans=db.collection<PlanDocument>('spendable_plans');
 const interpretations=db.collection<InterpretationDocument>('spendable_interpretations');
 const executions=db.collection<ExecutionDocument>('spendable_executions');
 const guards=db.collection<GuardDocument>('spendable_wallet_guards');
 try{
  await executions.createIndex({owner:1,idempotencyKey:1},{unique:true});
  await executions.createIndex({nextCheckAt:1,leaseUntil:1,state:1});
 }catch{await connection.close();throw new SpendableError('DATABASE_UNAVAILABLE','MongoDB storage indexes could not be initialized.',503);}
 return {plans,interpretations,executions,guards,transaction:connection.transaction,close:connection.close};
}
