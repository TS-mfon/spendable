# API manifest

Runtime endpoints currently used:

| Provider | Endpoint | Purpose |
|---|---|---|
| CMC | GET /v3/cryptocurrency/quotes/latest | ID-based USD/EUR/NGN prices and fiat-reference rates |
| CMC | GET /v2/cryptocurrency/info | Contract deployments for WETH, WBTC, USDC, USDT and DAI |
| Zerion | GET /v1/chains/ | Supported discovery networks |
| Zerion | GET /v1/wallets/{address}/positions/ | Simple directly held token balances |
| LI.FI | GET /v1/chains | EVM capability discovery |
| LI.FI | GET /v1/tokens | Contract identity/decimals join |
| LI.FI | GET /v1/quote | Exact source-input routing |
| LI.FI | GET /v1/quote/toAmount | Minimum target-amount routing |
| LI.FI | GET /v1/status | Route attribution and destination transaction discovery |
| EVM RPC | eth_call, eth_getBalance, eth_getTransactionCount | Token balance/decimals/allowance, native gas, nonce |
| EVM RPC | eth_estimateGas, eth_gasPrice, eth_getTransactionReceipt, eth_getTransactionByHash | Bounded fees and committed transaction/delivery checks |
| GenLayer RPC | Contract submission/status/read | Async consensus interpretation with bounded sponsorship |

CMC metadata caches for 24 hours, market prices for 60 seconds. Execution quotes are requested on demand. CMC multi-conversion values retain provider timestamps; missing or stale prices are rejected. Provider USD valuations do not replace CMC values.

The v3 CMC live response has asset arrays and conversion arrays; joins use asset.id and conversion.symbol. EVM chain IDs and CMC platform IDs are separate namespaces.

MCP exposes capabilities, wallet context, interpretation/polling, payment/swap planning, saved plans/actions, preparation, submission, status, receipts, updates and recovery. Wallet-proof bearer sessions are owner scoped and agent preparation requires explicit source/fee caps. HTTP supports authentication, resource discovery, health and reconciliation; the payment REST API and browser OAuth flow are removed.
