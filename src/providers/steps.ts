import {encodeFunctionData} from 'viem';
import type {RouteQuote,PreparedStep,UnsignedTransaction} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {RpcClient,tokenAbi} from './rpc.ts';
import {quantity} from './proof.ts';
export async function buildSteps(quote:RouteQuote,rpc:RpcClient):Promise<readonly PreparedStep[]>{
 const q=quote;await rpc.ensureChain();
 const nonce=Number(quantity(await rpc.call('eth_getTransactionCount',[q.owner,'pending'])));
 if(!Number.isSafeInteger(nonce))throw new SpendableError('INVALID_NONCE','Wallet nonce cannot be represented safely.',422);
 const requests:readonly {kind:PreparedStep['kind'],data:`0x${string}`,to:UnsignedTransaction['to'],value:string}[]=[];
 let work=[...requests];
 if(q.sourceAsset.kind==='erc20'&&q.approvalAddress){
  const allowance=await rpc.allowance(q.owner,q.sourceAsset,q.approvalAddress);
  if(allowance<BigInt(q.fromAmountAtoms)){
   if(allowance>0n)work=[...work,{kind:'approval_reset',to:q.sourceAsset.address!,value:'0',data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[q.approvalAddress,0n]})}];
   work=[...work,{kind:'approval',to:q.sourceAsset.address!,value:'0',data:encodeFunctionData({abi:tokenAbi,functionName:'approve',args:[q.approvalAddress,BigInt(q.fromAmountAtoms)]})}];
  }
 }
 work=[...work,{kind:'funding',to:q.transaction.to,value:q.transaction.value,data:q.transaction.data}];
 const fee=quantity(await rpc.call('eth_gasPrice'))*2n;
 if(fee<=0n)throw new SpendableError('UNBOUNDED_FEE','Current gas fee is unavailable.',502);
 const steps:PreparedStep[]=[];
 for(const [index,item]of work.entries()){
  let transaction:UnsignedTransaction;
  if(item.kind==='funding'){
   transaction={...q.transaction,nonce:nonce+index};
   if(BigInt(transaction.gasPrice??transaction.maxFeePerGas??'0')<fee/2n)throw new SpendableError('EXPIRED_FEES','Network fees changed. Review a fresh plan.',409);
  }else{
   transaction={chainId:q.sourceAsset.chainId,from:q.owner,to:item.to,value:'0',data:item.data,gasLimit:'120000',gasPrice:fee.toString(),maxFeePerGas:null,maxPriorityFeePerGas:null,nonce:nonce+index};
  }
  steps.push({id:item.kind+'-'+index,kind:item.kind,transaction,submittedHash:null,confirmedBlockNumber:null});
 }
 return steps;
}
