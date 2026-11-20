import type {Address,AssetRef,InterpretationRequest} from '../src/shared/contracts.ts';
import type {ComposeFields} from './model.ts';
const allowed=new Set(['maxSourceSpendAtoms','maxPriceImpactBps','gasReserveAtoms','maxFeeUsd','maxSlippageBps']);
export function applyInterpretationFields(request:InterpretationRequest,assets:readonly AssetRef[],current:ComposeFields,owner:Address):{fields:ComposeFields;targetKey:string}{
 const f=request.fields;
 if(request.status!=='accepted'||!f)throw new Error('Wait for an accepted interpretation before using its fields.');
 if(Object.keys(f.constraints).some(key=>!allowed.has(key)))throw new Error('This request contains an unsupported spending limit. Use the structured form to review it.');
 const targets=assets.filter(a=>a.chainId===f.targetChainId&&a.symbol===f.targetSymbol);
 if(targets.length!==1)throw new Error('Choose one verified destination token and network for this request.');
 const recipient=f.operation==='swap'?owner:request.addressAliases[f.recipientAlias??''];
 if(!recipient)throw new Error('Add the complete recipient address before comparing sources.');
 let sources=f.sourceSymbol?assets.filter(a=>a.symbol===f.sourceSymbol):[];
 if(sources.length>1&&current.sourceAssetKey)sources=sources.filter(a=>a.key===current.sourceAssetKey);
 if(f.sourceSymbol&&sources.length!==1)throw new Error('Choose the source asset and network explicitly.');
 if(f.constraints.maxSourceSpendAtoms&&sources.length!==1)throw new Error('A source-token spending cap needs one explicit source asset.');
 return {targetKey:targets[0].key,fields:{...current,operation:f.operation,recipient,amount:f.amount,amountMode:f.amountMode,currency:f.currency,sourceAssetKey:sources[0]?.key??'',maxFeeUsd:f.constraints.maxFeeUsd??current.maxFeeUsd,maxSlippageBps:f.constraints.maxSlippageBps??current.maxSlippageBps,maxSourceSpendAtoms:f.constraints.maxSourceSpendAtoms??null,maxPriceImpactBps:f.constraints.maxPriceImpactBps??'300',gasReserveAtoms:f.constraints.gasReserveAtoms??null}};
}
