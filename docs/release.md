# Spendable MCP release acceptance

Public repository: https://github.com/TS-mfon/spendable.
MCP endpoint: https://spendable-preview-gen-daves.vercel.app/mcp.

The owner changed the release to MCP-only. The UI, frontend dependencies, static application build, payment REST routes and browser OAuth endpoints are removed. Authentication uses wallet-proof bearer sessions; agents retain their own wallet signing.

## Checks

- Typecheck and backend-only build, including the compiled-entry regression that loads the API in plain Node.
- Unit/repository coverage above 80%, MCP integration and native client E2E.
- Secret scanning and dependency audit.
- Real CMC/Zerion/capability data and Atlas transaction/isolation evidence under docs/evidence.
- Live MCP surface, ephemeral wallet proof, tool discovery, real capability lookup and session revocation.
- Scheduler authentication and reconciliation.

E2E payment receipts are fixture evidence. The live verifier signs only a login message and cannot broadcast a payment. A normal-sized LI.FI quote and the specific tiny-amount rejection are checked separately from funding.

## Before submission

- Configure a separately funded GenLayer Bradbury sponsor, deploy the pinned reviewed interpreter with owner authorization, and prove finalized interpretation.
- Complete an owner-approved wallet payment through an MCP client, showing source confirmation and actual recipient delivery.
- Record the MCP workflow and prepare the required #BuildwithCMC submission post.

Known boundaries: L2 source fees and routed native delivery remain disabled where proof/bounds are missing. Unknown or replaced broadcasts remain reserved until supported evidence resolves them; there is no automatic repayment. Explicit owner recovery cannot invalidate a previously signed transaction.
