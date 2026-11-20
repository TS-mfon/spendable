import {decodeEventLog,parseAbi} from 'viem';
import type {Address,AssetRef,UnsignedTransaction} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {address,record,array} from './http.ts';
const transferAbi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
export function quantity(value:unknown):bigint{
 if(typeof value!=='string'||!/^0x[0-9a-fA-F]+$/.test(value)||value.length>66)throw new SpendableError('RPC_SCHEMA','Invalid RPC integer.',502);
 return BigInt(value);
}
function sameCalldata(actual:unknown,expected:unknown):boolean{
 const valid=(value:unknown):value is string=>typeof value==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(value);
 return valid(actual)&&valid(expected)&&actual.toLowerCase()===expected.toLowerCase();
}
export function validateTransaction(expected:UnsignedTransaction,input:unknown):void{
 const tx=record(input,'submitted transaction');
 const fail=()=>{throw new SpendableError('SUBMISSION_MISMATCH','Submitted transaction differs from the authorized wallet action.',422);};
 if(address(tx.from)!==expected.from.toLowerCase()||address(tx.to)!==expected.to.toLowerCase()||quantity(tx.value)!==BigInt(expected.value)||!sameCalldata(tx.input,expected.data))fail();
 if(expected.nonce===null||quantity(tx.nonce)!==BigInt(expected.nonce))fail();
 if(quantity(tx.gas)>BigInt(expected.gasLimit))fail();
 const fee=tx.maxFeePerGas??tx.gasPrice;
 const cap=expected.maxFeePerGas??expected.gasPrice;
 if(!cap||quantity(fee)>BigInt(cap))fail();
 if(expected.maxPriorityFeePerGas!==null&&quantity(tx.maxPriorityFeePerGas)>BigInt(expected.maxPriorityFeePerGas))fail();
}
export function transferAmount(input:unknown,asset:AssetRef,recipient:Address):string{
 if(asset.kind!=='erc20'||!asset.address)throw new SpendableError('UNSUPPORTED_PROOF','Routed native delivery requires trace verification.',422);
 const net=array(input,'receipt logs').reduce<bigint>((total,raw)=>{
  const log=record(raw);if(typeof log.address!=='string'||log.address.toLowerCase()!==asset.address)return total;
  const topics=array(log.topics);
  if(topics[0]!=='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'){
   if(typeof topics[0]!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(topics[0]))throw new SpendableError('RPC_SCHEMA','Invalid token event log.',502);
   return total;
  }
  try{
   const event=decodeEventLog({abi:transferAbi,data:log.data as `0x${string}`,topics:topics as [`0x${string}`,...`0x${string}`[]]});
   const args=event.args;
   return total+(args.to.toLowerCase()===recipient.toLowerCase()?args.value:0n)-(args.from.toLowerCase()===recipient.toLowerCase()?args.value:0n);
  }catch{throw new SpendableError('RPC_SCHEMA','Token transfer event could not be verified.',502);}
 },0n);
 return (net>0n?net:0n).toString();
}
