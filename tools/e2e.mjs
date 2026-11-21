import {runTests} from './db-test.mjs';
process.exitCode=await runTests(['e2e/mcp.test.ts']);
