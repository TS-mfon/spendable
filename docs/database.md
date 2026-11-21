# Spendable database

Production storage uses MongoDB Atlas. Local PGlite remains supported for development and tests.

The Atlas organization rejected another M0 deployment because it already has ten free clusters. The owner approved using an existing cluster. Spendable uses its own database named spendable on Project 0 / Cluster0, with a separate spendable-app user restricted to readWrite on spendable and scoped to Cluster0. Other application databases are outside that role.

The user password and connection URI are stored only in .data/atlas-user.json and .env.local with mode600, both ignored by Git. Provider and wallet funding credentials are never placed in database setup command arguments.

Collections are separated by responsibility: immutable plans and interpretations, owner-scoped executions/guards/leases, authentication and legacy OAuth records, and sponsor commitments. The active MCP-only release does not expose browser OAuth; existing records are retained without modifying other application data. Execution reservations and sponsor budgets use snapshot transactions with majority commit; token quantities remain integer strings. Guards serialize competing owner updates before balance/quota snapshots. Auth nonces and OAuth codes consume atomically, and expiry indexes clean transient records.

The shared connector forces TLS for Atlas. Plaintext is allowed only for NODE_ENV=test with every host restricted to loopback, for an ephemeral replica-set test.

Run npm run db:migrate after private connection setup to verify indexes and schemas. Unit/provider fixtures are separate from live Atlas acceptance. The free cluster has no managed backup enabled; before adding irreplaceable production state, choose and test an export/restore policy.
