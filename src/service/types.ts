import type {Repository,MarketProviders,Interpreter} from '../shared/ports.ts';
export interface Dependencies {readonly repository:Repository;readonly providers:MarketProviders;readonly interpreter:Interpreter}
