import {build as buildWeb} from 'vite';
import {build as buildServer} from 'esbuild';
import {resolve} from 'node:path';
await buildWeb({configFile:false,root:resolve('web'),build:{outDir:resolve('dist/public'),emptyOutDir:true,sourcemap:false}});
await buildServer({entryPoints:['api/index.ts'],outfile:'dist/server.mjs',bundle:true,platform:'node',format:'esm',target:'node24',packages:'external',sourcemap:false});
console.log('SPENDABLE_BUILD_OK');
