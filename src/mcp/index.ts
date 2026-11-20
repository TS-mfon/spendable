import type {Express} from 'express';
import {NodeStreamableHTTPServerTransport} from '@modelcontextprotocol/node';
import type {SpendableService} from '../shared/contracts.ts';
import type {AuthService} from '../auth/index.ts';
import {failure,principal} from '../http/helpers.ts';
import {SpendableError} from '../shared/errors.ts';
import {createToolServer} from './tools.ts';
export {createToolServer} from './tools.ts';
export function mountMcp(app:Express,service:SpendableService,auth:AuthService,origin:string){
 app.post('/mcp',async(req,res)=>{
  try{
   const p=await principal(req,auth,origin,true);
   if(!await auth.allow('mcp:'+p.wallet,120))throw new SpendableError('RATE_LIMITED','Too many MCP requests.',429);
   const server=createToolServer(service,p),transport=new NodeStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true});
   res.on('close',()=>{void transport.close().then(()=>server.close()).catch(()=>console.error('MCP cleanup failed'));});
   await server.connect(transport);await transport.handleRequest(req,res,req.body);
  }catch(error){
   if(error instanceof SpendableError&&error.status===401)res.set('WWW-Authenticate','Bearer resource_metadata="'+origin+'/.well-known/oauth-protected-resource/mcp"');
   if(!res.headersSent)failure(res,error);
  }
 });
 for(const method of ['get','delete'] as const)app[method]('/mcp',(_req,res)=>res.status(405).set('Allow','POST').end());
}
