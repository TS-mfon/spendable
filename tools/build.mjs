import {build} from 'esbuild';
import {mkdir,rm,writeFile} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist/public',{recursive:true});
await writeFile('dist/public/service.json',JSON.stringify({name:'Spendable',transport:'streamable-http',endpoint:'/mcp'},null,2)+'\n');
await build({entryPoints:['api/index.ts'],outfile:'dist/server.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',sourcemap:false});
console.log('SPENDABLE_BUILD_OK');
