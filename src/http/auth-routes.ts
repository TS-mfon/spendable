import type {Express} from 'express';
import {z} from 'zod';
import {sessionCookieName,type AuthService} from '../auth/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {ok,parse,principal,token} from './helpers.ts';
import {route} from './routes.ts';
export function authRoutes(app:Express,auth:AuthService,origin:string){
 route(app,'post','/api/auth/challenge',async(req,res)=>{
  if(!await auth.allow('sign-in:'+req.ip,20))throw new SpendableError('RATE_LIMITED','Too many sign-in requests.',429);
  const input=parse(z.object({wallet:z.string().max(42)}).strict(),req.body);
  ok(res,await auth.challenge(input.wallet));
 });
 route(app,'post','/api/auth/verify',async(req,res)=>{
  if(!await auth.allow('verify:'+req.ip,20))throw new SpendableError('RATE_LIMITED','Too many sign-in attempts.',429);
  const input=parse(z.object({wallet:z.string().max(42),message:z.string().max(4096),signature:z.string().regex(/^0x[0-9a-fA-F]+$/).max(2048)}).strict(),req.body);
  const session=await auth.verify(input);
  res.cookie(sessionCookieName,session.token,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'strict',path:'/',maxAge:3600000});
  ok(res,session);
 });
 route(app,'get','/api/auth/session',async(req,res)=>ok(res,await principal(req,auth,origin)));
 route(app,'post','/api/auth/logout',async(req,res)=>{
  await principal(req,auth,origin);await auth.revoke(token(req)!);
  res.clearCookie(sessionCookieName,{httpOnly:true,secure:origin.startsWith('https:'),sameSite:'strict',path:'/'});ok(res,{signedOut:true});
 });
}
