import {createRuntime} from './runtime.ts';
const runtime=await createRuntime();
const server=runtime.app.listen(runtime.config.port,'127.0.0.1',()=>console.log('Spendable MCP running at '+runtime.config.origin+'/mcp'));
for(const signal of ['SIGTERM','SIGINT'] as const)process.once(signal,()=>server.close(async()=>{await runtime.close();process.exit(0);}));
