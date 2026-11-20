import {testSessionSecret} from '../helpers/credentials.ts';
import test from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import {createHash} from 'node:crypto';
import {privateKeyToAccount} from 'viem/accounts';
import {createAuth,createMemoryAuthStore} from '../../src/auth/index.ts';
import {createApp} from '../../src/http/index.ts';
import type {SpendableService} from '../../src/shared/contracts.ts';
const origin='http://localhost:3000',redirect='http://localhost:4567/callback';
const account=privateKeyToAccount(('0x'+'33'.repeat(32)) as `0x${string}`);
function setup(){const auth=createAuth({origin,secret:testSessionSecret(),store:createMemoryAuthStore()});return {auth,app:createApp({auth,origin,service:{getCapabilities:async()=>[]} as unknown as SpendableService})};}
async function login(app:ReturnType<typeof createApp>){
 const c=await request(app).post('/api/auth/challenge').set('Origin',origin).send({wallet:account.address});
 const r=await request(app).post('/api/auth/verify').set('Origin',origin).send({wallet:account.address,message:c.body.data.message,signature:await account.signMessage({message:c.body.data.message})});
 return r.headers['set-cookie'];
}
test('OAuth binds client redirect, owner consent, PKCE and one-use code',async()=>{
 const {app,auth}=setup();
 const registration=await request(app).post('/oauth/register').send({client_name:'Local Agent',redirect_uris:[redirect],token_endpoint_auth_method:'none'});
 assert.equal(registration.status,201);
 const verifier='a'.repeat(43),challenge=createHash('sha256').update(verifier).digest('base64url');
 const fields={client_id:registration.body.client_id,redirect_uri:redirect,response_type:'code',code_challenge:challenge,code_challenge_method:'S256',state:'known-state',scope:'wallet:read plan:write execution:write',resource:origin+'/mcp'};
 assert.equal((await request(app).get('/api/oauth/authorize').query(fields)).status,401);
 const cookie=await login(app);
 assert.equal((await request(app).get('/api/oauth/authorize').set('Cookie',cookie).query({...fields,redirect_uri:'https://evil.example'})).status,422);
 const consent=await request(app).post('/api/oauth/authorize').set('Cookie',cookie).set('Origin',origin).send({...fields,approved:true});
 assert.equal(consent.status,200);
 const target=new URL(consent.body.data.redirectUrl);assert.equal(target.searchParams.get('state'),'known-state');
 const grant={grant_type:'authorization_code',client_id:fields.client_id,redirect_uri:redirect,code:target.searchParams.get('code'),code_verifier:verifier,resource:origin+'/mcp'};
 assert.equal((await request(app).post('/oauth/token').send({...grant,code_verifier:'b'.repeat(43)})).status,400);
 const exchange=await request(app).post('/oauth/token').send(grant);assert.equal(exchange.status,200);
 assert.equal((await auth.authenticate(exchange.body.access_token)).wallet,account.address.toLowerCase());
 assert.equal((await request(app).post('/oauth/token').send(grant)).status,400);
 const revoke=await request(app).post('/oauth/revoke').send({token:exchange.body.access_token,client_id:fields.client_id});
 assert.equal(revoke.status,200);await assert.rejects(auth.authenticate(exchange.body.access_token));
});
test('OAuth metadata advertises the MCP resource and rejects unsafe registration',async()=>{
 const {app}=setup();
 assert.equal((await request(app).get('/.well-known/oauth-protected-resource/mcp')).body.resource,origin+'/mcp');
 const metadata=await request(app).get('/.well-known/oauth-authorization-server');
 assert.deepEqual(metadata.body.code_challenge_methods_supported,['S256']);
 assert.equal((await request(app).post('/oauth/register').send({redirect_uris:['javascript:alert(1)']})).status,422);
 assert.equal((await request(app).post('/oauth/register').send({redirect_uris:['http://remote.example/callback']})).status,422);
});

test('OAuth access sessions cannot authorize other clients or extend their own consent',async()=>{
 const {app,auth}=setup();
 const registration=await request(app).post('/oauth/register').send({client_name:'Another Agent',redirect_uris:[redirect]});
 const fields={client_id:registration.body.client_id,redirect_uri:redirect,response_type:'code',code_challenge:createHash('sha256').update('a'.repeat(43)).digest('base64url'),code_challenge_method:'S256',scope:'wallet:read plan:write execution:write',resource:origin+'/mcp'};
 const agent=await auth.issueSession(account.address,{clientId:'existing-agent',scopes:['wallet:read','plan:write','execution:write']});
 const preview=await request(app).get('/api/oauth/authorize').set('Authorization','Bearer '+agent.token).query(fields);
 assert.equal(preview.status,403);assert.equal(preview.body.error.code,'OWNER_CONSENT_REQUIRED');
 const approval=await request(app).post('/api/oauth/authorize').set('Authorization','Bearer '+agent.token).set('Origin',origin).send({...fields,approved:true});
 assert.equal(approval.status,403);assert.equal(approval.body.error.code,'OWNER_CONSENT_REQUIRED');
 const wallet=await auth.issueSession(account.address);
 assert.equal((await request(app).post('/api/oauth/authorize').set('Authorization','Bearer '+wallet.token).set('Origin',origin).send({...fields,approved:true})).status,403);
});
