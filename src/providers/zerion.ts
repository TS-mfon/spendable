import type {Address,AssetRef,ChainCapability,WalletHolding} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {JsonClient,record,array,atom,address,type HttpConfig} from './http.ts';
import {chainIdForName} from './registry.ts';
export interface ZerionConfig extends HttpConfig {readonly zerionApiKey?:string}
export class ZerionClient{
 readonly http:JsonClient;
 constructor(readonly config:ZerionConfig={}){
  this.http=new JsonClient('Zerion','https://api.zerion.io',{Authorization:'Basic '+Buffer.from((config.zerionApiKey||'')+':').toString('base64')},config);
 }
 async chains():Promise<readonly string[]>{
  if(!this.config.zerionApiKey)throw new SpendableError('ZERION_CONFIG','Zerion API key is required.',503);
  const body=await this.http.get('/v1/chains/');return array(body.data).map(x=>{const c=record(x);if(typeof c.id!=='string')throw Error('Invalid Zerion chain.');return c.id;});
 }
 async positions(owner:Address,chains:readonly ChainCapability[]):Promise<{holdings:readonly WalletHolding[],warnings:readonly string[],complete:boolean}>{
  if(!this.config.zerionApiKey)throw new SpendableError('ZERION_CONFIG','Zerion API key is required.',503);
  address(owner);let next='/v1/wallets/'+owner+'/positions/';let params:Record<string,string>={'filter[positions]':'only_simple','page[size]':'100',currency:'usd'};
  const holdings:WalletHolding[]=[],warnings:string[]=[];let pages=0;
  while(next&&pages++<10){
   const body=await this.http.get(next,params);
   for(const raw of array(body.data)){
    const p=record(raw),a=record(p.attributes),r=record(p.relationships),rel=record(record(r.chain).data);
    const chainName=typeof rel.id==='string'?rel.id:'';const id=chainIdForName(chainName);const chain=chains.find(c=>c.id===id);
    if(!chain){warnings.push('Holdings on unsupported network '+chainName+' could not be evaluated.');continue;}
    const f=record(a.fungible_info),q=record(a.quantity),balanceAtoms=atom(q.int);
    const implementation=array(f.implementations).map(x=>record(x)).find(x=>x.chain_id===chainName);
    if(!implementation){warnings.push('Token deployment missing on '+chainName+'.');continue;}
    const native=implementation.address===null||implementation.address==='0x0000000000000000000000000000000000000000';
    const tokenAddress=native?null:address(implementation.address);
    const trusted=(chain.assets??[chain.nativeAsset]).find(x=>x.address===tokenAddress);
    if(!Number.isInteger(q.decimals)||Number(q.decimals)<0||Number(q.decimals)>36)throw new SpendableError('ZERION_SCHEMA','Invalid wallet token decimals.',502);
    const asset:AssetRef=trusted??{key:chain.id+':'+tokenAddress,chainId:chain.id,address:tokenAddress,kind:native?'native':'erc20',symbol:typeof f.symbol==='string'?f.symbol:'UNKNOWN',name:typeof f.name==='string'?f.name:'Unverified token',decimals:Number(q.decimals),cmcId:null};
    const warning=trusted&&trusted.decimals===q.decimals?null:'Token identity or decimals not verified; excluded from funding.';
    holdings.push({asset:warning?{...asset,cmcId:null}:asset,balanceAtoms,observedAt:new Date(this.http.now()).toISOString(),blockNumber:null,discoveredBy:'zerion',warning});
   }
   const link=record(body.links??{}).next;
   if(link){
    if(typeof link!=='string')throw new SpendableError('ZERION_SCHEMA','Invalid pagination link.',502);
    const url=new URL(link,this.http.base);if(url.origin!==new URL(this.http.base).origin)throw new SpendableError('ZERION_SCHEMA','Unexpected pagination origin.',502);
    next=url.pathname;params=Object.fromEntries(url.searchParams);
   }else next='';
  }
  if(next)warnings.push('Wallet discovery truncated after 1,000 positions.');
  return {holdings,warnings,complete:!warnings.length&&!next};
 }
}
