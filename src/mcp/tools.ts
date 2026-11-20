import {McpServer} from '@modelcontextprotocol/server';
import {z} from 'zod';
import type {AuthPrincipal,SpendableService} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {requireAgentCaps,hash,identifier,missing,version,walletSignature} from '../http/helpers.ts';
const amount=z.string().regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).max(80);
const atoms=z.string().regex(/^[0-9]+$/).max(80);
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const asset=z.object({key:identifier,chainId:z.number().int().positive(),address:address.nullable(),kind:z.enum(['native','erc20']),symbol:z.string().max(20),name:z.string().max(100),decimals:z.number().int().min(0).max(36),cmcId:z.number().int().positive().nullable()}).strict();
const intent=z.object({
 recipient:address,targetAsset:asset,sourceAssetKey:identifier.nullable(),amountMode:z.enum(['receive_token','receive_fiat','spend_token','spend_fiat']),amount,currency:z.string().regex(/^[A-Z]{3}$/),
 policy:z.object({maxSlippageBps:z.number().int().min(0).max(500),maxPriceImpactBps:z.number().int().min(0).max(10000),maxSourceSpendAtoms:atoms.nullable(),maxFeeUsd:amount.nullable(),gasReserveAtoms:atoms.nullable()}).strict(),
 interpretationId:identifier.nullable().optional()
}).strict();
export function createToolServer(service:SpendableService,p:AuthPrincipal){
 const server=new McpServer({name:'spendable',version:'0.1.0'});
 async function execute(scope:string,run:()=>Promise<unknown>){
  try{
   if(!p.scopes.includes(scope))throw new SpendableError('INSUFFICIENT_SCOPE','This session does not have the required permission.',403);
   const data=await run();return {content:[{type:'text' as const,text:JSON.stringify(data)}],structuredContent:{data}};
  }catch(error){
   const e=error instanceof SpendableError?error:new SpendableError('INTERNAL_ERROR','Spendable could not complete this tool call.',500);
   return {isError:true,content:[{type:'text' as const,text:JSON.stringify({error:{code:e.code,message:e.message}})}]};
  }
 }
 server.registerTool('get_wallet_context',{description:'Discover your directly held crypto and CMC reference prices, with capability and gas warnings.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true}},()=>execute('wallet:read',()=>service.getWalletContext(p.wallet)));
 server.registerTool('interpret_request',{description:'Queue a GenLayer interpretation of a bounded request. Poll get_interpretation; confirm fields before planning.',inputSchema:z.object({text:z.string().min(1).max(2000)}).strict()},x=>execute('plan:write',()=>service.interpretRequest(p.wallet,x.text)));
 server.registerTool('get_interpretation',{description:'Poll your asynchronous GenLayer request; accepted fields still need owner confirmation.',inputSchema:z.object({id:identifier}).strict(),annotations:{readOnlyHint:true}},x=>execute('wallet:read',async()=>missing(await service.getInterpretation(p.wallet,x.id))));
 for(const [name,operation]of [['plan_payment','pay'],['plan_swap','swap']] as const){
  server.registerTool(name,{description:'Compare live funding options from one source. Token quantities and fiat-reference budgets have distinct amount modes. Set explicit source-atom and fee caps for agent execution.',inputSchema:z.object({intent}).strict()},x=>execute('plan:write',()=>service.createPlan(p.wallet,{...x.intent,operation,...(operation==='swap'?{recipient:p.wallet}:{})})));
 }
 server.registerTool('prepare_action',{description:'Reserve a confirmed plan and return unsigned bounded transactions for your own wallet. Requires explicit source-spending and fee caps. Never pass a wallet private key.',inputSchema:z.object({planId:identifier,candidateId:identifier,version,idempotencyKey:z.string().min(8).max(128)}).strict()},x=>execute('execution:write',async()=>{
  const plan=missing(await service.getPlan(p.wallet,x.planId));
  requireAgentCaps(plan.intent.policy);
  return service.prepareAction(p.wallet,x.planId,x.candidateId,x.version,x.idempotencyKey,true);
 }));
 server.registerTool('report_submission',{description:'Report the hash returned by your wallet. Spendable checks the committed transaction before accepting it.',inputSchema:z.object({executionId:identifier,stepId:identifier,hash,version}).strict()},x=>execute('execution:write',()=>service.reportSubmission(p.wallet,x.executionId,x.stepId,x.hash,x.version)));
 server.registerTool('get_action_status',{description:'Reconcile your action and distinguish source confirmation from verified recipient delivery. Unknown outcomes never trigger repayment.',inputSchema:z.object({executionId:identifier}).strict()},x=>execute('wallet:read',()=>service.observeExecution(p.wallet,x.executionId)));
 server.registerTool('get_receipt',{description:'Read delivered, partial, refunded or unresolved evidence for your action.',inputSchema:z.object({executionId:identifier}).strict(),annotations:{readOnlyHint:true}},x=>execute('wallet:read',()=>service.getReceipt(p.wallet,x.executionId)));
 server.registerTool('get_actionable_updates',{description:'Read your outstanding signing, delivery and reconciliation updates.',inputSchema:z.object({}).strict(),annotations:{readOnlyHint:true}},()=>execute('wallet:read',()=>service.getActionableUpdates(p.wallet)));
 server.registerTool('recover_action',{description:'Recover an unbroadcast action using a fresh wallet signature over the canonical owner/action/version/commitment recovery message. Explicitly acknowledge that a previously signed transaction could still be broadcast late. The service checks the recorded execution state and owner signature before releasing reservations.',inputSchema:z.object({executionId:identifier,version,signature:walletSignature,acknowledgeLateBroadcastRisk:z.literal(true)}).strict(),annotations:{destructiveHint:true}},x=>execute('execution:write',()=>service.recoverAction(p.wallet,x.executionId,x.version,x.signature,x.acknowledgeLateBroadcastRisk)));
 return server;
}
