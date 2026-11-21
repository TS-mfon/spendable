# Connect to Spendable MCP

Endpoint: https://spendable-preview-gen-daves.vercel.app/mcp. Transport: Streamable HTTP, with stateless JSON responses.

Spendable is MCP-only. HTTP wallet-proof endpoints bootstrap authentication; health and scheduler endpoints support operations. There is no payment UI, public payment REST API or browser OAuth authorization server. Use a client that can supply a bearer Authorization header.

## Prove wallet ownership

For local development, use http://127.0.0.1:3000 as the origin below. For the deployment, use the HTTPS origin shown.

1. Request a login challenge using only your public wallet address:

```bash
npm run mcp:auth -- challenge --origin https://spendable-preview-gen-daves.vercel.app --wallet YOUR_PUBLIC_WALLET_ADDRESS
```

2. Sign the returned message through the client's own wallet provider. It binds the origin, wallet, nonce and expiry, and states that it does not authorize a transaction. Save the resulting EIP-191 signature to a local file. Never provide a private key.

3. Verify the signature:

```bash
npm run mcp:auth -- verify --origin https://spendable-preview-gen-daves.vercel.app --wallet YOUR_PUBLIC_WALLET_ADDRESS --signature-file /path/to/login-signature.txt
```

The helper saves the token in .data/client-auth/session-WALLET.json with mode 600 and prints only its path and expiry. Sessions last one hour. Request and sign a fresh challenge after expiry.

Load the saved token through your MCP client's secret or environment configuration. The connection fields are:

```json
{
  "url": "https://spendable-preview-gen-daves.vercel.app/mcp",
  "headers": {
    "Authorization": "Bearer <wallet-session-token>"
  }
}
```

The placeholder is not a credential. Do not commit real tokens in client configuration. Clients that require browser OAuth login need a different connection method.

Direct wallet-proof endpoints are POST /api/auth/challenge {wallet} and POST /api/auth/verify {wallet,message,signature}. GET /api/auth/session reads the current bearer identity. POST /api/auth/logout with the bearer header revokes it. Protected-resource metadata is at /.well-known/oauth-protected-resource/mcp.

## Tool workflow

| Step | Tools | Result |
|---|---|---|
| Discover | get_capabilities, get_wallet_context | Verified identities, holdings, reference prices and execution limits |
| Interpret, when configured | interpret_request, get_interpretation | Asynchronous canonical fields to review |
| Compare | plan_payment, plan_swap, get_plan | Source spend, fees, minimum receipt, expiry, warnings and eligibility reasons |
| Prepare | prepare_action, get_action | Durable reservations and unsigned wallet steps |
| Report and verify | report_submission, get_action_status, get_receipt, get_actionable_updates | Attributed source confirmation, recipient delivery and pending work |
| Recover | recover_action | Explicit owner-signed release of an unsubmitted commitment |

Choose recipient token, network and amount meaning explicitly. Obtain token objects from discovery; do not invent contract addresses or decimals. Inspect plan warnings and candidate reasons when no route is eligible.

Planning does not move funds. Before preparation, obtain owner-approved positive maxSourceSpendAtoms and maxFeeUsd, then plan with those limits. The first bounds source-asset spending in atomic units; the second bounds fees in USD. Fiat references retain their CMC currency and price timestamp.

The wallet signs each unsigned step. Verify that the connected wallet matches transaction.from and the network matches transaction.chainId; preserve the returned calldata, value and fee bounds. Check signingExpiresAt, or quote.expiresAt, before requesting a new signature. Confirm submitted approvals before funding. Retain and report a known broadcast hash even after quote expiry. Do not retry payment automatically when the outcome is unknown.

For an unsubmitted action, derive the exact message with recoveryMessage(execution) from src/shared/recovery.ts, sign it with the owning wallet, and call recover_action with executionId, current version, signature and acknowledgeLateBroadcastRisk:true. The signature cannot cancel a transaction signed outside Spendable; known funding broadcasts or pending submitted approvals cannot use this override.

## Validation

npm run test:e2e exercises a native MCP client with synthetic payment fixtures. npm run verify:mcp checks the deployed surface, proves an ephemeral wallet identity, lists tools, reads real capabilities and revokes the session. It never authorizes funding.
