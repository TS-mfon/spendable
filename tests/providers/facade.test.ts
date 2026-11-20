import test from 'node:test';import assert from 'node:assert/strict';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,recipient,usdc,weth} from './facade-fixture.ts';
import {intent} from '../domain/fixtures.ts';
test('public facade gives trusted targets, CMC-only prices and bounded direct sends',async()=>{
 const p=createProviders(fixture()),chains=await p.capabilities(),native=chains[0].nativeAsset;
 assert.equal(chains[0].discovery,true);assert.equal(chains[0].assets?.length,3);
 const ctx=await p.wallet(wallet);assert.equal(ctx.holdings.length,2);assert.equal(ctx.prices.find(p=>p.assetKey==='1:'+usdc)?.usd,'1');
 const q=await p.quote({intent:{...intent,targetAsset:native,owner:wallet,recipient},source:native,fromAmountAtoms:'1000000000000000',targetAmountAtoms:'1000000000000000'});
 assert.equal(q.provider,'direct');assert.equal(q.transaction.value,'1000000000000000');assert.equal(q.transaction.nonce,0);
 const steps=await p.prepareSteps(q);assert.equal(steps.length,1);assert.equal(steps[0].kind,'funding');
 await assert.rejects(p.resolveAsset!({...native,cmcId:1}),/verified|registry/i);
});
test('public routed quote has CMC reference-loss impact and bounded approval steps',async()=>{
 const p=createProviders(fixture()),chain=(await p.capabilities())[0],target=chain.assets!.find(a=>a.address===usdc)!,source=chain.assets!.find(a=>a.address===weth)!;
 const q=await p.quote({intent:{...intent,owner:wallet,recipient,targetAsset:target},source,fromAmountAtoms:'25000000000000000',targetAmountAtoms:'50000000'});
 assert.equal(q.provider,'lifi');assert.equal(q.priceImpactBps,0);assert.equal(q.fees.filter(f=>f.kind==='approval').length,1);
 const steps=await p.prepareSteps(q);assert.equal(steps[0].kind,'approval');assert.equal(steps[1].transaction.nonce,1);
 const reset=createProviders(fixture({allowance:'0x1'}));const resetSteps=await reset.prepareSteps(q);assert.equal(resetSteps[0].kind,'approval_reset');assert.equal(resetSteps.length,3);
});
test('transient registry failure recovers instead of disabling tokens for a day',async()=>{
 const base=fixture();let calls=0;
 const p=createProviders({...base,fetch:(async(input,init)=>{
  if(String(input).includes('/v2/cryptocurrency/info')&&calls++===0)return new Response('',{status:503});
  return base.fetch!(input,init);
 }) as typeof fetch});
 assert.equal((await p.capabilities())[0].assets?.length,1);
 assert.equal((await p.capabilities())[0].assets?.length,3);
});
