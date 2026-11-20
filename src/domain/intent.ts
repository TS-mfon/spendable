import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {SpendableError} from '../shared/errors.ts';
import type {Address,SpendableIntent} from '../shared/contracts.ts';
import {decimalPattern} from './money.ts';
const address=z.string().regex(/^0x[0-9a-fA-F]{40}$/);
const positive=z.string().max(120).regex(decimalPattern).refine(x=>Number(x)>0);
const atom=z.string().max(100).regex(/^(0|[1-9]\d*)$/);
const asset=z.object({key:z.string().min(1).max(160),chainId:z.number().int().positive(),address:address.nullable(),kind:z.enum(['native','erc20']),symbol:z.string().min(1).max(32),name:z.string().min(1).max(120),decimals:z.number().int().min(0).max(36),cmcId:z.number().int().positive().nullable()}).refine(x=>x.kind==='native'?x.address===null:x.address!==null);
const policy=z.object({maxSlippageBps:z.number().int().min(0).max(500).default(50),maxPriceImpactBps:z.number().int().min(0).max(1000).default(200),maxSourceSpendAtoms:atom.nullable().default(null),maxFeeUsd:positive.nullable().default(null),gasReserveAtoms:atom.nullable().default(null)}).default({maxSlippageBps:50,maxPriceImpactBps:200,maxSourceSpendAtoms:null,maxFeeUsd:null,gasReserveAtoms:null});
const schema=z.object({id:z.string().min(1).max(160).optional(),owner:address.optional(),operation:z.enum(['pay','swap']),recipient:address,targetAsset:asset,sourceAssetKey:z.string().max(160).nullable().default(null),amountMode:z.enum(['receive_token','receive_fiat','spend_token','spend_fiat']),amount:positive,currency:z.string().regex(/^[A-Z]{3}$/).default('USD'),policy,interpretationId:z.string().max(160).nullable().default(null)});
export function parseIntent(owner:Address,input:unknown):SpendableIntent{
 const result=schema.safeParse(input);
 if(!result.success)throw new SpendableError('INVALID_INTENT','Check the amount, asset, network and recipient.',422,{issues:result.error.issues.map(i=>({path:i.path.join('.'),message:i.message}))});
 const data=result.data;
 if(data.owner&&data.owner.toLowerCase()!==owner.toLowerCase())throw new SpendableError('OWNER_MISMATCH','The intent belongs to another wallet.',403);
 if(data.operation==='swap'&&data.recipient.toLowerCase()!==owner.toLowerCase())throw new SpendableError('RECIPIENT_MISMATCH','Swap output must return to your wallet.');
 if(data.amountMode.startsWith('spend_')&&!data.sourceAssetKey)throw new SpendableError('SOURCE_REQUIRED','Choose which asset you are spending.');
 return {...data,id:randomUUID(),owner:owner.toLowerCase() as Address,recipient:data.recipient.toLowerCase() as Address,targetAsset:{...data.targetAsset,address:data.targetAsset.address?.toLowerCase() as Address|null},createdAt:new Date().toISOString()};
}
