import test from 'node:test';import assert from 'node:assert/strict';import {describeAsset} from '../../web/model.ts';import {token} from '../../e2e/fixtures.ts';
test('verified deployments with identical symbols and chains have distinct choice labels',()=>{
 const bridged={...token,key:'8453:other-usdc',address:'0x4444444444444444444444444444444444444444' as const};
 assert.equal(describeAsset(token,[token],'Base'),'USDC on Base');
 assert.equal(describeAsset(token,[token,bridged],'Base'),'USDC on Base (0x1111…1111)');
 assert.equal(describeAsset(bridged,[token,bridged],'Base'),'USDC on Base (0x4444…4444)');
});
