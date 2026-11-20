import {isMongoUri} from '../shared/mongo.ts';
import {createMongoRepository} from './mongo.ts';
import type {Repository} from '../shared/ports.ts';
import {migrate,openDatabase} from './db.ts';
import {mutations} from './mutations.ts';
import {reads} from './reads.ts';
import {leases,type ExecutionClaim} from './leases.ts';
export {migrate} from './db.ts';
export {terminalStates} from './utils.ts';
export type {ExecutionClaim} from './leases.ts';
export interface SpendableRepository extends Repository {close():Promise<void>;claimDue(limit:number,now?:number,leaseMs?:number):Promise<readonly ExecutionClaim[]>;releaseLease(id:string,token:string):Promise<void>}
export async function createRepository(url?:string,options:{dataDir?:string}={}):Promise<SpendableRepository>{
 if(isMongoUri(url))return createMongoRepository(url!);
 const db=await openDatabase(url,options.dataDir);
 try{await migrate(db);}catch(error){await db.close();throw error;}
 return {...mutations(db),...reads(db),...leases(db),close:()=>db.close()};
}
