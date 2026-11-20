import type {Db,ClientSession} from 'mongodb';
import {openMongo} from '../shared/mongo.ts';
import {SpendableError} from '../shared/errors.ts';
import type {SponsorStore,SponsorJob,SponsorLimits} from './sponsor-store.ts';
interface StoredJob extends SponsorJob {readonly _id:string}
interface Guard {readonly _id:string;readonly version:number}
export interface MongoSponsorConnection {
 readonly db:Db;transaction<T>(fn:(session:ClientSession)=>Promise<T>):Promise<T>;close():Promise<void>;
}
const fail=(code:string,message:string)=>new SpendableError(code,message,503);
const detached=(doc:StoredJob):SponsorJob=>({id:doc.id,sponsor:doc.sponsor,digest:doc.digest,day:doc.day,gas:doc.gas,costWei:doc.costWei,nonce:doc.nonce,hash:doc.hash,serialized:doc.serialized,complete:doc.complete});
export async function createMongoSponsorStore(uri:string,connection?:MongoSponsorConnection):Promise<SponsorStore>{
 const mongo=connection??await openMongo(uri);
 const jobs=mongo.db.collection<StoredJob>('spendable_sponsor_jobs');
 const guards=mongo.db.collection<Guard>('spendable_sponsor_guard');
 try{await jobs.createIndex({sponsor:1,day:1});}
 catch{await mongo.close();throw fail('SPONSOR_STORAGE','MongoDB sponsor storage is unavailable.');}
 async function ensureGuard(sponsor:string){
  try{await guards.updateOne({_id:sponsor},{$setOnInsert:{version:0}},{upsert:true});}
  catch(error){
   if(typeof error==='object'&&error!==null&&'code' in error&&error.code===11000&&await guards.findOne({_id:sponsor}))return;
   throw error;
  }
 }
 const lock=(sponsor:string,session:ClientSession)=>guards.updateOne({_id:sponsor},{$inc:{version:1}},{session});
 async function find(id:string,session?:ClientSession){const doc=await jobs.findOne({_id:id},session?{session}:{});return doc?detached(doc):null;}
 function validate(job:Omit<SponsorJob,'hash'|'serialized'|'complete'>,limits:SponsorLimits){
  if(!/^0x[0-9a-fA-F]{40}$/.test(job.sponsor)||!Number.isSafeInteger(job.nonce)||job.nonce<0||!/^\d{4}-\d{2}-\d{2}$/.test(job.day))throw fail('SPONSOR_CONFIGURATION','Invalid sponsor commitment identity.');
  if(!Number.isInteger(limits.requests)||limits.requests<1||limits.requests>10000||![job.gas,job.costWei,limits.gas,limits.costWei].every(v=>/^[1-9][0-9]{0,77}$/.test(v)))throw fail('SPONSOR_CONFIGURATION','Sponsor quotas must be bounded positive integers.');
 }
 return {
 get:id=>find(id),
 async reserve(input,limits){
  validate(input,limits);const job={...input,sponsor:input.sponsor.toLowerCase()};
  await ensureGuard(job.sponsor);
  return mongo.transaction(async session=>{
   // The first transactional operation writes a shared guard. Competing snapshots retry through withTransaction.
   await lock(job.sponsor,session);
   const existing=await find(job.id,session);
   if(existing){
    if(existing.sponsor!==job.sponsor||existing.digest!==job.digest)throw fail('SPONSOR_CONFIGURATION','Sponsor request binding mismatch.');
    return existing;
   }
   if(await jobs.findOne({sponsor:job.sponsor,complete:false},{session}))throw fail('SPONSOR_LIMIT','A sponsor transaction is pending confirmation; reconcile it before retrying.');
   const today=await jobs.find({sponsor:job.sponsor,day:job.day},{session}).toArray();
   const gas=today.reduce((sum,j)=>sum+BigInt(j.gas),0n);
   const cost=today.reduce((sum,j)=>sum+BigInt(j.costWei),0n);
   if(today.length>=limits.requests||gas+BigInt(job.gas)>BigInt(limits.gas)||cost+BigInt(job.costWei)>BigInt(limits.costWei))throw fail('SPONSOR_LIMIT','Daily sponsor request or spend limit reached.');
   const created:StoredJob={_id:job.id,...job,hash:null,serialized:null,complete:false};
   await jobs.insertOne(created,{session});return detached(created);
  });
 },
 async saveSigned(id,hash,serialized){
  const before=await find(id);if(!before)throw fail('SPONSOR_STORAGE','Sponsor reservation is missing.');
  return mongo.transaction(async session=>{
   await lock(before.sponsor,session);
   const existing=await find(id,session);if(!existing)throw fail('SPONSOR_STORAGE','Sponsor reservation is missing.');
   if(existing.hash&&(existing.hash!==hash||existing.serialized!==serialized))throw fail('SPONSOR_CONFIGURATION','Sponsor signing commitment changed.');
   await jobs.updateOne({_id:id},{$set:{hash,serialized}},{session});
   return {...existing,hash,serialized};
  });
 },
 async complete(id){
  const before=await find(id);if(!before)throw fail('SPONSOR_STORAGE','Sponsor reservation is missing.');
  await mongo.transaction(async session=>{await lock(before.sponsor,session);await jobs.updateOne({_id:id},{$set:{complete:true}},{session});});
 },
 close:()=>mongo.close()
 };
}
