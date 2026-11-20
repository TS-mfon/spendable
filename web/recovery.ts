export interface BroadcastRecord {readonly owner:string;readonly executionId:string;readonly stepId:string;readonly hash:string;readonly version:number;readonly commitmentHash:string;}
const key=(owner:string)=>'spendable:broadcast:v1:'+owner.toLowerCase();
export function readBroadcast(owner:string):BroadcastRecord|null{
 try{
  const raw=sessionStorage.getItem(key(owner));if(!raw)return null;
  const value=JSON.parse(raw);
  if(value.owner!==owner||typeof value.executionId!=='string'||typeof value.stepId!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(value.hash)||!Number.isInteger(value.version)||value.version<1||typeof value.commitmentHash!=='string'||!value.commitmentHash)return null;
  return value;
 }catch{return null;}
}
export function saveBroadcast(value:BroadcastRecord):void{sessionStorage.setItem(key(value.owner),JSON.stringify(value));}
export function clearBroadcast(owner:string):void{sessionStorage.removeItem(key(owner));}
