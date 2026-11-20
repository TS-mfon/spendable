import {z} from 'zod';
import {authScopes} from '../auth/index.ts';
export const safeRedirect=z.string().url().max(2048).refine(value=>{
 const url=new URL(value);
 return !url.username&&!url.password&&!url.hash&&(url.protocol==='https:'||(url.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(url.hostname)));
},'Use HTTPS or a loopback redirect without credentials or fragment.');
export const registrationSchema=z.object({client_name:z.string().min(1).max(80).default('Wallet agent'),redirect_uris:z.array(safeRedirect).min(1).max(5),token_endpoint_auth_method:z.literal('none').default('none'),grant_types:z.array(z.literal('authorization_code')).optional(),response_types:z.array(z.literal('code')).optional()}).strict();
export const authorizationSchema=z.object({
 client_id:z.string().min(1).max(128),redirect_uri:safeRedirect,response_type:z.literal('code'),
 code_challenge:z.string().regex(/^[A-Za-z0-9_-]{43}$/),code_challenge_method:z.literal('S256'),
 state:z.string().max(1024).optional(),scope:z.string().max(200).default(authScopes.join(' ')),
 resource:z.string().url().optional()
}).strict();
export const tokenSchema=z.object({grant_type:z.literal('authorization_code'),client_id:z.string().max(128),code:z.string().regex(/^[0-9a-f]{64}$/),redirect_uri:safeRedirect,code_verifier:z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),resource:z.string().url().optional()}).strict();
export function requestedScopes(value:string){const scopes=[...new Set(value.split(' ').filter(Boolean))];return scopes.length&&scopes.every(s=>authScopes.includes(s as typeof authScopes[number]))?scopes:null;}
