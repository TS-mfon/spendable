export interface OAuthRecord {readonly kind:'client'|'code';readonly id:string;readonly data:Readonly<Record<string,unknown>>;readonly expires:number}
export interface OAuthStoreMethods {
 oauthPut(record:OAuthRecord):Promise<void>;
 oauthGet(kind:OAuthRecord['kind'],id:string,now:number):Promise<OAuthRecord|null>;
 oauthTake(kind:OAuthRecord['kind'],id:string,now:number):Promise<OAuthRecord|null>;
}
interface DB {query<T extends Record<string,unknown>=Record<string,unknown>>(sql:string,values?:unknown[]):Promise<{rows:T[]}>}
export function createMemoryOAuthMethods():OAuthStoreMethods {
 let records=new Map<string,OAuthRecord>();
 return {
 async oauthPut(record){records=new Map([...records,[record.kind+':'+record.id,structuredClone(record)]]);},
 async oauthGet(kind,id,now){const r=records.get(kind+':'+id);return r&&r.expires>now?structuredClone(r):null;},
 async oauthTake(kind,id,now){const key=kind+':'+id,r=records.get(key);if(!r||r.expires<=now)return null;records=new Map([...records].filter(([k])=>k!==key));return structuredClone(r);}
 };
}
export async function createSqlOAuthMethods(db:DB):Promise<OAuthStoreMethods>{
 await db.query('CREATE TABLE IF NOT EXISTS spendable_oauth_records(kind text NOT NULL,id text NOT NULL,data jsonb NOT NULL,expires bigint NOT NULL,PRIMARY KEY(kind,id))');
 const record=(row:Record<string,unknown>|undefined):OAuthRecord|null=>row?{kind:row.kind as OAuthRecord['kind'],id:String(row.id),data:row.data as Record<string,unknown>,expires:Number(row.expires)}:null;
 return {
 async oauthPut(r){await db.query('DELETE FROM spendable_oauth_records WHERE expires<$1',[Date.now()]);await db.query('INSERT INTO spendable_oauth_records(kind,id,data,expires) VALUES($1,$2,$3::jsonb,$4)',[r.kind,r.id,JSON.stringify(r.data),r.expires]);},
 async oauthGet(kind,id,now){return record((await db.query('SELECT * FROM spendable_oauth_records WHERE kind=$1 AND id=$2 AND expires>$3',[kind,id,now])).rows[0]);},
 async oauthTake(kind,id,now){return record((await db.query('DELETE FROM spendable_oauth_records WHERE kind=$1 AND id=$2 AND expires>$3 RETURNING *',[kind,id,now])).rows[0]);}
 };
}
