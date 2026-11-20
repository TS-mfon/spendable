import {abi as codec} from 'genlayer-js';
import {testnetBradbury} from 'genlayer-js/chains';
import {encodeFunctionData,decodeEventLog,type Abi,type Hex} from 'viem';
import type {ConsensusSubmission} from './types.ts';
export const contractSha256='2168b32215eb6d6ef803eca5db794574fcf8df3958515c6935ae88c95c5df985';
export const runnerHeader='# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }';
export const consensusAddress=testnetBradbury.consensusMainContract!.address;
const addAbi=[{type:'function',name:'addTransaction',stateMutability:'payable',inputs:[
 {name:'sender',type:'address'},{name:'recipient',type:'address'},{name:'validators',type:'uint256'},
 {name:'rotations',type:'uint256'},{name:'data',type:'bytes'},{name:'validUntil',type:'uint256'}
],outputs:[]}] as const;
const createdAbi=[{type:'event',name:'CreatedTransaction',anonymous:false,inputs:[
 {indexed:true,name:'txId',type:'bytes32'},{indexed:false,name:'txSlot',type:'uint256'}
]}] as const;
export interface ConsensusLog {readonly address:string;readonly data:Hex;readonly topics:readonly Hex[]}
export function encodeInterpretation(sponsor:Hex,contract:Hex,request:ConsensusSubmission,now:number):Hex{
 const call=codec.calldata.encode(codec.calldata.makeCalldataObject('interpret',[request.id,request.text,request.context,request.digest],undefined));
 const payload=codec.transactions.serialize([call,false]);
 return encodeFunctionData({abi:addAbi,functionName:'addTransaction',args:[sponsor,contract,BigInt(testnetBradbury.defaultNumberOfInitialValidators),BigInt(testnetBradbury.defaultConsensusMaxRotations),payload,BigInt(Math.floor(now/1000)+3600)]});
}
export function consensusId(logs:readonly ConsensusLog[]):Hex|null{
 const relevant=logs.filter(l=>l.address.toLowerCase()===consensusAddress.toLowerCase()).map(l=>({...l,topics:[...l.topics]}));
 for(const log of relevant){
  try{
   const event=decodeEventLog({abi:[...(testnetBradbury.consensusMainContract!.abi as Abi),...createdAbi],data:log.data,topics:log.topics as [Hex,...Hex[]],strict:true});
   if(event.eventName!=='CreatedTransaction'&&event.eventName!=='NewTransaction')continue;
   const args=event.args as Record<string,unknown>;
   if(typeof args.txId==='string'&&/^0x[0-9a-fA-F]{64}$/.test(args.txId))return args.txId as Hex;
  }catch{/* Ignore unrelated event signatures; no proof is synthesized. */}
 }
 return null;
}
export function encodeDeployment(sponsor:Hex,source:string,now:number):Hex{
 const constructor=codec.calldata.encode(codec.calldata.makeCalldataObject(undefined,[sponsor],undefined));
 const payload=codec.transactions.serialize([new TextEncoder().encode(source),constructor,false]);
 return encodeFunctionData({abi:addAbi,functionName:'addTransaction',args:[sponsor,'0x0000000000000000000000000000000000000000',BigInt(testnetBradbury.defaultNumberOfInitialValidators),BigInt(testnetBradbury.defaultConsensusMaxRotations),payload,BigInt(Math.floor(now/1000)+3600)]});
}
