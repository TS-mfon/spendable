import test from 'node:test';
import assert from 'node:assert/strict';
import {createRepository} from '../../src/storage/index.ts';
import {execution,owner,token} from '../domain/fixtures.ts';
function withNonce(id:string,nonce:number){const e=execution(id);return {...e,steps:e.steps.map(s=>({...s,transaction:{...s.transaction,nonce}}))};}
test('signing commitments reserve nonce slots and reject pre-confirmation balance snapshots',async()=>{
 const r=await createRepository('memory://');try{
  const first=withNonce('nonce-first',0);
  await r.reserve(first,'first');
  await assert.rejects(r.reserve(withNonce('same-nonce',0),'collision'),(e:unknown)=>e instanceof Error&&'code'in e&&e.code==='NONCE_RESERVED');
  assert.equal((await r.reserve({...first,id:'retry'},'first')).id,first.id);
  await r.updateExecution({...first,version:2,state:'delivered',steps:first.steps.map(s=>({...s,confirmedBlockNumber:'101'}))},1);
  await assert.rejects(r.reserve(withNonce('stale-balance',1),'stale'),(e:unknown)=>e instanceof Error&&'code'in e&&e.code==='STALE_BALANCE');
  const fresh=withNonce('fresh',1);
  const observed={...fresh,debits:fresh.debits.map(d=>({...d,observedBlockNumber:'101',observedBalanceAtoms:d.assetKey===token.key?'50000000':'99999000000000000'}))};
  await assert.rejects(r.reserve({...observed,id:'stale-nonce',steps:observed.steps.map(s=>({...s,transaction:{...s.transaction,nonce:0}}))},'oldnonce'),(e:unknown)=>e instanceof Error&&'code'in e&&e.code==='STALE_NONCE');
  assert.equal((await r.reserve(observed,'fresh')).id,'fresh');
 }finally{await r.close();}
});
