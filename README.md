# Spendable MCP

Plan a crypto payment from assets your wallet already holds, then verify what reached the recipient. Spendable is an authenticated MCP server for wallet-owning agents, built for the CMC **AI Agents and Automation** track.

An agent can ask for USDC on Base, compare funding sources using live CoinMarketCap prices, review a LI.FI or direct-transfer quote, and receive unsigned transactions. The client wallet approves and signs. Spendable reserves balances, checks reported hashes, reconciles delivery and produces a receipt.

**Remote MCP endpoint:** https://spendable-preview-gen-daves.vercel.app/mcp

## Connect

Use an MCP client that supports Streamable HTTP and an Authorization header. Prove wallet ownership with a login signature and load the resulting bearer token into the client. Browser OAuth and the payment UI have been removed.

The [connection guide](docs/mcp.md) includes the wallet-proof commands, client settings and tool workflow. Never send Spendable a wallet private key.

## Run locally

Use Node 24 or newer.

```bash
npm ci
npm run setup:secrets
APP_ORIGIN=http://127.0.0.1:3000 npm run dev
```

Connect to http://127.0.0.1:3000/mcp. The root returns JSON service information. Setup imports only named application credentials from ../cmc.env, excludes wallet funding keys, and saves .env.local with mode 600.

Local state uses PostgreSQL-compatible PGlite in .data. Production uses the isolated MongoDB Atlas database, persistent authentication secrets and server-only CMC/Zerion keys.

## Tools and safeguards

- Read supported networks, verified assets, wallet holdings and CMC reference prices.
- Compare payment or swap plans from one source asset on one network.
- Distinguish token receipts, fiat-reference receipts, source-token spending and all-in fiat budgets.
- Require positive source-spending and fee caps before preparing an agent action.
- Return bounded unsigned steps; client wallets retain signing authority.
- Keep atomic source/gas reservations through uncertain broadcasts, with owner-scoped idempotency and recovery.
- Check source confirmation and recipient delivery separately.
- Offer asynchronous GenLayer interpretation when a separate sponsor and reviewed contract are configured. Live sponsorship/deployment is still pending.

A very small cross-chain receipt can be below a provider route minimum. LI.FI's observed rejection of 0.0001 USDC is explained explicitly; no arbitrary minimum is assumed. Transaction hex quantities are normalized separately from decimal token amounts.

## Verify

```bash
npm run typecheck
npm run build
npm run test:coverage
npm run test:integration
npm run test:e2e
npm run check:secrets
npm run verify:live
npm run verify:mcp
```

E2E uses a native MCP client, an ephemeral wallet login signature and fixture payment evidence. Live MCP verification signs only a login message, reads real capabilities and revokes the session; it cannot sign a payment. These checks do not establish that a real payment was made.

See [implementation plan](docs/implementation-plan.md), [provider endpoints](docs/endpoints.md), [API feedback](docs/api-feedback.md), [database setup](docs/database.md) and [release acceptance](docs/release.md).
