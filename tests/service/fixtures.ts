import type {MarketProviders,Interpreter} from '../../src/shared/ports.ts';
import {context,quote} from '../domain/fixtures.ts';
let fixtureNonce=0;
export const providers:MarketProviders={
 async capabilities(){return context.chains;},async wallet(){return context;},
 async quote(){return {...quote,createdAt:new Date().toISOString(),expiresAt:new Date(Date.now()+120000).toISOString()};},
 async refreshBalance(_owner,asset){return {balanceAtoms:context.holdings.find(h=>h.asset.key===asset.key)?.balanceAtoms??'0',blockNumber:'101'};},
 async prepareSteps(q){return [{id:'funding',kind:'funding',transaction:{...q.transaction,nonce:fixtureNonce++},submittedHash:null,confirmedBlockNumber:null}];},
 async validateSubmission(){},async reconcile(){return {state:'reconciliation_required',receipt:null,warnings:['No evidence yet.']};}
};
export const interpreter:Interpreter={async request(){throw Error('Unavailable');},async poll(r){return r;}};
