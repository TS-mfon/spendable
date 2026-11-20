import type { Address, AssetRef, ChainCapability, WalletContext, SpendableIntent, RouteQuote, Execution, DeliveryReceipt, InterpretationRequest, FundingPlan, AssetDebit } from './contracts.ts';
export interface QuoteRequest { readonly intent:SpendableIntent; readonly source:AssetRef; readonly fromAmountAtoms:string; readonly targetAmountAtoms:string|null; }
export interface MarketProviders {
 resolveAsset?(asset:AssetRef):Promise<AssetRef>;
 prices?(assets:readonly AssetRef[]):Promise<{prices:readonly import('./contracts.ts').PriceQuote[];rates:readonly import('./contracts.ts').FiatRate[]}>;
 capabilities():Promise<readonly ChainCapability[]>;
 wallet(owner:Address):Promise<WalletContext>;
 quote(input:QuoteRequest):Promise<RouteQuote>;
 refreshBalance(owner:Address,asset:AssetRef):Promise<{balanceAtoms:string;blockNumber:string|null}>;
 prepareSteps(quote:RouteQuote):Promise<Execution['steps']>;
 validateSubmission(execution:Execution,stepId:string,hash:string):Promise<void>;
 reconcile(execution:Execution):Promise<{state:Execution['state'];receipt:DeliveryReceipt|null;warnings:readonly string[];steps?:Execution['steps']}>;
}
export interface Interpreter {
 request(owner:Address,text:string):Promise<InterpretationRequest>;
 poll(request:InterpretationRequest):Promise<InterpretationRequest>;
}
export interface Repository {
 findByIdempotency?(owner:Address,key:string):Promise<Execution|null>;
 claimExecution?(owner:Address,id:string,leaseMs?:number):Promise<string|null>;
 close():Promise<void>;
 claimDue?(limit:number,now?:number,leaseMs?:number):Promise<readonly {execution:Execution;leaseToken:string}[]>;
 releaseLease?(id:string,token:string):Promise<void>;
 putPlan(plan:FundingPlan):Promise<void>;
 getPlan(owner:Address,id:string):Promise<FundingPlan|null>;
 putInterpretation(request:InterpretationRequest):Promise<void>;
 getInterpretation(owner:Address,id:string):Promise<InterpretationRequest|null>;
 reserve(execution:Execution,key:string):Promise<Execution>;
 getExecution(owner:Address,id:string):Promise<Execution|null>;
 updateExecution(execution:Execution,expectedVersion:number):Promise<Execution>;
 listExecutions(owner:Address):Promise<readonly Execution[]>;
 reserved(owner:Address):Promise<readonly AssetDebit[]>;
 due(limit:number):Promise<readonly Execution[]>;
}
