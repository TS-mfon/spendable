import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';

const account=privateKeyToAccount(('0x'+'11'.repeat(32)) as `0x${string}`);
const config={secret:testSessionSecret(),origin:'http://localhost:3000',store:createMemoryAuthStore()};
test('wallet sign-in issues an audience-bound session and consumes its nonce',async()=>{
 const auth=createAuth(config);
 const challenge=await auth.challenge(account.address);
 const signature=await account.signMessage({message:challenge.message});
 const session=await auth.verify({wallet:account.address,message:challenge.message,signature});
 assert.equal((await auth.authenticate(session.token)).wallet,account.address.toLowerCase());
 await assert.rejects(auth.verify({wallet:account.address,message:challenge.message,signature}),/already used|expired/i);
 const other=createAuth({...config,origin:'http://localhost:4000'});
 await assert.rejects(other.authenticate(session.token),/session/i);
});
test('invalid signature cannot mint a session and forged sessions are rejected',async()=>{
 const auth=createAuth({...config,store:createMemoryAuthStore()});
 const c=await auth.challenge(account.address);
 const other=privateKeyToAccount(('0x'+'22'.repeat(32)) as `0x${string}`);
 await assert.rejects(auth.verify({wallet:account.address,message:c.message,signature:await other.signMessage({message:c.message})}),/signature/i);
 await assert.rejects(auth.authenticate('forged.token'),/session/i);
 await assert.rejects(auth.challenge('not-a-wallet'),/wallet|address/i);
});
test('session logout revokes bearer and cookie reuse and rate limits are isolated',async()=>{
 const auth=createAuth({...config,store:createMemoryAuthStore()});
 const c=await auth.challenge(account.address);
 const s=await auth.verify({wallet:account.address,message:c.message,signature:await account.signMessage({message:c.message})});
 await auth.revoke(s.token);
 await assert.rejects(auth.authenticate(s.token),/session/i);
 assert.equal(await auth.allow('wallet-one',2,60000),true);
 assert.equal(await auth.allow('wallet-one',2,60000),true);
 assert.equal(await auth.allow('wallet-one',2,60000),false);
 assert.equal(await auth.allow('wallet-two',2,60000),true);
});
