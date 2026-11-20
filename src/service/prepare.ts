import {createHash,randomUUID} from 'node:crypto';
import type {Address,Execution,WalletContext} from '../shared/contracts.ts';
import {atoms,candidateDebits,rankCandidate} from '../domain/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {validateSteps} from './steps.ts';
import type {Dependencies} from './types.ts';
export async function prepareAction(deps:Dependencies,owner:Address,planId:string,candidateId:string,version:number,key:string,requireCaps=false):Promise<Execution>{
 const plan=await deps.repository.getPlan(owner,planId);
 if(!plan)throw new SpendableError('NOT_FOUND','Payment plan was not found.',404);
 if(requireCaps&&(!plan.intent.policy.maxSourceSpendAtoms||atoms(plan.intent.policy.maxSourceSpendAtoms)<=0n||!plan.intent.policy.maxFeeUsd))throw new SpendableError('SPENDING_CAP_REQUIRED','Agents must specify a positive source spending cap and fee cap.');
 const candidate=plan.candidates.find(c=>c.id===candidateId);
 if(!candidate||version!==plan.version)throw new SpendableError('VERSION_CONFLICT','Choose a current funding plan.',409);
 const prior=await deps.repository.findByIdempotency?.(owner,key);
 if(prior){if(prior.planId!==planId||prior.candidate.id!==candidateId)throw new SpendableError('IDEMPOTENCY_CONFLICT','Request key belongs to another payment.',409);return prior;}
 if(Date.parse(candidate.quote.expiresAt)<=Date.now()||!candidate.eligible)throw new SpendableError('EXPIRED_QUOTE','This route expired or is ineligible. Create a fresh plan.',409);
 const q=candidate.quote;
 const known=[q.sourceAsset,...q.fees.map(f=>f.asset),q.targetAsset];
 const assets=[...new Map(known.map(a=>[a.key,a])).values()];
 const balances=await Promise.all(assets.map(async asset=>({...await deps.providers.refreshBalance(owner,asset),asset})));
 const chains=await deps.providers.capabilities();
 const context:WalletContext={wallet:owner,chains,holdings:balances.map(b=>({asset:b.asset,balanceAtoms:b.balanceAtoms,blockNumber:b.blockNumber,observedAt:new Date().toISOString(),discoveredBy:'rpc',warning:null})),prices:plan.prices,rates:plan.rates,observedAt:new Date().toISOString(),complete:true,warnings:[]};
 const current=rankCandidate(q,context,plan.intent,await deps.repository.reserved(owner));
 if(!current.eligible)throw new SpendableError('INSUFFICIENT_FUNDS','Source funds, prices or fee bounds changed. Create a fresh plan.',409,{reasons:current.reasons});
 const steps=await deps.providers.prepareSteps(q);validateSteps(candidate,steps);
 if(!Number.isFinite(Date.parse(q.expiresAt))||Date.parse(q.expiresAt)<=Date.now())throw new SpendableError('EXPIRED_QUOTE','This route expired during preparation. Create a fresh plan.',409);
 const native=chains.find(c=>c.id===q.sourceAsset.chainId)?.nativeAsset;
 const debits=candidateDebits(candidate,context).map(d=>native&&d.assetKey===native.key?{...d,amountAtoms:(atoms(d.amountAtoms)+atoms(plan.intent.policy.gasReserveAtoms??'0')).toString()}:d);
 const now=new Date().toISOString();
 const commitmentHash=createHash('sha256').update(JSON.stringify({planId,candidateId,version,owner,quote:q,intent:plan.intent})).digest('hex');
 const execution:Execution={id:randomUUID(),owner:plan.owner,planId,planVersion:version,candidate,intent:plan.intent,version:1,state:'awaiting_signature',steps,debits,commitmentHash,sourceHash:null,nextCheckAt:new Date(Date.now()+10000).toISOString(),retryCount:0,warnings:[],receipt:null,createdAt:now,updatedAt:now,signingExpiresAt:q.expiresAt};
 return deps.repository.reserve(execution,key);
}
