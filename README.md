<h1 align="center">Kast</h1>

<p align="center">
  A deterministic SOL → USDC cross-chain borrow/bridge/repay loop.<br>
  <b>Deposit · Borrow · Bridge · Repay · Withdraw</b> — every step modeled as a pure FSM, verified before it touches the chain.
</p>

<p align="center">
  <a href="https://github.com/Milerius/kast-project/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/ci.yml?style=flat-square&logo=github&label=CI&branch=main" alt="CI"></a>
  <a href="https://github.com/Milerius/kast-project/actions/workflows/smoke.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/smoke.yml?style=flat-square&logo=github&label=smoke" alt="Smoke"></a>
  <a href="https://github.com/Milerius/kast-project/actions/workflows/integration.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/integration.yml?style=flat-square&logo=github&label=integration" alt="Integration"></a>
  <a href="https://github.com/Milerius/kast-project/actions/workflows/nightly.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/nightly.yml?style=flat-square&logo=github&label=nightly" alt="Nightly"></a>
  <img src="https://img.shields.io/badge/typescript-5.6-3178c6?style=flat-square&logo=typescript" alt="TypeScript 5.6">
  <img src="https://img.shields.io/badge/next.js-15-black?style=flat-square&logo=next.js" alt="Next.js 15">
  <a href="#license"><img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License: MIT"></a>
</p>

<p align="center">
  <a href="https://github.com/Milerius/kast-project/actions/workflows/ci.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/ci.yml?style=for-the-badge&label=tests&branch=main" alt="Tests"></a>
  <a href="https://github.com/Milerius/kast-project/actions/workflows/nightly.yml"><img src="https://img.shields.io/github/actions/workflow/status/Milerius/kast-project/nightly.yml?style=for-the-badge&label=property%20%2B%20mutation" alt="Property + Mutation"></a>
</p>

<p align="center">
  <b>Pure FSM · Optimistic UI · Atomic tx bundles · Property-verified transitions · Deterministic replay</b>
</p>

---

## Why Kast?

Cross-chain DeFi flows break in boring, repeatable ways: RPC caches serve stale state, wallet modals block on user input, bridges settle out-of-order, UI reducers race with chain derivations. Most teams ship a screenful of `useEffect` soup and pray.

Kast is that loop written once, with the state machine extracted and proven.

|                              | Kast                                                       | Typical DeFi frontend                               |
|------------------------------|------------------------------------------------------------|-----------------------------------------------------|
| **State model**              | Pure finite-state machine, 6 states × 8 events             | Ad-hoc booleans, `isLoading`, `hasBridged`          |
| **UI ↔ chain sync**          | `derivePositionFromChain` single source of truth           | Multiple effects, last-write-wins                   |
| **Optimistic transitions**   | Advance FSM before await, rollback on error                | Wait for receipt, blocking modal                    |
| **Verification**             | fast-check properties + Cucumber BDD + mutation testing    | Unit tests for the happy path                       |
| **Bridge settlement**        | Polled orders, persistent across reloads, resume on mount  | "Refresh the tab"                                   |
| **Adapters**                 | Swappable: Kamino/Mayan behind pure interfaces             | Direct SDK calls sprinkled through components       |
| **RPC resilience**           | 429 rate-limit tolerant, best-effort reads, never blocks UI| Overlay error on every transient failure            |
| **CI rigor**                 | 4 workflows: ci · integration · smoke · nightly mutation   | Single job, unit tests                              |

---

## Architecture

Every user action passes through the pure orchestrator, which decides whether the transition is legal, builds the on-chain transaction via adapters, and advances the UI state optimistically.

```text
                   ┌──────────────────────────────────────┐
                   │            apps/web (Next.js)         │
                   │   Privy wallets · zustand · React UI  │
                   └──────────────────┬───────────────────┘
                                      │
            ┌─────────────────────────▼──────────────────────────┐
            │                                                    │
            │   1. canFire(state, event)  → gate the button      │
            │   2. adapter.buildTx(...)   → build on-chain tx    │
            │   3. transition(state, ev)  → optimistic advance   │
            │   4. wallet.sendTransaction → user signs           │
            │   5. derivePositionFromChain on reload             │
            │                                                    │
            │   ✓ Every write is FSM-gated, chain-authoritative  │
            └─────────────────────────┬──────────────────────────┘
                                      │
              ┌───────────────────────┼───────────────────────┐
              │                       │                       │
       ┌──────▼──────┐        ┌───────▼───────┐       ┌───────▼───────┐
       │   kamino-   │        │    mayan-     │       │ orchestrator  │
       │   adapter   │        │   adapter     │       │  (pure FSM)   │
       │             │        │               │       │               │
       │ deposit /   │        │  quote /      │       │ canFire       │
       │ borrow /    │        │  buildBridge  │       │ transition    │
       │ repay /     │        │  getStatus    │       │ derive        │
       │ withdraw    │        │  SWIFT+MCTP   │       │               │
       └──────┬──────┘        └───────┬───────┘       └───────────────┘
              │                       │
       ┌──────▼──────┐        ┌───────▼────────┐
       │  Kamino     │        │  Mayan Swift   │
       │  main mkt   │        │  + relayers    │
       │ (on-chain)  │        │  Sol ↔ Base    │
       └─────────────┘        └────────────────┘
```

**Invariants enforced by the FSM:**

- **canFire gates every button** → no button is clickable in a state where the action is illegal
- **transition is total** → every (state, event) pair either produces a new state or panics in tests
- **optimistic setState + rollback** → UI reflects intent the instant the user clicks, but reverts on wallet failure
- **derive is chain-authoritative** → on reload/refocus, UI is recomputed from `(obligation, baseUsdc, pendingOrders)`, never from stale zustand
- **pending orders survive reloads** → bridge settlement is polled from `localStorage`, resumed on mount

---

## Highlights

⚡ **Pure orchestrator** — 6-state, 8-event FSM in `@kast/orchestrator`; zero IO, 23 unit tests, 5 property tests

🔒 **Optimistic UI with rollback** — `setState` fires before the Privy modal blocks, reverts on send failure; the position pill reflects intent within one render

🧱 **Atomic tx bundles** — Mayan bundles ship with ephemeral signers + placeholder blockhash; Kast rewrites the blockhash, preserves LUTs, and resigns before send

🪝 **Pending-order poller** — bridge orders persist in `localStorage`; a top-level hook polls Mayan status and advances the FSM on settlement, surviving reloads

📊 **`derivePositionFromChain`** — on mount/refocus, the UI recomputes state from the Kamino obligation + Base USDC + pending orders. No reducer drift.

🧪 **Five-layer verification** — unit (vitest) · property (fast-check) · BDD (Cucumber scenarios) · integration (live RPC) · smoke (Playwright + Docker) · mutation (Stryker, nightly)

🏗️ **Adapter pattern** — Kamino and Mayan hide behind thin interfaces (`buildDepositTx`, `quote`, `buildBridgeTx`, `getOrderStatus`); the app imports no SDKs directly

🚦 **RPC-resilient** — public Base RPC rate-limits land as `0n` fallbacks, not dev-overlay errors; Kamino `reload()` is forced between txs to dodge cached obligation state

---

## Packages

| Package                                          | Purpose                                                         | Tests |
|--------------------------------------------------|-----------------------------------------------------------------|------:|
| [`@kast/orchestrator`](packages/orchestrator/)   | Pure FSM: `transition`, `canFire`, `derivePositionFromChain`    |    23 |
| [`@kast/kamino-adapter`](packages/kamino-adapter/)| Deposit · Borrow · Repay · Withdraw tx builders (klend-sdk)     |    18 |
| [`@kast/mayan-adapter`](packages/mayan-adapter/) | Quote · BuildBridgeTx · GetOrderStatus (Swift + MCTP SDK)       |    22 |
| [`@kast/verify`](packages/verify/)               | fast-check property tests over the FSM                          |     5 |
| [`@kast/shared`](packages/shared/)               | Types, constants, chain IDs, USDC base units                    |     — |
| [`@kast/web`](apps/web/)                         | Next.js 15 App Router UI; Privy embedded wallets, zustand store |     — |
| [`scenario-tests`](scenario-tests/)              | Cucumber BDD: 6 scenarios, 34 steps, in-memory + live runners   |     6 |
| [`integration-tests`](integration-tests/)        | Live-RPC smoke of Kamino reserves + Mayan quote                 |     — |

---

## Quick Start

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install

# Privy app id is the only required env var
cp apps/web/.env.example apps/web/.env.local
# edit apps/web/.env.local → NEXT_PUBLIC_PRIVY_APP_ID=...

pnpm dev                     # Next.js dev server on :3000
```

Then open [http://localhost:3000](http://localhost:3000), log in via Privy (email or Google), fund the generated wallets, and walk the Open Position → Close Position flow.

---

## Tests

```bash
pnpm typecheck                   # all 8 workspace projects
pnpm lint                        # eslint + typed TS rules
pnpm format:check                # prettier

pnpm test                        # unit + property + BDD  (fast, no RPC)
pnpm test:unit                   # package unit tests only
pnpm test:property               # fast-check over the FSM
pnpm test:bdd                    # Cucumber scenarios

pnpm test:integration            # live mainnet reads   (needs KAST_INTEGRATION=1)
pnpm test:smoke                  # Playwright + Docker  (needs docker)
pnpm test:mutation               # Stryker (orchestrator + verify)
```

Every PR runs: `lint → typecheck → format:check → test → build`.
Nightly adds mutation testing + extended integration.

---

<details>
<summary><h2>🧪 Verification Strategy</h2></summary>

| Layer           | Tool             | What it catches                                              | Where                                   |
|-----------------|------------------|--------------------------------------------------------------|-----------------------------------------|
| **Unit**        | vitest           | Adapter shape, tx builder output, reserve decoding           | `packages/*/src/*.test.ts`              |
| **Property**    | fast-check       | FSM transition totality, illegal-event rejection, determinism| `packages/verify/src/fsm.property.test.ts`|
| **BDD**         | Cucumber         | Full user journeys: open, close, partial repay, idempotency  | `scenario-tests/features/*.feature`     |
| **Integration** | vitest + live RPC| Kamino obligation decode + Mayan quote against mainnet       | `integration-tests/`                    |
| **Smoke**       | Playwright       | Headless browser walkthrough on a Docker image               | `apps/web/tests/smoke/`                 |
| **Mutation**    | Stryker          | Mutant tests: does the suite actually catch the bugs?        | `stryker.conf.mjs` in orchestrator+verify|

**Property coverage** — the FSM is exhaustively fuzzed over random state/event sequences. fast-check asserts:
- `transition(state, event)` is total for every legal pair
- Illegal events throw (never silently noop)
- Replaying the same event tape produces identical state sequences

</details>

<details>
<summary><h2>🎯 FSM Design</h2></summary>

```ts
type PositionState =
  | 'IDLE'
  | 'DEPOSITED'
  | 'BORROWED'
  | 'BRIDGING_OUT'
  | 'ACTIVE_ON_BASE'
  | 'BRIDGING_BACK';

type Event =
  | { type: 'DEPOSIT';       lamports: bigint }
  | { type: 'BORROW';        amountUsdc: bigint }
  | { type: 'BRIDGE_OUT';    amountUsdc: bigint; orderHash: string }
  | { type: 'BRIDGE_SETTLED' }
  | { type: 'BRIDGE_REFUND' }
  | { type: 'BRIDGE_BACK';   amountUsdc: bigint; orderHash: string }
  | { type: 'REPAY';         amount: bigint | 'all' }
  | { type: 'WITHDRAW';      lamports: bigint | 'all' };

transition(state, event);     // pure: PositionState, throws IllegalTransitionError
canFire(state, event.type);   // pure: boolean — gates UI buttons
derivePositionFromChain(ctx); // pure: state from (obligation, baseUsdc, pending)
```

**Key properties:**

- **Pure functions only** — no IO, no globals, no mocks required to test
- **Reducer is total** — every legal `(state, eventType)` pair has a defined transition
- **`canFire` gates the UI** — the Deposit button is unclickable unless `canFire(state, 'DEPOSIT')`
- **Optimistic transitions** — UI calls `setState(transition(prev, ev))` *before* the await, rolls back on error
- **Chain-authoritative derive** — on page load, `derivePositionFromChain({ obligation, baseUsdc, pendingOrders })` recomputes state from the world, not from cached zustand

</details>

<details>
<summary><h2>🏛️ Design Principles</h2></summary>

1. **Pure core, impure shell** — the orchestrator never imports web3, viem, or React; every IO lives in `apps/web` or the adapters
2. **FSM before UI** — the state model was proven with fast-check before a single component was styled
3. **Optimistic by default** — the Privy Solana modal doesn't resolve until the user dismisses it; advance state immediately, rollback on error
4. **Adapters are interfaces, not classes** — `KaminoAdapter` and `MayanAdapter` are plain objects of pure async functions, easy to mock
5. **Derive state from chain** — zustand holds transient UI intent; every reload recomputes from the obligation + Base USDC + pending orders
6. **Tests are contracts, not ceremony** — property tests prove FSM invariants; BDD proves user journeys; smoke proves the build serves; mutation proves the tests actually catch bugs

</details>

<details>
<summary><h2>📋 Project Status</h2></summary>

**Shipped:**
- Deposit SOL collateral on Kamino main market
- Borrow 5 USDC against SOL
- Bridge USDC Solana → Base via Mayan (SWIFT / FAST_MCTP)
- Bridge USDC Base → Solana via Mayan
- Full repay + partial repay (bonus)
- Withdraw all collateral
- Privy embedded wallets — Solana + EVM, auto-created on first login (bonus)
- Optimistic FSM transitions with rollback
- Pending-order persistence + background poller
- Full test stack: unit · property · BDD · integration · smoke · mutation
- 4-workflow CI: `ci` · `integration` · `smoke` · `nightly`
- Vercel production deploy

**Deferred (future work):**
- Collateral adjustment flow — add/withdraw without closing the position (bonus #3)
- Position health monitoring + LTV warnings
- Base gas sponsorship via Privy paymaster
- Multi-position support
- User-facing slippage controls
- Formal model (TLA+/Quint) — fast-check is the current TS-native analogue
- Live BDD step definitions against real mainnet

See [`docs/PROGRESS.md`](docs/PROGRESS.md) for the full tracking.

</details>

<details>
<summary><h2>📂 Docs</h2></summary>

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Mermaid diagrams for repo layout, component map, data flow, tx bundles
- [`docs/AI_ORCHESTRATION.md`](docs/AI_ORCHESTRATION.md) — how Claude agents were used to plan, implement, and verify
- [`docs/TIME_LOG.md`](docs/TIME_LOG.md) — hour-by-hour build log
- [`docs/PROGRESS.md`](docs/PROGRESS.md) — shipped vs deferred
- [`docs/superpowers/specs/2026-04-20-kast-defi-design.md`](docs/superpowers/specs/2026-04-20-kast-defi-design.md) — design RFC: goals, non-goals, trade-offs
- [`docs/superpowers/plans/2026-04-20-kast-defi-implementation.md`](docs/superpowers/plans/2026-04-20-kast-defi-implementation.md) — implementation plan

</details>

---

## License

MIT
