import {Decimal} from 'decimal.js';
import {SpendableError} from '../shared/errors.ts';
const D=Decimal.clone({precision:256,rounding:Decimal.ROUND_DOWN});
export const decimalPattern=/^(?:0|[1-9]\d*)(?:\.\d+)?$/;
export function decimal(value:string):Decimal {
 if(typeof value!=='string'||value.length>120||!decimalPattern.test(value))throw new SpendableError('INVALID_AMOUNT','Enter a plain positive decimal amount.');
 return new D(value);
}
export function atoms(value:string):bigint {
 if(typeof value!=='string'||value.length>100||!/^(?:0|[1-9]\d*)$/.test(value))throw new SpendableError('INVALID_ATOMS','Atomic amounts must be non-negative integers.');
 return BigInt(value);
}
function scale(decimals:number):Decimal{
 if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw new SpendableError('INVALID_DECIMALS','Unsupported token precision.');
 return new D(10).pow(decimals);
}
export function amountToAtoms(amount:string,decimals:number):string{
 const n=decimal(amount).mul(scale(decimals));
 if(!n.gt(0)||!n.isInteger())throw new SpendableError('INVALID_AMOUNT','Amount is zero or exceeds the token precision.');
 return n.toFixed(0);
}
export function formatAtoms(amount:string,decimals:number):string{return new D(atoms(amount).toString()).div(scale(decimals)).toFixed().replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');}
export function fiatToAtoms(amount:string,usdPerUnit:string,tokenUsd:string,decimals:number):string{
 const a=decimal(amount),rate=decimal(usdPerUnit),price=decimal(tokenUsd);
 if(!a.gt(0)||!rate.gt(0)||!price.gt(0))throw new SpendableError('MISSING_PRICE','A positive live price and currency rate are required.');
 return a.mul(rate).div(price).mul(scale(decimals)).ceil().toFixed(0);
}
export function valueUsd(amount:string,decimals:number,usd:string):Decimal{return new D(atoms(amount).toString()).div(scale(decimals)).mul(decimal(usd));}
export function ceilMultiply(amount:string,factor:Decimal):string{return new D(atoms(amount).toString()).mul(factor).ceil().toFixed(0);}
