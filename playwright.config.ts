import {defineConfig} from '@playwright/test';
export default defineConfig({
 testDir:'./e2e',timeout:30000,fullyParallel:true,
 use:{baseURL:process.env.E2E_BASE_URL??'http://localhost:3000',viewport:{width:1440,height:1000},trace:'retain-on-failure'},
 webServer:process.env.E2E_BASE_URL?undefined:{command:'npm run dev',url:'http://localhost:3000',reuseExistingServer:!process.env.CI,timeout:120000},
 reporter:[['list']],outputDir:'test-results'
});
