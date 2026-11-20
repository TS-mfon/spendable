import test from 'node:test';import assert from 'node:assert/strict';
import {applyInterpretationFields} from '../../web/interpretation.ts';import {createIntentInput,emptyFields} from '../../web/model.ts';import {fixtures,token,owner,recipient} from '../../e2e/fixtures.ts';
import type {InterpretationRequest} from '../../src/shared/contracts.ts';
test('interpreted limits survive accepted fields, form state and intent creation',()=>{
 const request:InterpretationRequest={id:'consensus-test',owner,status:'accepted',redactedText:'pay',addressAliases:{recipient},fields:{operation:'pay',targetChainId:8453,targetSymbol:'USDC',recipientAlias:'recipient',amountMode:'receive_token',amount:'50',currency:'USD',sourceSymbol:'USDC',constraints:{maxSourceSpendAtoms:'55000000',maxPriceImpactBps:'125',gasReserveAtoms:'1000',maxFeeUsd:'1.25',maxSlippageBps:'35'}},questions:[],transactionHash:null,contractAddress:null,version:1,createdAt:fixtures().context.observedAt,updatedAt:fixtures().context.observedAt,error:null};
 const next=applyInterpretationFields(request,[token],emptyFields,owner);
 const intent=createIntentInput(next.fields,token,owner,request.id);
 assert.equal(next.targetKey,token.key);
 assert.deepEqual(intent.policy,{maxSlippageBps:35,maxPriceImpactBps:125,maxSourceSpendAtoms:'55000000',maxFeeUsd:'1.25',gasReserveAtoms:'1000'});
 assert.throws(()=>applyInterpretationFields({...request,fields:{...request.fields!,constraints:{unsupported_limit:'1'}}},[token],emptyFields,owner),/unsupported/i);
});
