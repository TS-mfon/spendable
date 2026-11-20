import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {createProviders} from '../../src/providers/index.ts';
import type {UnsignedTransaction} from '../../src/shared/contracts.ts';
import {fixture,wallet,recipient,usdc,weth,hash} from '../providers/facade-fixture.ts';
import {intent} from '../domain/fixtures.ts';
import {interpreter} from './fixtures.ts';
const hex=(value:string|number)=>'0x'+BigInt(value).toString(16);
test('real facade and service continue funding after confirmed approvals remove approval estimates',async()=>{
 const repository=await createRepository('memory://');
 try{
  const base=fixture();let approved=false,approval:UnsignedTransaction|null=null;
  const fetcher=(async(input:Parameters<typeof fetch>[0],init?:RequestInit)=>{
   const url=new URL(String(input));
   if(url.pathname.includes('/positions/')){
    const response=await base.fetch!(input,init);const body=await response.json() as {data:unknown[]};
    return Response.json({...body,data:[...body.data,{attributes:{quantity:{int:'1000000000000000000',decimals:18},fungible_info:{symbol:'WETH',name:'Wrapped Ether',implementations:[{chain_id:'ethereum',address:weth}]}},relationships:{chain:{data:{id:'ethereum'}}}}]});
   }
   if(init?.method==='POST'){
    const request=JSON.parse(String(init.body)) as {method:string;params:{to:string;data:string}[]};
    let result:unknown;
    if(request.method==='eth_call'&&request.params[0].to===weth&&request.params[0].data.startsWith('0x70a08231'))result='0xde0b6b3a7640000';
    if(request.method==='eth_call'&&request.params[0].data.startsWith('0xdd62ed3e'))result=approved?hex('25000000000000000'):'0x0';
    if(request.method==='eth_getTransactionCount')result=approved?'0x1':'0x0';
    if(request.method==='eth_getTransactionByHash'&&approval)result={from:approval.from,to:approval.to,value:hex(approval.value),input:approval.data,nonce:hex(approval.nonce!),gas:hex(approval.gasLimit),gasPrice:hex(approval.gasPrice!)};
    if(request.method==='eth_getTransactionReceipt'&&approved)result={transactionHash:hash,status:'0x1',blockHash:'0x'+'cd'.repeat(32),blockNumber:'0x63',gasUsed:'0x1',effectiveGasPrice:'0x1',logs:[]};
    if(result!==undefined)return Response.json({jsonrpc:'2.0',id:1,result});
   }
   return base.fetch!(input,init);
  }) as typeof fetch;
  const actualProviders=createProviders({...base,fetch:fetcher});let latestQuoteExpiry='';
  const providers={...actualProviders,async quote(request:Parameters<typeof actualProviders.quote>[0]){const q=await actualProviders.quote(request);latestQuoteExpiry=q.expiresAt;return q;}};
  const chain=(await providers.capabilities())[0],target=chain.assets!.find(a=>a.address===usdc)!;
  const service=createService({repository,providers,interpreter});
  const plan=await service.createPlan(wallet,{...intent,owner:wallet,recipient,targetAsset:target,sourceAssetKey:'1:'+weth});
  assert.equal(plan.state,'quoted');
  const candidate=plan.candidates.find(c=>c.eligible)!;
  assert.equal(candidate.quote.fees.filter(f=>f.kind==='approval').length,1);
  const e=await service.prepareAction(wallet,plan.id,candidate.id,1,'live-approval');
  approval=e.steps[0].transaction;
  await service.reportSubmission(wallet,e.id,e.steps[0].id,hash,1);approved=true;
  const next=await service.observeExecution(wallet,e.id);
  assert.equal(next.state,'awaiting_signature',next.warnings.join('; '));assert.ok(next.steps[0].confirmedBlockNumber);
  assert.ok(!next.warnings.some(w=>w.includes('Route terms changed')));
  assert.equal(next.signingExpiresAt,latestQuoteExpiry);
 }finally{await repository.close();}
});
