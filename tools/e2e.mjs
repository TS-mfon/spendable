import {spawn} from 'node:child_process';
import {existsSync} from 'node:fs';
const cached='/tmp/arc-chromium-libs/usr/lib/x86_64-linux-gnu';
const env={...process.env,...(existsSync(cached+'/libasound.so.2')?{LD_LIBRARY_PATH:cached+(process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:'')}:{})};
const child=spawn(process.execPath,['node_modules/@playwright/test/cli.js','test',...process.argv.slice(2)],{stdio:'inherit',env});
child.once('error',()=>{process.exitCode=1;});
child.once('exit',code=>{process.exitCode=code??1;});
