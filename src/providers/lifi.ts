import type {ChainCapability,RouteQuote} from '../shared/contracts.ts';
import type {QuoteRequest} from '../shared/ports.ts';
import {SpendableError} from '../shared/errors.ts';
import {JsonClient,record,type HttpConfig} from './http.ts';
import {normalizeQuote} from './lifi-quote.ts';
export interface LifiConfig extends HttpConfig{readonly lifiApiKey?:string}
async function quoteHttpError(response:Response,path:string):Promise<SpendableError|null>{
 if(response.status!==400||path!=='/v1/quote/toAmount')return null;
 try{
  const body=await response.json();
  if(body&&typeof body==='object'&&!Array.isArray(body)&&body.code===1011&&body.message==='toAmount is too small to generate a valid fromAmount estimate'){
   return new SpendableError('LIFI_AMOUNT_TOO_SMALL','LI.FI cannot estimate a route for this receive amount because it is too small. Try a larger receive amount and compare again; the quote will show fees before signing.',422,{providerCode:1011});
  }
 }catch{return null;}
 return null;
}
export class LifiClient{
 readonly http:JsonClient;
 constructor(config:LifiConfig={}){
  this.http=new JsonClient('LI.FI','https://li.quest',config.lifiApiKey?{'x-lifi-api-key':config.lifiApiKey}:{},config,quoteHttpError);
 }
 chains(){return this.http.get('/v1/chains',{chainTypes:'EVM'});}
 async tokens(chains:readonly ChainCapability[]){return record((await this.http.get('/v1/tokens',{chains:chains.map(c=>c.id).join(',')})).tokens);}
 async quote(request:QuoteRequest,chain:ChainCapability):Promise<RouteQuote>{
  const i=request.intent;
  if(!chain.feeEstimation||!chain.routing)throw new SpendableError('UNSUPPORTED_FEES','Network fee components are not bounded on this source chain.',422);
  const params:Record<string,string>={fromChain:String(request.source.chainId),toChain:String(i.targetAsset.chainId),fromToken:request.source.address??'0x0000000000000000000000000000000000000000',toToken:i.targetAsset.address??'0x0000000000000000000000000000000000000000',fromAddress:i.owner,toAddress:i.recipient,slippage:String(i.policy.maxSlippageBps/10000),integrator:'spendable'};
  if(request.targetAmountAtoms){
   params.toAmount=((BigInt(request.targetAmountAtoms)*10000n+BigInt(10000-i.policy.maxSlippageBps)-1n)/BigInt(10000-i.policy.maxSlippageBps)).toString();
  }else params.fromAmount=request.fromAmountAtoms;
  const body=await this.http.get(request.targetAmountAtoms?'/v1/quote/toAmount':'/v1/quote',params);
  return normalizeQuote(body,request,chain,this.http.now());
 }
 status(hash:string,fromChain:number,toChain:number,bridge?:string){
  return this.http.get('/v1/status',{txHash:hash,fromChain:String(fromChain),toChain:String(toChain),...(bridge?{bridge}:{})});
 }
}
