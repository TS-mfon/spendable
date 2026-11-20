import {MongoServerError,type Collection,type Document} from 'mongodb';
import {openMongo} from '../shared/mongo.ts';
import type {AuthStore,Challenge,Session} from './store.ts';
import type {OAuthRecord,OAuthStoreMethods} from './oauth-store.ts';
import {SpendableError} from '../shared/errors.ts';
interface ChallengeDoc extends Omit<Challenge,'id'|'expires'> {_id:string;expires:Date;consumed:boolean}
interface SessionDoc extends Omit<Session,'id'|'expires'> {_id:string;expires:Date;revoked:boolean}
interface RateDoc {_id:string;count:number;expires:Date}
interface OAuthDoc {_id:string;kind:OAuthRecord['kind'];id:string;data:OAuthRecord['data'];expires:Date}
async function ttl<T extends Document>(collection:Collection<T>){await collection.createIndex({expires:1},{expireAfterSeconds:0,name:'expires_ttl'});}
function challenge(row:ChallengeDoc|null):Challenge|null{return row?{id:row._id,wallet:row.wallet,message:row.message,expires:row.expires.getTime()}:null;}
function oauthRecord(row:OAuthDoc|null):OAuthRecord|null{return row?{id:row.id,kind:row.kind,data:row.data,expires:row.expires.getTime()}:null;}
function oauthMethods(collection:Collection<OAuthDoc>):OAuthStoreMethods{
 return {
 async oauthPut(r){await collection.insertOne({_id:r.kind+':'+r.id,id:r.id,kind:r.kind,data:structuredClone(r.data),expires:new Date(r.expires)});},
 async oauthGet(kind,id,now){return oauthRecord(await collection.findOne({_id:kind+':'+id,expires:{$gt:new Date(now)}}));},
 async oauthTake(kind,id,now){return oauthRecord(await collection.findOneAndDelete({_id:kind+':'+id,expires:{$gt:new Date(now)}},{includeResultMetadata:false}));}
 };
}
async function allow(collection:Collection<RateDoc>,key:string,limit:number,windowMs:number,now:number){
 if(!Number.isSafeInteger(limit)||limit<1||!Number.isSafeInteger(windowMs)||windowMs<1||!Number.isSafeInteger(now))throw new SpendableError('INVALID_RATE_WINDOW','Invalid rate-limit configuration.',503);
 const expired={$lte:[{$ifNull:['$expires',new Date(0)]},new Date(now)]};
 const pipeline=[{$set:{
  count:{$cond:[expired,1,{$min:[{$add:[{$ifNull:['$count',0]},1]},limit+1]}]},
  expires:{$cond:[expired,new Date(now+windowMs),'$expires']}
 }}];
 const options={upsert:true,returnDocument:'after' as const,includeResultMetadata:false as const};
 try{const row=await collection.findOneAndUpdate({_id:key},pipeline,options);return !!row&&row.count<=limit;}
 catch(error){
  if(!(error instanceof MongoServerError)||error.code!==11000)throw error;
  const row=await collection.findOneAndUpdate({_id:key},pipeline,{...options,upsert:false});return !!row&&row.count<=limit;
 }
}
export async function createMongoAuthStore(uri:string):Promise<AuthStore>{
 const connection=await openMongo(uri),{db}=connection;
 const challenges=db.collection<ChallengeDoc>('spendable_auth_challenges');
 const sessions=db.collection<SessionDoc>('spendable_auth_sessions');
 const rates=db.collection<RateDoc>('spendable_auth_rates');
 const oauth=db.collection<OAuthDoc>('spendable_oauth_records');
 try{await Promise.all([ttl(challenges),ttl(sessions),ttl(rates),ttl(oauth)]);}
 catch{await connection.close();throw new SpendableError('AUTH_DATABASE_UNAVAILABLE','Authentication storage is unavailable.',503);}
 return {
 ...oauthMethods(oauth),
 async putChallenge(c){await challenges.insertOne({_id:c.id,wallet:c.wallet,message:c.message,expires:new Date(c.expires),consumed:false});},
 async getChallenge(id){return challenge(await challenges.findOne({_id:id,consumed:false}));},
 async consumeChallenge(id,now){return (await challenges.updateOne({_id:id,consumed:false,expires:{$gt:new Date(now)}},{$set:{consumed:true}})).modifiedCount===1;},
 async putSession(s){await sessions.insertOne({_id:s.id,wallet:s.wallet,expires:new Date(s.expires),revoked:false});},
 async activeSession(id,wallet,now){return !!await sessions.findOne({_id:id,wallet,revoked:false,expires:{$gt:new Date(now)}},{projection:{_id:1}});},
 async revokeSession(id){await sessions.updateOne({_id:id},{$set:{revoked:true}});},
 async allow(key,limit,windowMs,now){return allow(rates,key,limit,windowMs,now);},
 close:connection.close
 };
}
