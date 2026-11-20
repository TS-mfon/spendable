import {useCallback,useEffect,useRef,useState} from 'react';
import type {Address,WalletContext,ChainCapability,ActionUpdate} from '../src/shared/contracts.ts';
import {ApiError,requestApi} from './api.ts';
import {connectWallet,signInMessage,walletProvider} from './wallet.ts';
export function useSession(){
 const [owner,setOwner]=useState<Address|null>(null);
 const [context,setContext]=useState<WalletContext|null>(null);
 const [capabilities,setCapabilities]=useState<readonly ChainCapability[]>([]);
 const [updates,setUpdates]=useState<readonly ActionUpdate[]>([]);
 const [error,setError]=useState('');
 const [busy,setBusy]=useState('');
 const [loading,setLoading]=useState(false);
 const ownerRef=useRef<Address|null>(owner);ownerRef.current=owner;
 useEffect(()=>{
  let active=true;const abort=new AbortController();
  requestApi<{wallet:Address}>('/api/auth/session',{signal:abort.signal}).then(x=>{if(active)setOwner(x.wallet);}).catch(e=>{if(active&&!(e instanceof ApiError&&e.status===401)&&e.name!=='AbortError')setError(e.message);});
  requestApi<readonly ChainCapability[]>('/api/capabilities',{signal:abort.signal}).then(x=>{if(active)setCapabilities(x);}).catch(e=>{if(active&&e.name!=='AbortError')setError(e.message);});
  return()=>{active=false;abort.abort();};
 },[]);
 const refresh=useCallback(async(wallet:Address)=>{
  setLoading(true);
  try{
   const results=await Promise.allSettled([requestApi<WalletContext>('/api/wallet'),requestApi<readonly ActionUpdate[]>('/api/updates')]);
   if(ownerRef.current!==wallet)return;
   if(results[0].status==='fulfilled'){setContext(results[0].value);setCapabilities(results[0].value.chains);}
   else{setContext(null);setError(results[0].reason instanceof Error?results[0].reason.message:'Wallet discovery failed. Try again.');}
   if(results[1].status==='fulfilled')setUpdates(results[1].value);
  }finally{if(ownerRef.current===wallet)setLoading(false);}
 },[]);
 useEffect(()=>{setContext(null);setUpdates([]);if(owner)void refresh(owner);},[owner,refresh]);
 useEffect(()=>{
  const provider=window.ethereum;if(!provider?.on)return;
  const changed=(value:unknown)=>{
   if(!ownerRef.current)return;
   const address=Array.isArray(value)?value[0]:null;
   if(typeof address!=='string'||address.toLowerCase()!==ownerRef.current){
    setOwner(null);setContext(null);setError('Your wallet changed. Sign in again before continuing.');
    void requestApi('/api/auth/logout',{method:'POST',body:{}}).catch(()=>{});
   }
  };
  provider.on('accountsChanged',changed);
  return()=>provider.removeListener?.('accountsChanged',changed);
 },[]);
 async function connect(){
  if(busy)return;setBusy('connect');setError('');
  try{
   const provider=walletProvider();const wallet=await connectWallet(provider);
   const challenge=await requestApi<{message:string}>('/api/auth/challenge',{method:'POST',body:{wallet}});
   const signature=await signInMessage(provider,challenge.message,wallet);
   const session=await requestApi<{wallet:Address}>('/api/auth/verify',{method:'POST',body:{wallet,message:challenge.message,signature}});
   setOwner(session.wallet);
  }catch(e){setError(e instanceof Error?e.message:'Wallet connection failed. Try again.');}
  finally{setBusy('');}
 }
 async function logout(){
  try{await requestApi('/api/auth/logout',{method:'POST',body:{}});setOwner(null);setContext(null);setError('');}
  catch(e){setError(e instanceof Error?e.message:'Sign-out failed. Try again.');}
 }
 return {owner,context,capabilities,updates,error,setError,busy,setBusy,loading,refresh,connect,logout};
}
