import test from 'node:test';
import assert from 'node:assert/strict';
import {requestApi,ApiError} from '../../web/api.ts';
test('API client keeps cookies and surfaces the sanitized server error',async()=>{
 let credentials:unknown;
 const fetcher:typeof fetch=async(_input,init)=>{credentials=init?.credentials;return Response.json({success:false,data:null,error:{code:'INSUFFICIENT_GAS',message:'Add ETH for network fees.'}},{status:422});};
 await assert.rejects(requestApi('/api/plans',{method:'POST',body:{amount:'50'}},fetcher),(e:unknown)=>e instanceof ApiError&&e.code==='INSUFFICIENT_GAS'&&e.message==='Add ETH for network fees.');
 assert.equal(credentials,'same-origin');
});
test('API client does not display raw upstream HTML or invent empty success data',async()=>{
 await assert.rejects(requestApi('/api/wallet',{},async()=>new Response('<secret upstream page>',{status:502})),/could not be read/i);
 await assert.rejects(requestApi('/api/wallet',{},async()=>Response.json({success:true})),/invalid response/i);
 assert.deepEqual(await requestApi('/api/capabilities',{},async()=>Response.json({success:true,data:[],error:null})),[]);
});
