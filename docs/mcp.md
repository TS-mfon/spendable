# Connect an agent

Spendable exposes authenticated Streamable HTTP MCP at /mcp. OAuth metadata is available at /.well-known/oauth-authorization-server and /.well-known/oauth-protected-resource/mcp.

Register an HTTPS or loopback redirect, use PKCE S256, and obtain explicit wallet-owner consent in the browser. Tokens are scoped to that owner; agents cannot grant further consent. An agent preparing funding must provide positive maxSourceSpendAtoms and maxFeeUsd. Signing stays in the client's own wallet provider.

Tools: get_wallet_context, interpret_request, get_interpretation, plan_payment, plan_swap, prepare_action, report_submission, get_action_status, get_receipt, get_actionable_updates and recover_action.

Token quantities are plain atomic integer strings on the wire. Fiat reference amounts retain their CMC currency and price timestamp. Check signingExpiresAt (or quote.expiresAt) before opening a new wallet signature. Quote expiry cannot revoke a signed transaction: always retain/report a known broadcast hash and reconcile it.

For recovery of an unsubmitted action, derive the exact canonical message using recoveryMessage(execution) from src/shared/recovery.ts, sign it with the funding wallet, and call recover_action with executionId, current version, signature and acknowledgeLateBroadcastRisk:true. This is an explicit owner acknowledgement, not proof that a signed transaction was canceled. Known funding broadcasts and pending submitted approvals cannot use this override.
