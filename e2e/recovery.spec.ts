import {test,expect} from '@playwright/test';
import {fixtures,installWallet,recipient} from './fixtures.ts';
import {installApi} from './api-fixture.ts';
test('a broadcast retry uses the current version after reconciliation advances it',async({page})=>{
 await installWallet(page);await installApi(page);
 const {execution}=fixtures();let attempts=0;let reportVersion=0;
 await page.route('**/api/actions/action-test/submissions',async route=>{
  attempts++;reportVersion=route.request().postDataJSON().version;
  if(attempts===1)return route.fulfill({status:503,json:{success:false,data:null,error:{code:'UNAVAILABLE',message:'Report unavailable; retry saved hash.'}}});
  expect(reportVersion).toBe(3);
  return route.fulfill({json:{success:true,data:{...execution,version:4,state:'submitted',sourceHash:'0x'+'b'.repeat(64),steps:execution.steps.map(s=>({...s,submittedHash:'0x'+'b'.repeat(64)}))},error:null}});
 });
 await page.route('**/api/actions/action-test',route=>route.fulfill({json:{success:true,data:{...execution,version:attempts?3:1},error:null}}));
 await page.goto('/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByLabel('Recipient address').fill(recipient);await page.getByLabel('Amount',{exact:true}).fill('50');await page.getByLabel('Destination token').selectOption('8453:usdc');
 await page.getByRole('button',{name:'Compare funding sources'}).click();await page.getByRole('button',{name:'Review this plan'}).click();await page.getByRole('button',{name:'Prepare action'}).click();
 await page.getByRole('button',{name:'Sign funding transaction'}).click();await expect(page.getByRole('button',{name:'Retry transaction report'})).toBeVisible();
 await page.getByRole('button',{name:'Retry transaction report'}).click();await expect(page.getByText('Transaction submitted',{exact:true})).toBeVisible();expect(attempts).toBe(2);
});
