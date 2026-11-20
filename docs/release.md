# Spendable release acceptance

Local implementation includes live CMC/Zerion/LI.FI adapters, client-owned signing, durable MongoDB Atlas reservations and authentication, MCP/OAuth, reconciliation and receipts. Synthetic fixtures are limited to tests.

Before submission:
- Run typecheck, build, meaningful executable coverage (80% minimum), integration, browser tests and secret/dependency checks.
- Verify live provider responses and Atlas commit/isolation evidence under docs/evidence.
- Publish the repository and a public Vercel preview.
- Configure a separate bounded GenLayer Bradbury sponsor, deploy the pinned reviewed interpreter, and prove finalized interpretation. Deployment requires explicit owner authorization.
- Complete small owner-authorized wallet payments through the human and agent flows, demonstrating source confirmation and actual recipient delivery.
- Record a short truthful video and prepare the required #BuildwithCMC post with the submission link. Do not label synthetic browser fixtures as live payment evidence.

Known boundaries: L2 source fees and routed native delivery are disabled where proof/bounds are missing. Already-broadcast replacements remain unresolved until supported chain evidence determines the outcome; the app never automatically repays. Owner-signed release of unsubmitted commitments is an acknowledged override and cannot invalidate a transaction signed outside the app.
