import {testSessionSecret} from '../helpers/credentials.ts';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {createService} from '../../src/service/index.ts';
import type {Address} from '../../src/shared/contracts.ts';
import type {MarketProviders,Interpreter} from '../../src/shared/ports.ts';
import {context,intent,quote,token,recipient} from '../domain/fixtures.ts';
export async function setup(){
 const account=privateKeyToAccount(('0x'+'1'.repeat(64)) as Address);
 const owner=account.address.toLowerCase() as Address;
 const repository=await createRepository('memory://');
 const auth=createAuth({secret:testSessionSecret(),origin:'http://localhost:3000',store:createMemoryAuthStore()});
 const providers:MarketProviders={
  async capabilities(){return context.chains;},
  async wallet(){const time=new Date().toISOString();return {...context,wallet:owner,observedAt:time,prices:context.prices.map(p=>({...p,observedAt:time})),rates:context.rates.map(r=>({...r,observedAt:time}))};},
  async quote(){return {...quote,owner,transaction:{...quote.transaction,from:owner},createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120000).toISOString()};},
  async refreshBalance(_owner,asset){return {balanceAtoms:context.holdings.find(h=>h.asset.key===asset.key)?.balanceAtoms??'0',blockNumber:'101'};},
  async prepareSteps(q){return [{id:'funding',kind:'funding',transaction:q.transaction,submittedHash:null,confirmedBlockNumber:null}];},
  async validateSubmission(){},
  async reconcile(e){return {state:'delivered',warnings:[],receipt:{executionId:e.id,outcome:'delivered',recipient,asset:token,requestedAtoms:'50000000',receivedAtoms:'50000000',sourceHash:e.sourceHash!,destinationHash:e.sourceHash!,destinationBlockHash:'0x'+'b'.repeat(64),destinationBlockNumber:'102',proofLevel:'onchain',routeAttribution:'direct',networkFeeAtoms:'1000000000000',networkFeeAsset:context.chains[0].nativeAsset,observedAt:new Date().toISOString(),warnings:[]}};}
 };
 const interpreter:Interpreter={async request(){throw new Error('Test interpreter unavailable');},async poll(r){return r;}};
 const service=createService({repository,providers,interpreter});
 const app=createApp({service,auth,origin:'http://localhost:3000',reconcileSecret:'test-scheduler',reconcile:limit=>service.reconcileDue(limit)});
 const challenge=await auth.challenge(owner);
 const signature=await account.signMessage({message:challenge.message});
 const session=await auth.verify({wallet:owner,message:challenge.message,signature});
 return {app,auth,repository,service,owner,input:{...intent,owner},cookie:'spendable_session='+session.token,close:async()=>{await auth.close();await repository.close();}};
}
