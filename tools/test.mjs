import {readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {runTests} from './db-test.mjs';
function walk(dir){return existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(dir,x.name)):x.name.endsWith('.test.ts')?[join(dir,x.name)]:[]):[];}
const requested=process.argv[2];
const root=requested?'tests/'+requested:'tests';
const files=walk(root);
if(!files.length)throw new Error('No tests found for '+root);
process.exitCode=await runTests(files);
