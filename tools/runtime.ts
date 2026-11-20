import {loadConfig} from '../src/config.ts';
import {createProviders} from '../src/providers/index.ts';
import {createRepository} from '../src/storage/index.ts';
import {createService} from '../src/service/index.ts';
import {createInterpreter} from '../src/ai/index.ts';
import {createAuth} from '../src/auth/index.ts';
import {createApp} from '../src/http/index.ts';
export async function createRuntime(root=process.cwd()){
 const config=loadConfig(root);
 const repository=await createRepository(config.databaseUrl);
 let interpreter:ReturnType<typeof createInterpreter>|undefined;
 let auth:ReturnType<typeof createAuth>|undefined;
 try{
  const providers=createProviders(config);
  interpreter=createInterpreter(config);
  const service=createService({repository,providers,interpreter});
  auth=createAuth({secret:config.sessionSecret,origin:config.origin,databaseUrl:config.databaseUrl,dataDir:root+'/.data/auth'});
  await auth.ready?.();
  const app=createApp({service,auth,origin:config.origin,reconcileSecret:config.reconcileSecret,reconcile:(limit)=>service.reconcileDue(limit)});
  const resources={auth,interpreter};
  return {app,config,repository,providers,service,auth,close:async()=>{await resources.interpreter.close();await resources.auth.close();await repository.close();}};
 }catch(error){
  await Promise.allSettled([repository.close(),interpreter?.close(),auth?.close()]);
  throw error;
 }
}
