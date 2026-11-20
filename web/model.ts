import type { Address, AmountMode, AssetRef, Execution, SpendableIntent, UnsignedTransaction } from '../src/shared/contracts.ts';
const addressPattern=/^0x[0-9a-fA-F]{40}$/;
const decimalPattern=/^(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;
export interface ComposeFields {
 readonly operation:'pay'|'swap';readonly recipient:string;readonly amount:string;readonly amountMode:AmountMode;
 readonly currency:string;readonly sourceAssetKey:string;readonly maxFeeUsd:string;readonly maxSlippageBps:string;
 readonly maxSourceSpendAtoms?:string|null;readonly maxPriceImpactBps?:string;readonly gasReserveAtoms?:string|null;
}
export const emptyFields:ComposeFields={operation:'pay',recipient:'',amount:'',amountMode:'receive_token',currency:'USD',sourceAssetKey:'',maxFeeUsd:'2',maxSlippageBps:'50'};
export function displayAtoms(atoms:string,decimals:number):string {
 if(!/^[0-9]+$/.test(atoms)||!Number.isInteger(decimals)||decimals<0||decimals>36)throw new Error('Invalid token balance.');
 if(decimals===0)return BigInt(atoms).toString();
 const padded=BigInt(atoms).toString().padStart(decimals+1,'0');
 const fraction=padded.slice(-decimals).replace(/0+$/,'');
 return padded.slice(0,-decimals)+(fraction?'.'+fraction:'');
}
export function usd(value:string):string {
 const n=Number(value);return Number.isFinite(n)?new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',minimumFractionDigits:2,maximumFractionDigits:4}).format(n):'Unavailable';
}
export function shortAddress(value:string):string {return value.slice(0,6)+'…'+value.slice(-4);}
export function describeAsset(asset:AssetRef,assets:readonly AssetRef[],network:string):string {
 const deployments=new Set(assets.filter(a=>a.chainId===asset.chainId&&a.symbol===asset.symbol).map(a=>a.kind+':'+(a.address?.toLowerCase()??'native')));
 const label=asset.symbol+' on '+network;
 return deployments.size>1?label+' ('+(asset.address?shortAddress(asset.address):'native token')+')':label;
}
export function createIntentInput(fields:ComposeFields,target:AssetRef|undefined,owner:string,interpretationId:string|null=null):Omit<SpendableIntent,'id'|'createdAt'|'owner'> {
 if(!target)throw new Error('Choose a token and network.');
 const recipient=fields.operation==='swap'?owner:fields.recipient.trim();
 if(!addressPattern.test(recipient))throw new Error('Enter a complete EVM recipient address.');
 if(!decimalPattern.test(fields.amount)||!/[1-9]/.test(fields.amount))throw new Error('Enter a positive decimal amount. Scientific notation is not supported.');
 if(fields.amount.length>80)throw new Error('Amount is too long.');
 if(fields.amountMode.startsWith('spend')&&!fields.sourceAssetKey)throw new Error('Choose which source asset to spend.');
 if(!/^[A-Z]{3}$/.test(fields.currency))throw new Error('Choose a supported fiat currency.');
 if(fields.maxFeeUsd&&!decimalPattern.test(fields.maxFeeUsd))throw new Error('Enter a positive fee limit in USD.');
 const slippage=Number(fields.maxSlippageBps);
 if(!Number.isInteger(slippage)||slippage<0||slippage>500)throw new Error('Slippage must be between 0 and 500 basis points.');
 const impact=Number(fields.maxPriceImpactBps??'300');
 if(!Number.isInteger(impact)||impact<0||impact>1000)throw new Error('Price impact must be between 0 and 1000 basis points.');
 for(const cap of [fields.maxSourceSpendAtoms,fields.gasReserveAtoms])if(cap!=null&&!/^(0|[1-9][0-9]{0,99})$/.test(cap))throw new Error('Spending caps must be non-negative whole token units.');
 return {operation:fields.operation,recipient:recipient as Address,targetAsset:target,sourceAssetKey:fields.sourceAssetKey||null,amountMode:fields.amountMode,amount:fields.amount,currency:fields.currency,policy:{maxSlippageBps:slippage,maxPriceImpactBps:impact,maxSourceSpendAtoms:fields.maxSourceSpendAtoms??null,maxFeeUsd:fields.maxFeeUsd||null,gasReserveAtoms:fields.gasReserveAtoms??null},interpretationId};
}
export function nextSigningStep(execution:Execution) {
 for(const step of execution.steps){
  if(step.submittedHash&&!step.confirmedBlockNumber)return null;
  if(!step.submittedHash)return step;
 }
 return null;
}
function hex(value:string|number):`0x${string}` {return ('0x'+BigInt(value).toString(16)) as `0x${string}`;}
export function walletTransaction(tx:UnsignedTransaction,wallet:string,chainId:number):Readonly<Record<string,string>> {
 if(wallet.toLowerCase()!==tx.from.toLowerCase())throw new Error('Your connected wallet changed. Reconnect the wallet that prepared this action.');
 if(chainId!==tx.chainId)throw new Error('Switch to the action’s network before signing.');
 if(!addressPattern.test(tx.to)||!/^0x(?:[0-9a-fA-F]{2})*$/.test(tx.data)||BigInt(tx.gasLimit)<=0n)throw new Error('The prepared transaction is invalid.');
 return {from:tx.from,to:tx.to,value:hex(tx.value),data:tx.data,gas:hex(tx.gasLimit),
  ...(tx.maxFeePerGas!==null?{maxFeePerGas:hex(tx.maxFeePerGas)}:{}),
  ...(tx.maxPriorityFeePerGas!==null?{maxPriorityFeePerGas:hex(tx.maxPriorityFeePerGas)}:{}),
  ...(tx.gasPrice!==null?{gasPrice:hex(tx.gasPrice)}:{}),
  ...(tx.nonce!==null?{nonce:hex(tx.nonce)}:{})};
}
export function progressLabel(state:Execution['state']):string {
 const names:Record<Execution['state'],string>={reserved:'Funds reserved',awaiting_signature:'Ready for your signature',submitted:'Transaction submitted',source_confirmed:'Source transaction confirmed',delivery_pending:'Delivery in progress',delivered:'Delivery verified',source_reverted:'Transaction reverted',partial_delivery:'Partial delivery',refunded:'Funds refunded',reconciliation_required:'Delivery needs checking',canceled:'Canceled'};
 return names[state];
}
