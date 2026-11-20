import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,recipient,usdc,weth,router,hash} from './facade-fixture.ts';
import {intent} from '../domain/fixtures.ts';import type {Execution} from '../../src/shared/contracts.ts';
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
export const log=(token:string,to:string,value:bigint)=>({address:token,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:router as `0x${string}`,to:to as `0x${string}`}}),data:encodeAbiParameters([{type:'uint256'}],[value])});
export async function routed(){
 const p=createProviders(fixture()),chain=(await p.capabilities())[0],source=chain.assets!.find(a=>a.address===weth)!,target=chain.assets!.find(a=>a.address===usdc)!;
 const q=await p.quote({intent:{...intent,owner:wallet,recipient,targetAsset:target},source,fromAmountAtoms:'25000000000000000',targetAmountAtoms:'50000000'});
 const steps=(await p.prepareSteps(q)).map(s=>({...s,submittedHash:hash as `0x${string}`,confirmedBlockNumber:s.kind==='funding'?null:'99'}));
 const e={id:'e',owner:wallet,intent:{...intent,targetAsset:target,recipient},sourceHash:hash,candidate:{quote:q},steps} as unknown as Execution;
 const tx={from:wallet,to:router,value:'0x0',input:'0x1234',gas:'0x186a0',gasPrice:'0x989680',nonce:'0x1'};
 const receipt={transactionHash:hash,blockHash:'0x'+'cd'.repeat(32),blockNumber:'0x64',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x989680',logs:[log(usdc,recipient,50000000n)]};
 const status={status:'DONE',substatus:'COMPLETED',fromAddress:wallet,toAddress:recipient,sending:{txHash:hash,chainId:1},receiving:{txHash:hash,chainId:1,amount:'50000000',token:{address:usdc,decimals:6}}};
 return {e,tx,receipt,status};
}
