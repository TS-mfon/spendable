import {useEffect,useState} from 'react';
import {requestApi} from './api.ts';
interface Consent {clientName:string;clientId:string;redirectUri:string;scope:string;}
interface Props {owner:string|null;setError:(message:string)=>void;}
const tools=['get_wallet_context','interpret_request','plan_payment','plan_swap','prepare_action','report_submission','get_action_status','get_receipt','get_actionable_updates'];
export function Agents({owner,setError}:Props){
 const authorizing=window.location.pathname==='/oauth/authorize';
 const [consent,setConsent]=useState<Consent|null>(null);
 const [pending,setPending]=useState(false);
 const query=window.location.search;
 useEffect(()=>{
  if(!owner||!authorizing)return;
  let active=true;
  requestApi<Consent>('/api/oauth/authorize'+query).then(c=>{if(active)setConsent(c);}).catch(e=>{if(active)setError(e.message);});
  return()=>{active=false;};
 },[owner,authorizing,query,setError]);
 async function authorize(approved:boolean){
  setPending(true);setError('');
  try{
   const params=Object.fromEntries(new URLSearchParams(query));
   const data=await requestApi<{redirectUrl:string}>('/api/oauth/authorize',{method:'POST',body:{...params,approved}});
   window.location.assign(data.redirectUrl);
  }catch(e){setError(e instanceof Error?e.message:'Agent authorization failed.');setPending(false);}
 }
 const endpoint=window.location.origin+'/mcp';
 const config=JSON.stringify({mcpServers:{spendable:{url:endpoint}}},null,2);
 return <section className="agents panel" aria-labelledby="agents-title">
  <div className="section-heading"><h2 id="agents-title">{authorizing?'Connect this agent':'Use Spendable with your agent'}</h2><span className="quiet">Private wallet access</span></div>
  {authorizing?!owner?<p>Connect and sign in with your wallet to review the agent’s request.</p>:consent?<div className="consent"><h3>{consent.clientName} requests access</h3><p>This agent can read your wallet context, prepare plans and track payments with the scopes below. Payment transactions still require signing through your wallet provider.</p><dl><div><dt>Requested scopes</dt><dd>{consent.scope}</dd></div><div><dt>Redirect destination</dt><dd><code className="hash">{consent.redirectUri}</code></dd></div></dl><div className="consent-buttons"><button className="primary" disabled={pending} onClick={()=>authorize(true)}>Allow agent access</button><button className="secondary" disabled={pending} onClick={()=>authorize(false)}>Decline</button></div></div>:<p>Checking this connection request…</p>:<>
   <p>Give your agent live wallet context, comparable funding plans and payment receipts through the same service you use here.</p>
   <label>MCP endpoint<input readOnly value={endpoint} onFocus={e=>e.currentTarget.select()}/></label>
   <p className="field-note">Use a remote MCP client with OAuth support. Sign in with your wallet and approve its requested access.</p>
   <details open><summary>Client configuration</summary><pre>{config}</pre></details>
   <h3>Available tools</h3><div className="tool-list">{tools.map(t=><code key={t}>{t}</code>)}</div>
   <p className="field-note">Agents must provide explicit spending caps before preparing an action. Spendable returns unsigned transactions; the agent’s own wallet provider signs them.</p>
  </>}
 </section>;
}
