import test from 'node:test';
import assert from 'node:assert/strict';
import {validateTransaction} from '../../src/providers/proof.ts';
import {quote,owner,token} from '../domain/fixtures.ts';
import {createProviders} from '../../src/providers/index.ts';
import {routeMatches} from '../../src/providers/receipt.ts';
import {fixture} from './facade-fixture.ts';
import {routed} from './route-fixture.ts';
test('RPC calldata casing preserves authorization and malformed bytes are rejected',()=>{
 const expected={...quote.transaction,data:'0xAaBbCcDd' as const};
 const observed={from:owner,to:token.address,value:'0x0',input:'0xaabbccdd',gas:'0x186a0',gasPrice:'0x989680',maxPriorityFeePerGas:'0xf4240',nonce:'0x0'};
 assert.doesNotThrow(()=>validateTransaction(expected,observed));
 assert.throws(()=>validateTransaction({...expected,data:'0xabc'}, {...observed,input:'0xabc'}));
 assert.throws(()=>validateTransaction({...expected,data:'0xgg'}, {...observed,input:'0xgg'}));
});
test('routed proof accepts equivalent source hash casing and rejects malformed identities',async()=>{
 const {e,tx,receipt,status}=await routed();
 const upper='0x'+status.sending.txHash.slice(2).toUpperCase();
 const result=await createProviders(fixture({tx,receipt,status:{...status,sending:{...status.sending,txHash:upper}}})).reconcile(e);
 assert.equal(result.state,'delivered');
 assert.equal(result.receipt?.proofLevel,'onchain');
 assert.equal(routeMatches({...status,sending:{...status.sending,txHash:'0xabc'}},{...e,sourceHash:'0xabc'}),false);
});
