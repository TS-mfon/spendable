import {test,expect} from '@playwright/test';
import {installWallet,recipient} from './fixtures.ts';
import {installApi} from './api-fixture.ts';
async function signedIn(page:Parameters<typeof installWallet>[0]){
 await page.goto('/');await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
}
async function prepare(page:Parameters<typeof installWallet>[0]){
 await page.getByLabel('Recipient address').fill(recipient);
 await page.getByLabel('Amount', {exact:true}).fill('50');
 await page.getByLabel('Destination token').selectOption('8453:usdc');
 await page.getByRole('button',{name:'Compare funding sources'}).click();
 await page.getByRole('button',{name:'Review this plan'}).click();
 await page.getByRole('button',{name:'Prepare action'}).click();
}
test('human compares funding and sees submitted status without a fake delivery claim',async({page})=>{
 await installWallet(page);await installApi(page);await signedIn(page);await prepare(page);
 await page.getByRole('button',{name:'Sign funding transaction'}).click();
 await expect(page.getByText('Transaction submitted',{exact:true})).toBeVisible();
 await expect(page.getByText('Delivery verified',{exact:true})).toHaveCount(0);
 await expect(page.getByText('50 USDC',{exact:true}).first()).toBeVisible();
});
test('provider failure creates no fabricated holdings',async({page})=>{
 await installWallet(page);await installApi(page,{walletFailure:true});await signedIn(page);
 await expect(page.getByRole('alert')).toContainText('Wallet discovery is unavailable');
 await expect(page.getByRole('button',{name:'Compare funding sources'})).toBeDisabled();
});
test('a pending approval cannot be skipped to sign funding',async({page})=>{
 await installWallet(page);await installApi(page,{pendingApproval:true});await signedIn(page);await prepare(page);
 await expect(page.getByText('Waiting for transaction confirmation.')).toBeVisible();
 await expect(page.getByRole('button',{name:'Sign funding transaction'})).toHaveCount(0);
});
test('broadcast report failures retain the hash and prevent a second send',async({page})=>{
 await installWallet(page);await installApi(page,{reportFailure:true});await signedIn(page);await prepare(page);
 await page.getByRole('button',{name:'Sign funding transaction'}).click();
 await expect(page.getByRole('button',{name:'Retry transaction report'})).toBeVisible();
 await expect(page.getByRole('button',{name:'Sign funding transaction'})).toHaveCount(0);
 await expect(page.getByRole('alert')).toContainText('Transaction report failed');
});
test('mobile layout keeps transaction controls in view',async({page})=>{
 await page.setViewportSize({width:390,height:844});await installWallet(page);await installApi(page);await signedIn(page);
 await expect(page.getByLabel('Recipient address')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
