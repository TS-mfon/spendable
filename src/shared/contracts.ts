export type Address = `0x${string}`;
export type AtomString = string;
export type DecimalString = string;
export type AssetKind = 'native' | 'erc20';
export interface AssetRef {
 readonly key:string; readonly chainId:number; readonly address:Address|null; readonly kind:AssetKind;
 readonly symbol:string; readonly name:string; readonly decimals:number; readonly cmcId:number|null;
}
export interface ChainCapability {
 readonly id:number; readonly name:string; readonly key:string; readonly rpcUrls:readonly string[];
 readonly explorerUrl:string|null; readonly nativeAsset:AssetRef;
 readonly discovery:boolean; readonly routing:boolean; readonly feeEstimation:boolean; readonly verification:boolean;
 readonly reasons:readonly string[]; readonly assets?:readonly AssetRef[];
}
export interface PriceQuote {readonly assetKey:string;readonly usd:DecimalString;readonly observedAt:string;readonly source:'cmc';readonly endpoint:string}
export interface FiatRate {readonly currency:string;readonly usdPerUnit:DecimalString;readonly observedAt:string;readonly source:'cmc'}
export interface WalletHolding {
 readonly asset:AssetRef;readonly balanceAtoms:AtomString;readonly observedAt:string;readonly blockNumber:string|null;
 readonly discoveredBy:'zerion'|'rpc';readonly warning:string|null;
}
export interface WalletContext {
 readonly wallet:Address;readonly holdings:readonly WalletHolding[];readonly chains:readonly ChainCapability[];
 readonly prices:readonly PriceQuote[];readonly rates:readonly FiatRate[];readonly observedAt:string;readonly complete:boolean;readonly warnings:readonly string[];
}
export type AmountMode='receive_token'|'receive_fiat'|'spend_token'|'spend_fiat';
export interface SpendPolicy {
 readonly maxSlippageBps:number;readonly maxPriceImpactBps:number;readonly maxSourceSpendAtoms:AtomString|null;
 readonly maxFeeUsd:DecimalString|null;readonly gasReserveAtoms:AtomString|null;
}
export interface SpendableIntent {
 readonly id:string;readonly owner:Address;readonly operation:'pay'|'swap';readonly recipient:Address;readonly targetAsset:AssetRef;
 readonly sourceAssetKey:string|null;readonly amountMode:AmountMode;readonly amount:DecimalString;readonly currency:string;
 readonly policy:SpendPolicy;readonly interpretationId:string|null;readonly createdAt:string;
}
export interface UnsignedTransaction {
 readonly chainId:number;readonly from:Address;readonly to:Address;readonly value:AtomString;readonly data:`0x${string}`;
 readonly gasLimit:AtomString;readonly maxFeePerGas:AtomString|null;readonly maxPriorityFeePerGas:AtomString|null;
 readonly gasPrice:AtomString|null;readonly nonce:number|null;
}
export interface QuoteFee {
 readonly kind:'network'|'approval'|'protocol'|'l1';readonly name:string;readonly asset:AssetRef;readonly amountAtoms:AtomString;
 readonly maxAmountAtoms:AtomString;readonly includedInInput:boolean;
}
export interface RouteQuote {
 readonly id:string;readonly provider:'lifi'|'direct';readonly owner:Address;readonly recipient:Address;
 readonly sourceAsset:AssetRef;readonly targetAsset:AssetRef;readonly fromAmountAtoms:AtomString;
 readonly toAmountAtoms:AtomString;readonly minimumOutputAtoms:AtomString;readonly fees:readonly QuoteFee[];
 readonly approvalAddress:Address|null;readonly transaction:UnsignedTransaction;readonly estimatedSeconds:number;
 readonly priceImpactBps:number|null;readonly createdAt:string;readonly expiresAt:string;
 readonly providerData:Readonly<Record<string,unknown>>;
}
export interface FundingCandidate {
 readonly id:string;readonly quote:RouteQuote;readonly totalSpendUsd:DecimalString;readonly feesUsd:DecimalString;
 readonly sourceRemainingAtoms:AtomString;readonly nativeRemainingAtoms:AtomString;readonly eligible:boolean;readonly reasons:readonly string[];
}
export interface FundingPlan {
 readonly id:string;readonly owner:Address;readonly intent:SpendableIntent;readonly version:number;
 readonly state:'quoted'|'insufficient_funds'|'unavailable';readonly candidates:readonly FundingCandidate[];
 readonly prices:readonly PriceQuote[];readonly rates:readonly FiatRate[];readonly warnings:readonly string[];
 readonly createdAt:string;readonly expiresAt:string;
}
export interface AssetDebit {readonly assetKey:string;readonly amountAtoms:AtomString;readonly observedBalanceAtoms:AtomString;readonly observedBlockNumber:string|null}
export type ExecutionState='reserved'|'awaiting_signature'|'submitted'|'source_confirmed'|'delivery_pending'|'delivered'
 |'source_reverted'|'partial_delivery'|'refunded'|'reconciliation_required'|'canceled';
export interface PreparedStep {
 readonly id:string;readonly kind:'approval_reset'|'approval'|'funding';readonly transaction:UnsignedTransaction;
 readonly submittedHash:`0x${string}`|null;readonly confirmedBlockNumber:string|null;
}
export interface Execution {
 readonly id:string;readonly owner:Address;readonly planId:string;readonly planVersion:number;readonly candidate:FundingCandidate;
 readonly intent:SpendableIntent;readonly version:number;readonly state:ExecutionState;readonly steps:readonly PreparedStep[];
 readonly debits:readonly AssetDebit[];readonly commitmentHash:string;readonly sourceHash:`0x${string}`|null;
 readonly nextCheckAt:string|null;readonly retryCount:number;readonly warnings:readonly string[];readonly receipt:DeliveryReceipt|null;
 readonly createdAt:string;readonly updatedAt:string;readonly signingExpiresAt?:string;
}
export interface DeliveryReceipt {
 readonly executionId:string;readonly outcome:'delivered'|'partial'|'refunded'|'reverted'|'unresolved';
 readonly recipient:Address;readonly asset:AssetRef;readonly requestedAtoms:AtomString;readonly receivedAtoms:AtomString;
 readonly sourceHash:string;readonly destinationHash:string|null;readonly destinationBlockHash:string|null;
 readonly destinationBlockNumber:string|null;readonly proofLevel:'onchain'|'provider'|'unverified';
 readonly routeAttribution:'lifi'|'direct'|null;readonly networkFeeAtoms:AtomString|null;readonly networkFeeAsset:AssetRef|null;
 readonly observedAt:string;readonly warnings:readonly string[];
}
export interface InterpretedFields {
 readonly operation:'pay'|'swap';readonly targetChainId:number;readonly targetSymbol:string;readonly recipientAlias:string|null;
 readonly amountMode:AmountMode;readonly amount:DecimalString;readonly currency:string;readonly sourceSymbol:string|null;
 readonly constraints:Readonly<Record<string,string>>;
}
export interface InterpretationRequest {
 readonly id:string;readonly owner:Address;readonly status:'queued'|'submitted'|'accepted'|'clarification'|'unavailable';
 readonly redactedText:string;readonly addressAliases:Readonly<Record<string,Address>>;readonly fields:InterpretedFields|null;
 readonly questions:readonly string[];readonly transactionHash:string|null;readonly contractAddress:string|null;
 readonly version:number;readonly createdAt:string;readonly updatedAt:string;readonly error:string|null;
 readonly candidateContext?:string;readonly requestDigest?:string;
}
export interface AuthPrincipal {readonly wallet:Address;readonly scopes:readonly string[];readonly clientId:string}
export interface ActionUpdate {
 readonly id:string;readonly kind:'pending_delivery'|'needs_signature'|'reconciliation_required'|'quote_expired';
 readonly title:string;readonly executionId:string|null;readonly planId:string|null;readonly observedAt:string;
}
export interface SpendableService {
 getCapabilities():Promise<readonly ChainCapability[]>;
 getWalletContext(owner:Address):Promise<WalletContext>;
 interpretRequest(owner:Address,text:string):Promise<InterpretationRequest>;
 getInterpretation(owner:Address,id:string):Promise<InterpretationRequest|null>;
 createPlan(owner:Address,input:unknown):Promise<FundingPlan>;
 getPlan(owner:Address,id:string):Promise<FundingPlan|null>;
 prepareAction(owner:Address,planId:string,candidateId:string,version:number,idempotencyKey:string,requireCaps?:boolean):Promise<Execution>;
 reportSubmission(owner:Address,executionId:string,stepId:string,hash:string,version:number):Promise<Execution>;
 getExecution(owner:Address,id:string):Promise<Execution|null>;
 recoverAction(owner:Address,id:string,version:number,signature:string,acknowledgeLateBroadcastRisk:boolean):Promise<Execution>;
 observeExecution(owner:Address,id:string):Promise<Execution>;
 getReceipt(owner:Address,id:string):Promise<DeliveryReceipt|null>;
 getActionableUpdates(owner:Address):Promise<readonly ActionUpdate[]>;
}
