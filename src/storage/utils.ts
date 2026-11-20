import type {AssetDebit,Execution} from '../shared/contracts.ts';
import {SpendableError} from '../shared/errors.ts';
import {atoms} from '../domain/money.ts';
import type {Sql} from './db.ts';
export const terminalStates=['delivered','source_reverted','partial_delivery','refunded','canceled'];
export const fail=(code:string,message:string)=>new SpendableError(code,message,409);
export function copy<T>(value:T):T{return structuredClone(value);}
export function aggregate(records:readonly Execution[]):readonly AssetDebit[]{
 return [...records.reduce<ReadonlyMap<string,AssetDebit>>((out,e)=>e.debits.reduce<ReadonlyMap<string,AssetDebit>>((m,d)=>{
  const prev=m.get(d.assetKey);return new Map([...m,[d.assetKey,{...d,amountAtoms:(atoms(prev?.amountAtoms??'0')+atoms(d.amountAtoms)).toString(),observedBalanceAtoms:prev&&atoms(prev.observedBalanceAtoms)<atoms(d.observedBalanceAtoms)?prev.observedBalanceAtoms:d.observedBalanceAtoms}]]);
 },out),new Map()).values()];
}
export async function active(db:Sql,owner:string):Promise<readonly Execution[]>{
 const r=await db.query('SELECT payload FROM spendable_executions WHERE owner=$1 AND NOT(state=ANY($2::text[])) ORDER BY id',[owner,terminalStates]);
 return r.rows.map(r=>r.payload as Execution);
}
export function dueTime(e:Execution):number|null{return e.nextCheckAt?Date.parse(e.nextCheckAt):null;}
