import type {RouteQuote,ChainCapability,QuoteFee} from '../shared/contracts.ts';
import type {QuoteRequest} from '../shared/ports.ts';
import {SpendableError} from '../shared/errors.ts';
import {record,array,atom,address} from './http.ts';
function check(condition:unknown):asserts condition{if(!condition)throw new SpendableError('LIFI_QUOTE','LI.FI quote does not match the bounded request.',502);}
const maxTransactionQuantity=(1n<<256n)-1n;
function transactionQuantity(value:unknown):string{
 if(typeof value!=='string'||(!/^(?:0|[1-9][0-9]*)$/.test(value)&&!/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value))||value.length>(value.startsWith('0x')?66:78)){
  throw new SpendableError('LIFI_TRANSACTION_QUANTITY','LI.FI returned an invalid transaction quantity.',502);
 }
 const parsed=BigInt(value);
 if(parsed>maxTransactionQuantity)throw new SpendableError('LIFI_TRANSACTION_QUANTITY','LI.FI transaction quantity exceeds its integer bound.',502);
 return parsed.toString();
}
export function normalizeQuote(body:Record<string,unknown>,request:QuoteRequest,chain:ChainCapability,now:number):RouteQuote{
 const a=record(body.action),e=record(body.estimate),tx=record(body.transactionRequest),i=request.intent;
 const from=record(a.fromToken),to=record(a.toToken);
 const tokenAddress=(x:typeof request.source)=>x.address??'0x0000000000000000000000000000000000000000';
 check(a.fromChainId===request.source.chainId&&a.toChainId===i.targetAsset.chainId&&address(a.fromAddress)===i.owner.toLowerCase()&&address(a.toAddress)===i.recipient.toLowerCase());
 check(address(from.address)===tokenAddress(request.source)&&address(to.address)===tokenAddress(i.targetAsset));
 check(from.decimals===request.source.decimals&&to.decimals===i.targetAsset.decimals);
 check(tx.chainId===chain.id&&(!tx.from||address(tx.from)===i.owner.toLowerCase()));
 check(typeof tx.data==='string'&&/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data)&&tx.data.length<262144);
 const rawGas=transactionQuantity(tx.gasLimit),rawPrice=transactionQuantity(tx.gasPrice??tx.maxFeePerGas);
 const gas=BigInt(rawGas)*13n/10n,gasPrice=BigInt(rawPrice)*2n;
 check(gas>0n&&gasPrice>0n&&gas<=maxTransactionQuantity&&gasPrice<=maxTransactionQuantity);
 const input=atom(e.fromAmount??a.fromAmount),minimum=atom(e.toAmountMin),output=atom(e.toAmount);
 check(BigInt(input)>0n&&BigInt(minimum)>0n&&BigInt(output)>=BigInt(minimum));
 if(request.targetAmountAtoms)check(BigInt(minimum)>=BigInt(request.targetAmountAtoms));else check(input===request.fromAmountAtoms);
 const feeCosts=array(e.feeCosts??[]).map(raw=>{
  const f=record(raw),t=record(f.token);check(t.chainId===request.source.chainId&&address(t.address)===tokenAddress(request.source));
  check(typeof f.included==='boolean');const amountAtoms=atom(f.amount);
  return {kind:'protocol' as const,name:typeof f.name==='string'?f.name:'Protocol fee',asset:request.source,amountAtoms,maxAmountAtoms:amountAtoms,includedInInput:f.included};
 });
 const approvalFees=array(e.gasCosts??[]).map(x=>record(x)).filter(x=>x.type==='APPROVE').map(f=>{
  const t=record(f.token);check(t.chainId===chain.id&&address(t.address)==='0x0000000000000000000000000000000000000000');
  const amountAtoms=atom(f.amount);return {kind:'approval' as const,name:'Approval gas',asset:chain.nativeAsset,amountAtoms,maxAmountAtoms:(BigInt(amountAtoms)*2n).toString(),includedInInput:false};
 });
 const network:QuoteFee={kind:'network',name:'Source network gas',asset:chain.nativeAsset,amountAtoms:(BigInt(rawGas)*BigInt(rawPrice)).toString(),maxAmountAtoms:(gas*gasPrice).toString(),includedInInput:false};
 check(typeof body.id==='string'&&body.id.length<256);
 return {id:body.id,provider:'lifi',owner:i.owner,recipient:i.recipient,sourceAsset:request.source,targetAsset:i.targetAsset,fromAmountAtoms:input,toAmountAtoms:output,minimumOutputAtoms:minimum,fees:[network,...approvalFees,...feeCosts],approvalAddress:e.approvalAddress?address(e.approvalAddress):null,transaction:{chainId:chain.id,from:i.owner,to:address(tx.to),value:transactionQuantity(tx.value??'0'),data:tx.data as `0x${string}`,gasLimit:gas.toString(),maxFeePerGas:null,maxPriorityFeePerGas:null,gasPrice:gasPrice.toString(),nonce:null},estimatedSeconds:typeof e.executionDuration==='number'?Math.max(0,e.executionDuration):60,priceImpactBps:null,createdAt:new Date(now).toISOString(),expiresAt:new Date(now+60000).toISOString(),providerData:{tool:body.tool??null}};
}
