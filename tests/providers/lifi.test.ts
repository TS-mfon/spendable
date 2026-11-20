import test from 'node:test';import assert from 'node:assert/strict';
import {normalizeQuote} from '../../src/providers/lifi-quote.ts';
import {context,intent,token,native,owner,recipient} from '../domain/fixtures.ts';
const now=Date.now();const request={intent,source:token,fromAmountAtoms:'50000000',targetAmountAtoms:'49000000'};
const body={id:'route1',tool:'bridge',action:{fromChainId:1,toChainId:1,fromAddress:owner,toAddress:recipient,fromToken:{address:token.address,decimals:6},toToken:{address:token.address,decimals:6},fromAmount:'50000000'},estimate:{fromAmount:'50000000',toAmount:'49900000',toAmountMin:'49500000',executionDuration:20,approvalAddress:token.address,gasCosts:[{type:'SEND',amount:'1000',token:{address:'0x0000000000000000000000000000000000000000',chainId:1}}],feeCosts:[{name:'protocol',amount:'100',included:true,token:{address:token.address,chainId:1}}]},transactionRequest:{chainId:1,from:owner,to:token.address,value:'0',data:'0x1234',gasLimit:'100000',gasPrice:'10'}};
test('LI.FI binds quote identities, minimum output and root fee accounting',()=>{
 const quote=normalizeQuote(body,request,context.chains[0],now);
 assert.equal(quote.minimumOutputAtoms,'49500000');assert.equal(quote.fees.filter(x=>x.kind==='protocol').length,1);
 assert.equal(quote.fees.find(x=>x.kind==='protocol')?.includedInInput,true);
 assert.equal(quote.fees.find(x=>x.kind==='network')?.asset.key,native.key);
 assert.throws(()=>normalizeQuote({...body,action:{...body.action,toAddress:owner}},request,context.chains[0],now));
 assert.throws(()=>normalizeQuote({...body,estimate:{...body.estimate,toAmountMin:'1'}},request,context.chains[0],now));
});
test('LI.FI rejects mixed fee assets and mismatched transaction chain',()=>{
 assert.throws(()=>normalizeQuote({...body,transactionRequest:{...body.transactionRequest,chainId:56}},request,context.chains[0],now));
 assert.throws(()=>normalizeQuote({...body,estimate:{...body.estimate,feeCosts:[{amount:'1',token:{address:recipient,chainId:1}}]}},request,context.chains[0],now));
});
