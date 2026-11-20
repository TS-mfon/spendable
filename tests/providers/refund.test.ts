import test from 'node:test';import assert from 'node:assert/strict';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,weth} from './facade-fixture.ts';
import {routed,log} from './route-fixture.ts';
test('provider refunds require exact source token return to the original wallet',async()=>{
 const {e,tx,receipt,status}=await routed();
 const returned={...receipt,logs:[log(weth,wallet,25000000000000000n)]};
 const refundStatus={...status,substatus:'REFUNDED',receiving:{...status.receiving,amount:'25000000000000000',token:{address:weth,decimals:18}}};
 const result=await createProviders(fixture({tx,receipt:returned,status:refundStatus})).reconcile(e);
 assert.equal(result.state,'refunded');assert.equal(result.receipt?.asset.address,weth);assert.equal(result.receipt?.recipient,wallet);assert.equal(result.receipt?.receivedAtoms,'25000000000000000');assert.equal(result.receipt?.proofLevel,'onchain');
 const missing=await createProviders(fixture({tx,receipt,status:refundStatus})).reconcile(e);assert.equal(missing.state,'reconciliation_required');
});
