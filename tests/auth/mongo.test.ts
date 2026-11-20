import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {loadConfig} from '../../src/config.ts';
import {createSqlAuthStore,type AuthStore} from '../../src/auth/store.ts';
const uri=process.env.MONGO_TEST_URI??process.env.AUTH_MONGO_TEST_URI??loadConfig().databaseUrl;
const available=!!uri&&/^mongodb(?:\+srv)?:\/\//.test(uri);
async function withStores(run:(first:AuthStore,second:AuthStore)=>Promise<void>){
 if(!available)throw new Error('Mongo integration requires a real Mongo URI.');
 const first=await createSqlAuthStore(uri);
 try{
  const second=await createSqlAuthStore(uri);
  try{await run(first,second);}finally{await second.close();}
 }finally{await first.close();}
}
test('Mongo auth persists across clients and atomically consumes wallet and OAuth nonces',{skip:!available},async()=>{
 const prefix='auth-test-'+randomUUID(),now=Date.now(),expires=now+120000;
 await withStores(async(first,second)=>{
  const challenge={id:prefix+'-nonce',wallet:prefix+'-wallet',message:'wallet ownership proof',expires};
  await first.putChallenge(challenge);
  assert.equal((await second.getChallenge(challenge.id))?.wallet,challenge.wallet);
  const consumers=await Promise.all(Array.from({length:8},(_,i)=>(i%2?first:second).consumeChallenge(challenge.id,now)));
  assert.equal(consumers.filter(Boolean).length,1);
  assert.equal(await second.getChallenge(challenge.id),null);
  await first.putSession({id:prefix+'-session',wallet:challenge.wallet,expires});
  assert.equal(await second.activeSession(prefix+'-session',challenge.wallet,now),true);
  assert.equal(await second.activeSession(prefix+'-session','other-owner',now),false);
  assert.equal(await second.activeSession(prefix+'-session',challenge.wallet,expires+1),false);
  await second.revokeSession(prefix+'-session');assert.equal(await first.activeSession(prefix+'-session',challenge.wallet,now),false);
  await first.oauthPut({kind:'client',id:prefix+'-client',data:{redirect_uris:['https://example.com/callback']},expires});
  const client=await second.oauthGet('client',prefix+'-client',now);assert.deepEqual(client?.data.redirect_uris,['https://example.com/callback']);
  await first.oauthPut({kind:'code',id:prefix+'-code',data:{clientId:prefix+'-client',wallet:challenge.wallet},expires});
  const codes=await Promise.all(Array.from({length:8},(_,i)=>(i%2?first:second).oauthTake('code',prefix+'-code',now)));
  assert.equal(codes.filter(Boolean).length,1);assert.equal(await first.oauthGet('code',prefix+'-code',now),null);
  await first.putChallenge({...challenge,id:prefix+'-expired',expires:now-1});
  assert.equal(await second.consumeChallenge(prefix+'-expired',now),false);
  await first.oauthPut({kind:'code',id:prefix+'-expired-code',data:{},expires:now-1});
  assert.equal(await second.oauthGet('code',prefix+'-expired-code',now),null);
  assert.equal(await second.oauthTake('code',prefix+'-expired-code',now),null);
 });
});
test('Mongo distributed rate limits admit exactly the quota and reset one window atomically',{skip:!available},async()=>{
 const key='auth-rate-test-'+randomUUID(),now=Date.now();
 await withStores(async(first,second)=>{
  const allowed=await Promise.all(Array.from({length:12},(_,i)=>(i%2?first:second).allow(key,3,60000,now)));
  assert.equal(allowed.filter(Boolean).length,3);
  assert.equal(await first.allow(key,3,60000,now+61000),true);
  assert.equal(await second.allow(key,3,60000,now+61000),true);
  assert.equal(await first.allow(key,3,60000,now+61000),true);
  assert.equal(await second.allow(key,3,60000,now+61000),false);
  assert.equal(await first.allow(key+'-other',1,60000,now),true);
  await assert.rejects(first.allow(key,0,60000,now),/rate-limit/i);
 });
});
