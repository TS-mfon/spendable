import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createSqlAuthStore,createMemoryAuthStore} from '../../src/auth/store.ts';
test('durable auth state persists and consumes challenges and OAuth codes atomically',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'spendable-auth-')),now=Date.now();
 let store=await createSqlAuthStore(undefined,dir);
 try{
  await store.putChallenge({id:'nonce',wallet:'wallet',message:'sign',expires:now+60000});
  assert.equal((await store.getChallenge('nonce'))?.message,'sign');
  assert.deepEqual(await Promise.all([store.consumeChallenge('nonce',now),store.consumeChallenge('nonce',now)]),[true,false]);
  assert.equal(await store.getChallenge('nonce'),null);
  await store.putSession({id:'session',wallet:'wallet',expires:now+60000});
  assert.equal(await store.activeSession('session','another-wallet',now),false);
  assert.equal(await store.activeSession('session','wallet',now),true);
  await store.oauthPut({kind:'code',id:'code',data:{owner:'wallet'},expires:now+60000});
  await store.oauthPut({kind:'client',id:'client',data:{redirect_uris:['https://example.com']},expires:now+60000});
  assert.equal(await store.oauthGet('code','missing',now),null);
  assert.equal(await store.oauthGet('code','code',now+70000),null);
  assert.equal(await store.allow('wallet',2,1000,now),true);
  assert.equal(await store.allow('wallet',2,1000,now),true);
  assert.equal(await store.allow('wallet',2,1000,now),false);
  assert.equal(await store.allow('wallet',2,1000,now+2000),true);
  await store.close();store=await createSqlAuthStore(undefined,dir);
  assert.equal(((await store.oauthGet('client','client',now))?.data.redirect_uris as string[]|undefined)?.[0],'https://example.com');
  const codes=await Promise.all([store.oauthTake('code','code',now),store.oauthTake('code','code',now)]);
  assert.equal(codes.filter(Boolean).length,1);
  assert.equal(await store.activeSession('session','wallet',now),true);
  await store.revokeSession('session');
  assert.equal(await store.activeSession('session','wallet',now),false);
 }finally{await store.close();await rm(dir,{recursive:true,force:true});}
});
test('memory auth limits roll over and expired codes remain unavailable',async()=>{
 const store=createMemoryAuthStore(),now=Date.now();
 await store.putChallenge({id:'expired',wallet:'wallet',message:'sign',expires:now-1});
 assert.equal(await store.consumeChallenge('expired',now),false);
 await store.oauthPut({kind:'code',id:'expired',data:{},expires:now-1});
 assert.equal(await store.oauthGet('code','expired',now),null);assert.equal(await store.oauthTake('code','expired',now),null);
 await store.oauthPut({kind:'client',id:'client',data:{},expires:now+100});
 assert.ok(await store.oauthTake('client','client',now));assert.equal(await store.oauthGet('client','client',now),null);
 assert.equal(await store.allow('one',1,1000,now),true);assert.equal(await store.allow('one',1,1000,now),false);assert.equal(await store.allow('one',1,1000,now+1001),true);
 await store.close();
});
