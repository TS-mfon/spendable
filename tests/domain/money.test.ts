import test from 'node:test';
import assert from 'node:assert/strict';
import { amountToAtoms, formatAtoms, fiatToAtoms } from '../../src/domain/index.ts';
test('amounts preserve native atomic precision',()=>{
 assert.equal(amountToAtoms('0.000001',6),'1');
 assert.equal(amountToAtoms('123.456789',6),'123456789');
 assert.equal(formatAtoms('123456789',6),'123.456789');
 assert.throws(()=>amountToAtoms('1.0000001',6));
 assert.throws(()=>amountToAtoms('1e3',6));
 assert.throws(()=>amountToAtoms('-1',6));
});
test('minimum fiat delivery rounds up and rejects invalid prices',()=>{
 assert.equal(fiatToAtoms('50','1','0.999',6),'50050051');
 assert.equal(fiatToAtoms('1000','0.00065','1',6),'650000');
 assert.throws(()=>fiatToAtoms('1','1','0',6));
});
