import test from 'node:test';
import assert from 'node:assert/strict';
import {ZodError} from 'zod';
import {originOf,walletSession} from '../../tools/auth-wallet.ts';
test('headless authentication rejects credential URLs and nonlocal plaintext origins',()=>{
 assert.equal(originOf('https://spendable.example/'),'https://spendable.example');
 assert.equal(originOf('http://127.0.0.1:3000'),'http://127.0.0.1:3000');
 for(const value of ['https://user:password@spendable.example','http://remote.example','https://spendable.example/path','https://spendable.example?token=x','https://spendable.example#token=x'])assert.throws(()=>originOf(value));
});
test('a private key cannot be transmitted as a wallet login signature',async()=>{
 await assert.rejects(walletSession('https://spendable.example','0x'+'a'.repeat(40),'login message','0x'+'1'.repeat(64)),error=>error instanceof ZodError);
});
