import type {Address,UnsignedTransaction} from '../src/shared/contracts.ts';
import {walletTransaction} from './model.ts';
export interface WalletProvider {
 request(input:{method:string;params?:readonly unknown[]}):Promise<unknown>;
 on?(event:string,listener:(value:unknown)=>void):void;
 removeListener?(event:string,listener:(value:unknown)=>void):void;
}
declare global {interface Window {ethereum?:WalletProvider;}}
function account(value:unknown):Address{
 if(!Array.isArray(value)||typeof value[0]!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(value[0]))throw new Error('Choose an EVM wallet account to continue.');
 return value[0].toLowerCase() as Address;
}
export function walletProvider():WalletProvider{
 if(!window.ethereum)throw new Error('Open Spendable in an EVM wallet browser or enable your wallet extension.');
 return window.ethereum;
}
export async function connectWallet(provider:WalletProvider):Promise<Address>{
 return account(await provider.request({method:'eth_requestAccounts'}));
}
export async function verifyConnectedOwner(provider:WalletProvider,owner:string):Promise<Address>{
 const current=account(await provider.request({method:'eth_accounts'}));
 if(current.toLowerCase()!==owner.toLowerCase())throw new Error('Your wallet changed. Sign in with the wallet that prepared this action.');
 return current;
}
export async function signInMessage(provider:WalletProvider,message:string,owner:Address):Promise<string>{
 await verifyConnectedOwner(provider,owner);
 const bytes=new TextEncoder().encode(message);
 const encoded='0x'+Array.from(bytes,b=>b.toString(16).padStart(2,'0')).join('');
 const signature=await provider.request({method:'personal_sign',params:[encoded,owner]});
 if(typeof signature!=='string'||!/^0x[0-9a-fA-F]+$/.test(signature))throw new Error('Your wallet returned an invalid sign-in signature.');
 await verifyConnectedOwner(provider,owner);
 return signature;
}
export interface SigningWindow {readonly expiresAt?:string;readonly now?:()=>number}
function requireFreshWindow(window:SigningWindow){
 if(window.expiresAt===undefined)return;
 const expiry=Date.parse(window.expiresAt);
 if(!Number.isFinite(expiry)||expiry<=(window.now??Date.now)())throw new Error('This quote expired before the wallet could sign. Release the unsubmitted reservation and compare a fresh plan.');
}
export async function signPreparedStep(provider:WalletProvider,tx:UnsignedTransaction,owner:string,window:SigningWindow={}):Promise<string>{
 requireFreshWindow(window);
 await verifyConnectedOwner(provider,owner);
 let chain=await provider.request({method:'eth_chainId'});
 const wanted='0x'+tx.chainId.toString(16);
 if(chain!==wanted){
  await provider.request({method:'wallet_switchEthereumChain',params:[{chainId:wanted}]});
  chain=await provider.request({method:'eth_chainId'});
 }
 if(typeof chain!=='string'||!/^0x[0-9a-fA-F]+$/.test(chain))throw new Error('Your wallet network could not be read.');
 await verifyConnectedOwner(provider,owner);
 const transaction=walletTransaction(tx,owner,Number(BigInt(chain)));
 requireFreshWindow(window);
 const hash=await provider.request({method:'eth_sendTransaction',params:[transaction]});
 if(typeof hash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(hash))throw new Error('Your wallet did not return a valid transaction hash. Check the wallet before retrying.');
 return hash;
}
