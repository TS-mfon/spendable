import {mkdir,writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config.ts';
import {createProviders} from '../src/providers/index.ts';
const config=loadConfig();
const checks:Record<string,unknown>[]=[];
async function get(name:string,url:string,headers:Record<string,string>,select:(data:any)=>unknown){
 try{
  const response=await fetch(url,{headers,signal:AbortSignal.timeout(25000)});
  if(!response.ok)throw new Error('HTTP '+response.status);
  const body=await response.json();
  if(body.status&&body.status.error_code!==0&&body.status.error_code!=='0')throw new Error('Provider returned error code '+body.status.error_code);
  checks.push({name,url,status:response.status,observedAt:new Date().toISOString(),response:select(body)});
  console.log(name+' LIVE_OK');
 }catch(error){checks.push({name,status:'failed',reason:error instanceof Error&&/^HTTP |^Provider returned/.test(error.message)?error.message:'Connection or response verification failed'});console.log(name+' LIVE_FAILED');}
}
if(!config.cmcApiKey||!config.zerionApiKey)throw new Error('Configure CMC and Zerion app keys locally before live verification.');
await get('CMC','https://pro-api.coinmarketcap.com/v3/cryptocurrency/quotes/latest?id=1,1027,3408&convert=USD,EUR,NGN',{'X-CMC_PRO_API_KEY':config.cmcApiKey},body=>{
 const data=Object.entries(body.data??{}).map(([_key,value])=>{
  const asset=Array.isArray(value)?value[0]:value as any;
  const id=String(asset.id); const quotes=Array.isArray(asset.quote)?Object.fromEntries(asset.quote.map((q:any)=>[q.symbol,q])):asset.quote;
  if(!quotes?.USD||Number(quotes.USD.price)<=0)throw new Error('Invalid quote');
  return {id,symbol:asset.symbol,quote:quotes};
 });
 if(data.length!==3)throw new Error('Incomplete quotes');
 return {status:{timestamp:body.status.timestamp,credit_count:body.status.credit_count,error_code:body.status.error_code},data};
});
await get('ZERION','https://api.zerion.io/v1/chains/',{'Authorization':'Basic '+Buffer.from(config.zerionApiKey+':').toString('base64'),'accept':'application/json'},body=>{
 if(!Array.isArray(body.data)||body.data.length===0)throw new Error('No chains');
 return {chainCount:body.data.length,sample:body.data.slice(0,5).map((c:any)=>({id:c.id,name:c.attributes?.name}))};
});
await get('LIFI','https://li.quest/v1/chains',{},body=>{
 if(!Array.isArray(body.chains)||body.chains.length===0)throw new Error('No chains');
 return {chainCount:body.chains.length,sample:body.chains.slice(0,5).map((c:any)=>({id:c.id,name:c.name}))};
});
try{
 const providers=createProviders(config);
 const capabilities=await providers.capabilities();
 checks.push({name:'ADAPTER_CAPABILITIES',observedAt:new Date().toISOString(),status:200,chainCount:capabilities.length,assetCount:capabilities.reduce((n,c)=>n+(c.assets?.length??0),0)});
 const pol=capabilities.find(c=>c.id===137)?.nativeAsset;
 if(!pol||pol.cmcId!==28321)throw new Error('POL identity unavailable');
 const valuation=await providers.prices!([pol]);
 checks.push({name:'POL_IDENTITY',status:200,cmcId:28321,prices:valuation.prices});
 console.log('LIVE_ADAPTERS_VERIFIED');
}catch{checks.push({name:'ADAPTER_CAPABILITIES',status:'failed',reason:'Live provider adapter verification failed'});console.log('LIVE_ADAPTERS_FAILED');}
await mkdir('docs/evidence',{recursive:true});
await writeFile('docs/evidence/live-providers.json',JSON.stringify({observedAt:new Date().toISOString(),checks},null,2)+'\n');
if(checks.some(c=>c.status==='failed'))process.exitCode=1;
else console.log('LIVE_PROVIDERS_VERIFIED');
