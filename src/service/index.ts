import type {Address,ActionUpdate,SpendableService} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {createPlan} from './plans.ts';
import {prepareAction} from './prepare.ts';
import {recoverAction} from './recovery.ts';
import {reportSubmission} from './submissions.ts';
import {observeExecution,reconcileDue} from './observe.ts';
import type {Dependencies} from './types.ts';
export type {Dependencies} from './types.ts';
export interface Service extends SpendableService {reconcileDue(limit?:number):Promise<{checked:number;warnings:readonly string[]}>}
export function createService(deps:Dependencies):Service{
 return {
 getCapabilities:()=>deps.providers.capabilities(),
 getWalletContext:(owner)=>deps.providers.wallet(owner),
 async interpretRequest(owner,text){
  if(typeof text!=='string'||!text.trim()||text.length>2000)throw new SpendableError('INVALID_REQUEST','Enter a request between 1 and 2000 characters.');
  const request=await deps.interpreter.request(owner,text);
  if(request.owner.toLowerCase()!==owner.toLowerCase())throw new SpendableError('OWNER_MISMATCH','Interpretation owner changed.',403);
  await deps.repository.putInterpretation(request);return request;
 },
 async getInterpretation(owner,id){
  const request=await deps.repository.getInterpretation(owner,id);
  if(!request||['accepted','clarification','unavailable'].includes(request.status))return request;
  const next=await deps.interpreter.poll(request);
  if(next.owner.toLowerCase()!==owner.toLowerCase()||next.id!==id)throw new SpendableError('OWNER_MISMATCH','Interpretation owner changed.',403);
  await deps.repository.putInterpretation(next);return next;
 },
 createPlan:(owner,input)=>createPlan(deps,owner,input),
 getPlan:(owner,id)=>deps.repository.getPlan(owner,id),
 prepareAction:(owner,planId,candidateId,version,key,requireCaps)=>prepareAction(deps,owner,planId,candidateId,version,key,requireCaps),
 reportSubmission:(owner,id,stepId,hash,version)=>reportSubmission(deps,owner,id,stepId,hash,version),
 recoverAction:(owner,id,version,signature,acknowledge)=>recoverAction(deps,owner,id,version,signature,acknowledge),
 getExecution:(owner,id)=>deps.repository.getExecution(owner,id),
 observeExecution:(owner,id)=>observeExecution(deps,owner,id),
 async getReceipt(owner,id){return (await deps.repository.getExecution(owner,id))?.receipt??null;},
 async getActionableUpdates(owner:Address){
  const records=await deps.repository.listExecutions(owner);
  return records.flatMap<ActionUpdate>(e=>{
   const kind=e.state==='awaiting_signature'?'needs_signature':e.state==='reconciliation_required'?'reconciliation_required':['submitted','source_confirmed','delivery_pending'].includes(e.state)?'pending_delivery':null;
   return kind?[{id:e.id+':'+e.version,kind,title:kind==='needs_signature'?'Your wallet signature is needed.':kind==='pending_delivery'?'Delivery is still being verified.':'This payment needs reconciliation.',executionId:e.id,planId:e.planId,observedAt:e.updatedAt}]:[];
  });
 },
 reconcileDue:(limit)=>reconcileDue(deps,limit)
 };
}
