import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import type {InterpretationRequest} from '../../src/shared/contracts.ts';
import {intent,owner,recipient} from '../domain/fixtures.ts';
import {providers} from './fixtures.ts';
test('interpretation is persisted, owner-scoped and confirmed before it can inform a plan',async()=>{
 const repository=await createRepository('memory://');
 try{
  const stamp=new Date().toISOString();
  const request:InterpretationRequest={id:'interpretation',owner,status:'queued',redactedText:'Pay recipient_1',addressAliases:{recipient_1:recipient},fields:null,questions:[],transactionHash:null,contractAddress:null,version:1,createdAt:stamp,updatedAt:stamp,error:null};
  let polls=0;
  const interpreter={async request(){return request;},async poll(r:InterpretationRequest){polls++;return {...r,status:'accepted' as const,version:r.version+1,fields:{operation:'pay' as const,targetChainId:1,targetSymbol:'USDC',recipientAlias:'recipient_1',amountMode:'receive_token' as const,amount:'50',currency:'USD',sourceSymbol:null,constraints:{}}};}};
  const s=createService({repository,providers,interpreter});
  await assert.rejects(s.interpretRequest(owner,''));
  await assert.rejects(s.interpretRequest(owner,'x'.repeat(2001)));
  assert.equal((await s.interpretRequest(owner,'Pay 50 USDC')).status,'queued');
  await assert.rejects(s.createPlan(owner,{...intent,interpretationId:request.id}),/interpretation/);
  assert.equal(await s.getInterpretation(recipient,request.id),null);
  assert.equal((await s.getInterpretation(owner,request.id))?.status,'accepted');
  assert.equal((await s.getInterpretation(owner,request.id))?.status,'accepted');assert.equal(polls,1);
  assert.equal((await s.createPlan(owner,{...intent,interpretationId:request.id})).state,'quoted');
  assert.equal(await s.getReceipt(owner,'missing'),null);
  assert.equal(await s.getPlan(recipient,'missing'),null);
  let simultaneous=0;
  const race=createService({repository,providers,interpreter:{
   async request(){return {...request,id:'race'};},
   async poll(r:InterpretationRequest){
    simultaneous++;
    if(simultaneous===1){await new Promise(resolve=>setTimeout(resolve,100));return {...r,status:'submitted',version:r.version+1,transactionHash:'0x'+'a'.repeat(64)};}
    if(simultaneous===2)return {...r,status:'queued',version:r.version+1};
    return {...r,status:r.transactionHash?'submitted':'queued',version:r.version+1};
   }
  }});
  await race.interpretRequest(owner,'Pay');
  await Promise.all([race.getInterpretation(owner,'race'),race.getInterpretation(owner,'race')]);
  const recovered=await race.getInterpretation(owner,'race');
  assert.equal(recovered?.status,'submitted');assert.equal(recovered?.transactionHash,'0x'+'a'.repeat(64));
  const malicious=createService({repository,providers,interpreter:{...interpreter,async request(){return {...request,id:'wrong'};},async poll(r:InterpretationRequest){return {...r,owner:recipient};}}});
  await malicious.interpretRequest(owner,'Pay');
  await assert.rejects(malicious.getInterpretation(owner,'wrong'),/owner/);
 }finally{await repository.close();}
});
