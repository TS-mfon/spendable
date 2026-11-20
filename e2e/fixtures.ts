import type {Page} from '@playwright/test';
import type {AssetRef,WalletContext,FundingPlan,Execution} from '../src/shared/contracts.ts';
export const owner='0x2222222222222222222222222222222222222222' as const;
export const recipient='0x3333333333333333333333333333333333333333' as const;
export const token:AssetRef={key:'8453:usdc',chainId:8453,address:'0x1111111111111111111111111111111111111111',kind:'erc20',symbol:'USDC',name:'USD Coin',decimals:6,cmcId:3408};
const native:AssetRef={key:'8453:native',chainId:8453,address:null,kind:'native',symbol:'ETH',name:'Ether',decimals:18,cmcId:1027};
export function fixtures(){
 const date=new Date().toISOString();
 const context:WalletContext={wallet:owner,holdings:[{asset:token,balanceAtoms:'100000000',observedAt:date,blockNumber:'42',discoveredBy:'rpc',warning:null},{asset:native,balanceAtoms:'10000000000000000',observedAt:date,blockNumber:'42',discoveredBy:'rpc',warning:null}],chains:[{id:8453,key:'base',name:'Base',rpcUrls:[],explorerUrl:'https://basescan.org',nativeAsset:native,discovery:true,routing:true,feeEstimation:true,verification:true,reasons:[]}],prices:[{assetKey:token.key,usd:'1',observedAt:date,source:'cmc',endpoint:'/v3/cryptocurrency/quotes/latest'},{assetKey:native.key,usd:'3000',observedAt:date,source:'cmc',endpoint:'/v3/cryptocurrency/quotes/latest'}],rates:[{currency:'USD',usdPerUnit:'1',observedAt:date,source:'cmc'}],observedAt:date,complete:true,warnings:[]};
 const intent={id:'intent-test',owner,recipient,operation:'pay' as const,targetAsset:token,sourceAssetKey:null,amountMode:'receive_token' as const,amount:'50',currency:'USD',policy:{maxSlippageBps:50,maxPriceImpactBps:300,maxSourceSpendAtoms:null,maxFeeUsd:'2',gasReserveAtoms:null},interpretationId:null,createdAt:date};
 const quote={id:'quote-test',provider:'direct' as const,owner,recipient,sourceAsset:token,targetAsset:token,fromAmountAtoms:'50000000',toAmountAtoms:'50000000',minimumOutputAtoms:'50000000',fees:[],approvalAddress:null,transaction:{chainId:8453,from:owner,to:token.address!,value:'0',data:'0x' as const,gasLimit:'65000',maxFeePerGas:'100',maxPriorityFeePerGas:'1',gasPrice:null,nonce:0},estimatedSeconds:12,priceImpactBps:0,createdAt:date,expiresAt:new Date(Date.now()+120000).toISOString(),providerData:{}};
 const candidate={id:'candidate-test',quote,totalSpendUsd:'50.01',feesUsd:'0.01',sourceRemainingAtoms:'50000000',nativeRemainingAtoms:'9900000000000000',eligible:true,reasons:[]};
 const plan:FundingPlan={id:'plan-test',owner,intent,version:1,state:'quoted',candidates:[candidate],prices:context.prices,rates:context.rates,warnings:[],createdAt:date,expiresAt:quote.expiresAt};
 const execution:Execution={id:'action-test',owner,planId:plan.id,planVersion:1,candidate,intent,version:1,state:'awaiting_signature',steps:[{id:'funding',kind:'funding',transaction:quote.transaction,submittedHash:null,confirmedBlockNumber:null}],debits:[],commitmentHash:'test-commitment',sourceHash:null,nextCheckAt:date,retryCount:0,warnings:[],receipt:null,createdAt:date,updatedAt:date};
 return {context,plan,execution};
}
export async function installWallet(page:Page){
 await page.addInitScript(({wallet})=>{
  const listeners:Record<string,(value:unknown)=>void>={};
  let current:string=wallet;
  Object.assign(window,{ethereum:{request:async({method}: {method:string})=>{
   if(method==='eth_requestAccounts'||method==='eth_accounts')return [current];
   if(method==='eth_chainId')return '0x2105';
   if(method==='personal_sign')return '0x'+'a'.repeat(130);
   if(method==='eth_sendTransaction')return '0x'+'b'.repeat(64);
   throw Error('Unexpected wallet method '+method);
  },on:(event:string,fn:(value:unknown)=>void)=>{listeners[event]=fn;},removeListener:(event:string)=>{delete listeners[event];}},changeTestWallet:(wallet:string)=>{current=wallet;listeners.accountsChanged?.([wallet]);}});
 },{wallet:owner});
}
