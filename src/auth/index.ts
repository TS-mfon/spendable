import type {OAuthRecord,OAuthStoreMethods} from './oauth-store.ts';
import {createHmac,randomBytes,timingSafeEqual} from 'node:crypto';
import {getAddress,verifyMessage} from 'viem';
import {z} from 'zod';
import type {Address,AuthPrincipal} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {createStoreLifecycle} from './lifecycle.ts';
import {createSqlAuthStore,type AuthStore} from './store.ts';
export {createMemoryAuthStore,createSqlAuthStore,type AuthStore} from './store.ts';
export const sessionCookieName='spendable_session';
export interface AuthConfig {readonly secret:string;readonly origin:string;readonly store?:AuthStore;readonly databaseUrl?:string;readonly dataDir?:string;readonly now?:()=>number}
export const authScopes=['wallet:read','plan:write','execution:write'] as const;
const tokenPayload=z.object({id:z.string().length(48),wallet:z.string().regex(/^0x[0-9a-f]{40}$/),aud:z.string().url(),exp:z.number().int().positive(),scopes:z.array(z.enum(authScopes)).default([...authScopes]),clientId:z.string().max(128).optional()}).strict();
export interface SessionPrincipal extends AuthPrincipal {readonly sessionKind:'wallet'|'oauth'}
export interface AuthService extends OAuthStoreMethods {
 ready():Promise<void>;
 issueSession(wallet:string,options?:{scopes?:readonly string[];clientId?:string}):Promise<{token:string;wallet:Address;expiresAt:string}>;
 challenge(wallet:string):Promise<{message:string;expiresAt:string}>;
 verify(input:{wallet:string;message:string;signature:string}):Promise<{token:string;wallet:Address;expiresAt:string}>;
 authenticate(token:string):Promise<SessionPrincipal>; revoke(token:string):Promise<void>;
 allow(key:string,limit?:number,windowMs?:number):Promise<boolean>; close():Promise<void>;
}
const fail=(code:string,message:string,status=401)=>new SpendableError(code,message,status);
function normalizeWallet(wallet:string):Address {
 try{return getAddress(wallet).toLowerCase() as Address;}catch{throw fail('INVALID_WALLET','Enter a valid wallet address.',422);}
}
export function createAuth(config:AuthConfig):AuthService {
 if(config.secret.length<32)throw fail('AUTH_CONFIGURATION','SESSION_SECRET must contain at least 32 characters.',503);
 const origin=new URL(config.origin).origin;
 if(origin!==config.origin)throw fail('AUTH_CONFIGURATION','APP_ORIGIN must be an origin without a path.',503);
 const lifecycle=createStoreLifecycle(()=>createSqlAuthStore(config.databaseUrl,config.dataDir),config.store);
 const store=lifecycle.get;
 const now=config.now??Date.now;
 const sign=(payload:string)=>createHmac('sha256',config.secret).update(payload).digest('base64url');
 function decode(token:string){
  const [payload,signature,...rest]=token.split('.');
  if(!payload||!signature||rest.length||token.length>2048)throw fail('INVALID_SESSION','Your wallet session is invalid or expired. Sign in again to continue.');
  const expected=Buffer.from(sign(payload));const actual=Buffer.from(signature);
  if(expected.length!==actual.length||!timingSafeEqual(expected,actual))throw fail('INVALID_SESSION','Your wallet session is invalid or expired. Sign in again to continue.');
  try{const p=tokenPayload.parse(JSON.parse(Buffer.from(payload,'base64url').toString()));if(p.aud!==origin||p.exp<=now())throw Error();return p;}catch{throw fail('INVALID_SESSION','Your wallet session is invalid or expired. Sign in again to continue.');}
 }
 async function issueSession(raw:string,options:{scopes?:readonly string[];clientId?:string}={}){
  const wallet=normalizeWallet(raw);
  const id=randomBytes(24).toString('hex');const exp=now()+3600000;
  await(await store()).putSession({id,wallet,expires:exp});
  const payload=Buffer.from(JSON.stringify({id,wallet,aud:origin,exp,scopes:options.scopes??authScopes,...(options.clientId?{clientId:options.clientId}:{})})).toString('base64url');
  return {token:`${payload}.${sign(payload)}`,wallet,expiresAt:new Date(exp).toISOString()};
 }
 return {
 ready:lifecycle.ready,
 issueSession,
 async oauthPut(r:OAuthRecord){await(await store()).oauthPut(r);},
 async oauthGet(kind,id,time){return (await store()).oauthGet(kind,id,time);},
 async oauthTake(kind,id,time){return (await store()).oauthTake(kind,id,time);},
 async challenge(raw){
  const wallet=normalizeWallet(raw);const id=randomBytes(24).toString('hex');const expires=now()+300000;
  const message=`${new URL(origin).host} wants you to sign in with your Ethereum account:
${wallet}

Sign in to Spendable. This signature does not authorize a transaction.

URI: ${origin}
Version: 1
Nonce: ${id}
Issued At: ${new Date(now()).toISOString()}
Expiration Time: ${new Date(expires).toISOString()}`;
  await(await store()).putChallenge({id,wallet,message,expires});return {message,expiresAt:new Date(expires).toISOString()};
 },
 async verify(input){
  const wallet=normalizeWallet(input.wallet);
  const nonce=/^Nonce: ([0-9a-f]{48})$/m.exec(input.message)?.[1];
  const c=nonce?await(await store()).getChallenge(nonce):null;
  if(!c||c.expires<=now())throw fail('INVALID_CHALLENGE','Sign-in challenge expired or already used.');
  if(c.wallet!==wallet||c.message!==input.message)throw fail('INVALID_CHALLENGE','Sign-in challenge does not match this wallet.');
  let valid=false;
  try{valid=await verifyMessage({address:wallet,message:c.message,signature:input.signature as `0x${string}`});}catch{valid=false;}
  if(!valid)throw fail('INVALID_SIGNATURE','Wallet signature could not be verified.');
  if(!await(await store()).consumeChallenge(c.id,now()))throw fail('INVALID_CHALLENGE','Sign-in challenge expired or already used.');
  return issueSession(wallet);
 },
 async authenticate(token){
  const p=decode(token);
  if(!await(await store()).activeSession(p.id,p.wallet,now()))throw fail('INVALID_SESSION','Your wallet session is invalid or expired. Sign in again to continue.');
  return {wallet:p.wallet as Address,scopes:p.scopes,clientId:p.clientId??p.id,sessionKind:p.clientId?'oauth':'wallet'};
 },
 async revoke(token){const p=decode(token);await(await store()).revokeSession(p.id);},
 async allow(key,limit=120,windowMs=60000){return (await store()).allow(key,limit,windowMs,now());},
 close:lifecycle.close
 };
}
