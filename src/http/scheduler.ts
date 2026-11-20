import type {Express,Request,Response} from 'express';
import {z} from 'zod';
import type {AppConfig} from './index.ts';
import {SpendableError} from '../shared/errors.ts';
import {bearer,ok,parse,sameSecret} from './helpers.ts';
import {route} from './routes.ts';
export function schedulerRoutes(app:Express,config:AppConfig){
 const reconcile=async(req:Request,res:Response)=>{
  if(!config.reconcileSecret||!sameSecret(bearer(req)??'',config.reconcileSecret))throw new SpendableError('UNAUTHORIZED_SCHEDULER','Scheduler authentication is required.',401);
  if(!config.reconcile)throw new SpendableError('SCHEDULER_UNAVAILABLE','Background checking is unavailable.',503);
  const x=parse(z.object({limit:z.number().int().min(1).max(50).default(20)}).strict(),req.body??{});
  ok(res,await config.reconcile(x.limit));
 };
 route(app,'post','/api/internal/reconcile',reconcile);route(app,'post','/api/reconcile',reconcile);
}
