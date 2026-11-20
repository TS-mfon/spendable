import type {Express,Request,Response} from 'express';
import {z} from 'zod';
import type {SpendableService,Address} from '../shared/contracts.ts';
import type {AuthService} from '../auth/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {bearer,requireAgentCaps,failure,hash,identifier,missing,ok,parse,principal,version,walletSignature} from './helpers.ts';
export function route(app:Express,method:'get'|'post',path:string,run:(req:Request,res:Response)=>Promise<void>){
 app[method](path,async(req,res)=>{try{await run(req,res);}catch(e){failure(res,e);}});
}
export function resourceRoutes(app:Express,service:SpendableService,auth:AuthService,origin:string){
 const privateRoute=(method:'get'|'post',path:string,run:(wallet:Address,req:Request)=>Promise<unknown>)=>route(app,method,path,async(req,res)=>{
  const p=await principal(req,auth,origin);
  if(!await auth.allow('wallet:'+p.wallet,120))throw new SpendableError('RATE_LIMITED','Too many wallet requests.',429);
  const scope=method==='get'?'wallet:read':path.startsWith('/api/actions')?'execution:write':'plan:write';
  if(!p.scopes.includes(scope))throw new SpendableError('INSUFFICIENT_SCOPE','This session does not have permission for that action.',403);
  ok(res,await run(p.wallet,req));
 });
 privateRoute('get','/api/wallet',wallet=>service.getWalletContext(wallet));
 privateRoute('post','/api/interpretations',(wallet,req)=>service.interpretRequest(wallet,parse(z.object({text:z.string().min(1).max(2000)}).strict(),req.body).text));
 privateRoute('get','/api/interpretations/:id',async(wallet,req)=>missing(await service.getInterpretation(wallet,parse(identifier,req.params.id))));
 privateRoute('post','/api/plans',(wallet,req)=>service.createPlan(wallet,req.body));
 privateRoute('get','/api/plans/:id',async(wallet,req)=>missing(await service.getPlan(wallet,parse(identifier,req.params.id))));
 privateRoute('post','/api/actions',async(wallet,req)=>{
  const x=parse(z.object({planId:identifier,candidateId:identifier,version,idempotencyKey:z.string().min(8).max(128)}).strict(),req.body);
  const requireCaps=!!bearer(req);
  if(requireCaps)requireAgentCaps(missing(await service.getPlan(wallet,x.planId)).intent.policy);
  return service.prepareAction(wallet,x.planId,x.candidateId,x.version,x.idempotencyKey,requireCaps);
 });
 privateRoute('post','/api/actions/:id/submissions',(wallet,req)=>{
  const x=parse(z.object({stepId:identifier,hash,version}).strict(),req.body);
  return service.reportSubmission(wallet,parse(identifier,req.params.id),x.stepId,x.hash,x.version);
 });
 privateRoute('get','/api/actions/:id',async(wallet,req)=>missing(await service.getExecution(wallet,parse(identifier,req.params.id))));
 privateRoute('post','/api/actions/:id/recover',(wallet,req)=>{
  const x=parse(z.object({version,signature:walletSignature,acknowledgeLateBroadcastRisk:z.literal(true)}).strict(),req.body);
  return service.recoverAction(wallet,parse(identifier,req.params.id),x.version,x.signature,x.acknowledgeLateBroadcastRisk);
 });
 privateRoute('post','/api/actions/:id/observe',(wallet,req)=>service.observeExecution(wallet,parse(identifier,req.params.id)));
 privateRoute('get','/api/actions/:id/receipt',async(wallet,req)=>missing(await service.getReceipt(wallet,parse(identifier,req.params.id))));
 privateRoute('get','/api/updates',wallet=>service.getActionableUpdates(wallet));
}
