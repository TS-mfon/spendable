import {createMemoryOAuthMethods,createSqlOAuthMethods,type OAuthStoreMethods} from './oauth-store.ts';
import {SpendableError} from '../shared/errors.ts';
import { mkdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import { Pool } from 'pg';
export interface Challenge {readonly id:string;readonly wallet:string;readonly message:string;readonly expires:number;}
export interface Session {readonly id:string;readonly wallet:string;readonly expires:number;}
export interface AuthStore extends OAuthStoreMethods {
 putChallenge(challenge:Challenge):Promise<void>; getChallenge(id:string):Promise<Challenge|null>;
 consumeChallenge(id:string,now:number):Promise<boolean>; putSession(session:Session):Promise<void>;
 activeSession(id:string,wallet:string,now:number):Promise<boolean>; revokeSession(id:string):Promise<void>;
 allow(key:string,limit:number,windowMs:number,now:number):Promise<boolean>; close():Promise<void>;
}
export function createMemoryAuthStore():AuthStore {
 let challenges=new Map<string,Challenge>();let sessions=new Map<string,Session>();let rates=new Map<string,{count:number;expires:number}>();
 return {
 ...createMemoryOAuthMethods(),
 async putChallenge(c){challenges=new Map([...challenges,[c.id,c]]);},
 async getChallenge(id){return challenges.get(id)??null;},
 async consumeChallenge(id,now){const c=challenges.get(id);if(!c||c.expires<=now)return false;challenges=new Map([...challenges].filter(([k])=>k!==id));return true;},
 async putSession(s){sessions=new Map([...sessions,[s.id,s]]);},
 async activeSession(id,wallet,now){const s=sessions.get(id);return !!s&&s.wallet===wallet&&s.expires>now;},
 async revokeSession(id){sessions=new Map([...sessions].filter(([k])=>k!==id));},
 async allow(key,limit,windowMs,now){const prev=rates.get(key);const next=prev&&prev.expires>now?{...prev,count:prev.count+1}:{count:1,expires:now+windowMs};rates=new Map([...rates,[key,next]]);return next.count<=limit;},
 async close(){}
 };
}
type Row=Record<string,unknown>;
interface QueryDB {query<T extends Row=Row>(sql:string,values?:unknown[]):Promise<{rows:T[]}>}
export async function createSqlAuthStore(databaseUrl?:string,dataDir='.data/auth'):Promise<AuthStore> {
 if(databaseUrl&&/^mongodb(?:\+srv)?:\/\//.test(databaseUrl)){
  const {createMongoAuthStore}=await import('./mongo-store.ts');return createMongoAuthStore(databaseUrl);
 }
 let db:QueryDB;let close:()=>Promise<void>;
 if(databaseUrl){const pool=new Pool({connectionString:databaseUrl,max:3});db=pool;close=()=>pool.end();}
 else {await mkdir(dataDir,{recursive:true});const local=new PGlite(dataDir);db=local;close=()=>local.close();}
 let oauth:OAuthStoreMethods;
 try{
 oauth=await createSqlOAuthMethods(db);
 await db.query('CREATE TABLE IF NOT EXISTS spendable_auth_challenges(id text PRIMARY KEY,wallet text NOT NULL,message text NOT NULL,expires bigint NOT NULL,consumed boolean NOT NULL DEFAULT false)');
 await db.query('CREATE TABLE IF NOT EXISTS spendable_auth_sessions(id text PRIMARY KEY,wallet text NOT NULL,expires bigint NOT NULL,revoked boolean NOT NULL DEFAULT false)');
 await db.query('CREATE TABLE IF NOT EXISTS spendable_auth_rates(key text PRIMARY KEY,count integer NOT NULL,expires bigint NOT NULL)');
 }catch(error){
  try{await close();}catch{console.error('Authentication storage cleanup failed');}
  throw error instanceof SpendableError?error:new SpendableError('AUTH_DATABASE_UNAVAILABLE','Authentication storage is unavailable.',503);
 }
 return {
 ...oauth,
 async putChallenge(c){await db.query('DELETE FROM spendable_auth_challenges WHERE expires < $1',[Date.now()-86400000]);await db.query('INSERT INTO spendable_auth_challenges(id,wallet,message,expires) VALUES($1,$2,$3,$4)',[c.id,c.wallet,c.message,c.expires]);},
 async getChallenge(id){const r=await db.query('SELECT * FROM spendable_auth_challenges WHERE id=$1 AND consumed=false',[id]);const row=r.rows[0];return row?{id:String(row.id),wallet:String(row.wallet),message:String(row.message),expires:Number(row.expires)}:null;},
 async consumeChallenge(id,now){const r=await db.query('UPDATE spendable_auth_challenges SET consumed=true WHERE id=$1 AND consumed=false AND expires>$2 RETURNING id',[id,now]);return r.rows.length===1;},
 async putSession(s){await db.query('DELETE FROM spendable_auth_sessions WHERE expires < $1',[Date.now()-86400000]);await db.query('INSERT INTO spendable_auth_sessions(id,wallet,expires) VALUES($1,$2,$3)',[s.id,s.wallet,s.expires]);},
 async activeSession(id,wallet,now){const r=await db.query('SELECT id FROM spendable_auth_sessions WHERE id=$1 AND wallet=$2 AND expires>$3 AND revoked=false',[id,wallet,now]);return r.rows.length===1;},
 async revokeSession(id){await db.query('UPDATE spendable_auth_sessions SET revoked=true WHERE id=$1',[id]);},
 async allow(key,limit,windowMs,now){const r=await db.query(`INSERT INTO spendable_auth_rates(key,count,expires) VALUES($1,1,$2) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN spendable_auth_rates.expires <= $3 THEN 1 ELSE spendable_auth_rates.count+1 END,expires=CASE WHEN spendable_auth_rates.expires <= $3 THEN $2 ELSE spendable_auth_rates.expires END RETURNING count`,[key,now+windowMs,now]);return Number(r.rows[0]?.count)<=limit;},
 close
 };
}
