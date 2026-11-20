import {Decimal} from 'decimal.js';
import type {AssetRef,PriceQuote,FiatRate} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {JsonClient,record,stamp,type HttpConfig} from './http.ts';
import {parseMetadata,type CmcMetadata} from './metadata.ts';
export {CMC_IDS,type CmcMetadata} from './metadata.ts';
const D=Decimal.clone({precision:40});
export interface CmcConfig extends HttpConfig {readonly cmcApiKey?:string;readonly fiatCurrencies?:readonly string[]}
export function positive(value:unknown):Decimal{
 if(typeof value!=='string'&&typeof value!=='number')throw new SpendableError('CMC_PRICE','CMC price is missing.',502);
 let n:Decimal;try{n=new D(value);}catch{throw new SpendableError('CMC_PRICE','CMC price is invalid.',502);}
 if(!n.isFinite()||n.lte(0))throw new SpendableError('CMC_PRICE','CMC price must be positive.',502);return n;
}
export class CmcClient{
 readonly http:JsonClient;readonly currencies:readonly string[];
 private cache=new Map<string,{at:number,value:{prices:readonly PriceQuote[],rates:readonly FiatRate[]}}>();
 private metadataCache:{at:number,value:readonly CmcMetadata[]}|null=null;private creditCount=0;
 constructor(readonly config:CmcConfig={}){
  this.http=new JsonClient('CMC','https://pro-api.coinmarketcap.com',{'X-CMC_PRO_API_KEY':config.cmcApiKey||''},config);
  this.currencies=[...new Set(['USD',...(config.fiatCurrencies??['EUR','NGN'])])];
  if(this.currencies.length>40||this.currencies.some(x=>!/^\w{3,5}$/.test(x)))throw new SpendableError('CMC_CONFIG','Invalid CMC conversion currencies.',503);
 }
 get creditsUsed(){return this.creditCount;}
 async request(path:string,params:Record<string,string>){
  if(!this.config.cmcApiKey)throw new SpendableError('CMC_CONFIG','CMC API key is required.',503);
  const body=await this.http.get(path,params);const status=record(body.status,'CMC status');
  if(status.error_code!==0&&status.error_code!=='0')throw new SpendableError('CMC_API','CMC rejected the request. Check entitlement and parameters.',502);
  if(typeof status.credit_count==='number'&&Number.isInteger(status.credit_count)&&status.credit_count>=0)this.creditCount+=status.credit_count;
  return body;
 }
 async prices(assets:readonly AssetRef[]):Promise<{prices:readonly PriceQuote[],rates:readonly FiatRate[]}>{
  const ids=[...new Set(assets.map(a=>a.cmcId).filter((x):x is number=>x!==null))].sort((a,b)=>a-b);
  if(!ids.length)return {prices:[],rates:[{currency:'USD',usdPerUnit:'1',observedAt:new Date(this.http.now()).toISOString(),source:'cmc'}]};
  const key=ids.join(',')+'|'+this.currencies.join(',')+'|'+assets.map(x=>x.key).sort().join(',');
  const cached=this.cache.get(key);if(cached&&this.http.now()-cached.at<60000)return structuredClone(cached.value);
  const body=await this.request('/v3/cryptocurrency/quotes/latest',{id:ids.join(','),convert:this.currencies.join(',')});
  const data=Array.isArray(body.data)?Object.fromEntries(body.data.map(raw=>{const a=record(raw);return [String(a.id),a];})):record(body.data,'CMC quotes');const quotes=ids.map(id=>{
   const raw=data[String(id)];const entry=record(Array.isArray(raw)?raw[0]:raw,'CMC asset quote');
   if(entry.id!==id)throw new SpendableError('CMC_ID','CMC quote ID does not match asset.',502);
   if(typeof entry.symbol==='string'&&assets.some(a=>a.cmcId===id&&a.symbol.toUpperCase()!==entry.symbol))throw new SpendableError('CMC_IDENTITY','CMC symbol does not match the verified asset identity.',502);
   const conversions=Array.isArray(entry.quote)?Object.fromEntries(entry.quote.map(raw=>{const q=record(raw);return [String(q.symbol),q];})):record(entry.quote,'CMC conversions');return {id,quote:conversions};
  });
  const prices=assets.filter(a=>a.cmcId!==null).map(a=>{
   const entry=quotes.find(x=>x.id===a.cmcId)!;const usd=record(entry.quote.USD,'CMC USD quote');
   return {assetKey:a.key,usd:positive(usd.price).toFixed(),observedAt:stamp(usd.last_updated,this.http.now()),source:'cmc' as const,endpoint:'/v3/cryptocurrency/quotes/latest'};
  });
  const anchor=quotes[0];const usd=record(anchor.quote.USD);const usdPrice=positive(usd.price);
  const rates=this.currencies.map(currency=>{
   const conversion=record(anchor.quote[currency],'CMC fiat conversion');
   return {currency,usdPerUnit:usdPrice.div(positive(conversion.price)).toFixed(),observedAt:stamp(conversion.last_updated,this.http.now()),source:'cmc' as const};
  });
  const value={prices,rates};this.cache.set(key,{at:this.http.now(),value:structuredClone(value)});return value;
 }
 async metadata():Promise<readonly CmcMetadata[]>{
  if(this.metadataCache&&this.http.now()-this.metadataCache.at<86400000)return structuredClone(this.metadataCache.value);
  const body=await this.request('/v2/cryptocurrency/info',{id:'2396,3717,3408,825,4943'});
  const value=parseMetadata(body.data);this.metadataCache={at:this.http.now(),value};return structuredClone(value);
 }
}
