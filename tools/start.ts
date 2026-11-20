import express from 'express';
import {resolve} from 'node:path';
import {createRuntime} from './runtime.ts';
const runtime=await createRuntime();
runtime.app.use(express.static(resolve('dist/public')));
runtime.app.get('/{*path}',(_req,res)=>res.sendFile(resolve('dist/public/index.html')));
const server=runtime.app.listen(runtime.config.port,'127.0.0.1',()=>console.log('Spendable running at '+runtime.config.origin));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>server.close(async()=>{await runtime.close();process.exit(0);}));
