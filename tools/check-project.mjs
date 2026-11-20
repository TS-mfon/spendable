import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
if(process.argv[2]==='ideas'){
 const t=readFileSync('../idea.md','utf8');
 for(const n of ['HolderLens','DeltaDesk MCP','VenueCut','Liquidity Compass','Spendable','SwapCheck','WalletInbox'])if(!t.includes(n))throw new Error('Missing idea '+n);
 for(const n of ['Data and Visualisation','AI Agents and Automation','Markets and Trading Tools'])if(!t.includes(n))throw new Error('Missing track '+n);
 if(t.includes('API'+'_KEY'+'='))throw new Error('Credential in catalogue');
 console.log('IDEA_CATALOGUE_OK');
}else if(process.argv[2]==='verified'){
 for(const task of ['typecheck','build','test:coverage','test:integration','test:e2e']){
  const p=spawnSync('npm',['run',task],{stdio:'inherit'});if(p.status!==0)process.exit(p.status??1);
 }
 console.log('PROJECT_VERIFIED');
}else throw new Error('Unknown check');
