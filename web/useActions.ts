import {useEffect,useRef,useState} from 'react';
import type {Address,AssetRef,Execution,FundingCandidate,FundingPlan,InterpretationRequest} from '../src/shared/contracts.ts';
import {requestApi} from './api.ts';
import {recoverUnsignedAction} from './action-recovery.ts';
import {createIntentInput,type ComposeFields} from './model.ts';
import {walletProvider} from './wallet.ts';
import {signExecutionStep} from './action-signing.ts';
import {clearBroadcast,readBroadcast,saveBroadcast,type BroadcastRecord} from './recovery.ts';
type Session={owner:Address|null;setError:(message:string)=>void;setBusy:(value:string)=>void;busy:string;};
export function useActions(session:Session){
 const {owner,setError,setBusy,busy}=session;
 const [plan,setPlan]=useState<FundingPlan|null>(null);
 const [selected,setSelected]=useState<FundingCandidate|null>(null);
 const [execution,setExecution]=useState<Execution|null>(null);
 const [interpretation,setInterpretation]=useState<InterpretationRequest|null>(null);
 const [pendingBroadcast,setPendingBroadcast]=useState<BroadcastRecord|null>(null);
 const requestKey=useRef<{terms:string;key:string}|null>(null);
 const activeOwner=useRef(owner);activeOwner.current=owner;
 useEffect(()=>{
  setPlan(null);setSelected(null);setExecution(null);setInterpretation(null);setPendingBroadcast(null);requestKey.current=null;
  if(!owner)return;
  const saved=readBroadcast(owner);if(!saved)return;
  setPendingBroadcast(saved);
  let active=true;
  requestApi<Execution>('/api/actions/'+encodeURIComponent(saved.executionId)).then(value=>{if(active)setExecution(value);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[owner,setError]);
 useEffect(()=>{
  if(!owner||!interpretation||!['queued','submitted'].includes(interpretation.status))return;
  let active=true;let running=false;
  const poll=async()=>{
   if(running)return;running=true;
   try{const value=await requestApi<InterpretationRequest>('/api/interpretations/'+encodeURIComponent(interpretation.id));if(active)setInterpretation(value);}
   catch(e){if(active)setError(e instanceof Error?e.message:'Request interpretation could not be checked.');}
   finally{running=false;}
  };
  const timer=setInterval(()=>void poll(),5000);
  return()=>{active=false;clearInterval(timer);};
 },[owner,interpretation?.id,interpretation?.status,setError]);
 useEffect(()=>{
  if(!owner||!execution||['delivered','source_reverted','refunded','canceled'].includes(execution.state))return;
  let active=true;let running=false;
  const timer=setInterval(async()=>{
   if(running)return;running=true;
   try{const value=await requestApi<Execution>('/api/actions/'+encodeURIComponent(execution.id)+'/observe',{method:'POST',body:{}});if(active)setExecution(value);}
   catch(e){if(active)setError(e instanceof Error?e.message:'Delivery status could not be checked.');}
   finally{running=false;}
  },10000);
  return()=>{active=false;clearInterval(timer);};
 },[owner,execution?.id,execution?.state,setError]);
 async function run(name:string,work:()=>Promise<void>){
  if(busy)return;setBusy(name);setError('');
  try{await work();}catch(e){setError(e instanceof Error?e.message:'The request failed. Try again.');}finally{setBusy('');}
 }
 async function compare(fields:ComposeFields,target:AssetRef|undefined,interpretationId:string|null=null){
  if(!owner)return;
  await run('plan',async()=>{
   const input=createIntentInput(fields,target,owner,interpretationId);
   const value=await requestApi<FundingPlan>('/api/plans',{method:'POST',body:input});
   if(activeOwner.current!==owner)return;
   setPlan(value);setSelected(null);
  });
 }
 async function interpret(text:string){
  if(!owner)return;
  await run('interpret',async()=>{
   const value=await requestApi<InterpretationRequest>('/api/interpretations',{method:'POST',body:{text}});
   if(activeOwner.current===owner)setInterpretation(value);
  });
 }
 async function prepare(){
  if(!owner||!plan||!selected)return;
  await run('prepare',async()=>{
   const terms=plan.id+':'+selected.id+':'+plan.version;
   if(requestKey.current?.terms!==terms)requestKey.current={terms,key:crypto.randomUUID()};
   const value=await requestApi<Execution>('/api/actions',{method:'POST',body:{planId:plan.id,candidateId:selected.id,version:plan.version,idempotencyKey:requestKey.current.key}});
   if(activeOwner.current===owner)setExecution(value);
  });
 }
 async function report(record:BroadcastRecord){
  const current=await requestApi<Execution>('/api/actions/'+encodeURIComponent(record.executionId));
  const step=current.steps.find(s=>s.id===record.stepId);
  if(current.owner!==record.owner||current.commitmentHash!==record.commitmentHash||!step)throw new Error('Payment terms changed while reporting this transaction. Check its status before proceeding.');
  if(step.submittedHash&&step.submittedHash.toLowerCase()!==record.hash.toLowerCase())throw new Error('A different transaction is already recorded for this step. Check payment status.');
  const value=await requestApi<Execution>('/api/actions/'+encodeURIComponent(record.executionId)+'/submissions',{method:'POST',body:{stepId:record.stepId,hash:record.hash,version:current.version}});
  clearBroadcast(record.owner);setPendingBroadcast(null);
  if(activeOwner.current===record.owner)setExecution(value);
 }
 async function sign(stepId:string){
  if(!owner||!execution||pendingBroadcast)return;
  if(!execution.steps.some(x=>x.id===stepId))return;
  await run('sign',async()=>{
   const result=await signExecutionStep(walletProvider(),execution,stepId,owner,fetch,Date.now,current=>{if(activeOwner.current===owner)setExecution(current);});
   const record={owner,executionId:result.execution.id,stepId:result.stepId,hash:result.hash,version:result.execution.version,commitmentHash:result.execution.commitmentHash};
   setPendingBroadcast(record);
   try{saveBroadcast(record);}catch{setError('Transaction submitted. Keep this page open until its hash is recorded.');}
   await report(record);
  });
 }
 async function retryReport(){if(pendingBroadcast)await run('report',()=>report(pendingBroadcast));}
 async function observe(){
  if(!execution)return;
  await run('observe',async()=>setExecution(await requestApi<Execution>('/api/actions/'+encodeURIComponent(execution.id)+'/observe',{method:'POST',body:{}})));
 }
 async function recover(acknowledged:boolean){
  if(!owner||!execution||pendingBroadcast)return;
  await run('recover',async()=>{const value=await recoverUnsignedAction(walletProvider(),execution,owner,acknowledged);if(activeOwner.current===owner){setExecution(value);setPlan(null);setSelected(null);requestKey.current=null;}});
 }
 function invalidate(){setPlan(null);setSelected(null);}
 async function openAction(id:string){await run('open-action',async()=>setExecution(await requestApi<Execution>('/api/actions/'+encodeURIComponent(id))));}
 return {plan,selected,setSelected,execution,interpretation,pendingBroadcast,compare,interpret,prepare,sign,retryReport,observe,recover,invalidate,openAction};
}
