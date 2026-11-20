import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,rm} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import ts from 'typescript';

test('compiled server entry loads in plain Node without TypeScript source files',async()=>{
 const root=resolve('.');
 await mkdir(join(root,'.data'),{recursive:true});
 const output=await mkdtemp(join(root,'.data','compiled-api-'));
 try{
  const config=ts.readConfigFile(join(root,'tsconfig.json'),ts.sys.readFile);
  assert.equal(config.error,undefined);
  const parsed=ts.parseJsonConfigFileContent(config.config,ts.sys,root);
  const options={...parsed.options,noEmit:false,noCheck:true,rootDir:root,outDir:output};
  const program=ts.createProgram([join(root,'api/index.ts')],options);
  assert.equal(program.emit().emitSkipped,false);
  const entry=pathToFileURL(join(output,'api/index.js')).href;
  const script='const entry=await import('+JSON.stringify(entry)+'); if(typeof entry.default!=="function") throw new Error("Missing API handler"); console.log("COMPILED_API_LOADS");';
  const result=spawnSync(process.execPath,['--input-type=module','-e',script],{cwd:root,encoding:'utf8',timeout:30000,env:{...process.env,NODE_OPTIONS:''}});
  assert.equal(result.status,0,result.stderr);
  assert.match(result.stdout,/COMPILED_API_LOADS/);
 }finally{await rm(output,{recursive:true,force:true});}
});
