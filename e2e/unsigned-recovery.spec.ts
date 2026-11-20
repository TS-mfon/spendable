import {test,expect} from '@playwright/test';import {fixtures,installWallet,recipient} from './fixtures.ts';import {installApi} from './api-fixture.ts';
test('wallet rejection retains funds until explicit owner-signed recovery',async({page})=>{
 await installWallet(page);await installApi(page);
 const {execution}=fixtures();let recoveries=0;
 await page.route('**/api/actions/action-test',route=>route.fulfill({json:{success:true,data:{...execution,version:3},error:null}}));
 await page.route('**/api/actions/action-test/recover',route=>{
  const body=route.request().postDataJSON();expect(body.version).toBe(3);expect(body.acknowledgeLateBroadcastRisk).toBe(true);expect(body.signature).toMatch(/^0x[0-9a-f]+$/);recoveries++;
  return route.fulfill({json:{success:true,data:{...execution,version:4,state:'canceled'},error:null}});
 });
 await page.goto('/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await page.getByLabel('Recipient address').fill(recipient);await page.getByLabel('Amount',{exact:true}).fill('50');await page.getByLabel('Destination token').selectOption('8453:usdc');
 await page.getByRole('button',{name:'Compare funding sources'}).click();await page.getByRole('button',{name:'Review this plan'}).click();await page.getByRole('button',{name:'Prepare action'}).click();
 await page.evaluate(()=>{const provider=window.ethereum!;const original=provider.request.bind(provider);provider.request=async args=>{if(args.method==='eth_sendTransaction')throw Error('Wallet rejected the transaction.');return original(args);};});
 await page.getByRole('button',{name:'Sign funding transaction'}).click();await expect(page.getByRole('alert')).toContainText('Wallet rejected');
 expect(recoveries).toBe(0);
 await page.getByText('Release an unsubmitted reservation',{exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign and release reservation'})).toBeDisabled();
 await page.getByLabel('I confirm no unsubmitted transaction, including approvals and funding, was signed or broadcast').check();
 await page.getByRole('button',{name:'Sign and release reservation'}).click();
 await expect(page.getByText('Canceled',{exact:true})).toBeVisible();expect(recoveries).toBe(1);
 await expect(page.getByRole('button',{name:'Compare funding sources'})).toBeEnabled();
});
