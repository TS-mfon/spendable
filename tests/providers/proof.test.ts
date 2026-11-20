import test from 'node:test';import assert from 'node:assert/strict';
import {encodeEventTopics,encodeAbiParameters,parseAbi} from 'viem';
import {transferAmount,validateTransaction} from '../../src/providers/proof.ts';
import {token,owner,recipient,quote} from '../domain/fixtures.ts';
const abi=parseAbi(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const log=(from:string,to:string,n:bigint)=>({address:token.address,topics:encodeEventTopics({abi,eventName:'Transfer',args:{from:from as `0x${string}`,to:to as `0x${string}`}}),data:encodeAbiParameters([{type:'uint256'}],[n])});
test('receipt proof uses exact token and recipient net movement',()=>{
 assert.equal(transferAmount([log(owner,recipient,50000000n)],token,recipient),'50000000');
 assert.equal(transferAmount([log(owner,recipient,50000000n),log(recipient,owner,10000000n)],token,recipient),'40000000');
 assert.equal(transferAmount([{...log(owner,recipient,50000000n),address:recipient}],token,recipient),'0');
 assert.throws(()=>transferAmount([{address:token.address,topics:['0xgarbage'],data:'0x'}],token,recipient));
});
test('submission is bound to wallet, nonce, calldata, value and fee caps',()=>{
 const tx={...quote.transaction,data:'0x1234' as const};
 const observed={from:owner,to:token.address,value:'0x0',input:'0x1234',gas:'0x186a0',gasPrice:'0x989680',maxPriorityFeePerGas:'0xf4240',nonce:'0x0'};
 validateTransaction(tx,observed);
 assert.throws(()=>validateTransaction(tx,{...observed,from:recipient}));
 assert.throws(()=>validateTransaction(tx,{...observed,nonce:'0x1'}));
 assert.throws(()=>validateTransaction(tx,{...observed,input:'0xdead'}));
 assert.throws(()=>validateTransaction(tx,{...observed,value:'0x1'}));
 assert.throws(()=>validateTransaction(tx,{...observed,gasPrice:'0xffffffffff'}));
});
