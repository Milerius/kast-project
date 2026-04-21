# Progress & Future Work

## Shipped
- [x] Deposit SOL collateral on Kamino
- [x] Borrow 5 USDC
- [x] Bridge USDC Solana → Base via Mayan
- [x] Bridge USDC Base → Solana via Mayan
- [x] Full repay
- [x] Partial repay (bonus #2)
- [x] Withdraw all collateral
- [x] Privy embedded wallets (bonus #1)
- [x] Full test stack (unit, property, BDD, integration, smoke, mutation)
- [x] 4-workflow CI with SHA-pinned actions
- [x] Vercel deployment

## Deferred (future work)
- [ ] Bonus #3: collateral adjustment flow (add/withdraw without closing)
- [ ] Position health monitoring + LTV warnings
- [ ] Base gas sponsorship (Privy paymaster)
- [ ] Multi-position support
- [ ] Sentry / structured telemetry
- [ ] User-facing slippage controls
- [ ] Formal model (TLA+/Quint) — fast-check property tests are the TS-native analogue used here
- [ ] Live BDD step defs (currently placeholder) against real mainnet
