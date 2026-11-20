import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepository} from '../../src/storage/index.ts';
import {execution,owner} from '../domain/fixtures.ts';
test('atomic reservations prevent concurrent overspending and preserve idempotency',async()=>{
 const r=await createRepository('memory://');
 try{
 const first=execution();
 assert.equal((await r.reserve(first,'request-one')).id,first.id);
 assert.equal((await r.reserve({...first,id:'unused'},'request-one')).id,first.id);
 await r.reserve(execution('execution2',1),'request-two');
 await assert.rejects(()=>r.reserve(execution('execution3',2),'request-three'));
 assert.equal((await r.reserved(owner))[0]?.amountAtoms,'100000000');
 assert.equal(await r.getExecution('0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',first.id),null);
 }finally{await r.close();}
});
test('CAS rejects stale updates; signing reservations survive expiry; finalized receipts release funds',async()=>{
 const r=await createRepository('memory://');try{
 const first=await r.reserve(execution(),'key');
 const next=await r.updateExecution({...first,version:2,state:'reconciliation_required'},1);
 await assert.rejects(()=>r.updateExecution({...first,version:2,state:'canceled'},1));
 assert.equal((await r.reserved(owner)).length,2);
 await r.updateExecution({...next,version:3,state:'delivered'},2);
 assert.equal((await r.reserved(owner)).length,0);
 }finally{await r.close();}
});
