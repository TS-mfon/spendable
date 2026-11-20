import type {AuthStore} from './store.ts';
import {SpendableError} from '../shared/errors.ts';
export function createStoreLifecycle(factory:()=>Promise<AuthStore>,initial?:AuthStore){
 let pending:Promise<AuthStore>|null=initial?Promise.resolve(initial):null;
 let closing:Promise<void>|null=null;
 function get():Promise<AuthStore>{
  if(closing)return Promise.reject(new SpendableError('AUTH_CLOSED','Authentication has been closed.',503));
  if(!pending)pending=factory();
  return pending;
 }
 return {
 get,
 async ready(){await get();},
 close():Promise<void>{
  if(!closing)closing=pending?pending.then(store=>store.close()):Promise.resolve();
  return closing;
 }
 };
}
