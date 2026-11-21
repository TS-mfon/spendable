import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import {LifiClient} from '../../src/providers/lifi.ts';
import {SpendableError} from '../../src/shared/errors.ts';
import {context,intent,native,token} from '../domain/fixtures.ts';
const receiveIntent={...intent,targetAsset:{...token,key:'8453:usdc',chainId:8453,address:'0x833589fcd6edb6e08f4c7c32d4f71b54bda02913' as const},policy:{...intent.policy,maxSlippageBps:50},amount:'0.0001'};
const request={intent:receiveIntent,source:native,fromAmountAtoms:'1',targetAmountAtoms:'100'};
const amountMessage='toAmount is too small to generate a valid fromAmount estimate';
test('the observed tiny receive rejection is explicit without changing requested minimum',async()=>{
 const client=new LifiClient({fetch:(async input=>{
  const url=new URL(String(input));
  assert.equal(url.pathname,'/v1/quote/toAmount');
  assert.equal(url.searchParams.get('toAmount'),'101');
  assert.equal(url.searchParams.has('fromAmount'),false);
  return Response.json({code:1011,message:amountMessage},{status:400});
 }) as typeof fetch});
 await assert.rejects(()=>client.quote(request,context.chains[0]),error=>
  error instanceof SpendableError&&error.code==='LIFI_AMOUNT_TOO_SMALL'&&error.status===422&&/too small/.test(error.message)&&error.details.providerCode===1011);
});
test('other LI.FI validation errors and malformed bodies stay sanitized and generic',async()=>{
 const secret=testSessionSecret();
 for(const reply of [
  {status:400,body:{code:1011,message:'Unsupported source '+secret}},
  {status:400,body:{code:1011,message:amountMessage+' '+secret}},
  {status:400,body:{code:1002,message:amountMessage}},
  {status:500,body:{code:1011,message:amountMessage}},
  {status:400,body:null}
 ]){
  const client=new LifiClient({fetch:(async()=>reply.body?Response.json(reply.body,{status:reply.status}):new Response(secret,{status:reply.status})) as typeof fetch});
  await assert.rejects(()=>client.quote(request,context.chains[0]),error=>error instanceof SpendableError&&error.code==='PROVIDER_HTTP'&&!error.message.includes(secret));
 }
 const sourceInput=new LifiClient({fetch:(async()=>Response.json({code:1011,message:amountMessage},{status:400})) as typeof fetch});
 await assert.rejects(()=>sourceInput.quote({...request,targetAmountAtoms:null},context.chains[0]),error=>error instanceof SpendableError&&error.code==='PROVIDER_HTTP');
});
