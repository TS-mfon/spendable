import assert from 'node:assert/strict';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {generatePrivateKey,privateKeyToAccount} from 'viem/accounts';
import {originOf,requestData,walletChallenge,walletSession} from './auth-wallet.ts';
import type {ChainCapability} from '../src/shared/contracts.ts';
async function main(){
 const origin=originOf(process.env.SPENDABLE_ORIGIN??'https://spendable-preview-gen-daves.vercel.app');
 const account=privateKeyToAccount(generatePrivateKey()),wallet=account.address.toLowerCase();
 const client=new Client({name:'spendable-live-verifier',version:'0.1.0'});
 let token:string|undefined;
 try{
  const info=await requestData<{transport:string;mcp:string}>(origin,'/');
  assert.equal(info.transport,'streamable-http');assert.equal(info.mcp,origin+'/mcp');console.log('MCP_ROOT_VERIFIED');
  for(const path of ['/app','/api/wallet','/oauth/authorize']){
   const response=await fetch(origin+path,{redirect:'error',signal:AbortSignal.timeout(15000)});
   assert.equal(response.status,404,path);assert.match(response.headers.get('content-type')??'',/application\/json/);
  }
  console.log('UI_REMOVAL_VERIFIED');
  const challenge=await walletChallenge(origin,wallet);
  const signature=await account.signMessage({message:challenge.message});
  token=(await walletSession(origin,wallet,challenge.message,signature)).token;
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+token,Origin:origin}}}));
  const tools=(await client.listTools()).tools.map(tool=>tool.name);
  for(const name of ['get_capabilities','get_wallet_context','get_plan','get_action','plan_payment','plan_swap','prepare_action','report_submission','get_receipt','recover_action'])assert.ok(tools.includes(name),name);
  console.log('MCP_TOOLS_VERIFIED');
  const result=await client.callTool({name:'get_capabilities',arguments:{}});
  assert.ok(!result.isError);
  const chains=(result.structuredContent as {data:ChainCapability[]}).data;
  assert.ok(chains.length>0);
  console.log(JSON.stringify({origin,toolCount:tools.length,chainCount:chains.length,walletProof:'verified',paymentSigningRequests:0}));
 }finally{
  await client.close();
  if(token)await requestData(origin,'/api/auth/logout',{},token);
 }
 console.log('MCP_LIVE_VERIFIED');
}
main().catch(()=>{console.error('MCP live verification failed; check the last completed stage and server configuration.');process.exitCode=1;});
