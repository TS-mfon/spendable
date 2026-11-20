import test from 'node:test';
import assert from 'node:assert/strict';
import { displayAtoms, createIntentInput, nextSigningStep, walletTransaction } from '../../web/model.ts';
import type { AssetRef, Execution, UnsignedTransaction } from '../../src/shared/contracts.ts';
const asset:AssetRef={key:'8453:usdc',chainId:8453,address:'0x1111111111111111111111111111111111111111',kind:'erc20',symbol:'USDC',name:'USD Coin',decimals:6,cmcId:3408};
const wallet='0x2222222222222222222222222222222222222222';
test('holdings keep atomic precision without floating point',()=>{
 assert.equal(displayAtoms('123456789',6),'123.456789');
 assert.equal(displayAtoms('1',18),'0.000000000000000001');
 assert.equal(displayAtoms('0',6),'0');
 assert.throws(()=>displayAtoms('-1',6));
});
test('intent preserves receive token versus fiat and source spend units',()=>{
 const fields={operation:'pay' as const,recipient:wallet,amount:'50',amountMode:'receive_token' as const,currency:'USD',sourceAssetKey:'',maxFeeUsd:'2',maxSlippageBps:'50'};
 const token=createIntentInput(fields,asset,wallet);
 assert.equal(token.amountMode,'receive_token');assert.equal(token.amount,'50');assert.equal(token.sourceAssetKey,null);
 assert.equal(createIntentInput({...fields,amountMode:'receive_fiat'},asset,wallet).amountMode,'receive_fiat');
 assert.throws(()=>createIntentInput({...fields,amountMode:'spend_token'},asset,wallet));
 assert.throws(()=>createIntentInput({...fields,amount:'1e3'},asset,wallet));
 assert.throws(()=>createIntentInput({...fields,recipient:'garbage'},asset,wallet));
});
test('a pending approval blocks funding until confirmation',()=>{
 const base={steps:[{id:'approval',kind:'approval',submittedHash:'0xabc',confirmedBlockNumber:null},{id:'funding',kind:'funding',submittedHash:null,confirmedBlockNumber:null}]} as unknown as Execution;
 assert.equal(nextSigningStep(base),null);
 assert.equal(nextSigningStep({...base,steps:[{...base.steps[0],confirmedBlockNumber:'42'},base.steps[1]]})?.id,'funding');
});
test('unsigned transaction is bounded and tied to the connected wallet',()=>{
 const tx:UnsignedTransaction={chainId:8453,from:wallet,to:asset.address!,value:'0',data:'0x1234',gasLimit:'65000',maxFeePerGas:'100',maxPriorityFeePerGas:'1',gasPrice:null,nonce:3};
 assert.deepEqual(walletTransaction(tx,wallet,8453),{from:wallet,to:asset.address,value:'0x0',data:'0x1234',gas:'0xfde8',maxFeePerGas:'0x64',maxPriorityFeePerGas:'0x1',nonce:'0x3'});
 assert.throws(()=>walletTransaction(tx,asset.address!,8453));
 assert.throws(()=>walletTransaction(tx,wallet,1));
});
