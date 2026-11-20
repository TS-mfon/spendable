import { readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import {runTests} from './db-test.mjs';
const allowed={core:['tests/domain','tests/storage','tests/service'],providers:['tests/providers'],ai:['tests/ai'],auth:['tests/auth','tests/http','tests/mcp'],ui:['tests/ui']};
const leaf=process.argv[2];
if(!Object.hasOwn(allowed,leaf))throw new Error('Unknown leaf');
function walk(dir){return existsSync(dir)?readdirSync(dir,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(join(dir,x.name)):x.name.endsWith('.test.ts')?[join(dir,x.name)]:[]):[];}
const files=allowed[leaf].flatMap(walk);
if(!files.length)throw new Error('Leaf has no tests');
const status=await runTests(files);
if(status!==0)process.exit(status);
console.log('LEAF '+leaf+' VERIFIED');
