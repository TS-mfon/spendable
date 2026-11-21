# Spendable MCP implementation plan

Current scope: an authenticated MCP payment-planning and receipt service for wallet-owning agents. The owner removed the UI and landing-page work. Primary track: AI Agents and Automation.

## Acceptance

- Use live CMC prices/timestamps, Zerion discovery and RPC balance checks without production mock fallback.
- Keep exact decimal/atomic amounts, explicit token/fiat modes, one funding source and bounded cost previews.
- Expose provider-discovered EVM capabilities; quote only where source fees and destination evidence are supported.
- Use isolated MongoDB Atlas in production and PGlite locally. Preserve atomic token/gas reservations, idempotency, optimistic versions and late-broadcast safety.
- Authenticate with wallet proof and owner-scoped bearer sessions. Validate tool inputs, supplied origins, scopes and rate limits.
- Expose capabilities, wallet context, interpretation, planning, preparation, reporting, reconciliation, receipts and recovery through MCP.
- Return unsigned transactions for client-owned wallets. Require explicit source and fee caps before preparation.
- Keep asynchronous GenLayer interpretation with a separately funded sponsor and a reviewed pinned contract; structured MCP planning remains usable when interpretation is unavailable.
- Remove frontend dependencies, static application assets, payment REST routes and browser OAuth flows.
- Verify unit, repository, native MCP integration and E2E boundaries with at least 80% executable coverage, typecheck and build.
- Keep secrets server-side or in private client session files. Record real provider evidence separately from fixture payment tests.

## Interfaces

createService({repository,providers,interpreter}) -> SpendableService.
createProviders(config) -> MarketProviders.
createInterpreter(config) -> Interpreter.
createRepository(databaseUrl?) -> Repository with close().
createApp({service,auth,origin,...}) -> MCP HTTP surface.
createAuth({secret,origin,databaseUrl,...}) -> Wallet proof and persistent sessions.

POST /mcp: authenticated MCP initialization, tool discovery and calls.
POST /api/auth/challenge: {wallet}.
POST /api/auth/verify: {wallet,message,signature}.
GET /api/auth/session and POST /api/auth/logout: bearer session identity/revocation.
GET /api/health: service health.
POST /api/internal/reconcile: separately authenticated bounded scheduler work.
GET /.well-known/oauth-protected-resource/mcp: bearer resource metadata.
GET /: JSON service information.
Removed application and browser OAuth paths return JSON 404.

Tool quantities are atomic integer strings or non-exponential decimal amounts. Service errors are sanitized. Network spending, contract deployment and real payment acceptance still require owner authorization.
