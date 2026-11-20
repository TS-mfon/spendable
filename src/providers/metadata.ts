import {array,record} from './http.ts';
import {SpendableError} from '../shared/errors.ts';
export const CMC_IDS=Object.freeze({WETH:2396,WBTC:3717,USDC:3408,USDT:825,DAI:4943,ETH:1027,BNB:1839,AVAX:5805,POL:28321});
export interface CmcMetadata {readonly id:number;readonly symbol:string;readonly name:string;readonly deployments:readonly {readonly platform:string;readonly address:string}[]}
export function parseMetadata(input:unknown):readonly CmcMetadata[]{
 const data=record(input);
 return [2396,3717,3408,825,4943].map(id=>{
  const raw=data[String(id)];const entry=record(Array.isArray(raw)?raw[0]:raw);
  if(entry.id!==id||typeof entry.symbol!=='string'||typeof entry.name!=='string')throw new SpendableError('CMC_SCHEMA','CMC metadata ID mismatch.',502);
  const deployments=array(entry.contract_address??[]).map(x=>{
   const c=record(x);const p=record(c.platform);
   if(typeof p.name!=='string'||typeof c.contract_address!=='string')throw new SpendableError('CMC_SCHEMA','Invalid CMC deployment.',502);
   return {platform:p.name,address:c.contract_address.toLowerCase()};
  });
  return {id,symbol:entry.symbol,name:entry.name,deployments};
 });
}
