import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {AssetRef,ChainCapability} from '../../src/shared/contracts.ts';
import {context,intent,owner,quote,token,native,now} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
const target:AssetRef={...token,key:'8453:usdc',chainId:8453,address:'0x1111111111111111111111111111111111111111'};
const destination:ChainCapability={...context.chains[0],id:8453,key:'base',name:'Base',nativeAsset:{...native,key:'8453:native',chainId:8453},assets:[target],routing:false,feeEstimation:false,verification:true,reasons:['Source fee components are unavailable.']};
test('an L1 funding source can pay a verified L2 token destination without a destination gas balance',async()=>{
 const repository=await createRepository('memory://');
 try{
  const chains=[context.chains[0],destination];
  const p={...providers,
   async capabilities(){return chains;},
   async wallet(){return {...context,chains};},
   async resolveAsset(asset:AssetRef){return asset.key===target.key?target:asset;},
   async prices(){return {prices:[{assetKey:target.key,usd:'1',observedAt:now(),source:'cmc' as const,endpoint:'/v3/cryptocurrency/quotes/latest'}],rates:context.rates};},
   async quote(){return {...quote,provider:'lifi' as const,targetAsset:target};}
  };
  const service=createService({repository,providers:p,interpreter});
  const plan=await service.createPlan(owner,{...intent,targetAsset:target,sourceAssetKey:token.key});
  assert.equal(plan.state,'quoted');
  assert.equal(plan.candidates[0].quote.sourceAsset.chainId,1);
  assert.equal(plan.candidates[0].quote.targetAsset.chainId,8453);
  const action=await service.prepareAction(owner,plan.id,plan.candidates[0].id,1,'l2-destination');
  assert.equal(action.state,'awaiting_signature');
  assert.deepEqual(action.debits.map(d=>d.assetKey),['1:usdc','1:native']);
  const unsupported=createService({repository,providers:{...p,async wallet(){return {...context,chains:[chains[0],{...destination,verification:false}]};}},interpreter});
  await assert.rejects(unsupported.createPlan(owner,{...intent,targetAsset:target,sourceAssetKey:token.key}),error=>error instanceof Error&&'code' in error&&error.code==='UNSUPPORTED_CHAIN');
 }finally{await repository.close();}
});
