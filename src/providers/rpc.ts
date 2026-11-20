import {encodeFunctionData,parseAbi} from 'viem';
import type {Address,AssetRef,ChainCapability,UnsignedTransaction} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {record,type HttpConfig} from './http.ts';
import {quantity} from './proof.ts';
export const tokenAbi=parseAbi(['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)','function allowance(address,address) view returns (uint256)','function approve(address,uint256) returns (bool)','function transfer(address,uint256) returns (bool)']);
export const hex=(n:bigint|number|string)=>'0x'+BigInt(n).toString(16);
const reads=new Set(['eth_chainId','eth_call','eth_getBalance','eth_blockNumber','eth_estimateGas','eth_gasPrice','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_getBlockByNumber']);
export class RpcClient{
 readonly fetcher:typeof fetch;private verified=false;
 constructor(readonly chain:ChainCapability,config:HttpConfig={}){this.fetcher=config.fetch??fetch;}
 async call(method:string,params:readonly unknown[]=[]):Promise<unknown>{
  if(!reads.has(method))throw new SpendableError('RPC_METHOD','RPC method is not read-only.',422);
  if(!this.chain.rpcUrls[0])throw new SpendableError('RPC_CONFIG','Chain RPC unavailable.',503);
  let body:Record<string,unknown>;
  try{
   const response=await this.fetcher(this.chain.rpcUrls[0],{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000),redirect:'error'});
   if(!response.ok)throw Error();body=record(await response.json());
  }catch{throw new SpendableError('RPC_UNAVAILABLE','Network RPC request unavailable. Retry later.',503);}
  if(body.error||body.id!==1||body.jsonrpc!=='2.0'||!Object.hasOwn(body,'result'))throw new SpendableError('RPC_REJECTED','Network RPC could not complete this request.',502);
  return body.result;
 }
 async ensureChain():Promise<void>{
  if(this.verified)return;
  if(quantity(await this.call('eth_chainId'))!==BigInt(this.chain.id))throw new SpendableError('RPC_CHAIN','RPC chain does not match requested EVM chain.',502);
  this.verified=true;
 }
 async decimals(asset:AssetRef):Promise<number>{
  if(asset.kind==='native')return this.chain.nativeAsset.decimals;
  await this.ensureChain();const data=encodeFunctionData({abi:tokenAbi,functionName:'decimals'});
  const n=quantity(await this.call('eth_call',[{to:asset.address,data},'latest']));
  if(n!==BigInt(asset.decimals))throw new SpendableError('TOKEN_DECIMALS','Token decimals differ from verified metadata.',422);
  return Number(n);
 }
 async balance(owner:Address,asset:AssetRef):Promise<{balanceAtoms:string,blockNumber:string}>{
  await this.ensureChain();await this.decimals(asset);
  const block=quantity(await this.call('eth_blockNumber'));
  const value=asset.kind==='native'?await this.call('eth_getBalance',[owner,hex(block)]):await this.call('eth_call',[{to:asset.address,data:encodeFunctionData({abi:tokenAbi,functionName:'balanceOf',args:[owner]})},hex(block)]);
  return {balanceAtoms:quantity(value).toString(),blockNumber:block.toString()};
 }
 async prepare(owner:Address,to:Address,value:string,data:`0x${string}`,nonce?:number):Promise<UnsignedTransaction>{
  await this.ensureChain();
  const tx={from:owner,to,value:hex(value),data};
  const gas=quantity(await this.call('eth_estimateGas',[tx]))*13n/10n;
  const fee=quantity(await this.call('eth_gasPrice'))*2n;
  const next=nonce??Number(quantity(await this.call('eth_getTransactionCount',[owner,'pending'])));
  if(gas<=0n||fee<=0n||!Number.isSafeInteger(next)||next<0)throw new SpendableError('RPC_FEES','Bounded gas or nonce unavailable.',502);
  return {chainId:this.chain.id,from:owner,to,value,data,gasLimit:gas.toString(),gasPrice:fee.toString(),maxFeePerGas:null,maxPriorityFeePerGas:null,nonce:next};
 }
 async allowance(owner:Address,asset:AssetRef,spender:Address):Promise<bigint>{
  await this.ensureChain();
  return quantity(await this.call('eth_call',[{to:asset.address,data:encodeFunctionData({abi:tokenAbi,functionName:'allowance',args:[owner,spender]})},'latest']));
 }
}
