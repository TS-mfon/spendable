import test from 'node:test';import assert from 'node:assert/strict';
import {CmcClient} from '../../src/providers/cmc.ts';
const date='2026-11-20T12:00:00.000Z';
const asset={key:'1:native',chainId:1,address:null,kind:'native' as const,symbol:'ETH',name:'Ether',decimals:18,cmcId:1027};
test('CMC rejects a native identity when returned symbol differs',async()=>{
 const client=new CmcClient({cmcApiKey:'test',now:()=>Date.parse(date),fiatCurrencies:['USD'],fetch:(async()=>Response.json({status:{error_code:'0'},data:[{id:1027,symbol:'BTC',quote:[{symbol:'USD',price:3000,last_updated:date}]}]})) as typeof fetch});
 await assert.rejects(client.prices([asset]),/identity|symbol/i);
});
test('current CMC v3 array schema and string status code retain asset/fiat IDs',async()=>{
 const client=new CmcClient({cmcApiKey:'test',now:()=>Date.parse(date),fiatCurrencies:['USD','EUR'],fetch:(async()=>Response.json({status:{error_code:'0',credit_count:2},data:[{id:1027,quote:[{id:2781,symbol:'USD',price:3000,last_updated:date},{id:2790,symbol:'EUR',price:2500,last_updated:date}]}]})) as typeof fetch});
 const result=await client.prices([asset]);assert.equal(result.prices[0].usd,'3000');assert.equal(result.rates[1].usdPerUnit,'1.2');assert.equal(client.creditsUsed,2);
});
