# Spendable

Plan a payment or swap from crypto you already own. Compare one-source funding plans using live CoinMarketCap prices, sign in your own wallet, and check the recipient’s actual delivery.

Built for the CMC **AI Agents and Automation** track. People and authenticated MCP agents use the same planning, reservation and receipt service.

## Run locally

Use Node 24 or newer.

```bash
npm ci
npm run setup:secrets
npm run dev
```

Open http://localhost:3000 with an EVM browser wallet. Setup imports only named app credentials from ../cmc.env; it excludes wallet funding keys and saves .env.local with mode 600. Missing provider data produces an explicit unavailable result. The runtime uses live providers; synthetic fixtures live in tests.

Local state persists in .data using PostgreSQL-compatible PGlite. Production uses DATABASE_URL for the isolated MongoDB Atlas database, HTTPS APP_ORIGIN, a persistent SESSION_SECRET and server CMC/Zerion keys. GenLayer also requires a deployed reviewed contract and separately funded sponsor.

## What the app does

- Discover verified majors and stablecoins across provider-supported EVM chains.
- Distinguish token quantities, fiat-reference receipt amounts and all-in spending budgets.
- Compare minimum receipt, source spend and bounded fees without combining separate holdings.
- Prepare client-signed direct transfers or LI.FI routes where the capability matrix supports fees and proof.
- Keep atomic source and gas reservations, including unresolved or late broadcasts.
- Verify destination token, recipient and minimum amount before marking delivery complete.
- Interpret requests asynchronously through GenLayer when sponsorship is configured; retain an editable structured form.
- Expose authenticated MCP tools with wallet consent, OAuth PKCE and explicit agent spending caps.

The chain matrix separates discovery, routing, fee coverage and verification. An advertised network does not imply every action is executable.

## Verify

```bash
npm run typecheck
npm run build
npm run test:coverage
npm run test:integration
npm run test:e2e
npm run check:secrets
npm run verify:live
```

Live responses are recorded with public market fields in [docs/evidence/live-providers.json](docs/evidence/live-providers.json). Tests do not establish that a real payment was made.

See [implementation plan](docs/implementation-plan.md), [API manifest](docs/endpoints.md), [API feedback](docs/api-feedback.md) [database setup](docs/database.md) and [release acceptance](docs/release.md). The seven separate project ideas remain in ../idea.md.
