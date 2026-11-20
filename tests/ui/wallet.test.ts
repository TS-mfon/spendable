import test from 'node:test';
import assert from 'node:assert/strict';
import {connectWallet,signPreparedStep,type WalletProvider} from '../../web/wallet.ts';
import type {UnsignedTransaction} from '../../src/shared/contracts.ts';
const owner='0x2222222222222222222222222222222222222222';
const other='0x3333333333333333333333333333333333333333';
const tx:UnsignedTransaction={chainId:8453,from:owner,to:other,value:'0',data:'0x',gasLimit:'21000',maxFeePerGas:'100',maxPriorityFeePerGas:'1',gasPrice:null,nonce:1};
test('wallet connection rejects empty or malformed owner identities',async()=>{
 for(const response of [[],['garbage']])await assert.rejects(connectWallet({request:async()=>response}));
});
test('signing rechecks wallet ownership and never submits for a changed account',async()=>{
 const methods:string[]=[];
 const provider:WalletProvider={request:async({method})=>{methods.push(method);return method==='eth_accounts'?[other]:'0x2105';}};
 await assert.rejects(signPreparedStep(provider,tx,owner),/wallet changed/i);
 assert.equal(methods.includes('eth_sendTransaction'),false);
});
test('signing switches chains and sends only the bounded prepared transaction',async()=>{
 let chain='0x1';let sent:unknown;
 const provider:WalletProvider={request:async({method,params})=>{
  if(method==='eth_accounts')return [owner];
  if(method==='eth_chainId')return chain;
  if(method==='wallet_switchEthereumChain'){chain='0x2105';return null;}
  if(method==='eth_sendTransaction'){sent=params?.[0];return '0x'+'a'.repeat(64);}
  throw Error('Unexpected method');
 }};
 assert.equal(await signPreparedStep(provider,tx,owner),'0x'+'a'.repeat(64));
 assert.deepEqual(sent,{from:owner,to:other,value:'0x0',data:'0x',gas:'0x5208',maxFeePerGas:'0x64',maxPriorityFeePerGas:'0x1',nonce:'0x1'});
});
test('a refused network switch and malformed transaction hash remain explicit errors',async()=>{
 const provider:WalletProvider={request:async({method})=>method==='eth_accounts'?[owner]:method==='eth_chainId'?'0x1':Promise.reject(Error('Switch refused'))};
 await assert.rejects(signPreparedStep(provider,tx,owner),/Switch refused/);
 const malformed:WalletProvider={request:async({method})=>method==='eth_accounts'?[owner]:method==='eth_chainId'?'0x2105':'0xabc'};
 await assert.rejects(signPreparedStep(malformed,tx,owner),/transaction hash/i);
});
