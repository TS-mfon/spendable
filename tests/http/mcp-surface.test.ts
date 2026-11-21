import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import {testSessionSecret} from '../helpers/credentials.ts';
import type {SpendableService} from '../../src/shared/contracts.ts';
const origin='http://localhost:3000';
function setup(){
 const auth=createAuth({secret:testSessionSecret(),origin,store:createMemoryAuthStore()});
 return {auth,app:createApp({origin,auth,service:{getCapabilities:async()=>[]} as unknown as SpendableService})};
}
test('the service root describes MCP and serves no application HTML',async()=>{
 const {app,auth}=setup();
 try{
  const response=await request(app).get('/');
  assert.equal(response.status,200);
  assert.match(response.headers['content-type'],/application\/json/);
  assert.equal(response.body.data.transport,'streamable-http');
  assert.equal(response.body.data.mcp,origin+'/mcp');
 }finally{await auth.close();}
});
test('payment UI, REST resources and browser OAuth are absent',async()=>{
 const {app,auth}=setup();
 try{
  for(const path of ['/app','/assets/app.js','/api/wallet','/api/plans','/oauth/authorize','/.well-known/oauth-authorization-server']){
   const response=await request(app).get(path);
   assert.equal(response.status,404,path);
   assert.equal(response.body.error.code,'NOT_FOUND');
  }
  assert.equal((await request(app).post('/api/plans').send({})).status,404);
  assert.equal((await request(app).post('/oauth/register').send({})).status,404);
 }finally{await auth.close();}
});
test('resource discovery advertises bearer authentication without a removed browser flow',async()=>{
 const {app,auth}=setup();
 try{
  const response=await request(app).get('/.well-known/oauth-protected-resource/mcp');
  assert.equal(response.status,200);
  assert.equal(response.body.resource,origin+'/mcp');
  assert.deepEqual(response.body.bearer_methods_supported,['header']);
  assert.equal(response.body.authorization_servers,undefined);
 }finally{await auth.close();}
});
