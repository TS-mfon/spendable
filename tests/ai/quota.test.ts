import test from 'node:test';
import assert from 'node:assert/strict';
import {createSponsorStore} from '../../src/ai/sponsor-store.ts';
const sponsor='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const job=(id:string)=>({id,sponsor,digest:'0x'+'1'.repeat(64),day:'2026-11-20',gas:'100',costWei:'1000',nonce:0});
const limits={requests:2,gas:'250',costWei:'2500'};
test('sponsor quotas serialize nonce commitments and preserve idempotency',async()=>{
 const store=await createSponsorStore('memory://');
 try{
  assert.equal((await store.reserve(job('one'),limits)).id,'one');
  assert.equal((await store.reserve(job('one'),limits)).id,'one');
  await assert.rejects(store.reserve(job('two'),limits),/pending|sponsor/i);
  const signed=await store.saveSigned('one','0x'+'2'.repeat(64),'0xdeadbeef');
  assert.equal(signed.hash,'0x'+'2'.repeat(64));
  await assert.rejects(store.saveSigned('one','0x'+'3'.repeat(64),'0xother'),/commitment/i);
  await store.complete('one');
  await store.reserve({...job('two'),nonce:1},limits);
  await store.complete('two');
  await assert.rejects(store.reserve({...job('three'),nonce:2},limits),/limit/i);
  await assert.rejects(store.reserve({...job('one'),digest:'different'},limits),/binding/i);
 }finally{await store.close();}
});
