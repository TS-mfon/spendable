import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {encodeFunctionData,erc20Abi} from 'viem';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {recoveryMessage} from '../../src/shared/recovery.ts';
import type {Address,Execution} from '../../src/shared/contracts.ts';
import {context,intent,quote,execution} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
const account=privateKeyToAccount('0x'+'01'.padStart(64,'0') as `0x${string}`);
const wallet=account.address.toLowerCase() as Address;
test('owner signature explicitly recovers an unbroadcast commitment while pending transactions stay reserved',async()=>{
 const repository=await createRepository('memory://');
 try{
  const p={...providers,
   async wallet(){return {...context,wallet};},
   async quote(r:Parameters<typeof providers.quote>[0]){return {...quote,owner:r.intent.owner,recipient:r.intent.recipient,transaction:{...quote.transaction,from:r.intent.owner}};},
   async prepareSteps(q:typeof quote){return [{id:'funding',kind:'funding' as const,transaction:{...q.transaction,nonce:0},submittedHash:null,confirmedBlockNumber:null}];}
  };
  const s=createService({repository,providers:p,interpreter});
  const plan=await s.createPlan(wallet,{...intent,owner:wallet}),candidate=plan.candidates.find(c=>c.eligible)!;
  const first=await s.prepareAction(wallet,plan.id,candidate.id,1,'recover');
  const signature=await account.signMessage({message:recoveryMessage(first)});
  await assert.rejects(s.recoverAction(wallet,first.id,1,signature,false),/acknowledge/i);
  await assert.rejects(s.recoverAction(intent.recipient,first.id,1,signature,true));
  await assert.rejects(s.recoverAction(wallet,first.id,99,signature,true),/refresh|version/i);
  const bad=await account.signMessage({message:recoveryMessage({...first,commitmentHash:'wrong'})});
  await assert.rejects(s.recoverAction(wallet,first.id,1,bad,true),/signature/i);
  assert.equal((await repository.reserved(wallet)).length,2);
  const canceled=await s.recoverAction(wallet,first.id,1,signature,true);
  assert.equal(canceled.state,'canceled');assert.equal(canceled.nextCheckAt,null);
  assert.match(canceled.warnings.join(' '),/signed transaction|late broadcast/i);
  assert.equal((await repository.reserved(wallet)).length,0);
  assert.equal((await s.recoverAction(wallet,first.id,1,signature,true)).id,first.id);
  const second=await s.prepareAction(wallet,plan.id,candidate.id,1,'fresh');
  assert.equal(second.steps[0].transaction.nonce,0);
  const submitted=await s.reportSubmission(wallet,second.id,'funding','0x'+'a'.repeat(64),1);
  await assert.rejects(s.recoverAction(wallet,submitted.id,submitted.version,await account.signMessage({message:recoveryMessage(submitted)}),true),/broadcast|funding/i);
  const spender='0xdddddddddddddddddddddddddddddddddddddddd' as const;
  const seed=execution('approval-recovery',1);
  const funding={...seed.steps[0],transaction:{...seed.steps[0].transaction,from:wallet,nonce:2}};
  const approval={...funding,id:'approval',kind:'approval' as const,transaction:{...funding.transaction,nonce:1,data:encodeFunctionData({abi:erc20Abi,functionName:'approve',args:[spender,50000000n]})},submittedHash:('0x'+'b'.repeat(64)) as `0x${string}`,confirmedBlockNumber:null};
  const waiting:Execution={...seed,owner:wallet,intent:{...seed.intent,owner:wallet},candidate:{...seed.candidate,quote:{...seed.candidate.quote,owner:wallet,provider:'lifi',approvalAddress:spender}},state:'submitted',steps:[approval,funding]};
  await repository.reserve(waiting,'approval-recovery');
  await assert.rejects(s.recoverAction(wallet,waiting.id,1,await account.signMessage({message:recoveryMessage(waiting)}),true),/approval/i);
  const confirmed=await repository.updateExecution({...waiting,version:2,steps:[{...approval,confirmedBlockNumber:'102'},funding]},1);
  assert.equal((await s.recoverAction(wallet,confirmed.id,2,await account.signMessage({message:recoveryMessage(confirmed)}),true)).state,'canceled');
 }finally{await repository.close();}
});
