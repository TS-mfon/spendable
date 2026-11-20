import {randomBytes} from 'node:crypto';
export function testSessionSecret():string{return randomBytes(32).toString('hex');}
