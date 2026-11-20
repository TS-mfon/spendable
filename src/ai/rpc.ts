import {createClient} from 'genlayer-js';
import {testnetBradbury} from 'genlayer-js/chains';
import {createPublicClient,http,type Address,type Hex} from 'viem';
import {ExecutionResult,TransactionStatus,TransactionHashVariant,type TransactionHash,type GenLayerTransaction} from 'genlayer-js/types';
import type {ConsensusLog} from './encoding.ts';
export interface SponsorReceipt {
 readonly hash:string;readonly from:string;readonly to:string|null;readonly status:'success'|'reverted';readonly logs:readonly ConsensusLog[];
}
export interface SponsorRpc {
 chainId():Promise<number>;balance(address:Address):Promise<bigint>;
 estimate(from:Address,to:Address,data:Hex):Promise<bigint>;gasPrice():Promise<bigint>;nonce(address:Address):Promise<number>;
 broadcast(serialized:Hex):Promise<string>;receipt(hash:Hex):Promise<SponsorReceipt|null>;
 code(address:Address):Promise<string>;sponsor(address:Address):Promise<string>;
 consensus(id:Hex):Promise<{status:'pending'|'finalized'|'failed';execution:'pending'|'success'|'error';sender:string|null;recipient:string|null}>;
 result(address:Address,id:string):Promise<unknown>;
}
interface EvmClient {
 getChainId():Promise<number>;getBalance(input:{address:Address}):Promise<bigint>;
 estimateGas(input:{account:Address;to:Address;data:Hex;value:bigint}):Promise<bigint>;getGasPrice():Promise<bigint>;
 getTransactionCount(input:{address:Address;blockTag:'pending'}):Promise<number>;
 sendRawTransaction(input:{serializedTransaction:Hex}):Promise<Hex>;
 getTransactionReceipt(input:{hash:Hex}):Promise<{transactionHash:Hex;from:Address;to:Address|null;status:'success'|'reverted';logs:readonly ConsensusLog[]}>;
}
interface GenClient {
 getContractCode(address:Address):Promise<string>;
 readContract(input:{address:Address;functionName:string;args?:string[];transactionHashVariant:TransactionHashVariant}):Promise<unknown>;
 getTransaction(input:{hash:TransactionHash}):Promise<GenLayerTransaction>;
}
export interface RpcDependencies {readonly evm?:EvmClient;readonly gen?:GenClient}
export function createSponsorRpc(endpoint:string,clients:RpcDependencies={}):SponsorRpc{
 const publicClient:EvmClient=clients.evm??createPublicClient({chain:testnetBradbury,transport:http(endpoint,{timeout:10000,retryCount:0})});
 const genClient:GenClient=clients.gen??createClient({chain:testnetBradbury,endpoint});
 return {
 chainId:()=>publicClient.getChainId(),balance:address=>publicClient.getBalance({address}),
 estimate:(from,to,data)=>publicClient.estimateGas({account:from,to,data,value:0n}),
 gasPrice:()=>publicClient.getGasPrice(),nonce:address=>publicClient.getTransactionCount({address,blockTag:'pending'}),
 broadcast:serialized=>publicClient.sendRawTransaction({serializedTransaction:serialized}),
 async receipt(hash){
  try{
   const r=await publicClient.getTransactionReceipt({hash});
   return {hash:r.transactionHash,from:r.from,to:r.to,status:r.status,logs:r.logs};
  }catch(error){
   if(error instanceof Error&&error.name==='TransactionReceiptNotFoundError')return null;
   throw error;
  }
 },
 code:address=>genClient.getContractCode(address),
 async sponsor(address){return String(await genClient.readContract({address,functionName:'get_sponsor',transactionHashVariant:TransactionHashVariant.LATEST_FINAL}));},
 async consensus(id){
  const tx=await genClient.getTransaction({hash:id as TransactionHash});
  const status=tx.statusName===TransactionStatus.FINALIZED?'finalized':tx.statusName===TransactionStatus.CANCELED?'failed':'pending';
  const execution=tx.txExecutionResultName===ExecutionResult.FINISHED_WITH_RETURN?'success':tx.txExecutionResultName===ExecutionResult.FINISHED_WITH_ERROR?'error':'pending';
  return {status,execution,sender:tx.sender??tx.from_address??null,recipient:tx.recipient??tx.to_address??null};
 },
 result:(address,id)=>genClient.readContract({address,functionName:'get_request',args:[id],transactionHashVariant:TransactionHashVariant.LATEST_FINAL})
 };
}
