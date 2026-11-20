import test from 'node:test';
import assert from 'node:assert/strict';
import { CmcClient } from '../../src/providers/cmc.ts';
const date='2026-11-19T12:00:00.000Z';
const asset={key:'1:native',chainId:1,address:null,kind:'native' as const,symbol:'ETH',name:'Ether',decimals:18,cmcId:1027};
test('CMC joins conversions by ID and preserves provider timestamps',async()=>{
 let calls=0;
 const fetcher=async(input:unknown,init?:RequestInit)=>{
  calls++;const url=String(input);
  assert.ok(url.includes('/v3/cryptocurrency/quotes/latest'));
  assert.equal(new Headers(init?.headers).get('X-CMC_PRO_API_KEY'),'secret-test');
  return Response.json({status:{error_code:0,timestamp:date,credit_count:4},data:{'1027':[{id:1027,quote:{USD:{price:3000,last_updated:date},EUR:{price:2500,last_updated:date},NGN:{price:4500000,last_updated:date}}}]}});
 };
 const client=new CmcClient({cmcApiKey:'secret-test',fetch:fetcher as typeof fetch,now:()=>Date.parse(date),fiatCurrencies:['USD','EUR','NGN']});
 const result=await client.prices([asset]);
 assert.equal(result.prices[0]?.usd,'3000');
 assert.equal(result.prices[0]?.observedAt,date);
 assert.equal(result.rates.find(x=>x.currency==='EUR')?.usdPerUnit,'1.2');
 assert.equal(result.rates.find(x=>x.currency==='NGN')?.usdPerUnit,'0.0006666666666666666666666666666666666666667');
 await client.prices([asset]);assert.equal(calls,1);
});
test('CMC never substitutes missing, stale or zero quotes',async()=>{
 const make=(price:unknown,stamp:string)=>new CmcClient({cmcApiKey:'x',now:()=>Date.parse(date),fiatCurrencies:['USD'],fetch:(async()=>Response.json({status:{error_code:0},data:{'1027':[{id:1027,quote:{USD:{price,last_updated:stamp}}}]}})) as typeof fetch});
 await assert.rejects(make(0,date).prices([asset]));
 await assert.rejects(make(3,'2020-01-01T00:00:00Z').prices([asset]));
 await assert.rejects(new CmcClient({}).prices([asset]),/CMC/);
});
test('provider errors are sanitized and throttling is explicit',async()=>{
 const client=new CmcClient({cmcApiKey:'secret-value',fetch:(async()=>new Response('secret-value',{status:429})) as typeof fetch});
 await assert.rejects(client.prices([asset]),(e:unknown)=>e instanceof Error && !e.message.includes('secret-value') && /rate|limit|thrott/i.test(e.message));
});
