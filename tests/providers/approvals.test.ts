import test from 'node:test';import assert from 'node:assert/strict';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,weth,hash} from './facade-fixture.ts';
import {routed} from './route-fixture.ts';
test('approval receipt confirmation unlocks the already-bound next wallet step',async()=>{
 const {e}=await routed();const approval=e.steps[0];
 const execution={...e,sourceHash:null,steps:e.steps.map(s=>({...s,submittedHash:s.kind==='funding'?null:s.submittedHash,confirmedBlockNumber:null}))};
 const tx={from:wallet,to:weth,value:'0x0',input:approval.transaction.data,gas:'0x1d4c0',gasPrice:'0x989680',nonce:'0x0'};
 const receipt={transactionHash:hash,blockHash:'0x'+'cd'.repeat(32),blockNumber:'0x64',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x989680',logs:[]};
 const result=await createProviders(fixture({tx,receipt})).reconcile(execution);
 assert.equal(result.state,'awaiting_signature');assert.equal(result.steps?.[0].confirmedBlockNumber,'100');
 const pending=await createProviders(fixture({tx})).reconcile(execution);assert.equal(pending.state,'submitted');assert.equal(pending.steps?.[0].confirmedBlockNumber,null);
 const reverted=await createProviders(fixture({tx,receipt:{...receipt,status:'0x0'}})).reconcile(execution);assert.equal(reverted.state,'reconciliation_required');
});
test('unknown approval hash cannot unlock funding',async()=>{
 const {e}=await routed();const execution={...e,sourceHash:null,steps:e.steps.map(s=>({...s,submittedHash:s.kind==='funding'?null:s.submittedHash,confirmedBlockNumber:null}))};
 await assert.rejects(createProviders(fixture()).reconcile(execution));
});
