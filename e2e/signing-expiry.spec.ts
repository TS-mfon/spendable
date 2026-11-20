import {test,expect} from '@playwright/test';
import {fixtures,installWallet,recipient} from './fixtures.ts';
import {installApi} from './api-fixture.ts';
test('expired prepared terms cannot open the wallet and offer an explicit fresh-plan recovery path',async({page})=>{
 await installWallet(page);await installApi(page);
 const {execution}=fixtures();
 const expired={...execution,version:3,signingExpiresAt:new Date(Date.now()-1000).toISOString()};
 await page.route('**/api/actions/action-test',route=>route.fulfill({json:{success:true,data:expired,error:null}}));
 await page.route('**/api/actions/action-test/observe',route=>route.fulfill({json:{success:true,data:expired,error:null}}));
 await page.goto('/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByLabel('Recipient address').fill(recipient);
 await page.getByLabel('Amount',{exact:true}).fill('50');
 await page.getByLabel('Destination token').selectOption('8453:usdc');
 await page.getByRole('button',{name:'Compare funding sources'}).click();
 await page.getByRole('button',{name:'Review this plan'}).click();
 await page.getByRole('button',{name:'Prepare action'}).click();
 await page.evaluate(()=>{
  const provider=window.ethereum!;const original=provider.request.bind(provider);
  Object.assign(window,{signRequests:0});
  provider.request=async input=>{
   if(input.method==='eth_sendTransaction')Object.assign(window,{signRequests:((window as Window&{signRequests?:number}).signRequests??0)+1});
   return original(input);
  };
 });
 await page.getByRole('button',{name:'Sign funding transaction'}).click();
 await expect(page.getByRole('alert')).toContainText('quote expired');
 await expect(page.getByRole('button',{name:'Sign funding transaction'})).toHaveCount(0);
 await expect(page.getByRole('status')).toContainText('compare a fresh plan');
 expect(await page.evaluate(()=>(window as Window&{signRequests?:number}).signRequests)).toBe(0);
 await expect(page.getByText('Release an unsubmitted reservation',{exact:true})).toBeVisible();
});
