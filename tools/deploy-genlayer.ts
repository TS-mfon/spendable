import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {createClient} from 'genlayer-js';
import {testnetBradbury} from 'genlayer-js/chains';
import {ExecutionResult,TransactionStatus,type TransactionHash} from 'genlayer-js/types';
import {createPublicClient,http,keccak256,type Hex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {loadConfig} from '../src/config.ts';
import {contractSha256,runnerHeader,consensusAddress,consensusId,encodeDeployment} from '../src/ai/encoding.ts';
async function main(){
 const source=readFileSync(resolve('contracts/spendable_interpreter.py'),'utf8');
 if(!source.startsWith(runnerHeader)||createHash('sha256').update(source).digest('hex')!==contractSha256)throw new Error('The contract differs from the reviewed pinned artifact. Re-lint and update the artifact before deployment.');
 const flags=process.argv.slice(2);
 const known=new Set(['--preview','--prepare','--submit','--confirm-spend','--check']);
 for(let i=0;i<flags.length;i++){
  if(!known.has(flags[i]))throw new Error('Unknown deployment argument.');
  if(flags[i]==='--confirm-spend'||flags[i]==='--check')i++;
 }
 const config=loadConfig();
 const endpoint=config.genlayerRpcUrl||testnetBradbury.rpcUrls.default.http[0];
 const submit=flags.includes('--submit');
 const checkHash=flags.includes('--check')?flags[flags.indexOf('--check')+1]:null;
 const network=flags.includes('--prepare')||submit||checkHash!==null;
 const key=config.genlayerSponsorPrivateKey;
 const account=key?privateKeyToAccount(key as Hex):null;
 if(!network){
  console.log(JSON.stringify({mode:'preview',network:'GenLayer Bradbury',chainId:4221,runner:runnerHeader,sourceSha256:contractSha256,sourceBytes:Buffer.byteLength(source),sponsor:account?.address??null,
   next:'Configure a separate funded sponsor, then run --prepare to inspect costs. Submission requires --submit --confirm-spend <sponsor-address>. No transaction was signed or broadcast.'},null,2));
  return;
 }
 const publicClient=createPublicClient({chain:testnetBradbury,transport:http(endpoint,{timeout:10000,retryCount:0})});
 const genClient=createClient({chain:testnetBradbury,endpoint});
 if(await publicClient.getChainId()!==4221)throw new Error('Deployment RPC is not GenLayer Bradbury.');
 if(checkHash!==null){
  if(!/^0x[0-9a-fA-F]{64}$/.test(checkHash))throw new Error('Provide the deployment EVM transaction hash.');
  const receipt=await publicClient.getTransactionReceipt({hash:checkHash as Hex});
  if(receipt.status!=='success'||receipt.to?.toLowerCase()!==consensusAddress.toLowerCase())throw new Error('Deployment source transaction failed or used the wrong consensus contract.');
  const id=consensusId(receipt.logs);if(!id)throw new Error('No attributable GenLayer deployment event.');
  const tx=await genClient.getTransaction({hash:id as TransactionHash});
  if(tx.statusName!==TransactionStatus.FINALIZED||tx.txExecutionResultName!==ExecutionResult.FINISHED_WITH_RETURN){
   console.log(JSON.stringify({evmHash:checkHash,consensusId:id,status:tx.statusName??'pending',execution:tx.txExecutionResultName??'pending',contractAddress:null},null,2));return;
  }
  const address=tx.txDataDecoded&&'contractAddress' in tx.txDataDecoded?tx.txDataDecoded.contractAddress:null;
  if(!address||createHash('sha256').update(await genClient.getContractCode(address)).digest('hex')!==contractSha256)throw new Error('Finalized deployment does not match the reviewed contract.');
  console.log(JSON.stringify({evmHash:checkHash,consensusId:id,status:'FINALIZED',execution:'FINISHED_WITH_RETURN',contractAddress:address,sourceSha256:contractSha256},null,2));return;
 }
 if(!account)throw new Error('Configure GENLAYER_SPONSOR_PRIVATE_KEY for a separate sponsor account.');
 if(submit){
  const confirmation=flags[flags.indexOf('--confirm-spend')+1];
  if(!flags.includes('--confirm-spend')||confirmation?.toLowerCase()!==account.address.toLowerCase())throw new Error('Submission requires --confirm-spend followed by the configured sponsor address.');
 }
 await genClient.getContractSchemaForCode(source);
 const data=encodeDeployment(account.address,source,Date.now());
 const [estimated,gasPrice,balance,nonce]=await Promise.all([
  publicClient.estimateGas({account,to:consensusAddress,data,value:0n}),publicClient.getGasPrice(),publicClient.getBalance({address:account.address}),publicClient.getTransactionCount({address:account.address,blockTag:'pending'})
 ]);
 const gas=(estimated*120n+99n)/100n;
 const maxGas=BigInt(config.env.GENLAYER_MAX_GAS_PER_REQUEST??'2000000');
 const maxGasPrice=BigInt(config.env.GENLAYER_MAX_GAS_PRICE_WEI??'1000000000');
 const minimum=BigInt(config.env.GENLAYER_MIN_BALANCE_WEI??'10000000000000000');
 if(gas<=0n||gas>maxGas||gasPrice<=0n||gasPrice>maxGasPrice||balance-gas*gasPrice<minimum)throw new Error('Deployment exceeds sponsor gas, gas price or low-balance limits.');
 const transaction={chainId:4221,to:consensusAddress,data,value:0n,gas,gasPrice,nonce,type:'legacy' as const};
 const preview={sponsor:account.address,sourceSha256:contractSha256,gas:gas.toString(),gasPriceWei:gasPrice.toString(),maximumNetworkFeeWei:(gas*gasPrice).toString(),nonce,transaction};
 if(!submit){console.log(JSON.stringify({mode:'prepared',...preview},(_k,v)=>typeof v==='bigint'?v.toString():v,2));return;}
 const serialized=await account.signTransaction(transaction);
 const hash=keccak256(serialized);const directory=resolve('.data/genlayer-deployments');
 mkdirSync(directory,{recursive:true,mode:0o700});
 writeFileSync(resolve(directory,hash+'.json'),JSON.stringify({...preview,hash,serialized},(_k,v)=>typeof v==='bigint'?v.toString():v),{mode:0o600,flag:'wx'});
 let acknowledged=false;
 try{await publicClient.sendRawTransaction({serializedTransaction:serialized});acknowledged=true;}catch{/* Retain the signed hash; never create a replacement automatically. */}
 console.log(JSON.stringify({mode:'submitted',evmHash:hash,acknowledged,next:'Run --check '+hash+' until finalized successful consensus supplies the contract address.'},null,2));
}
main().catch(()=>{console.error('GenLayer deployment could not proceed. Check the reviewed artifact, separate sponsor configuration, confirmation flags, network and fee limits.');process.exitCode=1;});
