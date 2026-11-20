import type {Execution} from './contracts.ts';
export function recoveryMessage(execution:Execution):string {
 return [
  'Spendable: release an unbroadcast funding commitment',
  'Wallet: '+execution.owner.toLowerCase(),
  'Action: '+execution.id,
  'Network: '+execution.candidate.quote.sourceAsset.chainId,
  'Version: '+execution.version,
  'Commitment: '+execution.commitmentHash,
  '',
  'I confirm that no unsubmitted transaction for this action, including approvals and funding, was signed or broadcast.',
  'I request release of its Spendable reservations.',
  'I understand that this does not invalidate a previously signed transaction and that a late broadcast may still spend my funds.'
 ].join('\n');
}
