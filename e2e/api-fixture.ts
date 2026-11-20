import type {Page} from '@playwright/test';
import {fixtures,owner} from './fixtures.ts';
export async function installApi(page:Page,options:{walletFailure?:boolean;pendingApproval?:boolean;reportFailure?:boolean}={}){
 const {context,plan,execution}=fixtures();
 let action=options.pendingApproval?{...execution,steps:[{...execution.steps[0],id:'approval',kind:'approval' as const,submittedHash:('0x'+'c'.repeat(64)) as `0x${string}`,confirmedBlockNumber:null},{...execution.steps[0]}]}:execution;
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  const good=async(data:unknown)=>route.fulfill({json:{success:true,data,error:null}});
  if(path==='/api/auth/session')return route.fulfill({status:401,json:{success:false,data:null,error:{code:'INVALID_SESSION',message:'Sign in to continue.'}}});
  if(path==='/api/auth/challenge')return good({message:'Test sign-in challenge',expiresAt:new Date(Date.now()+60000).toISOString()});
  if(path==='/api/auth/verify')return good({wallet:owner,token:'test-only',expiresAt:new Date(Date.now()+60000).toISOString()});
  if(path==='/api/auth/logout')return good(null);
  if(path==='/api/capabilities')return good(context.chains);
  if(path==='/api/wallet')return options.walletFailure?route.fulfill({status:503,json:{success:false,data:null,error:{code:'PROVIDER_UNAVAILABLE',message:'Wallet discovery is unavailable. Try again.'}}}):good(context);
  if(path==='/api/updates')return good([]);
  if(path==='/api/plans')return good(plan);
  if(path==='/api/actions')return good(action);
  if(path.endsWith('/submissions')){
   if(options.reportFailure)return route.fulfill({status:503,json:{success:false,data:null,error:{code:'PROVIDER_UNAVAILABLE',message:'Transaction report failed. Retry reporting the saved hash.'}}});
   action={...action,version:2,state:'submitted',sourceHash:('0x'+'b'.repeat(64)) as `0x${string}`,steps:action.steps.map(s=>({...s,submittedHash:('0x'+'b'.repeat(64)) as `0x${string}`}))};
   return good(action);
  }
  if(path.endsWith('/observe')||path==='/api/actions/action-test')return good(action);
  if(path.endsWith('/receipt'))return good(null);
  return route.fulfill({status:404,json:{success:false,data:null,error:{code:'NOT_FOUND',message:'Test route unavailable.'}}});
 });
}
