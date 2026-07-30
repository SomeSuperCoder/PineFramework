## 1. Backend: Balance Endpoint

- [x] 1.1 Add `GET /api/bot/wallet/balance` endpoint in `bot.ts`
- [x] 1.2 Use `@solana/web3.js` Connection to query USDC token accounts
- [x] 1.3 Return `{ success: true, balance: <number> }` or error

## 2. Frontend: Balance Fetch

- [x] 2.1 Add `fetchUsdcBalance(publicKey)` function in `TradingBotPanel.tsx`
- [x] 2.2 Call balance endpoint after successful wallet import
- [x] 2.3 Show loading state while fetching

## 3. Frontend: Display Balance

- [x] 3.1 Add balance to wallet status display area
- [x] 3.2 Format balance with 2 decimal places and comma separators

## 4. Verify

- [x] 4.1 Test: Import wallet, verify USDC balance is shown
- [x] 4.2 Test: Wallet with no USDC shows "0.00"
