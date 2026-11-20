import {useEffect,useMemo,useState} from 'react';
import {emptyFields,shortAddress,type ComposeFields} from './model.ts';
import {applyInterpretationFields} from './interpretation.ts';
import {useSession} from './useSession.ts';
import {useActions} from './useActions.ts';
import {Compose} from './Compose.tsx';
import {Holdings} from './Holdings.tsx';
import {Plans} from './Plans.tsx';
import {Activity} from './Activity.tsx';
import {Agents} from './Agents.tsx';
type View='payments'|'wallet'|'activity'|'agents';
const navigation:[View,string,string][]=[['payments','Payments','↗'],['wallet','Wallet','▤'],['activity','Activity','◷'],['agents','Agent access','⌘']];
export function App(){
 const session=useSession();const actions=useActions(session);
 const [view,setView]=useState<View>(window.location.pathname==='/oauth/authorize'?'agents':'payments');
 const [fields,setFields]=useState<ComposeFields>(emptyFields);
 const [interpretationId,setInterpretationId]=useState<string|null>(null);
 const [targetKey,setTargetKey]=useState('');const [text,setText]=useState('');
 useEffect(()=>{setFields(emptyFields);setTargetKey('');setInterpretationId(null);setText('');},[session.owner]);
 const assets=useMemo(()=>{
  const list=[...(session.context?.holdings.map(h=>h.asset)??[]),...session.capabilities.flatMap(c=>[c.nativeAsset,...(c.assets??[])])];
  return [...new Map(list.map(a=>[a.key,a])).values()].filter(a=>a.cmcId!==null);
 },[session.context,session.capabilities]);
 const effectiveTargetKey=targetKey||assets.find(a=>a.symbol==='USDC')?.key||assets[0]?.key||'';
 const target=assets.find(a=>a.key===effectiveTargetKey);
 function change(next:ComposeFields){
  if(fields.maxSourceSpendAtoms&&next.sourceAssetKey!==fields.sourceAssetKey){session.setError('This request has a source-token cap. Interpret a new request before changing its source.');return;}
  setFields(next);setInterpretationId(null);actions.invalidate();
 }
 function setTarget(key:string){setTargetKey(key);setInterpretationId(null);actions.invalidate();}
 function applyInterpretation(){
  const request=actions.interpretation;if(!request||!session.owner)return;
  try{const next=applyInterpretationFields(request,assets,fields,session.owner);setFields(next.fields);setTargetKey(next.targetKey);setInterpretationId(request.id);actions.invalidate();}
  catch(e){session.setError(e instanceof Error?e.message:'The interpretation could not be applied.');}
 }
 const activity=<Activity execution={actions.execution} updates={session.updates} busy={session.busy} pendingBroadcast={actions.pendingBroadcast} sign={id=>void actions.sign(id)} retryReport={()=>void actions.retryReport()} observe={()=>void actions.observe()} openAction={id=>void actions.openAction(id)} recover={ack=>void actions.recover(ack)}/>;
 return <div className="app-shell">
  <a className="skip-link" href="#main">Skip to main content</a>
  <aside className="sidebar">
   <a className="brand" href="/" aria-label="Spendable home"><span className="brand-mark" aria-hidden="true">s</span><span>Spendable</span></a>
   <nav aria-label="Main navigation">{navigation.map(([key,label,icon])=><button key={key} className={view===key?'nav-item active':'nav-item'} aria-current={view===key?'page':undefined} onClick={()=>setView(key)}><span aria-hidden="true">{icon}</span>{label}</button>)}</nav>
   <div className="sidebar-note"><span className="small-mark" aria-hidden="true">↗</span><strong>One clear payment plan.</strong><p>Know the source, cost and destination before you sign.</p></div>
   <div className="sidebar-footer"><span className="status-dot" aria-hidden="true"></span>Powered by CoinMarketCap</div>
  </aside>
  <main id="main" className="main-content">
   <header className="topbar"><span>{view==='payments'?'Payment workspace':view==='wallet'?'Wallet overview':view==='activity'?'Payment activity':'Agent connections'}</span><div className="wallet-controls">{session.owner?<><code className="connected-address">{shortAddress(session.owner)}</code><button className="secondary" onClick={()=>void session.logout()} disabled={Boolean(session.busy)}>Sign out</button></>:<button className="primary" onClick={()=>void session.connect()} disabled={Boolean(session.busy)}>{session.busy==='connect'?'Waiting for wallet…':'Connect wallet'}</button>}</div></header>
   <div className="page-heading"><div><h1>{view==='payments'?'Make your next move.':view==='wallet'?'Your crypto, in context.':view==='activity'?'Follow the payment.':'Give your agent a clear path.'}</h1><p>{view==='payments'?'Choose a destination. Find the funds. See what arrives.':view==='wallet'?'Directly held assets, live reference prices and network support.':view==='activity'?'Wallet signatures, source confirmation and recipient delivery.':'Private wallet context and payment tools with your permission.'}</p></div><span className="workspace-stamp">Signed by your wallet</span></div>
   {session.error?<div role="alert" className="error-banner"><span>{session.error}</span><button className="text-button" onClick={()=>session.setError('')} aria-label="Dismiss error">Dismiss</button></div>:null}
   {view==='payments'?<>
    {!session.owner?<div className="welcome-strip"><div className="welcome-flow" aria-hidden="true"><span>Wallet</span><i>›</i><span>Funding plan</span><i>›</i><span>Receipt</span></div><p>Sign in to read your holdings. Your wallet authorizes each transaction.</p></div>:null}
    <div className="workspace-grid"><Compose fields={fields} change={change} assets={assets} sourceAssets={session.context?.holdings.map(h=>h.asset)??[]} chains={session.capabilities} targetKey={effectiveTargetKey} setTargetKey={setTarget} enabled={Boolean(session.owner&&session.context)} busy={session.busy} compare={()=>void actions.compare(fields,target,interpretationId)} interpret={value=>void actions.interpret(value)} interpretation={actions.interpretation} applyInterpretation={applyInterpretation} text={text} setText={setText}/><Holdings context={session.context} loading={session.loading} refresh={()=>session.owner&&void session.refresh(session.owner)}/></div>
    <Plans plan={actions.plan} selected={actions.selected} select={actions.setSelected} prepare={()=>void actions.prepare()} busy={session.busy} chains={session.capabilities}/>
    {actions.execution?activity:null}
   </>:view==='wallet'?<Holdings context={session.context} loading={session.loading} refresh={()=>session.owner&&void session.refresh(session.owner)}/>:view==='activity'?activity:<Agents owner={session.owner} setError={session.setError}/>}
   <footer className="page-footer">Reference prices from CMC. Execution quotes and network checks determine whether a payment can proceed.</footer>
  </main>
 </div>;
}
