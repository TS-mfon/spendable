import type {ProviderConfig} from '../../src/providers/index.ts';
export const wallet='0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const;
export const recipient='0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb' as const;
export const usdc='0x1111111111111111111111111111111111111111';
export const weth='0x2222222222222222222222222222222222222222';
export const router='0x3333333333333333333333333333333333333333';
export const hash='0x'+'ab'.repeat(32);
export function fixture(options:{tx?:Record<string,unknown>;receipt?:Record<string,unknown>;status?:Record<string,unknown>;allowance?:string}={}):ProviderConfig{
 return {cmcApiKey:'fixture',zerionApiKey:'fixture',fiatCurrencies:['USD'],fetch:(async(input,init)=>{
  const url=new URL(String(input)),now=new Date().toISOString();
  if(init?.method==='POST'){
   const request=JSON.parse(String(init.body)),method=request.method;
   let result:unknown='0x0';
   if(method==='eth_chainId')result='0x1';
   if(method==='eth_blockNumber')result='0x65';
   if(method==='eth_getBalance')result='0xde0b6b3a7640000';
   if(method==='eth_gasPrice')result='0x989680';
   if(method==='eth_estimateGas')result='0xfde8';
   if(method==='eth_getTransactionByHash')result=options.tx??null;
   if(method==='eth_getTransactionReceipt')result=options.receipt??null;
   if(method==='eth_call'){
    const tx=request.params[0];result=tx.data.startsWith('0x313ce567')?(tx.to===usdc?'0x6':'0x12'):tx.data.startsWith('0xdd62ed3e')?options.allowance??'0x0':'0x5f5e100';
   }
   return Response.json({jsonrpc:'2.0',id:1,result});
  }
  if(url.pathname==='/v1/chains')return Response.json({chains:[{id:1,key:'eth',name:'Ethereum',chainType:'EVM',nativeToken:{symbol:'ETH',name:'Ether',decimals:18},metamask:{rpcUrls:['https://rpc.fixture'],blockExplorerUrls:[]}}]});
  if(url.pathname==='/v1/chains/')return Response.json({data:[{id:'ethereum'}]});
  if(url.pathname==='/v1/tokens')return Response.json({tokens:{'1':[{chainId:1,address:usdc,decimals:6},{chainId:1,address:weth,decimals:18}]}});
  if(url.pathname==='/v2/cryptocurrency/info')return Response.json({status:{error_code:'0'},data:Object.fromEntries([[2396,'WETH',weth],[3717,'WBTC',null],[3408,'USDC',usdc],[825,'USDT',null],[4943,'DAI',null]].map(([id,symbol,address])=>[id,{id,symbol,name:symbol,contract_address:address?[{platform:{name:'Ethereum'},contract_address:address}]:[]}]))});
  if(url.pathname==='/v3/cryptocurrency/quotes/latest')return Response.json({status:{error_code:'0'},data:url.searchParams.get('id')!.split(',').map(id=>({id:Number(id),quote:[{symbol:'USD',price:Number(id)===3408?1:2000,last_updated:now}]}))});
  if(url.pathname.includes('/positions/'))return Response.json({data:[{attributes:{quantity:{int:'100000000',decimals:6},fungible_info:{symbol:'USDC',name:'USD Coin',implementations:[{chain_id:'ethereum',address:usdc}]}},relationships:{chain:{data:{id:'ethereum'}}}}],links:{next:null}});
  if(url.pathname.startsWith('/v1/quote'))return Response.json({id:'route-fixture',tool:'swap',action:{fromChainId:1,toChainId:1,fromAddress:wallet,toAddress:recipient,fromToken:{address:weth,decimals:18},toToken:{address:usdc,decimals:6},fromAmount:'25000000000000000'},estimate:{fromAmount:'25000000000000000',toAmount:'50500000',toAmountMin:'50000000',approvalAddress:router,executionDuration:20,feeCosts:[],gasCosts:[]},transactionRequest:{chainId:1,from:wallet,to:router,value:'0',data:'0x1234',gasLimit:'100000',gasPrice:'10000000'}});
  if(url.pathname==='/v1/status')return Response.json(options.status??{status:'NOT_FOUND'});
  throw Error('Unexpected fixture endpoint '+url.pathname);
 }) as typeof fetch};
}
