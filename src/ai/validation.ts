import {createHash} from 'node:crypto';
import {z} from 'zod';
import type {Address,InterpretedFields} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import type {CandidateAsset,ConsensusSubmission} from './types.ts';
const address=/0x[0-9a-fA-F]{40}(?![0-9a-fA-F])/g;
const decimal=z.string().max(80).regex(/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/).refine(x=>/[1-9]/.test(x));
const constraints=z.object({
 maxFeeUsd:decimal.optional(),maxSourceSpendAtoms:z.string().regex(/^[1-9][0-9]{0,77}$/).optional(),
 maxSlippageBps:z.string().regex(/^[0-9]{1,3}$/).refine(x=>Number(x)<=500).optional(),
 maxPriceImpactBps:z.string().regex(/^[0-9]{1,4}$/).refine(x=>Number(x)<=3000).optional(),
 gasReserveAtoms:z.string().regex(/^[0-9]{1,78}$/).optional()
}).strict();
const fields=z.object({
 operation:z.enum(['pay','swap']),targetChainId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
 targetSymbol:z.string().regex(/^[A-Z0-9]{1,12}$/),recipientAlias:z.string().regex(/^recipient_[1-9][0-9]*$/).nullable(),
 amountMode:z.enum(['receive_token','receive_fiat','spend_token','spend_fiat']),amount:decimal,
 currency:z.string().regex(/^[A-Z]{3}$/),sourceSymbol:z.string().regex(/^[A-Z0-9]{1,12}$/).nullable(),constraints
}).strict();
const result=z.object({requestDigest:z.string().regex(/^0x[0-9a-f]{64}$/),status:z.enum(['accepted','clarification']),
 fields:fields.nullable(),questions:z.array(z.string().min(1).max(300)).max(5)}).strict();
const candidate=z.object({chainId:z.number().int().positive(),chainName:z.string().min(1).max(60),symbol:z.string().regex(/^[A-Z0-9]{1,12}$/)}).strict();
export const defaultCandidateAssets:readonly CandidateAsset[]=[
 [1,'Ethereum','ETH'],[10,'Optimism','ETH'],[8453,'Base','ETH'],[42161,'Arbitrum','ETH'],
 [56,'BNB Chain','BNB'],[137,'Polygon','POL'],[43114,'Avalanche','AVAX'],[100,'Gnosis','XDAI']
].flatMap(([chainId,chainName,symbol])=>[symbol,'WETH','WBTC','USDC','USDT','DAI'].map(s=>({chainId:Number(chainId),chainName:String(chainName),symbol:String(s)})));
export function redactRequest(text:string):{text:string;aliases:Readonly<Record<string,Address>>}{
 if(typeof text!=='string'||!text.trim()||text.length>2000)throw new SpendableError('INVALID_REQUEST','Enter a request between 1 and 2000 characters.');
 if(/0x[0-9a-fA-F]{64}|private\s+key|seed\s+phrase|mnemonic|api[ _-]?key|password/i.test(text))throw new SpendableError('SECRET_IN_REQUEST','Remove secrets and private keys from the request.');
 const addresses=[...new Set([...text.matchAll(address)].map(m=>m[0].toLowerCase()))];
 const aliases=Object.fromEntries(addresses.map((a,i)=>['recipient_'+(i+1),a as Address]));
 return {text:text.trim().replace(address,a=>'recipient_'+(addresses.indexOf(a.toLowerCase())+1)),aliases};
}
export function contextFor(assets:readonly CandidateAsset[],aliases:Readonly<Record<string,Address>>):string{
 if(assets.length<1||assets.length>200)throw new SpendableError('INTERPRETER_CONTEXT','Interpretation needs between 1 and 200 candidate assets.',503);
 const valid=assets.map(a=>candidate.parse(a));
 const sorted=[...valid].sort((a,b)=>a.chainId-b.chainId||a.symbol.localeCompare(b.symbol));
 const unique=sorted.filter((a,i)=>i===0||a.chainId!==sorted[i-1].chainId||a.symbol!==sorted[i-1].symbol);
 return JSON.stringify({assets:unique,aliases:Object.keys(aliases)});
}
export function digest(text:string,context:string):string{return '0x'+createHash('sha256').update(text+'\n'+context).digest('hex');}
export function parseConsensus(value:unknown,submission:ConsensusSubmission):{fields:InterpretedFields|null;questions:readonly string[]}{
 const raw=typeof value==='string'?JSON.parse(value):value;
 const parsed=result.parse(raw);
 if(parsed.requestDigest!==submission.digest)throw new Error('Consensus request binding mismatch.');
 if(parsed.status==='clarification'){
  if(parsed.fields!==null||parsed.questions.length===0)throw new Error('Clarification requires questions and no fields.');
  return {fields:null,questions:parsed.questions};
 }
 if(!parsed.fields||parsed.questions.length!==0)throw new Error('Accepted interpretation requires canonical fields.');
 const f=parsed.fields;
 const ctx=z.object({assets:z.array(candidate),aliases:z.array(z.string())}).strict().parse(JSON.parse(submission.context));
 if(!ctx.assets.some(a=>a.chainId===f.targetChainId&&a.symbol===f.targetSymbol))throw new Error('Target identity is outside the original context.');
 if(f.sourceSymbol&&!ctx.assets.some(a=>a.symbol===f.sourceSymbol))throw new Error('Source identity is outside the original context.');
 if(f.operation==='pay'&&(!f.recipientAlias||!ctx.aliases.includes(f.recipientAlias)))throw new Error('Payment recipient is unresolved.');
 if(f.operation==='swap'&&f.recipientAlias!==null)throw new Error('Swaps must return to the owner.');
 if(f.amountMode.startsWith('spend')&&!f.sourceSymbol)throw new Error('A spending request needs a source asset.');
 const numeric=[...submission.text.matchAll(/(?<![\w.])(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?![\w.])/g)].map(m=>m[0]);
 if(!numeric.includes(f.amount))throw new Error('Amount must match an explicit numeric amount in the request.');
 return {fields:f,questions:[]};
}
