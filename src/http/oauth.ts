import type {Express,Request,Response} from 'express';
import {randomBytes,createHash} from 'node:crypto';
import {z} from 'zod';
import {authScopes,type AuthService} from '../auth/index.ts';
import {SpendableError} from '../shared/errors.ts';
import {bearer,checkOrigin,failure,ok,parse,principal,sameSecret,token} from './helpers.ts';
import {authorizationSchema,registrationSchema,requestedScopes,tokenSchema} from './oauth-schemas.ts';
function oauthError(res:Response,error:unknown){const e=error instanceof SpendableError?error:new SpendableError('server_error','Authorization is unavailable.',500);res.status(e.status).json({error:e.status>=500?'server_error':'invalid_grant',error_description:e.message});}
export function oauthRoutes(app:Express,auth:AuthService,origin:string){
 const resource=origin+'/mcp';
 const wrap=(method:'get'|'post',path:string,run:(req:Request,res:Response)=>Promise<void>,envelope=false)=>app[method](path,async(req,res)=>{try{await run(req,res);}catch(e){envelope?failure(res,e):oauthError(res,e);}});
 app.get('/.well-known/oauth-authorization-server',(_req,res)=>res.json({
  issuer:origin,authorization_endpoint:origin+'/oauth/authorize',token_endpoint:origin+'/oauth/token',registration_endpoint:origin+'/oauth/register',revocation_endpoint:origin+'/oauth/revoke',
  response_types_supported:['code'],grant_types_supported:['authorization_code'],token_endpoint_auth_methods_supported:['none'],code_challenge_methods_supported:['S256'],scopes_supported:authScopes
 }));
 for(const path of ['/.well-known/oauth-protected-resource','/.well-known/oauth-protected-resource/mcp'])app.get(path,(_req,res)=>res.json({resource,authorization_servers:[origin],bearer_methods_supported:['header'],scopes_supported:authScopes}));
 wrap('post','/oauth/register',async(req,res)=>{
  if(!await auth.allow('oauth-register:'+req.ip,10))throw new SpendableError('rate_limited','Too many registrations.',429);
  const input=parse(registrationSchema,req.body),id=randomBytes(24).toString('hex');
  await auth.oauthPut({kind:'client',id,data:input,expires:Date.now()+30*86400000});
  res.status(201).json({...input,client_id:id,client_id_issued_at:Math.floor(Date.now()/1000)});
 });
 async function authorize(raw:unknown,req:Request){
  const p=await principal(req,auth,origin);
  if(p.sessionKind!=='wallet'||bearer(req))throw new SpendableError('OWNER_CONSENT_REQUIRED','Sign in with your wallet in Spendable to authorize this client.',403);
  const fields=parse(authorizationSchema,raw);
  const client=await auth.oauthGet('client',fields.client_id,Date.now());
  if(!client||!(client.data.redirect_uris as string[]).includes(fields.redirect_uri))throw new SpendableError('invalid_client','This client or redirect is not registered.',422);
  const scopes=requestedScopes(fields.scope);
  if(!scopes||scopes.some(s=>!p.scopes.includes(s)))throw new SpendableError('invalid_scope','Requested permissions are unavailable.',422);
  if(fields.resource&&fields.resource!==resource)throw new SpendableError('invalid_target','Authorization is only valid for this MCP resource.',422);
  return {p,fields,client,scopes};
 }
 wrap('get','/api/oauth/authorize',async(req,res)=>{
  const {fields,client}=await authorize(req.query,req);
  ok(res,{clientName:client.data.client_name,clientId:fields.client_id,redirectUri:fields.redirect_uri,scope:fields.scope,state:fields.state??null,resource,codeChallenge:fields.code_challenge});
 },true);
 wrap('post','/api/oauth/authorize',async(req,res)=>{
  checkOrigin(req,origin,true);
  const input=parse(authorizationSchema.extend({approved:z.boolean()}).strict(),req.body);
  const {approved,...raw}=input,{p,fields,scopes}=await authorize(raw,req);
  const target=new URL(fields.redirect_uri);
  if(approved){
   const code=randomBytes(32).toString('hex');
   await auth.oauthPut({kind:'code',id:code,data:{...fields,wallet:p.wallet,scopes,authorizingToken:token(req)},expires:Date.now()+300000});
   target.searchParams.set('code',code);
  }else target.searchParams.set('error','access_denied');
  if(fields.state)target.searchParams.set('state',fields.state);
  ok(res,{redirectUrl:target.toString()});
 },true);
 wrap('post','/oauth/token',async(req,res)=>{
  const x=parse(tokenSchema,req.body),grant=await auth.oauthGet('code',x.code,Date.now());
  const bad=()=>new SpendableError('invalid_grant','Authorization code or verifier is invalid or expired.',400);
  if(!grant||grant.data.client_id!==x.client_id||grant.data.redirect_uri!==x.redirect_uri||(x.resource&&x.resource!==resource))throw bad();
  if(!sameSecret(createHash('sha256').update(x.code_verifier).digest('base64url'),String(grant.data.code_challenge)))throw bad();
  await auth.authenticate(String(grant.data.authorizingToken));
  if(!await auth.oauthTake('code',x.code,Date.now()))throw bad();
  const session=await auth.issueSession(String(grant.data.wallet),{scopes:grant.data.scopes as string[],clientId:x.client_id});
  res.json({access_token:session.token,token_type:'Bearer',expires_in:3600,scope:(grant.data.scopes as string[]).join(' ')});
 });
 wrap('post','/oauth/revoke',async(req,res)=>{
  const x=parse(z.object({token:z.string().max(2048),client_id:z.string().max(128).optional(),token_type_hint:z.literal('access_token').optional()}).strict(),req.body);
  try{await auth.revoke(x.token);}catch(e){if(!(e instanceof SpendableError)||e.code!=='INVALID_SESSION')throw e;}
  res.status(200).json({});
 });
}
