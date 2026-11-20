import type {Execution,DeliveryReceipt} from '../shared/contracts.ts';
import {record,address,atom} from './http.ts';import {RpcClient} from './rpc.ts';import {quantity,transferAmount} from './proof.ts';import {confirmedReceipt,deliveryReceipt} from './receipt.ts';
export async function verifyRefund(e:Execution,source:Record<string,unknown>,status:Record<string,unknown>,rpc:RpcClient):Promise<DeliveryReceipt|null>{
 const asset=e.candidate.quote.sourceAsset;
 if(asset.kind!=='erc20'||!asset.address)return null;
 const receiving=record(status.receiving),token=record(receiving.token);
 if(receiving.chainId!==asset.chainId||token.decimals!==asset.decimals||address(token.address)!==asset.address)return null;
 if(typeof receiving.txHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(receiving.txHash))return null;
 const returned=await confirmedReceipt(rpc,receiving.txHash);
 if(!returned||quantity(returned.status)!==1n)return null;
 const movement=BigInt(transferAmount(returned.logs,asset,e.owner)),attributed=BigInt(atom(receiving.amount));
 if(attributed<=0n||movement<attributed)return null;
 const receipt=deliveryReceipt(e,source,returned,'refunded',attributed.toString());
 return {...receipt,asset,recipient:e.owner,requestedAtoms:e.candidate.quote.fromAmountAtoms,warnings:attributed<BigInt(e.candidate.quote.fromAmountAtoms)?['Verified refund is below the original source input; fees or partial return may apply.']:[]};
}
