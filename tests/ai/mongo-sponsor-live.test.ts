import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {createSponsorStore} from '../../src/ai/sponsor-store.ts';
const uri=process.env.MONGO_TEST_URI;
test('real Mongo replica enforces sponsor reservations, quotas and hash idempotency',{skip:!uri},async()=>{
 const store=await createSponsorStore(uri);
 const sponsor='0x'+randomBytes(20).toString('hex');
 const ids=[randomUUID(),randomUUID(),randomUUID()];
 const job=(id:string)=>({id,sponsor,digest:'0x'+'1'.repeat(64),day:'2026-11-20',gas:'100000000000000000000000000000000000000000000000001',costWei:'100000000000000000000000000000000000000000000000001',nonce:7});
 const limits={requests:2,gas:'200000000000000000000000000000000000000000000000002',costWei:'200000000000000000000000000000000000000000000000002'};
 try{
  const attempts=await Promise.allSettled([store.reserve(job(ids[0]),limits),store.reserve(job(ids[1]),limits)]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
  const first=attempts.find(a=>a.status==='fulfilled');
  if(first?.status!=='fulfilled')throw new Error('No reservation');
  const hash='0x'+'2'.repeat(64);
  await store.saveSigned(first.value.id,hash,'0x1234');
  assert.equal((await store.reserve(job(first.value.id),limits)).hash,hash);
  await assert.rejects(store.saveSigned(first.value.id,'0x'+'3'.repeat(64),'0x5678'),/commitment/);
  await store.complete(first.value.id);
  const other=first.value.id===ids[0]?ids[1]:ids[0];
  await store.reserve(job(other),limits);await store.complete(other);
  await assert.rejects(store.reserve(job(ids[2]),limits),/limit/);
  assert.equal((await store.get(first.value.id))?.costWei,'100000000000000000000000000000000000000000000000001');
 }finally{await store.close();}
});
