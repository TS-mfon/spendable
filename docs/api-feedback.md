# CoinMarketCap API feedback

Confirmed with the configured campaign key on 2026-11-19 UTC:

- /v3/cryptocurrency/quotes/latest returns data as an asset array, and each quote is a conversion array identified by symbol and fiat ID. The earlier ID-keyed v2 examples cannot be reused directly. Spendable joins by stable IDs and currency symbols, with a regression fixture matching the real v3 shape.
- status.error_code was the string "0" on a successful live response. The boundary explicitly accepts numeric/string zero while rejecting other codes.
- Multi-currency pricing lets token receipt amounts and fiat-reference budgets share a timestamped valuation. It does not guarantee the fiat value at settlement.
- CMC deployment metadata must be joined to provider chain names and exact contract addresses; the CMC platform ID is not an EVM chain ID.
- Metadata can establish a market identity while execution still lacks bounded fees or destination evidence. Spendable exposes those capability gaps explicitly.

Evidence is in evidence/live-providers.json. No unsupported endpoint access or historical coverage is claimed. Remaining feedback should be added only after actual provider responses reproduce it.
