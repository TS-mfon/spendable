import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveConfig} from '../../src/config.ts';
const env={NODE_ENV:'production',APP_ORIGIN:'https://spendable.example',SESSION_SECRET:'s'.repeat(48),CMC_PRO_API_KEY:'test-cmc',ZERION_API_KEY:'test-zerion'};
test('production requires durable PostgreSQL and server provider configuration',()=>{
 assert.throws(()=>resolveConfig(env),/DATABASE_URL/);
 assert.throws(()=>resolveConfig({...env,DATABASE_URL:'memory://'}),/DATABASE_URL/);
 assert.throws(()=>resolveConfig({...env,DATABASE_URL:'postgresql://user:password@localhost/spendable',CMC_PRO_API_KEY:''}),/CMC/);
 assert.throws(()=>resolveConfig({...env,DATABASE_URL:'postgresql://user:password@localhost/spendable',APP_ORIGIN:'http://spendable.example'}),/HTTPS/);
 const valid=resolveConfig({...env,DATABASE_URL:'postgresql://user:password@localhost/spendable'});
 assert.ok(valid.databaseUrl);
 assert.equal(resolveConfig({...env,DATABASE_URL:'mongodb+srv://user:password@cluster.example/spendable'}).databaseUrl,'mongodb+srv://user:password@cluster.example/spendable');
});
