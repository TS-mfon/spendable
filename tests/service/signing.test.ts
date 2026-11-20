import test from 'node:test';
import assert from 'node:assert/strict';
import {createService} from '../../src/service/index.ts';
import {createRepository} from '../../src/storage/index.ts';
import {owner,intent} from '../domain/fixtures.ts';
import {providers,interpreter} from './fixtures.ts';
test('preparation binds signing validity while late broadcasts remain reportable and reserved',async t=>{
 const repository=await createRepository('memory://');
 try{
  const service=createService({repository,providers,interpreter});
  const plan=await service.createPlan(owner,intent);
  const candidate=plan.candidates.find(c=>c.eligible)!;
  const action=await service.prepareAction(owner,plan.id,candidate.id,1,'signing-validity');
  assert.equal(action.signingExpiresAt,candidate.quote.expiresAt);
  t.mock.method(Date,'now',()=>Date.parse(candidate.quote.expiresAt)+1);
  const sent=await service.reportSubmission(owner,action.id,'funding','0x'+'a'.repeat(64),action.version);
  assert.equal(sent.state,'submitted');
  assert.equal((await repository.reserved(owner)).length,2);
 }finally{t.mock.restoreAll();await repository.close();}
});
