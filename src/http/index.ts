import express,{type ErrorRequestHandler} from 'express';
import type {SpendableService} from '../shared/contracts.ts';
import {authScopes,type AuthService} from '../auth/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {checkOrigin,failure,ok} from './helpers.ts';
import {mountMcp} from '../mcp/index.ts';
import {authRoutes} from './auth-routes.ts';
import {schedulerRoutes} from './scheduler.ts';
import {route} from './routes.ts';
export interface AppConfig {
 readonly service:SpendableService;readonly auth:AuthService;readonly origin:string;
 readonly reconcileSecret?:string;readonly reconcile?:(limit:number)=>Promise<unknown>;
}
export function createApp(config:AppConfig){
 const {service,auth,origin}=config;
 const app=express();app.disable('x-powered-by');
 app.use((_req,res,next)=>{
  res.set({'X-Content-Type-Options':'nosniff','X-Frame-Options':'DENY','Referrer-Policy':'no-referrer','Cache-Control':'no-store'});
  next();
 });
 app.use(express.json({limit:'32kb',strict:true}));app.use(express.urlencoded({extended:false,limit:'16kb'}));
 app.use(async(req,res,next)=>{
  if(!/^\/(?:api(?:\/|$)|mcp(?:\/|$)|\.well-known(?:\/|$))/.test(req.path)){next();return;}
  try{checkOrigin(req,origin);if(!await auth.allow('ip:'+req.ip,240))throw new SpendableError('RATE_LIMITED','Too many requests. Try again shortly.',429);next();}
  catch(error){failure(res,error);}
 });
 route(app,'get','/',async(_req,res)=>ok(res,{
  name:'Spendable',version:'0.1.0',transport:'streamable-http',mcp:origin+'/mcp',
  authentication:{method:'wallet-signature-bearer',challenge:origin+'/api/auth/challenge',verify:origin+'/api/auth/verify',revoke:origin+'/api/auth/logout'},
  documentation:'https://github.com/TS-mfon/spendable/blob/main/docs/mcp.md'
 }));
 route(app,'get','/api/health',async(_req,res)=>ok(res,{status:'ok'}));
 for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp']){
  app.get(path,(_req,res)=>res.json({resource:origin+'/mcp',resource_name:'Spendable',bearer_methods_supported:['header'],scopes_supported:authScopes}));
 }
 authRoutes(app,auth,origin);mountMcp(app,service,auth,origin);schedulerRoutes(app,config);
 app.use((_req,res)=>failure(res,new SpendableError('NOT_FOUND','This endpoint does not exist. Connect your MCP client to /mcp.',404)));
 const errors:ErrorRequestHandler=(error,_req,res,next)=>{
  if(res.headersSent){next(error);return;}
  if(error instanceof SyntaxError||error?.type==='entity.too.large'){failure(res,new SpendableError('INVALID_BODY','Send a valid request within the size limit.',400));return;}
  failure(res,error);
 };
 app.use(errors);
 return app;
}
