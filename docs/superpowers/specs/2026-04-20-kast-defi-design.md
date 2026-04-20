# RFC: KAST DeFi Lead Assignment — Technical Design

- **Status**: Draft — pending approval
- **Author**: milerius
- **Date**: 2026-04-20
- **Timebox**: 3–6 hours (per assignment)
- **Related**: `docs/ARCHITECTURE.md` (diagrams), `docs/DeFi Lead Assignment.pdf` (original brief), `docs/kast_defi_execution_plan.md` (early sketch, now superseded by this RFC)

---

## 1. Context & Problem

KAST has set a test assignment for an Engineering Lead (DeFi & Crypto). The task is to build a minimal end-to-end DeFi flow:

1. Deposit SOL as collateral on Kamino (main market)
2. Borrow USDC against the collateral
3. Bridge the USDC to Base via Mayan, held in a separate Base wallet
4. Close the position: bridge USDC back to Solana, repay the loan in full, withdraw collateral

Fixed parameters: ~$20 SOL collateral, $5 USDC borrow, Solana + Base only, Mayan for bridging, slippage/fees not graded.

The assignment is explicit: the deliverable is a **working happy-path**, the sub-text is that *AI agent orchestration* is graded as heavily as the product itself. Candidates are evaluated on depth of integration and discipline of methodology, not on surface-area of features.

Deliverables listed in the brief: git repo, AI tooling writeup, time log, video walkthrough, scoping discussion.

## 2. Goals

- **G1** — Deposit SOL collateral on Kamino main market, sign with a Privy-provisioned Solana wallet, confirm on-chain.
- **G2** — Borrow 5 USDC against the Kamino obligation, confirm on-chain.
- **G3** — Bridge the 5 USDC from Solana to Base via Mayan, delivered to a separate Privy-provisioned Base (EVM) wallet.
- **G4** — Close flow: bridge USDC back from Base to Solana via Mayan, repay the Kamino loan, withdraw the SOL collateral.
- **G5** — Implement **bonus #2: user-defined partial repayment** alongside full repayment.
- **G6** — Ship on Vercel with a minimal but functional UI.
- **G7** — Demonstrate lead-level discipline through tests (TDD/BDD), documentation, CI, and AI-agent orchestration.

## 3. Non-Goals (with Rationale)

Every item below is **intentionally excluded**. Each is labelled with why, so reviewers understand this is deliberate scope control, not omission.

### 3.1 Not building: production-grade error handling / retries / backoff
**Rationale.** The brief says edge cases, error handling, and production security are *secondary*. Adding retry/backoff wrappers around adapter calls would consume 30–60 min and contribute nothing to the graded deliverable (a working happy path). A failed tx surfaces the error to the user; they retry manually. This is an honest minimum for a 3–6 hour timebox.

### 3.2 Not building: persistent server state / database
**Rationale.** Position state is derivable from on-chain sources (Kamino obligation account + Base wallet USDC balance) **plus a minimal client-side cache of in-flight Mayan order IDs** (see §8.2 Persistence). Mayan bridge state is off-chain; on page refresh we cannot reconstruct a pending order from on-chain data alone, so we keep `{ orderHash, direction, amountUsdc, startedAt }` entries in `localStorage` until the order reaches a terminal status. No server DB, no user accounts, no migration story. Settled positions are re-derived from chain on every mount.

### 3.3 Not building: generic swap router / multi-protocol abstraction
**Rationale.** Two adapters (Kamino, Mayan), two protocols. A generic "Lender" or "Bridge" interface would be pure speculation about a future requirement that does not exist. YAGNI. If a second lender or bridge is ever added, the abstraction can be extracted from two concrete implementations — never invented from one.

### 3.4 Not building: caching layer / RPC pooling / request dedup
**Rationale.** The app makes on the order of 20–50 RPC calls per full open+close flow (reads, tx sends, confirmation polling, bridge-status polling, balance refreshes). A free-tier Helius endpoint and the Base public RPC handle this trivially. A caching layer buys nothing at this volume and adds a consistency bug class.

### 3.5 Not building: multi-user support / auth beyond Privy
**Rationale.** The brief scopes "a user" (singular). Privy handles session + wallet; no additional auth layer is needed. Multi-tenant concerns (rate limiting, per-user quotas, ACLs) are explicitly out of scope.

### 3.6 Not building: production error telemetry (Sentry, Datadog, etc.)
**Rationale.** Secondary per the brief. The `ActivityLog` component writes all tx signatures + bridge order hashes inline; this is enough to reconstruct any failure during the video walkthrough. Telemetry wiring is > 30 min of work for zero grading impact.

### 3.7 Not building: i18n, theming, mobile polish, design system
**Rationale.** The brief says UI/UX is secondary. Tailwind + `shadcn/ui` default tokens are enough. One screen, desktop-first, English-only.

### 3.8 Not building: user-facing slippage / MEV / priority-fee controls
**Rationale.** The brief: *"Slippage and fees are not important for this assignment."* We do **not** expose slippage tolerance, priority-fee sliders, or relayer selection to the user; Mayan's and Kamino's SDK defaults are used verbatim. **Not excluded**: basic gas-and-balance pre-flight correctness — we check that the Base wallet has enough ETH for the return bridge (see §8.3 Prerequisites) and that Kamino's compute-budget instruction is included via the SDK's default tx-build path. Skipping that would produce silent failures during the demo.

### 3.9 Not building: collateral adjustment flow (add/withdraw beyond close)
**Rationale.** This is bonus #3 from the brief. The brief states: *"We value depth in one or two bonuses rather than breadth across all of them."* We chose Privy (bonus #1) and partial repayment (bonus #2) for depth. Collateral adjustments are deferred to `docs/PROGRESS.md` as future work. Implementing them would add ~60–90 min for a bonus we were explicitly told not to chase.

### 3.10 Not building: durable workflow orchestration (Temporal, queue-backed sagas)
**Rationale.** All transitions complete in seconds to ~2 min (bridge finality). Recovery is a page-refresh + re-derive + resume polling against the persisted order ID — no worker process, no retry state machine, no dead-letter queue.

## 4. High-Level Architecture

Monorepo (pnpm workspaces), mirrors our Rust projects' `crates/*` pattern with `packages/*`.

```
kast-project/
├── apps/
│   └── web/                          # Next.js 15 App Router UI
├── packages/
│   ├── kamino-adapter/               # Kamino main-market integration
│   ├── mayan-adapter/                # Mayan bridge integration
│   ├── orchestrator/                 # Pure FSM, position lifecycle
│   ├── verify/                       # fast-check property tests
│   └── shared/                       # Types, constants, errors
├── scenario-tests/
│   └── features/*.feature            # @cucumber/cucumber BDD
├── integration-tests/                # Live-RPC mainnet tests
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .github/workflows/
│   ├── ci.yml
│   ├── integration.yml
│   ├── smoke.yml
│   └── nightly.yml
├── docs/
│   ├── ARCHITECTURE.md               # full diagrams (mermaid)
│   ├── AI_ORCHESTRATION.md
│   ├── TIME_LOG.md
│   └── PROGRESS.md
├── vercel.json
├── pnpm-workspace.yaml
└── tsconfig.json
```

Full diagrams (component, state machine, data flow, tx flow per step) live in `docs/ARCHITECTURE.md`.

## 5. Design Decisions

Each decision section lists alternatives considered and the reason for the chosen path, RFC-style.

### 5.1 Wallet: Privy embedded wallets

**Chosen**: `@privy-io/react-auth` with both Solana and EVM embedded wallets provisioned per user.

**Alternatives considered**:
- **Phantom multi-chain (single injected wallet, supports EVM since 2023)** — fastest to integrate, no server-side setup. Rejected because Privy is an *explicit listed bonus* in the brief and the embedded-wallet UX is more credible in the video walkthrough.
- **Two separate wallets (Phantom + MetaMask)** — rejected, no upside over Phantom multi-chain.
- **Local throwaway keypair** — rejected, ugly for the demo video.

**Trade-off**: +30–60 min setup cost for Privy vs. banked bonus #1 credit + smoother demo.

### 5.2 Protocol integration: official SDKs

**Chosen**: `@kamino-finance/klend-sdk` for Kamino; `@mayanfinance/swap-sdk` for Mayan.

**Alternatives considered**:
- **Raw Anchor IDL + hand-rolled instructions** — rejected, 3–5× slower and error-prone; no grading upside.
- **Mayan Swift HTTP API directly** — works, but the SDK wraps it with typed inputs and Solana/EVM tx builders. SDK is strictly better for timebox.

### 5.3 State management: pure FSM in `packages/orchestrator`

**Chosen**: A hand-rolled pure state machine (state enum + transition table), framework-agnostic.

**Alternatives considered**:
- **XState** — more formal, but 100+ KB of machinery for a 9-state FSM with 9 transitions. Overkill.
- **No FSM, just imperative calls from the UI** — rejected because (a) TDD/BDD becomes harder: scenarios want to talk about states and transitions; (b) property tests need an invariant target; (c) button enable/disable logic becomes scattered across components.

A pure FSM is the cheapest abstraction that unlocks clean tests and clean UI. Lives in its own package so it is reusable (CLI, tests, another UI) and has zero React dependency.

### 5.4 Adapters return *unsigned* transactions

**Chosen**: Adapter functions build and return unsigned `VersionedTransaction` / `EvmTransactionRequest` objects (one or several); signing happens in the React layer via Privy hooks.

**Alternatives considered**:
- **Adapters sign internally** — rejected: couples adapters to a wallet library, kills Node-side testability, and forces integration tests to run in a browser.

**Benefit**: adapters are pure Node modules. Integration tests in CI can sign with a throwaway keypair and submit real txs against mainnet. Adapters are also trivially reusable from a CLI.

**Thin public API, fat interior.** The adapters' exported interfaces stay small on purpose. The messy protocol detail lives *inside* the adapter: Kamino's obligation-account derivation, reserve selection, associated-token-account (ATA) creation for USDC, WSOL wrap/unwrap, compute-budget instruction, Kamino's "repay-all" flag for interest-accruing debt; Mayan's quote→swap wiring, ERC20 approval on Base before a bridge tx, relayer selection (Swift default), and order-hash extraction from the SDK response. Callers see `buildDepositCollateralTx(owner, lamports)`, not the fourteen-step pipeline behind it. This is the whole point of an adapter.

### 5.5 Testing: unit + property + BDD + integration + docker smoke + mutation

**Chosen**: Full TDD/BDD stack from day one — Vitest, fast-check, @cucumber/cucumber, Playwright, Stryker.

**Alternatives considered**:
- **Ship happy path first, add tests at the end** — rejected because it contradicts our stated TDD/BDD development style, and because tests are how we *demonstrate lead-level thinking* to KAST. A project with 5 passing Gherkin scenarios reads as "senior" regardless of LOC.
- **Only unit tests** — rejected because BDD scenarios are the most legible artefact a reviewer can inspect.

**Trade-off**: scaffolding the test stack costs ~30–45 min upfront. We accept this because tests then accelerate the rest of development (tight feedback loops) and the discipline is visible in the final repo.

### 5.6 Linting/formatting: ESLint flat config v9 + Prettier

**Chosen**: `eslint.config.mjs` (flat), `eslint-config-next`, Prettier.

**Alternatives considered**:
- **Biome** — faster and simpler, but `create-next-app` ships ESLint; ESLint is the unambiguous idiomatic default for Next.js 15 in 2026. Biome is the "new hotness" choice; the idiomatic one is ESLint.

### 5.7 CI/CD: four-workflow split, SHA-pinned actions

**Chosen**: `ci.yml` (fast gate), `integration.yml` (live-RPC on label), `smoke.yml` (docker+Playwright), `nightly.yml` (Stryker + coverage).

**Rationale**: mirrors the Mantis/hookbox pattern — fast CI gate on every push, expensive checks on cron. All action versions pinned to commit SHAs (security hardening convention from the sibling projects).

### 5.8 Deployment: Vercel

**Chosen**: Vercel with `apps/web` as the project root; preview deploys per PR.

**Rationale**: zero-infra, free tier is enough, matches the team's deployment target.

## 6. Interfaces (Public APIs)

### `packages/kamino-adapter`

```ts
export interface KaminoAdapter {
  // Reads
  getMainMarketReserves(): Promise<{ solReserve: Reserve; usdcReserve: Reserve }>;
  getObligation(owner: PublicKey): Promise<Obligation | null>;

  // Tx builders — each returns one or more unsigned tx to submit in order.
  // ATA creation, WSOL wrap/unwrap, compute-budget ix, obligation PDA derivation
  // are all handled internally by the adapter (see §5.4 "thin API, fat interior").
  buildDepositCollateralTx(p: { owner: PublicKey; lamports: bigint }): Promise<VersionedTransaction[]>;
  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction[]>;

  // `amount: 'all'` triggers Kamino's repay-all path, which handles interest
  // accrued between tx build and land (safe for full close).
  buildRepayTx(p: { owner: PublicKey; amount: bigint | 'all' }): Promise<VersionedTransaction[]>;

  // `lamports: 'all'` similarly withdraws the full collateral balance.
  buildWithdrawCollateralTx(p: { owner: PublicKey; lamports: bigint | 'all' }): Promise<VersionedTransaction[]>;
}
```

### `packages/mayan-adapter`

```ts
export interface MayanAdapter {
  quote(p: {
    fromChain: 'solana' | 'base';
    toChain: 'solana' | 'base';
    amountUsdc: bigint;
    fromAddress: string;
    toAddress: string;
  }): Promise<Quote>;   // Quote includes `expiresAt`; refetch if stale.

  // Returns a chain-tagged tx bundle. The EVM side is an ordered list
  // `[approve, bridge]` because Mayan pulls USDC via `transferFrom`;
  // the Solana side is a single versioned tx (SPL approve is done inline).
  buildBridgeTx(quote: Quote): Promise<
    | { chain: 'solana'; txs: [VersionedTransaction] }
    | { chain: 'base'; txs: [EvmTransactionRequest, EvmTransactionRequest] }
  >;

  // `orderHash` is produced by the SDK at tx-build time (not from RPC
  // confirmation) and must be persisted before the tx is submitted —
  // otherwise a page refresh between submit and settle loses the order.
  getOrderStatus(orderHash: string): Promise<'PENDING' | 'SETTLED' | 'REFUNDED'>;
}
```

### `packages/orchestrator`

```ts
export type PositionState =
  | 'IDLE'
  | 'DEPOSITED'
  | 'BORROWED'
  | 'BRIDGING_OUT'
  | 'ACTIVE_ON_BASE'
  | 'BRIDGING_BACK'
  | 'ON_SOL'
  | 'WITHDRAWING'
  | 'CLOSED';

export type Event =
  | { type: 'DEPOSIT'; lamports: bigint }
  | { type: 'BORROW'; amountUsdc: bigint }
  | { type: 'BRIDGE_OUT'; amountUsdc: bigint; orderHash: string }
  | { type: 'BRIDGE_SETTLED' }
  | { type: 'BRIDGE_REFUND' }        // Mayan returned REFUNDED; unwind to prev chain
  | { type: 'BRIDGE_BACK'; amountUsdc: bigint; orderHash: string }
  | { type: 'REPAY'; amount: bigint | 'all' }
  | { type: 'WITHDRAW'; lamports: bigint | 'all' };

export function transition(state: PositionState, event: Event): PositionState;
export function canFire(state: PositionState, event: Event['type']): boolean;

// Re-derives position state from chain + client-persisted in-flight orders.
// The adapter returns the live obligation (authoritative for debt/collateral);
// `pendingOrders` come from localStorage (§8.2) and drive the BRIDGING_* states.
export function derivePositionFromChain(args: {
  obligation: Obligation | null;
  baseUsdc: bigint;
  pendingOrders: PersistedOrder[];
}): PositionState;
```

`BRIDGE_REFUND` transitions `BRIDGING_OUT → BORROWED` (USDC returned to Solana) and `BRIDGING_BACK → ACTIVE_ON_BASE` (USDC returned to Base). Property tests assert no refund path can reach `CLOSED` with non-zero debt.

## 7. Data Flow

Amounts below are written as variables (`L_collateral` = lamports equivalent to $20 at mount time; `N_borrow` = 5_000_000 USDC base units). The UI resolves them from SOL price at mount; no amount is hardcoded in diagrams or code.

### 7.1 Open flow

1. User authenticates via Privy. `useSolanaWallets()` and `useWallets()` return **wallet handles**; the UI reads `.address` off each and stores the Solana public key + Base address. Signing later uses the handle objects directly, not the raw addresses.
2. UI calls `kaminoAdapter.getObligation(solAddress)` → `null` on first run → FSM starts at `IDLE`.
3. User clicks **Open**. For each step, the adapter returns an ordered list of unsigned txs; UI signs + submits each in sequence and waits for confirmation before the next:
   - `buildDepositCollateralTx({ owner, lamports: L_collateral })` → typically 1 tx; adapter inlines ATA/WSOL handling. Sign → submit → confirm.
   - `buildBorrowTx({ owner, amountUsdc: N_borrow })` → 1 tx; adapter ensures USDC ATA exists. Sign → submit → confirm.
   - `mayanAdapter.quote({ fromChain: 'solana', toChain: 'base', amountUsdc: N_borrow, fromAddress: solAddress, toAddress: baseAddress })`. Check `quote.expiresAt`; refetch if stale.
   - `mayanAdapter.buildBridgeTx(quote)` → returns `{ chain: 'solana', txs: [tx] }` **and an `orderHash`** (extracted from the SDK-prepared tx, available before submit). **Persist `{ orderHash, direction: 'out', amountUsdc, startedAt }` to localStorage before signing.** Sign → submit. FSM: `BORROWED → BRIDGING_OUT`.
   - Poll `mayanAdapter.getOrderStatus(orderHash)` until `SETTLED` (→ `ACTIVE_ON_BASE`) or `REFUNDED` (→ `BORROWED`, user retries).
4. UI shows Base wallet USDC balance (queried via viem). Display reflects **actual received amount after Mayan fees**, not the sent amount.

### 7.2 Close flow

5. User enters repayment amount `N_repay` (defaults to "Max" = Kamino's repay-all flag) and clicks **Close**. Partial repayments use a literal bigint; full uses `'all'`.
6. `mayanAdapter.quote({ fromChain: 'base', toChain: 'solana', amountUsdc: N_repay, fromAddress: baseAddress, toAddress: solAddress })`.
7. `mayanAdapter.buildBridgeTx(quote)` → returns `{ chain: 'base', txs: [approveTx, bridgeTx] }` and `orderHash`. Persist order to localStorage. Base wallet must hold enough **ETH** to pay gas for both txs (see §8.3). UI sends `approveTx`, waits for confirmation, then sends `bridgeTx`. FSM: `ACTIVE_ON_BASE → BRIDGING_BACK`.
8. Poll `getOrderStatus` → `SETTLED` → FSM `ON_SOL`. USDC arrives in Solana ATA (amount may be slightly less than sent due to Mayan fees).
9. UI re-reads `getObligation` for current live `borrowed` (debt has accrued since step 3).
10. `buildRepayTx({ owner, amount: 'all' })` if full close, or `buildRepayTx({ owner, amount: N_repay })` for partial. Sign → submit → confirm.
11. If full: `buildWithdrawCollateralTx({ owner, lamports: 'all' })` → sign → submit → confirm → FSM `CLOSED`, localStorage orders cleared.
12. If partial: FSM stays `ON_SOL` with reduced debt; UI shows updated obligation.

### 7.3 Refresh / recovery

On page load, the UI:
1. reads `obligation` + Base USDC balance + `localStorage.pendingOrders`,
2. calls `derivePositionFromChain({ obligation, baseUsdc, pendingOrders })` to compute current FSM state,
3. resumes polling any non-terminal orders, unpersisting them on `SETTLED`/`REFUNDED`.

## 8. Runtime Details

### 8.1 Protocol Constants & Config

| Name | Value |
|---|---|
| Solana cluster | mainnet-beta |
| Solana RPC | Helius (free tier) — `NEXT_PUBLIC_SOLANA_RPC_URL` |
| Solana USDC mint | `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v` |
| Kamino main market | `7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF` (verify against `@kamino-finance/klend-sdk` constants at impl time) |
| Kamino program | Pulled from `klend-sdk` (version-pinned) |
| Base chain id | `8453` |
| Base RPC | `https://mainnet.base.org` (public) or Alchemy — `NEXT_PUBLIC_BASE_RPC_URL` |
| Base USDC (native Circle) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Mayan SDK mode | Swift (default); MCTP not used |
| Mayan referrer | `NEXT_PUBLIC_MAYAN_REFERRER` (optional, defaults blank) |
| Privy app id | `NEXT_PUBLIC_PRIVY_APP_ID` |
| Privy embedded wallets | Solana + EVM both enabled; auto-provisioned on first login |
| Privy domain allowlist | `localhost:3000`, `*.vercel.app`, production domain |

All `NEXT_PUBLIC_*` envs are compiled into the client bundle. No non-public secrets are needed; there is no server.

### 8.2 Persistence

Single `localStorage` key: `kast:pendingOrders`. Schema:

```ts
type PersistedOrder = {
  orderHash: string;
  direction: 'out' | 'back';      // sol→base | base→sol
  amountUsdc: string;              // bigint serialized as decimal string
  startedAt: number;               // epoch ms
};
type Storage = PersistedOrder[];
```

Writes: before submitting any Mayan bridge tx. Reads: on mount, and after every `getOrderStatus` poll. Deletes: when an order transitions to `SETTLED` or `REFUNDED`. Max expected entries: 1 (the in-flight bridge). No versioning, no migrations.

### 8.3 Prerequisites

- **Solana wallet funding.** Privy-provisioned Solana wallet needs roughly `L_collateral + ~0.005 SOL` for rent + fees before the open flow. KAST funds the user's wallet per the brief.
- **Base wallet funding (ETH for gas).** The return bridge on Base requires two txs (approve + bridge), each costing a few cents of ETH. The Privy-provisioned Base wallet **does not auto-receive ETH**; the user (or KAST) must fund it with ~0.001 ETH before the close flow. The UI renders a "Fund Base wallet with ETH" prompt with the address + suggested amount if the balance is below a threshold. Gas sponsorship (paymaster / Privy-sponsored txs) is future work.
- **Deposit rent / ATAs.** ATA creation is idempotent; the adapter covers it on first tx. No manual prep.

## 9. Testing Strategy

- **Unit** (`packages/*/src/**/*.test.ts`, Vitest) — orchestrator transitions, amount conversions, parsers.
- **Property** (`packages/verify/`, Vitest + fast-check) — FSM invariants (e.g., `CLOSED ⇒ borrowed == 0`), arithmetic roundtrips, monotonicity of health factor under repay.
- **BDD / scenario** (`scenario-tests/features/*.feature`, @cucumber/cucumber) — Gherkin flows; two binaries: `orchestrator/` (in-memory, fast, every push) and `live/` (mainnet, scheduled).
- **Integration** (`integration-tests/`, Vitest) — live mainnet RPC, throwaway keypair, runs on PR label.
- **Docker smoke** (`docker/`, Playwright) — container boots, page renders, Privy login click works.
- **Mutation** (Stryker on `packages/orchestrator` + `packages/verify`, nightly cron).

Development is TDD/BDD: each vertical starts with a `.feature` file and failing unit tests; implementation follows until green; property tests added for invariants.

## 10. CI/CD

Four workflows, all actions SHA-pinned (matching Mantis/hookbox convention):

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push / PR | lint + typecheck + unit + property + BDD-in-memory + build |
| `integration.yml` | PR label `integration` + manual | live-RPC integration |
| `smoke.yml` | push to main | docker build + Playwright smoke |
| `nightly.yml` | cron `0 3 * * *` | Stryker mutation + coverage |

Supply-chain: `pnpm audit --audit-level=high` inside `ci.yml`.

Deployment: Vercel, `apps/web` root, env vars set in dashboard (`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_BASE_RPC_URL`).

## 11. Deliverables

Per the assignment brief:

- Git repo — this one.
- AI tooling writeup — `docs/AI_ORCHESTRATION.md`, documents how `superpowers:brainstorming → superpowers:writing-plans → superpowers:executing-plans` drove the work, including subagent decomposition.
- Time log — `docs/TIME_LOG.md`, updated per session.
- Video walkthrough — recorded live with KAST team.
- Architecture document — `docs/ARCHITECTURE.md`, full mermaid diagrams.
- Progress / future work — `docs/PROGRESS.md`.

## 12. Future Improvements

Explicitly deferred, ordered by impact / effort. These live in `docs/PROGRESS.md` as a living checklist during implementation.

### 12.1 Collateral adjustments (bonus #3)
Add and withdraw collateral on an open position without closing it. Kamino adapter functions already in scope; requires UI affordances and two new FSM self-loops from `BORROWED` / `ACTIVE_ON_BASE` / `ON_SOL`. Estimated 60–90 min. Tracked in `docs/PROGRESS.md`.

### 12.2 Production error handling
Structured error taxonomy (RPC error, user-rejected, insufficient balance, bridge timeout, oracle stale), user-visible messages, opt-in retry with exponential backoff for idempotent calls only.

### 12.3 Position health monitoring
Poll obligation health factor; warn the user at < 1.3, block new borrows at < 1.1. Out of scope for a $5 borrow against $20 collateral, but essential in production.

### 12.4 Priority fee / compute budget tuning
Dynamic priority fee estimation based on recent slot congestion. The SDKs expose hooks for this; we use defaults.

### 12.5 MEV-aware bridge routing
Mayan exposes multiple relayers (Swift, MCTP); choose based on current fees / finality. We use Swift defaults.

### 12.6 Multi-position support
Current design assumes one open position per user on the Kamino main market. Multiple obligations across isolated markets would require changes to the orchestrator state shape and the derivation function.

### 12.7 Observability
Sentry for client errors, structured logs of adapter calls, a `/metrics` endpoint with Prometheus-compatible output.

### 12.8 Base gas sponsorship (paymaster)
Current design requires the user to fund the Base wallet with ETH before the close flow. A production version would use Privy's paymaster support or an ERC-4337 paymaster to sponsor both the approve and bridge txs, removing the manual ETH-funding step.

### 12.9 Slippage & fee controls
User-configurable slippage tolerance, display of estimated fees before signing, pre-flight tx simulation for user confirmation.

### 12.10 Wallet migration path
Privy → export-to-self-custody flow, so users can move embedded wallets off-platform. Privy supports this natively; we do not expose it in the UI.

### 12.11 Formal modelling
For a production version, model the cross-chain position lifecycle in TLA+ or Quint and check safety/liveness properties. In this RFC we use fast-check property tests as the TS-native analogue; upgrading to a real model checker is deferred.

## 13. Open Questions

None at RFC approval time. Any discovered during implementation will be raised in the implementation plan or as PR comments.

## 14. Approval

This RFC is approved when the user responds "approved" or equivalent in the brainstorming session. After approval, the next step is `superpowers:writing-plans` to produce the step-by-step implementation plan.
