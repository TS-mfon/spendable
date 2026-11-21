import type {Express,Request,Response} from 'express';
import {failure} from './helpers.ts';
export function route(app:Express,method:'get'|'post',path:string,run:(req:Request,res:Response)=>Promise<void>){
 app[method](path,async(req,res)=>{try{await run(req,res);}catch(error){failure(res,error);}});
}
