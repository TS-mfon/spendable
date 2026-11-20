import {readdir,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
export function findSecrets(text){
 const pattern=/(?:CMC(?:_PRO)?_API_KEY|ZERION_API_KEY|SESSION_SECRET|RECONCILE_SECRET|(?:SPONSOR_)?PRIVATE_KEY)\s*[:=]\s*['"]([^'"\s]{24,})['"]/g;
 return [...text.matchAll(pattern)].filter(m=>!/^\$|^<|^test|^example|^placeholder/.test(m[1])).length;
}
export async function scan(root='.'){
 const ignored=new Set(['node_modules','.git','.data','.unlazy','coverage','test-results','playwright-report']);
 const problems=[];
 async function walk(dir){
  for(const entry of await readdir(dir,{withFileTypes:true})){
   if(ignored.has(entry.name)||entry.name.startsWith('.env')||entry.isSymbolicLink())continue;
   const path=join(dir,entry.name);
   if(entry.isDirectory())await walk(path);
   else if(/\.(?:[cm]?[jt]sx?|py|md|json|ya?ml|html)$/.test(entry.name)&&entry.name!=='package-lock.json'){
    if(findSecrets(await readFile(path,'utf8')))problems.push(path);
   }
  }
 }
 await walk(root);
 if(problems.length)throw new Error('Possible hardcoded credentials in: '+problems.join(', '));
 return problems;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){await scan();console.log('SECRET_SCAN_OK');}
