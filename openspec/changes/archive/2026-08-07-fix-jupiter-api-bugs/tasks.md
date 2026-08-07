## 1. Fix Unit Mismatch in Chaos Mode

- [x] 1.1 Modify `live-strategy-executor.ts` to fetch real wallet balance via `dex.getBalance()` instead of using `CHAOS_INITIAL_CAPITAL_LAMPORTS`
- [x] 1.2 Update `executeSignal()` to calculate swap amounts as `(realBalance * 0.1) / price` (10% of actual balance)
- [x] 1.3 Add minimum trade size check: skip trades where swap amount < 1 USDC
- [x] 1.4 Add logging to show real balance and calculated swap amount

## 2. Fix Route Format in Jupiter Adapter

- [x] 2.1 Update `Quote` interface in `dex-adapter.ts` to include `routePlan: any[]`
- [x] 2.2 Modify `quote()` method to preserve `routePlan` array from Jupiter response
- [x] 2.3 Update `swap()` method to send `routePlan` array instead of `route` string
- [x] 2.4 Remove the string conversion logic in `quote()` that converts array to `"amm1 → amm2"` format

## 3. Fix Devnet Default

- [x] 3.1 Change `createSolanaConfig()` default from `devnet` to `mainnet-beta`
- [x] 3.2 Add logging to show which network is being used on startup
- [x] 3.3 Verify `SOLANA_NETWORK` environment variable is respected

## 4. Integration Testing

- [ ] 4.1 Test chaos mode on testnet (if possible) to verify fixes work
- [ ] 4.2 Verify swap amounts are calculated correctly from real balance
- [ ] 4.3 Verify routePlan is preserved and sent correctly to Jupiter
- [ ] 4.4 Verify mainnet is used when `SOLANA_NETWORK` is not set
