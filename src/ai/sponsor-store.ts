import {PGlite} from '@electric-sql/pglite';
import {isMongoUri} from '../shared/mongo.ts';
import {createMongoSponsorStore} from './mongo-sponsor.ts';
import {resolve} from 'node:path';
import {SpendableError} from '../shared/errors.ts';
export interface SponsorJob {
 readonly id:string;readonly sponsor:string;readonly digest:string;readonly day:string;readonly gas:string;
 readonly costWei:string;readonly nonce:number;readonly hash:string|null;readonly serialized:string|null;readonly complete:boolean;
}
export interface SponsorLimits {readonly requests:number;readonly gas:string;readonly costWei:string}
type JobInput=Omit<SponsorJob,'hash'|'serialized'|'complete'>;
interface Sql {query(sql:string,params?:unknown[]):Promise<{rows:Record<string,unknown>[]}>}
export interface SponsorStore {
 get(id:string):Promise<SponsorJob|null>;
 reserve(job:JobInput,limits:SponsorLimits):Promise<SponsorJob>;
 saveSigned(id:string,hash:string,serialized:string):Promise<SponsorJob>;
 complete(id:string):Promise<void>;close():Promise<void>;
}
const fail=(code:string,message:string)=>new SpendableError(code,message,503);
function row(value:Record<string,unknown>):SponsorJob{
 return {id:String(value.id),sponsor:String(value.sponsor),digest:String(value.digest),day:String(value.day),
 gas:String(value.gas),costWei:String(value.cost_wei),nonce:Number(value.nonce),hash:value.hash===null?null:String(value.hash),
 serialized:value.serialized===null?null:String(value.serialized),complete:value.complete===true};
}
export async function createSponsorStore(databaseUrl?:string,dataDir?:string):Promise<SponsorStore>{
 if(isMongoUri(databaseUrl))return createMongoSponsorStore(databaseUrl!);
 if(databaseUrl&&databaseUrl!=='memory://')throw fail('SPONSOR_CONFIGURATION','Configure a MongoDB Atlas URI for remote sponsorship.');
 const local=new PGlite(databaseUrl==='memory://'?undefined:resolve(dataDir??'.data/genlayer'));
 const db:Sql={query:async(sql,params)=>local.query(sql,params)};
 const schema=[
 'CREATE TABLE IF NOT EXISTS spendable_sponsor_guard (sponsor TEXT PRIMARY KEY)',
 'CREATE TABLE IF NOT EXISTS spendable_sponsor_jobs (id TEXT PRIMARY KEY,sponsor TEXT NOT NULL,digest TEXT NOT NULL,day TEXT NOT NULL,gas NUMERIC(78,0) NOT NULL,cost_wei NUMERIC(78,0) NOT NULL,nonce BIGINT NOT NULL,hash TEXT,serialized TEXT,complete BOOLEAN NOT NULL DEFAULT FALSE)',
 'CREATE INDEX IF NOT EXISTS spendable_sponsor_day ON spendable_sponsor_jobs(sponsor,day)'
 ];
 try{for(const statement of schema)await db.query(statement);}catch{await local.close();throw fail('SPONSOR_STORAGE','Durable sponsor storage is unavailable.');}
 let pending:Promise<unknown>=Promise.resolve();
 async function transaction<T>(operation:(sql:Sql)=>Promise<T>):Promise<T>{
  const run=pending.then(async()=>{
   await db.query('BEGIN');
   try{const value=await operation(db);await db.query('COMMIT');return value;}
   catch(error){await db.query('ROLLBACK');throw error;}
  });
  pending=run.catch(()=>undefined);return run;
 }
 const find=async(sql:Sql,id:string)=>{const found=await sql.query('SELECT * FROM spendable_sponsor_jobs WHERE id=$1',[id]);return found.rows[0]?row(found.rows[0]):null;};
 return {
 async get(id){return transaction(sql=>find(sql,id));},
 async reserve(job,limits){
  if(!Number.isInteger(limits.requests)||limits.requests<1||!/^\d{1,78}$/.test(limits.gas)||!/^\d{1,78}$/.test(limits.costWei))throw fail('SPONSOR_CONFIGURATION','Sponsor quotas must be positive integer bounds.');
  return transaction(async sql=>{
   await sql.query('INSERT INTO spendable_sponsor_guard(sponsor) VALUES($1) ON CONFLICT DO NOTHING',[job.sponsor]);
   await sql.query('SELECT sponsor FROM spendable_sponsor_guard WHERE sponsor=$1 FOR UPDATE',[job.sponsor]);
   const existing=await find(sql,job.id);
   if(existing){
    if(existing.sponsor!==job.sponsor||existing.digest!==job.digest)throw fail('SPONSOR_CONFIGURATION','Sponsor request binding mismatch.');
    return existing;
   }
   const active=await sql.query('SELECT id FROM spendable_sponsor_jobs WHERE sponsor=$1 AND complete=FALSE LIMIT 1',[job.sponsor]);
   if(active.rows.length)throw fail('SPONSOR_LIMIT','A sponsor transaction is pending confirmation; try again after it is reconciled.');
   const usage=await sql.query('SELECT COUNT(*) AS requests,COALESCE(SUM(gas),0) AS gas,COALESCE(SUM(cost_wei),0) AS cost FROM spendable_sponsor_jobs WHERE sponsor=$1 AND day=$2',[job.sponsor,job.day]);
   const used=usage.rows[0];
   if(Number(used.requests)>=limits.requests||BigInt(String(used.gas))+BigInt(job.gas)>BigInt(limits.gas)||BigInt(String(used.cost))+BigInt(job.costWei)>BigInt(limits.costWei))throw fail('SPONSOR_LIMIT','Daily sponsor request or spend limit reached.');
   await sql.query('INSERT INTO spendable_sponsor_jobs(id,sponsor,digest,day,gas,cost_wei,nonce) VALUES($1,$2,$3,$4,$5,$6,$7)',[job.id,job.sponsor,job.digest,job.day,job.gas,job.costWei,job.nonce]);
   return (await find(sql,job.id))!;
  });
 },
 async saveSigned(id,hash,serialized){
  return transaction(async sql=>{
   const found=await sql.query('SELECT * FROM spendable_sponsor_jobs WHERE id=$1 FOR UPDATE',[id]);
   if(!found.rows[0])throw fail('SPONSOR_STORAGE','Sponsor reservation is missing.');
   const existing=row(found.rows[0]);
   if(existing.hash&&(existing.hash!==hash||existing.serialized!==serialized))throw fail('SPONSOR_CONFIGURATION','Sponsor signing commitment changed.');
   await sql.query('UPDATE spendable_sponsor_jobs SET hash=$2,serialized=$3 WHERE id=$1',[id,hash,serialized]);
   return (await find(sql,id))!;
  });
 },
 async complete(id){await transaction(async sql=>{await sql.query('UPDATE spendable_sponsor_jobs SET complete=TRUE WHERE id=$1',[id]);});},
 async close(){await pending;await local.close();}
 };
}
