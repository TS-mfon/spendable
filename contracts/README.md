# GenLayer interpretation

The contract independently extracts canonical payment or swap fields from a bounded, redacted request. Validators rerun the same task and compare every canonical field; JSON shape alone cannot establish agreement. The contract records interpretation and never approves a wallet payment. The application still requires owner confirmation and deterministic asset, amount and spending validation.

The pinned runner is the first line of spendable_interpreter.py. The local contract passed genvm-lint check. The SDK's Bradbury registry currently reports chain 4221, RPC https://rpc-bradbury.genlayer.com and explorer https://explorer-bradbury.genlayer.com/. Network execution and faucet funding must be demonstrated separately; a successful lint or synthetic test is not that demonstration.

## Setup and deployment

Use a new application sponsor account with testnet GEN. Keep its private key in GENLAYER_SPONSOR_PRIVATE_KEY and keep user funding accounts separate. Set GENLAYER_RPC_URL to the Bradbury RPC and DATABASE_URL to the Atlas URI; production sponsorship requires MongoDB Atlas. Never send credentials in interpretation text.

1. Run npm run genlayer:deploy for a local artifact preview. This performs no signing or broadcast.
2. Run npm run genlayer:deploy -- --prepare to verify the runner schema and inspect estimated gas, fee bound, nonce and unsigned deployment.
3. After explicit owner approval of this spend, run npm run genlayer:deploy -- --submit --confirm-spend <sponsor-address>.
4. Run npm run genlayer:deploy -- --check <evm-hash>. Only FINALIZED plus FINISHED_WITH_RETURN and a matching source checksum count as deployment. Set GENLAYER_CONTRACT_ADDRESS to that verified address.
5. Submit a small interpretation through the authenticated application and record its finalized response, latency and actual sponsor gas. This still requires live acceptance.

Default bounds: 100 requests/day, 10,000,000 reserved gas units/day, 0.1 GEN maximum reserved network fees/day, 2,000,000 gas/request, 1 gwei gas price and 0.01 GEN minimum remaining balance. Override with GENLAYER_DAILY_REQUEST_LIMIT, GENLAYER_DAILY_GAS_LIMIT, GENLAYER_DAILY_SPEND_WEI, GENLAYER_MAX_GAS_PER_REQUEST, GENLAYER_MAX_GAS_PRICE_WEI and GENLAYER_MIN_BALANCE_WEI. Gas is reserved conservatively rather than refunded on RPC uncertainty. Consensus fees or changed network pricing can require a smaller workload or revised reviewed bounds.

## Recovery and privacy

Creating a request returns queued without signing. Polling drives bounded sponsor submission, EVM confirmation and GenLayer finality. The sponsor store reserves the nonce and fee bound and persists a signed hash before broadcast. Lost acknowledgements rebroadcast identical bytes; quote expiry or API failure does not create a new spend. A crash before the signed commitment is persisted keeps the reservation blocked for operator reconciliation. The structured form remains available when sponsorship is missing or exhausted.

Only redacted text, candidate network/symbol context and recipient aliases reach GenLayer. The original wallet addresses and alias mapping remain in owner-scoped application storage. On-chain text is public. Requests require explicit numeric amounts, one target network and an identified recipient for payments. Unsupported, contradictory or ambiguous requests return clarification. Candidate symbols are interpretation context; execution still requires a verified deployment identity.

Mongo durability tests run against a real local replica set. GenLayer RPC scenarios use synthetic responses and a test sponsor, with no production mock fallback. Real Bradbury interpretation, funding and actual fee measurements are outstanding until owner-authorized setup is complete.
