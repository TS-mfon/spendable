import test from 'node:test';
import assert from 'node:assert/strict';
import type {Db,ClientSession} from 'mongodb';
import {createMongoSponsorStore} from '../../src/ai/mongo-sponsor.ts';
function fakeConnection(){
 let rows:readonly Record<string,unknown>[]=[];let pending:Promise<unknown>=Promise.resolve();
 const matches=(row:Record<string,unknown>,filter:Record<string,unknown>)=>Object.entries(filter).every(([k,v])=>row[k]===v);
 const jobs={
  createIndex:async()=> 'sponsor_day',
  findOne:async(filter:Record<string,unknown>)=>rows.find(row=>matches(row,filter))??null,
  find:(filter:Record<string,unknown>)=>({toArray:async()=>rows.filter(row=>matches(row,filter))}),
  insertOne:async(doc:Record<string,unknown>)=>{if(rows.some(r=>r._id===doc._id))throw new Error('Duplicate ID');rows=[...rows,{...doc}];return {insertedId:doc._id};},
  updateOne:async(filter:Record<string,unknown>,update:{$set?:Record<string,unknown>})=>{rows=rows.map(r=>matches(r,filter)?{...r,...update.$set}:r);return {matchedCount:1};}
 };
 const guard={updateOne:async()=>({matchedCount:1}),findOne:async()=>({version:1})};
 const db={collection:(name:string)=>name.includes('jobs')?jobs:guard} as unknown as Db;
 async function transaction<T>(fn:(session:ClientSession)=>Promise<T>):Promise<T>{
  const result=pending.then(async()=>{const before=rows;try{return await fn({} as ClientSession);}catch(error){rows=before;throw error;}});
  pending=result.catch(()=>undefined);return result;
 }
 return {db,transaction,close:async()=>{await pending;}};
}
const sponsor='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const job=(id:string)=>({id,sponsor,digest:'0x'+'1'.repeat(64),day:'2026-11-20',gas:'100000000000000000000000000000000000000000000000001',costWei:'100000000000000000000000000000000000000000000000001',nonce:7});
const limits={requests:2,gas:'200000000000000000000000000000000000000000000000002',costWei:'200000000000000000000000000000000000000000000000002'};
test('Mongo sponsorship preserves exact bigint quotas, concurrency and signed commitments',async()=>{
 const store=await createMongoSponsorStore('mongodb://test',fakeConnection());
 try{
  const attempts=await Promise.allSettled([store.reserve(job('one'),limits),store.reserve(job('two'),limits)]);
  assert.equal(attempts.filter(a=>a.status==='fulfilled').length,1);
  const first=attempts.find(a=>a.status==='fulfilled');
  assert.equal(first?.status,'fulfilled');if(first?.status!=='fulfilled')throw new Error('No reservation');
  const saved=await store.saveSigned(first.value.id,'0x'+'2'.repeat(64),'0x1234');
  assert.equal(saved.costWei,'100000000000000000000000000000000000000000000000001');
  assert.equal((await store.reserve(job(first.value.id),limits)).hash,saved.hash);
  await assert.rejects(store.saveSigned(first.value.id,'0x'+'3'.repeat(64),'0x5678'),/commitment/i);
  await store.complete(first.value.id);
  const other=first.value.id==='one'?'two':'one';await store.reserve(job(other),limits);await store.complete(other);
  await assert.rejects(store.reserve(job('three'),limits),/limit/i);
  await assert.rejects(store.reserve({...job(first.value.id),digest:'different'},limits),/binding/i);
  assert.equal(await store.get('absent'),null);
 }finally{await store.close();}
});
