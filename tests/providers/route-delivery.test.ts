import test from 'node:test';import assert from 'node:assert/strict';
import {createProviders} from '../../src/providers/index.ts';
import {fixture,wallet,recipient,usdc} from './facade-fixture.ts';
import {routed,log} from './route-fixture.ts';
test('unknown provider completion substatus cannot finalize a payment',async()=>{
 const {e,tx,receipt,status}=await routed();
 const result=await createProviders(fixture({tx,receipt,status:{...status,substatus:'UNKNOWN'}})).reconcile(e);
 assert.equal(result.state,'reconciliation_required');assert.equal(result.receipt,null);
});
test('routed delivery requires source attribution and destination token receipt',async()=>{
 const {e,tx,receipt,status}=await routed();
 const delivered=await createProviders(fixture({tx,receipt,status})).reconcile(e);assert.equal(delivered.state,'delivered');assert.equal(delivered.receipt?.routeAttribution,'lifi');
 const wrong=await createProviders(fixture({tx,receipt,status:{...status,fromAddress:recipient}})).reconcile(e);assert.equal(wrong.state,'reconciliation_required');
 const partial=await createProviders(fixture({tx,receipt:{...receipt,logs:[log(usdc,recipient,40000000n)]},status:{...status,receiving:{...status.receiving,amount:'40000000'}}})).reconcile(e);assert.equal(partial.state,'partial_delivery');
 const pending=await createProviders(fixture({tx,receipt,status:{...status,status:'PENDING'}})).reconcile(e);assert.equal(pending.state,'delivery_pending');
 const refund=await createProviders(fixture({tx,receipt,status:{...status,substatus:'REFUNDED'}})).reconcile(e);assert.equal(refund.state,'reconciliation_required');
});
