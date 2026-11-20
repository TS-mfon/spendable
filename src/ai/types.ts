import type { Address, InterpretationRequest } from '../shared/contracts.ts';
export interface CandidateAsset {readonly chainId:number;readonly chainName:string;readonly symbol:string}
export interface ConsensusSubmission {readonly id:string;readonly text:string;readonly context:string;readonly digest:string}
export interface ConsensusStatus {
 readonly status:'pending'|'finalized'|'failed';
 readonly execution:'pending'|'success'|'error';
 readonly result:unknown;
}
export interface GenLayerTransport {
 submit(request:ConsensusSubmission):Promise<{hash:string}>;
 status(hash:string,request:ConsensusSubmission):Promise<ConsensusStatus>;
 close?():Promise<void>;
}
export interface InterpreterConfig {
 readonly genlayerRpcUrl?:string;readonly genlayerContractAddress?:string;readonly genlayerSponsorPrivateKey?:string;
 readonly databaseUrl?:string;readonly env?:Readonly<Record<string,string|undefined>>;
 readonly candidateAssets?:readonly CandidateAsset[];readonly transport?:GenLayerTransport;
 readonly now?:()=>number;readonly id?:()=>string;
}
export type BoundRequest=InterpretationRequest & {readonly candidateContext?:string;readonly requestDigest?:string};
