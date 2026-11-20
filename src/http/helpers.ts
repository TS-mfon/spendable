import type {SpendPolicy} from '../shared/contracts.ts';
import type {Request,Response} from 'express';
import {z} from 'zod';
import {timingSafeEqual} from 'node:crypto';
import {SpendableError} from '../shared/errors.ts';
import {sessionCookieName,type AuthService} from '../auth/index.ts';
export const identifier=z.string().min(1).max(128).regex(/^[A-Za-z0-9:_-]+$/);
export const version=z.number().int().positive();
export const walletSignature=z.string().regex(/^0x(?:[0-9a-fA-F]{2})+$/).max(2048);
export const hash=z.string().regex(/^0x[0-9a-fA-F]{64}$/);
export function ok(res:Response,data:unknown,status=200){res.status(status).json({success:true,data,error:null});}
export function failure(res:Response,error:unknown){
 const e=error instanceof SpendableError?error:new SpendableError('INTERNAL_ERROR','Spendable could not complete this request. Try again.',500);
 if(e.status>=500)console.error('Spendable request failed',{code:e.code});
 res.status(e.status).json({success:false,data:null,error:{code:e.code,message:e.message,details:e.details}});
}
export function parse<T>(schema:z.ZodType<T>,value:unknown):T{
 const result=schema.safeParse(value);
 if(!result.success)throw new SpendableError('INVALID_INPUT','Check the request fields and try again.',422,{fields:result.error.issues.map(x=>x.path.join('.'))});
 return result.data;
}
export function bearer(req:Request){const m=/^Bearer ([A-Za-z0-9._~-]+)$/i.exec(req.get('Authorization')??'');return m?.[1]??null;}
export function cookie(req:Request){
 const value=(req.get('Cookie')??'').split(';').map(x=>x.trim()).find(x=>x.startsWith(sessionCookieName+'='))?.slice(sessionCookieName.length+1);
 try{return value?decodeURIComponent(value):null;}catch{return null;}
}
export function token(req:Request){return bearer(req)??cookie(req);}
export function sameSecret(a:string,b:string){const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function checkOrigin(req:Request,origin:string,require=false){
 const supplied=req.get('Origin');
 if((supplied&&supplied!==origin)||(require&&!supplied))throw new SpendableError('INVALID_ORIGIN','Open Spendable on its configured origin to continue.',403);
}
export async function principal(req:Request,auth:AuthService,origin:string,bearerOnly=false){
 const value=bearerOnly?bearer(req):token(req);
 if(!value)throw new SpendableError('INVALID_SESSION','A wallet session is required. Sign in to continue.',401);
 checkOrigin(req,origin,!bearerOnly&&!bearer(req)&&!['GET','HEAD','OPTIONS'].includes(req.method));
 const p=await auth.authenticate(value);
 if(!bearer(req)&&p.sessionKind==='oauth')throw new SpendableError('INVALID_SESSION','Agent access tokens must use Bearer authentication.',401);
 return p;
}
export function missing<T>(value:T|null):T {if(value===null)throw new SpendableError('NOT_FOUND','This item was not found for your wallet.',404);return value;}

export function requireAgentCaps(policy:SpendPolicy){
 if(policy.maxSourceSpendAtoms===null||!/^[0-9]+$/.test(policy.maxSourceSpendAtoms)||BigInt(policy.maxSourceSpendAtoms)<=0n||policy.maxFeeUsd===null||!/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(policy.maxFeeUsd)||!/[1-9]/.test(policy.maxFeeUsd))throw new SpendableError('SPENDING_CAP_REQUIRED','Agents must provide positive maximum source spending and fee caps before preparing.',422);
}
