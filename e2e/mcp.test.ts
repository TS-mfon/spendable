import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,mkdir,readFile,writeFile,stat,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {Client,StreamableHTTPClientTransport} from '@modelcontextprotocol/client';
import {setup} from '../tests/integration/helpers.ts';
import type {Execution,FundingPlan,DeliveryReceipt,WalletContext} from '../src/shared/contracts.ts';
const execute=promisify(execFile);
test('native MCP client authenticates by wallet proof and completes a fixture payment without a browser',async()=>{
 const listener=createServer();listener.listen(0,'127.0.0.1');await once(listener,'listening');
 const address=listener.address();assert.ok(address&&typeof address==='object');
 const origin='http://127.0.0.1:'+address.port,ctx=await setup(origin);
 listener.on('request',ctx.app);
 await mkdir('.data',{recursive:true});
 const directory=await mkdtemp(resolve('.data','mcp-e2e-'));
 const client=new Client({name:'spendable-e2e',version:'0.1.0'});
 const command=resolve('tools/auth-wallet.ts');
 async function auth(args:string[]){return execute(process.execPath,['--import','tsx',command,...args],{cwd:directory,timeout:30000});}
 try{
  const challengeOutput=await auth(['challenge','--origin',origin,'--wallet',ctx.owner]);
  const challenge=JSON.parse(challengeOutput.stdout);
  assert.ok(challenge.message.includes('URI: '+origin));
  const signature=await ctx.account.signMessage({message:challenge.message});
  const signaturePath=join(directory,'login-signature.txt');await writeFile(signaturePath,signature,{mode:0o600});
  const sessionOutput=await auth(['verify','--origin',origin,'--wallet',ctx.owner,'--signature-file',signaturePath]);
  const result=JSON.parse(sessionOutput.stdout);
  const sessionPath=join(directory,result.sessionFile);
  assert.equal((await stat(sessionPath)).mode&0o777,0o600);
  const session=JSON.parse(await readFile(sessionPath,'utf8'));
  assert.ok(!sessionOutput.stdout.includes(session.token));
  await client.connect(new StreamableHTTPClientTransport(new URL(origin+'/mcp'),{requestInit:{headers:{Authorization:'Bearer '+session.token}}}));
  const names=(await client.listTools()).tools.map(tool=>tool.name);
  for(const name of ['get_capabilities','get_plan','get_action','plan_payment','prepare_action','report_submission','get_receipt'])assert.ok(names.includes(name));
  async function call<T>(name:string,args:Record<string,unknown>={}):Promise<T>{
   const response=await client.callTool({name,arguments:args});
   assert.equal(response.isError,undefined,JSON.stringify(response));
   return (response.structuredContent as {data:T}).data;
  }
  assert.equal((await call<WalletContext>('get_wallet_context')).wallet,ctx.owner);
  const plan=await call<FundingPlan>('plan_payment',{intent:ctx.input});
  const candidate=plan.candidates.find(c=>c.eligible);assert.ok(candidate);
  const action=await call<Execution>('prepare_action',{planId:plan.id,candidateId:candidate.id,version:plan.version,idempotencyKey:'native-client-payment'});
  assert.equal(action.steps[0].transaction.from,ctx.owner);assert.equal(action.steps[0].submittedHash,null);
  const reported=await call<Execution>('report_submission',{executionId:action.id,stepId:action.steps[0].id,hash:'0x'+'a'.repeat(64),version:action.version});
  assert.equal(reported.state,'submitted');
  assert.equal((await call<Execution>('get_action_status',{executionId:action.id})).state,'delivered');
  assert.equal((await call<DeliveryReceipt>('get_receipt',{executionId:action.id})).receivedAtoms,'50000000');
  const revoked=await fetch(origin+'/api/auth/logout',{method:'POST',headers:{Authorization:'Bearer '+session.token,'Content-Type':'application/json'},body:'{}'});
  assert.equal(revoked.status,200);
  await assert.rejects(client.listTools());
 }finally{
  await client.close();listener.closeAllConnections();await new Promise<void>(done=>listener.close(()=>done()));
  await ctx.close();await rm(directory,{recursive:true,force:true});
 }
});
