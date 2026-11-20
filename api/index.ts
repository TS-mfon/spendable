import type {Request,Response} from 'express';
import {createRuntime} from '../tools/runtime.ts';
let runtime:ReturnType<typeof createRuntime>|undefined;
export default async function handler(req:Request,res:Response){
 try{runtime??=createRuntime();(await runtime).app(req,res);}
 catch{runtime=undefined;res.status(503).json({success:false,data:null,error:{code:'STARTUP_UNAVAILABLE',message:'Spendable is temporarily unavailable. Check the server configuration.'}});}
}
