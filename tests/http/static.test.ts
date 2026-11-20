import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {SpendableService} from '../../src/shared/contracts.ts';
test('static assets bypass database rate checks while API requests retain them',async()=>{
 const base=createAuth({secret:testSessionSecret(),origin:'http://localhost:3000',store:createMemoryAuthStore()});
 let calls=0;
 const auth={...base,async allow(key:string,limit?:number,windowMs?:number){calls++;return base.allow(key,limit,windowMs);}};
 const app=createApp({service:{} as SpendableService,auth,origin:'http://localhost:3000'});
 app.get('/asset.js',(_req,res)=>res.send('static asset'));
 try{
  assert.equal((await request(app).get('/asset.js')).status,200);
  assert.equal(calls,0);
  assert.equal((await request(app).get('/api/health')).status,200);
  assert.equal(calls,1);
 }finally{await auth.close();}
});
