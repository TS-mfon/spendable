import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {SpendableError} from '../../src/shared/errors.ts';
const config={secret:testSessionSecret(),origin:'http://localhost:3000'};
test('auth construction defers storage and startup readiness reports failures safely',async()=>{
 const auth=createAuth({...config,databaseUrl:'mongodb://localhost/invalid.name'});
 await new Promise<void>(resolve=>setImmediate(resolve));
 await assert.rejects(auth.ready(),error=>error instanceof SpendableError&&error.code==='DATABASE_CONFIG'&&!error.message.includes('mongodb://'));
 await assert.rejects(auth.challenge('0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'),error=>error instanceof SpendableError&&error.code==='DATABASE_CONFIG');
 await assert.rejects(auth.close(),error=>error instanceof SpendableError&&error.code==='DATABASE_CONFIG');
});
test('readiness is reusable and closing the auth lifecycle is idempotent',async()=>{
 let closes=0;
 const auth=createAuth({...config,store:{...createMemoryAuthStore(),close:async()=>{closes++;}}});
 await Promise.all([auth.ready(),auth.ready()]);
 await Promise.all([auth.close(),auth.close()]);
 assert.equal(closes,1);
 await assert.rejects(auth.ready(),error=>error instanceof SpendableError&&error.code==='AUTH_CLOSED');
});

test('unused auth can close without opening its configured database',async()=>{
 const auth=createAuth({...config,databaseUrl:'mongodb://localhost/invalid.name'});
 await auth.close();
 await assert.rejects(auth.ready(),error=>error instanceof SpendableError&&error.code==='AUTH_CLOSED');
});
