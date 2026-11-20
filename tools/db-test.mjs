import {spawn} from 'node:child_process';
export async function runTests(files){
 let replica;
 const needsMongo=files.some(path=>/mongo[^/]*\.test\.ts$/.test(path));
 let mongoUri=process.env.MONGO_TEST_URI;
 if(needsMongo&&!mongoUri){
  const {MongoMemoryReplSet}=await import('mongodb-memory-server');
  replica=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{launchTimeout:60000}],binary:{version:'8.0.18'}});
  mongoUri=replica.getUri('spendable_test');
 }
 try{
  return await new Promise((resolve,reject)=>{
   const child=spawn(process.execPath,['--import','tsx','--test','--test-isolation=none',...files],{stdio:'inherit',env:{...process.env,NODE_ENV:'test',...(mongoUri?{MONGO_TEST_URI:mongoUri}:{})}});
   child.once('error',reject);child.once('exit',code=>resolve(code??1));
  });
 }finally{await replica?.stop();}
}
