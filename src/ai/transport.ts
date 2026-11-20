import {createHash} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {keccak256,type Address,type Hex} from 'viem';
import {SpendableError} from '../shared/errors.ts';
import {consensusAddress,consensusId,contractSha256,encodeInterpretation} from './encoding.ts';
import {createSponsorRpc,type SponsorRpc} from './rpc.ts';
import {createSponsorStore,type SponsorStore,type SponsorJob} from './sponsor-store.ts';
import type {GenLayerTransport,InterpreterConfig,ConsensusSubmission} from './types.ts';
interface Signer {readonly address:Address;sign(tx:{chainId:number;to:Address;data:Hex;value:bigint;gas:bigint;gasPrice:bigint;nonce:number;type:'legacy'}):Promise<Hex>}
export interface TransportDependencies {readonly rpc?:SponsorRpc;readonly signer?:Signer;readonly store?:SponsorStore}
const fail=(code:string,message:string)=>new SpendableError(code,message,503);
function bound(raw:string|undefined,fallback:string):bigint{
 const value=raw??fallback;if(!/^[1-9][0-9]{0,77}$/.test(value))throw fail('SPONSOR_CONFIGURATION','Sponsor gas and spend bounds must be positive integers.');
 return BigInt(value);
}
export function createGenLayerTransport(config:InterpreterConfig,deps:TransportDependencies={}):GenLayerTransport{
 const env=config.env??{};const now=config.now??Date.now;
 const contract=config.genlayerContractAddress as Address;
 const key=config.genlayerSponsorPrivateKey as Hex;
 const endpoint=config.genlayerRpcUrl??'';
 if(!/^0x[0-9a-fA-F]{40}$/.test(contract)||(!deps.signer&&!/^0x[0-9a-fA-F]{64}$/.test(key)))throw fail('SPONSOR_CONFIGURATION','Configure a deployed interpreter and a separate sponsor key.');
 if(!deps.rpc){const url=new URL(endpoint);if(!['https:','http:'].includes(url.protocol))throw fail('SPONSOR_CONFIGURATION','GenLayer RPC must use HTTP.');}
 const account=deps.signer?null:privateKeyToAccount(key);
 const signer:Signer=deps.signer??{address:account!.address,sign:tx=>account!.signTransaction(tx)};
 const rpc=deps.rpc??createSponsorRpc(endpoint);
 const store=deps.store?Promise.resolve(deps.store):(
  env.NODE_ENV==='production'&&!config.databaseUrl?Promise.reject(fail('SPONSOR_STORAGE','Production sponsorship requires durable MongoDB Atlas storage.')):
  createSponsorStore(config.databaseUrl)
 );
 store.catch(()=>undefined);
 const maxGas=bound(env.GENLAYER_MAX_GAS_PER_REQUEST,'2000000');
 const maxGasPrice=bound(env.GENLAYER_MAX_GAS_PRICE_WEI,'1000000000');
 const minBalance=bound(env.GENLAYER_MIN_BALANCE_WEI,'10000000000000000');
 const limits={requests:Number(env.GENLAYER_DAILY_REQUEST_LIMIT??'100'),gas:bound(env.GENLAYER_DAILY_GAS_LIMIT,'10000000').toString(),costWei:bound(env.GENLAYER_DAILY_SPEND_WEI,'100000000000000000').toString()};
 async function verify(){
  if(await rpc.chainId()!==4221)throw fail('SPONSOR_CONFIGURATION','Sponsor RPC must be on GenLayer Bradbury.');
  const code=await rpc.code(contract);
  if(createHash('sha256').update(code).digest('hex')!==contractSha256)throw fail('SPONSOR_CONFIGURATION','Deployed interpretation code differs from the reviewed pinned contract.');
  if((await rpc.sponsor(contract)).toLowerCase()!==signer.address.toLowerCase())throw fail('SPONSOR_CONFIGURATION','Interpreter contract belongs to a different sponsor.');
 }
 async function send(saved:SponsorJob){
  if(!saved.hash||!saved.serialized)throw fail('SPONSOR_STORAGE','Sponsor signing commitment is missing.');
  try{await rpc.broadcast(saved.serialized as Hex);}catch{/* The known signed hash remains reserved; status reconciles it without replacing it. */}
  return {hash:saved.hash};
 }
 return {
 async submit(request:ConsensusSubmission){
  const persistence=await store;
  const existing=await persistence.get(request.id);
  if(existing){
   if(existing.digest!==request.digest||existing.sponsor.toLowerCase()!==signer.address.toLowerCase())throw fail('SPONSOR_CONFIGURATION','Sponsor request binding mismatch.');
   if(existing.hash)return send(existing);
   throw fail('SPONSOR_IN_FLIGHT','A sponsor signing commitment is in flight; retain this request and retry its status.');
  }
  await verify();
  const data=encodeInterpretation(signer.address,contract,request,now());
  const [estimated,gasPrice,balance,nonce]=await Promise.all([rpc.estimate(signer.address,consensusAddress,data),rpc.gasPrice(),rpc.balance(signer.address),rpc.nonce(signer.address)]);
  const gas=(estimated*120n+99n)/100n;
  if(gas<=0n||gas>maxGas||gasPrice<=0n||gasPrice>maxGasPrice)throw fail('SPONSOR_LIMIT','Interpretation gas or gas price exceeds the configured limit.');
  if(balance-gas*gasPrice<minBalance)throw fail('SPONSOR_BALANCE','Sponsor balance is below its safe funding threshold.');
  const reserved=await persistence.reserve({id:request.id,sponsor:signer.address.toLowerCase(),digest:request.digest,day:new Date(now()).toISOString().slice(0,10),gas:gas.toString(),costWei:(gas*gasPrice).toString(),nonce},limits);
  if(reserved.hash)return send(reserved);
  const serialized=await signer.sign({chainId:4221,to:consensusAddress,data,value:0n,gas,gasPrice,nonce:reserved.nonce,type:'legacy'});
  const saved=await persistence.saveSigned(request.id,keccak256(serialized),serialized);
  return send(saved);
 },
 async status(hash,request){
  const persistence=await store;const job=await persistence.get(request.id);
  if(!job||job.hash!==hash||job.digest!==request.digest)throw fail('SPONSOR_CONFIGURATION','Sponsor transaction binding mismatch.');
  const receipt=await rpc.receipt(hash as Hex);
  if(!receipt){if(job.serialized)await send(job);return {status:'pending',execution:'pending',result:null};}
  if(receipt.hash.toLowerCase()!==hash.toLowerCase()||receipt.from.toLowerCase()!==signer.address.toLowerCase()||receipt.to?.toLowerCase()!==consensusAddress.toLowerCase())throw fail('SPONSOR_CONFIGURATION','Sponsor receipt identity mismatch.');
  if(receipt.status==='reverted'){await persistence.complete(request.id);return {status:'failed',execution:'error',result:null};}
  const id=consensusId(receipt.logs);
  if(!id)throw fail('SPONSOR_CONFIGURATION','Sponsor transaction lacks attributable GenLayer consensus evidence.');
  await persistence.complete(request.id);
  const tx=await rpc.consensus(id);
  if(tx.sender?.toLowerCase()!==signer.address.toLowerCase()||tx.recipient?.toLowerCase()!==contract.toLowerCase())throw fail('SPONSOR_CONFIGURATION','Consensus transaction identity mismatch.');
  if(tx.status!=='finalized'||tx.execution!=='success')return {...tx,result:null};
  return {status:'finalized',execution:'success',result:await rpc.result(contract,request.id)};
 },
 async close(){await(await store).close();}
 };
}
