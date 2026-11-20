import {spawnSync} from 'node:child_process';
for(const script of ['tools/verify-live.ts','tools/verify-atlas.ts']){
 const result=spawnSync(process.execPath,['--import','tsx',script],{stdio:'inherit'});
 if(result.status!==0)process.exit(result.status??1);
}
console.log('LIVE_ACCEPTANCE_VERIFIED');
