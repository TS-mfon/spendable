import {test,expect} from '@playwright/test';
import {installWallet} from './fixtures.ts';
import {installApi} from './api-fixture.ts';
test('wallet account changes clear private context and require a fresh sign-in',async({page})=>{
 await installWallet(page);await installApi(page);await page.goto('/');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();await expect(page.getByRole('button',{name:'Sign out',exact:true})).toBeVisible();
 await page.evaluate(()=>{(window as unknown as {changeTestWallet:(wallet:string)=>void}).changeTestWallet('0x4444444444444444444444444444444444444444');});
 await expect(page.getByRole('button',{name:'Connect wallet',exact:true})).toBeVisible();
 await expect(page.getByRole('alert')).toContainText('wallet changed');
 await expect(page.getByRole('button',{name:'Compare funding sources'})).toBeDisabled();
});
test('agent access requires explicit named-client consent after wallet sign-in',async({page})=>{
 await installWallet(page);await installApi(page);
 await page.route('**/api/oauth/authorize**',async route=>{
  if(route.request().method()==='GET')return route.fulfill({json:{success:true,data:{clientName:'Test agent',clientId:'test-client',redirectUri:'http://localhost:3000/oauth/callback',scope:'wallet:read plan:write'},error:null}});
  expect(route.request().postDataJSON().approved).toBe(true);
  return route.fulfill({json:{success:true,data:{redirectUrl:'http://localhost:3000/oauth/callback?code=test-code'},error:null}});
 });
 await page.route('**/oauth/callback?code=test-code',route=>route.fulfill({contentType:'text/html',body:'<p>Test callback received</p>'}));
 await page.goto('/oauth/authorize?client_id=test-client&redirect_uri=http%3A%2F%2Flocalhost%3A3000%2Foauth%2Fcallback&code_challenge=test-challenge&code_challenge_method=S256&response_type=code');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.getByRole('heading',{name:'Test agent requests access'})).toBeVisible();
 await expect(page.getByText('wallet:read plan:write',{exact:true})).toBeVisible();
 await page.getByRole('button',{name:'Allow agent access'}).click();
 await expect(page.getByText('Test callback received')).toBeVisible();
});
test('desktop and mobile payment views render without horizontal overflow',async({page})=>{
 await installWallet(page);await installApi(page);await page.goto('/');
 await page.getByRole('button',{name:'Connect wallet',exact:true}).click();
 await expect(page.getByText('100',{exact:true})).toBeVisible();
 await page.screenshot({path:'test-results/spendable-desktop.png',fullPage:true});
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:'test-results/spendable-mobile.png',fullPage:true});
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
});
