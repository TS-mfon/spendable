import {Decimal} from 'decimal.js';
const D=Decimal.clone({precision:256});
import type {AssetRef,SpendableIntent,WalletContext} from '../shared/contracts.ts';
import {amountToAtoms,atoms,decimal,fiatToAtoms,livePrice,fresh} from '../domain/index.ts';
import {SpendableError} from '../shared/errors.ts';
export function fiatBudget(intent:SpendableIntent,context:WalletContext):Decimal{
 const rate=context.rates.find(x=>x.currency===intent.currency);
 if(!rate||!fresh(rate.observedAt)||!decimal(rate.usdPerUnit).gt(0))throw new SpendableError('MISSING_CURRENCY','A fresh CMC currency conversion is unavailable.');
 return decimal(intent.amount).mul(decimal(rate.usdPerUnit));
}
export function quoteAmounts(intent:SpendableIntent,source:AssetRef,context:WalletContext):{fromAmountAtoms:string;targetAmountAtoms:string|null}{
 if(intent.amountMode==='spend_token')return {fromAmountAtoms:amountToAtoms(intent.amount,source.decimals),targetAmountAtoms:null};
 if(intent.amountMode==='spend_fiat'){
  const from=fiatBudget(intent,context).div(decimal(livePrice(context,source.key))).mul(new D(10).pow(source.decimals)).floor();
  if(!from.gt(0))throw new SpendableError('INVALID_AMOUNT','The spending budget is below one atomic unit.');
  return {fromAmountAtoms:from.toFixed(0),targetAmountAtoms:null};
 }
 const target=intent.targetAsset;
 const output=intent.amountMode==='receive_token'?amountToAtoms(intent.amount,target.decimals):fiatToAtoms(intent.amount,context.rates.find(r=>r.currency===intent.currency)?.usdPerUnit??'0',livePrice(context,target.key),target.decimals);
 if(source.key===target.key)return {fromAmountAtoms:output,targetAmountAtoms:output};
 const from=new D(atoms(output).toString()).div(new D(10).pow(target.decimals)).mul(decimal(livePrice(context,target.key))).div(decimal(livePrice(context,source.key))).mul(new D(10).pow(source.decimals)).ceil();
 return {fromAmountAtoms:from.toFixed(0),targetAmountAtoms:output};
}
