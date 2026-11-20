import test from 'node:test';
import assert from 'node:assert/strict';
import {createSqlAuthStore} from '../../src/auth/store.ts';
import {SpendableError} from '../../src/shared/errors.ts';
test('auth storage selects Mongo URI validation before opening a database connection',async()=>{
 await assert.rejects(createSqlAuthStore('mongodb://localhost/invalid.name'),error=>error instanceof SpendableError&&error.code==='DATABASE_CONFIG');
});
