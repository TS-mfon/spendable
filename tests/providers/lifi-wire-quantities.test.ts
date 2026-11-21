import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeQuote} from '../../src/providers/lifi-quote.ts';
import {context,intent,native,token,owner,recipient} from '../domain/fixtures.ts';
const target={...token,key:'8453:usdc',chainId:8453,address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const};
const request={intent:{...intent,targetAsset:target,amount:'50'},source:native,fromAmountAtoms:'100000000000000000',targetAmountAtoms:'50000000'};
const body={id:'live-quantity-shape',tool:'bridge',action:{fromChainId:1,toChainId:8453,fromAddress:owner,toAddress:recipient,fromToken:{address:'0x0000000000000000000000000000000000000000',decimals:18},toToken:{address:target.address,decimals:6},fromAmount:'31328354371596498'},estimate:{fromAmount:'31328354371596498',toAmount:'50605106',toAmountMin:'50352080',executionDuration:20,feeCosts:[],gasCosts:[]},transactionRequest:{chainId:1,from:owner,to:recipient,value:'0x6f4cf8e9b770d2',data:'0x1234',gasLimit:'0x29e3f',gasPrice:'0x9019d2cf'}};
test('live LI.FI hex transaction quantities normalize without changing token amount units',()=>{
 const quote=normalizeQuote(body,request,context.chains[0],Date.now());
 assert.equal(quote.fromAmountAtoms,'31328354371596498');
 assert.equal(quote.minimumOutputAtoms,'50352080');
 assert.equal(quote.transaction.value,'31328354371596498');
 assert.equal(quote.transaction.gasLimit,'223057');
 assert.equal(quote.transaction.gasPrice,'4835222942');
});
test('transaction quantities reject malformed formats and uint256 overflow',()=>{
 const invalid=['0x','0xgg','0X1','0x00','-1','+1','1.5','1e3','0x'+'f'.repeat(65),'115792089237316195423570985008687907853269984665640564039457584007913129639936',1];
 for(const field of ['gasLimit','gasPrice','value'])for(const value of invalid)assert.throws(()=>normalizeQuote({...body,transactionRequest:{...body.transactionRequest,[field]:value}},request,context.chains[0],Date.now()));
 assert.throws(()=>normalizeQuote({...body,transactionRequest:{...body.transactionRequest,gasPrice:undefined,maxFeePerGas:'0xgg'}},request,context.chains[0],Date.now()));
 for(const field of ['gasLimit','gasPrice'])assert.throws(()=>normalizeQuote({...body,transactionRequest:{...body.transactionRequest,[field]:'0x'+'f'.repeat(64)}},request,context.chains[0],Date.now()));
 assert.throws(()=>normalizeQuote({...body,estimate:{...body.estimate,fromAmount:'0x100'}},request,context.chains[0],Date.now()));
});
test('decimal transaction quantities and zero ERC20 call value retain existing behavior',()=>{
 const erc20Body={...body,action:{...body.action,fromToken:{address:token.address,decimals:6},fromAmount:'60000000'},estimate:{...body.estimate,fromAmount:'60000000'},transactionRequest:{...body.transactionRequest,gasLimit:'171583',gasPrice:undefined,maxFeePerGas:'2417611471',value:'0'}};
 const quote=normalizeQuote(erc20Body,{...request,source:token},context.chains[0],Date.now());
 assert.equal(quote.transaction.value,'0');
 assert.equal(quote.transaction.gasPrice,'4835222942');
 assert.equal(quote.fromAmountAtoms,'60000000');
});
