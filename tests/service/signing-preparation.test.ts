import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {owner,intent} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
test('quote expiry during preparation cannot create a new signing commitment',async t=>{
 const repository=await createRepository('memory://');
 try{
  const p={...providers,async prepareSteps(q:Parameters<typeof providers.prepareSteps>[0]){
   const steps=await providers.prepareSteps(q);
   t.mock.method(Date,'now',()=>Date.parse(q.expiresAt)+1);
   return steps;
  }};
  const service=createService({repository,providers:p,interpreter});
  const plan=await service.createPlan(owner,intent);
  const candidate=plan.candidates.find(c=>c.eligible)!;
  await assert.rejects(service.prepareAction(owner,plan.id,candidate.id,1,'expires-during-preparation'),error=>error instanceof Error&&'code'in error&&error.code==='EXPIRED_QUOTE');
  assert.equal((await repository.reserved(owner)).length,0);
 }finally{t.mock.restoreAll();await repository.close();}
});
