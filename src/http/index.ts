import express,{type ErrorRequestHandler} from 'express';
import type {SpendableService} from '../shared/contracts.ts';
import type {AuthService} from '../auth/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {checkOrigin,failure,ok} from './helpers.ts';
import {mountMcp} from '../mcp/index.ts';
import {oauthRoutes} from './oauth.ts';
import {authRoutes} from './auth-routes.ts';
import {schedulerRoutes} from './scheduler.ts';
import {resourceRoutes,route} from './routes.ts';
export interface AppConfig {
 readonly service:SpendableService;readonly auth:AuthService;readonly origin:string;
 readonly reconcileSecret?:string;readonly reconcile?:(limit:number)=>Promise<unknown>;
}
export function createApp(config:AppConfig){
 const {service,auth,origin}=config;
 const app=express();app.disable('x-powered-by');
 app.use((req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer'});
  if(req.path.startsWith('/api')||req.path.startsWith('/oauth')||req.path==='/mcp')res.set('Cache-Control','no-store');
  next();
 });
 app.use(express.json({limit:'32kb',strict:true}));app.use(express.urlencoded({extended:false,limit:'16kb'}));
 app.use(async(req,res,next)=>{
  if(!/^\/(?:api(?:\/|$)|oauth(?:\/|$)|mcp(?:\/|$)|\.well-known(?:\/|$))/.test(req.path)){next();return;}
  try{checkOrigin(req,origin);if(!await auth.allow('ip:'+req.ip,240))throw new SpendableError('RATE_LIMITED','Too many requests. Try again shortly.',429);next();}
  catch(error){failure(res,error);}
 });
 route(app,'get','/api/health',async(_req,res)=>ok(res,{status:'ok'}));
 route(app,'get','/api/capabilities',async(_req,res)=>ok(res,await service.getCapabilities()));
 authRoutes(app,auth,origin);resourceRoutes(app,service,auth,origin);
 oauthRoutes(app,auth,origin);mountMcp(app,service,auth,origin);schedulerRoutes(app,config);
 const errors:ErrorRequestHandler=(error,_req,res,next)=>{
  if(res.headersSent){next(error);return;}
  if(error instanceof SyntaxError||error?.type==='entity.too.large'){failure(res,new SpendableError('INVALID_BODY','Send a valid request within the size limit.',400));return;}
  failure(res,error);
 };
 app.use(errors);
 return app;
}
