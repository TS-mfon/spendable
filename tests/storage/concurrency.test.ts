import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepository} from '../../src/storage/index.ts';
import {execution,owner} from '../domain/fixtures.ts';
test('concurrent reservations serialize token and gas debits',async()=>{
 const r=await createRepository('memory://');
 try{
  const results=await Promise.allSettled([1,2,3].map(i=>r.reserve(execution('e'+i,i),'k'+i)));
  assert.equal(results.filter(x=>x.status==='fulfilled').length,2);
  assert.equal((await r.reserved(owner)).find(x=>x.assetKey==='1:usdc')?.amountAtoms,'100000000');
 }finally{await r.close();}
});
test('reconciliation claims have one active lease and recover after expiry',async()=>{
 const r=await createRepository('memory://');
 try{
  await r.reserve(execution(),'request');
  const stamp=Date.now()+1000;
  const [a,b]=await Promise.all([r.claimDue(10,stamp,1000),r.claimDue(10,stamp,1000)]);
  assert.equal(a.length+b.length,1);
  const claim=[...a,...b][0];
  assert.equal((await r.claimDue(10,stamp+2000,1000)).length,1);
  await assert.rejects(r.releaseLease(claim.execution.id,claim.leaseToken));
 }finally{await r.close();}
});
test('an idempotency key cannot be repurposed for a different payment',async()=>{
 const r=await createRepository('memory://');try{
  await r.reserve(execution(),'request');
  await assert.rejects(r.reserve({...execution('different'),commitmentHash:'different'},'request'));
 }finally{await r.close();}
});
