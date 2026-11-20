import {MongoClient,type ClientSession} from 'mongodb';
import {SpendableError} from './errors.ts';
export function isMongoUri(uri?:string):boolean{return Boolean(uri&&/^mongodb(?:\+srv)?:\/\//.test(uri));}
export async function openMongo(uri:string){
 const parsed=/^mongodb(?:\+srv)?:\/\/([^/]+)(?:\/([^?]*))?/.exec(uri);
 if(!parsed)throw new SpendableError('DATABASE_CONFIG','Configure a MongoDB Atlas connection URI.',503);
 const name=decodeURIComponent(parsed[2]||'spendable');
 if(!/^[a-zA-Z0-9_-]{1,64}$/.test(name))throw new SpendableError('DATABASE_CONFIG','Invalid database name.',503);
 const hosts=parsed[1].split('@').at(-1)!.split(',');
 const localTest=process.env.NODE_ENV==='test'&&uri.startsWith('mongodb://')&&hosts.every(host=>/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host));
 let client:MongoClient;
 try{client=new MongoClient(uri,{maxPoolSize:3,minPoolSize:0,serverSelectionTimeoutMS:10000,connectTimeoutMS:10000,tls:!localTest});}
 catch{throw new SpendableError('DATABASE_CONFIG','Invalid MongoDB connection configuration.',503);}
 try{await client.connect();await client.db(name).command({ping:1});}
 catch{await client.close();throw new SpendableError('DATABASE_UNAVAILABLE','MongoDB Atlas is unavailable. Check access and configuration.',503);}
 const db=client.db(name);
 async function transaction<T>(fn:(session:ClientSession)=>Promise<T>):Promise<T>{
  const session=client.startSession();
  try{return await session.withTransaction(fn,{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},timeoutMS:15000,maxCommitTimeMS:5000});}
  finally{await session.endSession();}
 }
 return {client,db,transaction,close:()=>client.close()};
}
