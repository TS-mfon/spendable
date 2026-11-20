import test from 'node:test';
import assert from 'node:assert/strict';
import {findSecrets} from '../../tools/check-secrets.mjs';
test('secret scan catches credential assignments and permits empty configuration',()=>{
 assert.equal(findSecrets('CMC_PRO_API_KEY="'+('a'.repeat(40))+'"'),1);
 assert.equal(findSecrets("PRIVATE_KEY='"+('b'.repeat(64))+"'"),1);
 assert.equal(findSecrets('CMC_PRO_API_KEY=""'),0);
 assert.equal(findSecrets('const hash="0x'+('c'.repeat(64))+'";'),0);
});
