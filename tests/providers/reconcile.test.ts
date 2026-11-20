import test from 'node:test';import assert from 'node:assert/strict';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,recipient,hash} from './facade-fixture.ts';
import {intent} from '../domain/fixtures.ts';import type {Execution} from '../../src/shared/contracts.ts';
test('public reconciliation verifies native delivery and retains unknown source hashes',async()=>{
 const p=createProviders(fixture()),native=(await p.capabilities())[0].nativeAsset;
 const q=await p.quote({intent:{...intent,targetAsset:native,owner:wallet,recipient},source:native,fromAmountAtoms:'1000',targetAmountAtoms:'1000'}),steps=await p.prepareSteps(q);
 const e={id:'e',owner:wallet,intent:{...intent,targetAsset:native,recipient},sourceHash:hash,candidate:{quote:q},steps:steps.map(s=>({...s,submittedHash:hash}))} as unknown as Execution;
 const tx={from:wallet,to:recipient,value:'0x3e8',input:'0x',gas:'0x14a14',gasPrice:'0x989680',nonce:'0x0'};
 const receipt={transactionHash:hash,blockHash:'0x'+'cd'.repeat(32),blockNumber:'0x64',status:'0x1',gasUsed:'0x5208',effectiveGasPrice:'0x989680',logs:[]};
 const live=createProviders(fixture({tx,receipt}));const result=await live.reconcile(e);
 assert.equal(result.state,'delivered');assert.equal(result.receipt?.receivedAtoms,'1000');assert.equal(result.receipt?.proofLevel,'onchain');
 const unknown=await p.reconcile(e);assert.equal(unknown.state,'reconciliation_required');assert.equal(unknown.receipt,null);
 await assert.rejects(live.validateSubmission(e,steps[0].id,'bad'),/hash/i);
 await live.validateSubmission(e,steps[0].id,hash);
});
test('source revert and pending receipt do not claim delivery',async()=>{
 const p=createProviders(fixture()),native=(await p.capabilities())[0].nativeAsset;
 const q=await p.quote({intent:{...intent,targetAsset:native,owner:wallet,recipient},source:native,fromAmountAtoms:'1000',targetAmountAtoms:'1000'}),steps=await p.prepareSteps(q);
 const e={id:'e',owner:wallet,intent:{...intent,targetAsset:native,recipient},sourceHash:hash,candidate:{quote:q},steps:steps.map(s=>({...s,submittedHash:hash}))} as unknown as Execution;
 const tx={from:wallet,to:recipient,value:'0x3e8',input:'0x',gas:'0x14a14',gasPrice:'0x989680',nonce:'0x0'};
 const receipt={transactionHash:hash,blockHash:'0x'+'cd'.repeat(32),blockNumber:'0x64',status:'0x0',gasUsed:'0x5208',effectiveGasPrice:'0x989680',logs:[]};
 assert.equal((await createProviders(fixture({tx,receipt})).reconcile(e)).state,'source_reverted');
 assert.equal((await createProviders(fixture({tx})).reconcile(e)).state,'submitted');
});
