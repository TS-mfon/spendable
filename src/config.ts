import {readFileSync,existsSync} from 'node:fs';import {resolve} from 'node:path';import {randomBytes} from 'node:crypto';
const keys=new Set(['CMC_PRO_API_KEY','CMC_API_KEY','ZERION_API_KEY','LIFI_API_KEY','DATABASE_URL','APP_ORIGIN','SESSION_SECRET','RECONCILE_SECRET','GENLAYER_RPC_URL','GENLAYER_CONTRACT_ADDRESS','GENLAYER_SPONSOR_PRIVATE_KEY','GENLAYER_DAILY_REQUEST_LIMIT','GENLAYER_DAILY_GAS_LIMIT','GENLAYER_DAILY_SPEND_WEI','GENLAYER_MAX_GAS_PER_REQUEST','GENLAYER_MAX_GAS_PRICE_WEI','GENLAYER_MIN_BALANCE_WEI','NODE_ENV','PORT']);
export function parseEnv(text:string):Record<string,string>{return Object.fromEntries(text.split(/\r?\n/).flatMap(line=>{const m=line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);if(!m||!keys.has(m[1]))return [];const v=m[2];return [[m[1],v.length>=2&&((v.startsWith('"')&&v.endsWith('"'))||(v.startsWith("'")&&v.endsWith("'")))?v.slice(1,-1):v]];}));}
export function resolveConfig(env:Record<string,string|undefined>){
 const origin=env.APP_ORIGIN||'http://localhost:3000';const url=new URL(origin);if(!['http:','https:'].includes(url.protocol)||url.origin!==origin)throw new Error('APP_ORIGIN must be an HTTP origin');
 const sessionSecret=env.SESSION_SECRET||randomBytes(32).toString('hex');if(env.NODE_ENV==='production'&&!env.SESSION_SECRET)throw new Error('SESSION_SECRET is required in production');if(sessionSecret.length<32)throw new Error('SESSION_SECRET must have at least 32 characters');
 if(env.NODE_ENV==='production'){
  if(url.protocol!=='https:')throw new Error('APP_ORIGIN must use HTTPS in production');
  if(!env.DATABASE_URL||! /^(?:postgres(?:ql)?|mongodb(?:\+srv)?):\/\//.test(env.DATABASE_URL))throw new Error('DATABASE_URL must configure a durable MongoDB Atlas or PostgreSQL database in production');
  if(!(env.CMC_PRO_API_KEY||env.CMC_API_KEY))throw new Error('CMC_PRO_API_KEY is required in production');
  if(!env.ZERION_API_KEY)throw new Error('ZERION_API_KEY is required in production');
 }
 const port=Number(env.PORT||3000);if(!Number.isInteger(port)||port<1||port>65535)throw new Error('PORT is invalid');
 return {origin,port,sessionSecret,cmcApiKey:env.CMC_PRO_API_KEY||env.CMC_API_KEY||'',zerionApiKey:env.ZERION_API_KEY||'',lifiApiKey:env.LIFI_API_KEY||'',databaseUrl:env.DATABASE_URL||undefined,reconcileSecret:env.RECONCILE_SECRET||'',genlayerRpcUrl:env.GENLAYER_RPC_URL||'',genlayerContractAddress:env.GENLAYER_CONTRACT_ADDRESS||'',genlayerSponsorPrivateKey:env.GENLAYER_SPONSOR_PRIVATE_KEY||'',env};
}
export function loadConfig(root=process.cwd()){
 const sources=[resolve(root,'../cmc.env'),resolve(root,'.env'),resolve(root,'.env.local')];
 const fromFiles=sources.filter(existsSync).reduce((out,path)=>({...out,...parseEnv(readFileSync(path,'utf8'))}),{} as Record<string,string>);
 const ambient=Object.fromEntries(Object.entries(process.env).filter(([key])=>keys.has(key)));
 return resolveConfig({...fromFiles,...ambient});
}
