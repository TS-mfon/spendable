import {mkdir,readFile,writeFile,rename} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {getAddress} from 'viem';
import {z} from 'zod';
const signatureSchema=z.string().regex(/^0x(?:[0-9a-fA-F]{128}|[0-9a-fA-F]{130})$/);
const challengeSchema=z.object({message:z.string().max(4096),expiresAt:z.string().datetime()}).strict();
const sessionSchema=z.object({token:z.string().max(2048).regex(/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/),wallet:z.string().regex(/^0x[0-9a-fA-F]{40}$/),expiresAt:z.string().datetime()}).strict();
export function originOf(value:string){
 const url=new URL(value);
 if(url.username||url.password||url.search||url.hash||url.pathname!=='/'||!['http:','https:'].includes(url.protocol))throw Error('Use an application origin without a path or credentials.');
 if(url.protocol==='http:'&&!['localhost','127.0.0.1','[::1]'].includes(url.hostname))throw Error('Use HTTPS except for a loopback development server.');
 return url.origin;
}
export async function requestData<T>(origin:string,path:string,body?:unknown,token?:string):Promise<T>{
 const url=new URL(path,origin);if(url.origin!==origin)throw Error('Authentication requests must stay on the selected server.');
 const response=await fetch(url,{method:body===undefined?'GET':'POST',headers:{Origin:origin,...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),signal:AbortSignal.timeout(15000),redirect:'error'});
 let payload:{success?:unknown;data?:T};
 try{payload=await response.json();}catch{throw Error('Spendable returned an unreadable authentication response (HTTP '+response.status+').');}
 if(!response.ok||payload.success!==true||!Object.hasOwn(payload,'data'))throw Error('Spendable request failed (HTTP '+response.status+'). Check the server origin and wallet proof.');
 return payload.data as T;
}
function boundChallenge(value:unknown,origin:string,wallet:string){
 const result=challengeSchema.parse(value);
 if(Date.parse(result.expiresAt)<=Date.now()||!result.message.includes('URI: '+origin)||!result.message.toLowerCase().includes(wallet)||!result.message.includes('Sign in to Spendable. This signature does not authorize a transaction.'))throw Error('Request a fresh wallet-bound login challenge from this server.');
 return result;
}
export async function walletChallenge(origin:string,wallet:string){return boundChallenge(await requestData(origin,'/api/auth/challenge',{wallet}),origin,wallet);}
export async function walletSession(origin:string,wallet:string,message:string,signature:string){
 const result=sessionSchema.parse(await requestData(origin,'/api/auth/verify',{wallet,message,signature:signatureSchema.parse(signature)}));
 if(result.wallet.toLowerCase()!==wallet||Date.parse(result.expiresAt)<=Date.now())throw Error('The server returned a mismatched or expired wallet session.');
 return result;
}
async function savePrivate(path:string,value:unknown){
 await mkdir(resolve('.data/client-auth'),{recursive:true,mode:0o700});
 const temporary=path+'.'+randomUUID()+'.tmp';
 await writeFile(temporary,JSON.stringify(value,null,2)+'\n',{mode:0o600,flag:'wx'});
 await rename(temporary,path);
}
async function main(args:string[]){
 const [mode,...flags]=args;
 if(mode!=='challenge'&&mode!=='verify')throw Error('Use challenge or verify with --origin and --wallet. Verify also requires --signature-file.');
 const known=new Set(['--origin','--wallet','--signature-file']);
 if(flags.length%2||flags.some((value,index)=>index%2===0&&!known.has(value)))throw Error('Unknown or incomplete authentication argument.');
 const options=Object.fromEntries(Array.from({length:flags.length/2},(_,index)=>[flags[index*2],flags[index*2+1]]));
 const origin=originOf(options['--origin']??process.env.SPENDABLE_ORIGIN??'http://localhost:3000');
 const rawWallet=options['--wallet']??'';
 if(!/^0x[0-9a-fA-F]{40}$/.test(rawWallet))throw Error('Provide only your public wallet address with --wallet.');
 const wallet=getAddress(rawWallet).toLowerCase();
 const relativeDirectory='.data/client-auth',challengeFile=join(relativeDirectory,'challenge-'+wallet+'.json');
 if(mode==='challenge'){
  const challenge=await walletChallenge(origin,wallet);
  await savePrivate(challengeFile,{...challenge,origin,wallet});
  console.log(JSON.stringify({...challenge,wallet,origin,challengeFile,instruction:'Sign only this login message through your own wallet provider, save the signature to a file, then run verify. Never provide a wallet private key.'}));
  return;
 }
 if(!options['--signature-file'])throw Error('Provide --signature-file containing the wallet login signature.');
 let state:{origin?:unknown;wallet?:unknown;message?:unknown;expiresAt?:unknown};
 try{state=JSON.parse(await readFile(challengeFile,'utf8'));}catch{throw Error('The saved challenge could not be read. Request a new challenge.');}
 if(state.origin!==origin||state.wallet!==wallet)throw Error('The saved challenge belongs to another server or wallet.');
 const challenge=boundChallenge({message:state.message,expiresAt:state.expiresAt},origin,wallet);
 const signature=(await readFile(options['--signature-file'],'utf8')).trim();
 const session=await walletSession(origin,wallet,challenge.message,signature);
 const sessionFile=join(relativeDirectory,'session-'+wallet+'.json');
 await savePrivate(sessionFile,{...session,origin,mcp:origin+'/mcp'});
 console.log(JSON.stringify({sessionFile,expiresAt:session.expiresAt,mcp:origin+'/mcp',instruction:'Load the saved token into your MCP client Authorization header. The token is never printed.'}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)main(process.argv.slice(2)).catch(error=>{
 console.error(error instanceof z.ZodError?'Wallet authentication response or signature is invalid.':error instanceof Error?error.message:'Wallet authentication failed.');
 process.exitCode=1;
});
