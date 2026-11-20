# Spendable implementation plan
Build a live, client-signed crypto payment planner for humans and wallet-owning agents. Primary track: AI Agents and Automation. No RWA integrations.

## Acceptance
- CMC live reference prices and timestamps, Zerion wallet discovery and RPC balance checks; no production mock fallback.
- Explicit token/fiat amount modes, exact decimal arithmetic, one funding source, all cost previews.
- Provider-discovered EVM capability matrix; direct ERC-20/native sends and LI.FI routes only where bounded fees and delivery evidence are available.
- Production MongoDB Atlas (user amendment); local PGlite remains available. Durable plans, atomic token plus gas reservations, optimistic versions, idempotency, no release of signing-unknown funds at quote expiry.
- Wallet signature authentication; REST and MCP share service, owner authorization, input validation and rate limits.
- GenLayer interpretation is asynchronous, consensus-validated and clarification-first; deterministic structured form stays usable when sponsorship is unavailable.
- Accessible responsive wallet/payment interface, preparation and wallet signing, action status and receipt.
- Server-only credentials, local CMC import, no wallet funding keys imported, explicit endpoints, API feedback and demo docs.
- Tests at the shared public service, provider, repository, auth/MCP and UI boundaries; unit + integration + E2E, at least 80% coverage, build and typecheck.
- Real provider verification recorded separately from synthetic test fixtures; on-chain spending/deployment requires explicit authorization.

## Contracts and ownership
Shared contracts: src/shared/contracts.ts and ports.ts, owned by integration driver.
Core worker: src/domain/**, src/storage/**, src/service/**, tests/domain/**, tests/storage/**.
Providers worker: src/providers/**, tests/providers/**.
GenLayer worker: src/ai/**, contracts/**, tests/ai/**, tools/deploy-genlayer.ts.
Auth/API/MCP worker: src/auth/**, src/http/**, src/mcp/**, tests/auth/**, tests/mcp/**.
UI worker: web/**, tests/ui/**, e2e/**, playwright.config.ts.
Driver: tooling, configuration, documentation, API entrypoints, integration tests, live checks.

## Interfaces
createService({repository, providers, interpreter}) -> SpendableService.
createProviders(config) -> MarketProviders.
createInterpreter(config) -> Interpreter.
createRepository(databaseUrl?) -> Repository with close().
createApp({service, auth, origin, ...}) -> Express app; createAuth({secret,origin,repository?}).
POST /api/auth/challenge {wallet}; POST /api/auth/verify {wallet,message,signature}.
GET /api/capabilities; GET /api/wallet; POST /api/interpretations {text}; GET /api/interpretations/:id.
POST /api/plans canonical intent; GET /api/plans/:id.
POST /api/actions {planId,candidateId,version,idempotencyKey}.
POST /api/actions/:id/submissions {stepId,hash,version}.
GET /api/actions/:id; POST /api/actions/:id/observe; GET /api/actions/:id/receipt; GET /api/updates.
All responses {success,data,error}; browser cookie authentication, bearer wallet sessions for MCP.
Units are strings of atomic integers or non-exponential decimal amounts. Provider errors are explicit and sanitized. External responses validated at boundaries.
