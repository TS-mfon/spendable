import { SpendableError } from '../shared/errors.ts';
export interface HttpConfig { readonly fetch?:typeof fetch;readonly now?:()=>number }
export function record(value:unknown,label='provider response'):Record<string,unknown>{
 if(!value||typeof value!=='object'||Array.isArray(value))throw new SpendableError('PROVIDER_SCHEMA',`Invalid ${label}.`,502);
 return value as Record<string,unknown>;
}
export function array(value:unknown,label='provider response'):unknown[]{
 if(!Array.isArray(value))throw new SpendableError('PROVIDER_SCHEMA',`Invalid ${label}.`,502);return value;
}
export function atom(value:unknown):string{
 if(typeof value!=='string'||!/^\d+$/.test(value)||value.length>78)throw new SpendableError('PROVIDER_SCHEMA','Invalid provider token amount.',502);
 return BigInt(value).toString();
}
export function address(value:unknown):`0x${string}`{
 if(typeof value!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(value))throw new SpendableError('PROVIDER_SCHEMA','Invalid provider address.',502);
 return value.toLowerCase() as `0x${string}`;
}
export function stamp(value:unknown,now:number,maxAge=300000):string{
 const time=typeof value==='string'?Date.parse(value):NaN;
 if(!Number.isFinite(time)||time>now+60000||now-time>maxAge)throw new SpendableError('STALE_PRICE','CMC price timestamp is missing or stale.',502);
 return new Date(time).toISOString();
}
export class JsonClient {
 readonly fetcher:typeof fetch;readonly now:()=>number;
 private blockedUntil=0;
 constructor(readonly provider:string,readonly base:string,readonly headers:Readonly<Record<string,string>>,config:HttpConfig={}){
  this.fetcher=config.fetch??fetch;this.now=config.now??Date.now;
 }
 async get(path:string,params:Readonly<Record<string,string>>={}):Promise<Record<string,unknown>>{
  if(this.blockedUntil>this.now())throw new SpendableError('PROVIDER_THROTTLED',`${this.provider} rate limit active. Retry later.`,429);
  const url=new URL(path,this.base);for(const [k,v]of Object.entries(params))url.searchParams.set(k,v);
  let response:Response;
  try{response=await this.fetcher(url,{headers:{Accept:'application/json',...this.headers},signal:AbortSignal.timeout(15000),redirect:'error'});}
  catch{throw new SpendableError('PROVIDER_UNAVAILABLE',`${this.provider} request unavailable. Retry later.`,503);}
  if(response.status===429){
   const retry=Number(response.headers.get('retry-after')||1);this.blockedUntil=this.now()+Math.min(Math.max(Number.isFinite(retry)?retry:60,1),3600)*1000;
   throw new SpendableError('PROVIDER_THROTTLED',`${this.provider} rate limit reached. Retry later.`,429);
  }
  if(!response.ok)throw new SpendableError('PROVIDER_HTTP',`${this.provider} request failed (HTTP ${response.status}).`,response.status===401||response.status===403?503:502);
  try{return record(await response.json());}catch(e){if(e instanceof SpendableError)throw e;throw new SpendableError('PROVIDER_SCHEMA',`${this.provider} returned invalid JSON.`,502);}
 }
}
