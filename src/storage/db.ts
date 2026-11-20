import {mkdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {Pool} from 'pg';
export interface Sql {query<T extends Record<string,unknown>=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>}
export interface Database extends Sql {transaction<T>(fn:(db:Sql)=>Promise<T>):Promise<T>;close():Promise<void>;remote:boolean}
export async function openDatabase(url?:string,dataDir='.data/spendable'):Promise<Database>{
 if(url&&url!=='memory://'){
  const pool=new Pool({connectionString:url,max:5});
  return {remote:true,query:(sql,values)=>pool.query(sql,values),close:()=>pool.end(),async transaction(fn){
   const client=await pool.connect();
   try{await client.query('BEGIN');const result=await fn(client);await client.query('COMMIT');return result;}
   catch(error){await client.query('ROLLBACK');throw error;}finally{client.release();}
  }};
 }
 if(url!=='memory://')await mkdir(dataDir,{recursive:true});
 const db=new PGlite(url==='memory://'?undefined:dataDir);
 return {remote:false,query:(sql,values)=>db.query(sql,values),close:()=>db.close(),transaction:fn=>db.transaction(fn)};
}
export async function migrate(db:Sql):Promise<void>{
 await db.query('CREATE TABLE IF NOT EXISTS spendable_plans(id text PRIMARY KEY,owner text NOT NULL,payload jsonb NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS spendable_interpretations(id text PRIMARY KEY,owner text NOT NULL,payload jsonb NOT NULL)');
 await db.query('CREATE TABLE IF NOT EXISTS spendable_executions(id text PRIMARY KEY,owner text NOT NULL,idempotency_key text NOT NULL,version integer NOT NULL,state text NOT NULL,payload jsonb NOT NULL,next_check_at bigint,lease_token text,lease_until bigint,UNIQUE(owner,idempotency_key))');
 await db.query('CREATE INDEX IF NOT EXISTS spendable_executions_due ON spendable_executions(next_check_at,lease_until)');
}
