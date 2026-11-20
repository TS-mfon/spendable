import {randomUUID} from 'node:crypto';
import type {Address,InterpretationRequest} from '../shared/contracts.ts';
import type {Interpreter} from '../shared/ports.ts';
import {SpendableError} from '../shared/errors.ts';
import {contextFor,defaultCandidateAssets,digest,parseConsensus,redactRequest} from './validation.ts';
import type {BoundRequest,ConsensusSubmission,InterpreterConfig} from './types.ts';
import {createGenLayerTransport} from './transport.ts';
export type {CandidateAsset,GenLayerTransport,InterpreterConfig} from './types.ts';
export function createInterpreter(config:InterpreterConfig={}):Interpreter & {close():Promise<void>}{
 const now=config.now??Date.now;
 const transport=config.transport??(config.genlayerRpcUrl&&config.genlayerContractAddress&&config.genlayerSponsorPrivateKey?createGenLayerTransport(config):null);
 const update=(r:InterpretationRequest,change:Partial<BoundRequest>):BoundRequest=>({...r,...change,version:r.version+1,updatedAt:new Date(now()).toISOString()});
 function submission(r:BoundRequest):ConsensusSubmission{
  if(!r.candidateContext||!r.requestDigest||digest(r.redactedText,r.candidateContext)!==r.requestDigest)throw new Error('Stored request context is incomplete.');
  return {id:r.id,text:r.redactedText,context:r.candidateContext,digest:r.requestDigest};
 }
 return {
 async request(owner:Address,text:string){
  if(!/^0x[0-9a-fA-F]{40}$/.test(owner))throw new SpendableError('INVALID_WALLET','Enter a valid wallet address.');
  const redacted=redactRequest(text);
  const context=contextFor(config.candidateAssets??defaultCandidateAssets,redacted.aliases);
  const timestamp=new Date(now()).toISOString();
  return {id:(config.id??randomUUID)(),owner,status:transport?'queued':'unavailable',redactedText:redacted.text,
   addressAliases:redacted.aliases,fields:null,questions:transport?[]:['Use the structured form while GenLayer interpretation is unavailable.'],
   transactionHash:null,contractAddress:config.genlayerContractAddress||null,version:1,createdAt:timestamp,updatedAt:timestamp,
   error:transport?null:'GenLayer sponsorship and a deployed interpretation contract are not configured.',
   candidateContext:context,requestDigest:digest(redacted.text,context)} as BoundRequest;
 },
 async poll(request:InterpretationRequest){
  if(!transport||!['queued','submitted'].includes(request.status))return request;
  let payload:ConsensusSubmission;
  try{payload=submission(request);}catch{return update(request,{status:'clarification',fields:null,questions:['Please create a new request; its original interpretation context could not be verified.'],error:null});}
  if(request.status==='queued'){
   try{
    const sent=await transport.submit(payload);
    if(!/^0x[0-9a-fA-F]{64}$/.test(sent.hash))throw new Error('Invalid broadcast hash.');
    return update(request,{status:'submitted',transactionHash:sent.hash,error:null});
   }catch(error){
    const quota=error instanceof SpendableError&&['SPONSOR_LIMIT','SPONSOR_BALANCE','SPONSOR_STORAGE','SPONSOR_CONFIGURATION'].includes(error.code);
    return update(request,{status:quota?'unavailable':'queued',error:quota?(error as SpendableError).message:'GenLayer submission is temporarily unavailable. Your request has been retained.',
     questions:quota?['Use the structured form, or try interpretation after sponsorship is restored.']:[]});
   }
  }
  if(!request.transactionHash)return update(request,{status:'clarification',questions:['Please create a new request; its transaction binding is missing.']});
  try{
   const checked=await transport.status(request.transactionHash,payload).catch(error=>{
    if(error instanceof SpendableError)throw error;
    return null;
   });
   if(!checked)return update(request,{error:'GenLayer status is temporarily unavailable. The submitted request is retained.'});
   if(checked.status==='pending'||checked.execution==='pending')return request;
   if(checked.status==='failed'||checked.execution==='error')return update(request,{status:'clarification',fields:null,questions:['Consensus could not establish this request. Specify the amount, recipient, token and network in the structured form.'],error:null});
   const parsed=parseConsensus(checked.result,payload);
   return update(request,{status:parsed.fields?'accepted':'clarification',fields:parsed.fields,questions:parsed.questions,error:null});
  }catch{
   return update(request,{status:'clarification',fields:null,questions:['The interpretation could not be verified against your original request. Please check the structured fields.'],error:null});
  }
 },
 async close(){await transport?.close?.();}
 };
}
