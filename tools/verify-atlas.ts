import {randomUUID} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import {loadConfig} from '../src/config.ts';
import {openMongo} from '../src/shared/mongo.ts';
const config=loadConfig();
if(!config.databaseUrl)throw new Error('Configure the Atlas URI privately first.');
const connection=await openMongo(config.databaseUrl);
try{
 const collection=connection.db.collection<{_id:string;observedAt:Date}>('spendable_setup_checks');
 const id=randomUUID();
 await connection.transaction(async session=>{await collection.insertOne({_id:id,observedAt:new Date()},{session});});
 if(!await collection.findOne({_id:id}))throw new Error('Atlas committed probe could not be read.');
 await collection.deleteOne({_id:id});
 const status=await connection.client.db('admin').command({connectionStatus:1});
 const roles=status.authInfo?.authenticatedUserRoles??[];
 if(roles.length!==1||roles[0].role!=='readWrite'||roles[0].db!=='spendable')throw new Error('Unexpected authenticated Atlas roles.');
 let isolated=false;
 try{await connection.client.db('spendable_access_probe').collection('probe').findOne({});}
 catch(error){
  const e=error as {code?:number;codeName?:string;message?:string};
  isolated=e.code===13||e.codeName==='Unauthorized'||(e.code===8000&&/not authorized|not authorised|not allowed to do action/i.test(e.message??''));
  console.log('ATLAS_ACCESS_CHECK '+JSON.stringify({code:e.code,codeName:e.codeName,denied:isolated}));
 }
 if(!isolated)throw new Error('Spendable user isolation could not be verified.');
 const collections=await connection.db.listCollections({}, {nameOnly:true}).toArray();
 const evidence={observedAt:new Date().toISOString(),database:connection.db.databaseName,transactionCommit:'verified',otherDatabaseAccess:'denied',roles,collections:collections.map(c=>c.name)};
 await mkdir('docs/evidence',{recursive:true});
 await writeFile('docs/evidence/atlas.json',JSON.stringify(evidence,null,2)+'\n');
 console.log('ATLAS_DATABASE_VERIFIED');
}finally{await connection.close();}
