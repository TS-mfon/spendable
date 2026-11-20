import test from 'node:test';import assert from 'node:assert/strict';import {parseEnv,resolveConfig} from '../../src/config.ts';
test('env parser handles quoting and only admits app credentials',()=>{
 const parsed=parseEnv('CMC_API_KEY="cmc-value"\nZERION_API_KEY=zerion-value\nPRIVATE_KEY_ETH=never-import\nBAD=x\nSESSION_SECRET=abc\n# COMMENT=y\n');
 assert.deepEqual(parsed,{CMC_API_KEY:'cmc-value',ZERION_API_KEY:'zerion-value',SESSION_SECRET:'abc'});
});
test('configuration resolves canonical CMC alias and validates origin',()=>{
 const c=resolveConfig({CMC_API_KEY:'cmc',ZERION_API_KEY:'zerion',SESSION_SECRET:'x'.repeat(48),APP_ORIGIN:'http://localhost:3000'});
 assert.equal(c.cmcApiKey,'cmc');assert.equal(c.zerionApiKey,'zerion');assert.equal(c.origin,'http://localhost:3000');assert.ok(!('PRIVATE_KEY_ETH' in c));
 assert.throws(()=>resolveConfig({APP_ORIGIN:'ftp://localhost',SESSION_SECRET:'x'.repeat(48)}));
 assert.throws(()=>resolveConfig({APP_ORIGIN:'http://localhost:3000',SESSION_SECRET:'short'}));
});
test('production refuses an ephemeral session secret',()=>{
 assert.throws(()=>resolveConfig({NODE_ENV:'production',APP_ORIGIN:'https://spendable.example'}));
});
