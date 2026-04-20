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
**Rationale.** Position state is fully derivable from on-chain sources (Kamino obligation account for the user's Solana wallet + USDC balance on the Base wallet + Mayan order status). Introducing a database adds setup cost, migration surface, and a second source-of-truth that can disagree with the chain. The chain *is* the source of truth; the app is a thin state-reader + tx-builder.

### 3.3 Not building: generic swap router / multi-protocol abstraction
**Rationale.** Two adapters (Kamino, Mayan), two protocols. A generic "Lender" or "Bridge" interface would be pure speculation about a future requirement that does not exist. YAGNI. If a second lender or bridge is ever added, the abstraction can be extracted from two concrete implementations — never invented from one.

### 3.4 Not building: caching layer / RPC pooling / request dedup
**Rationale.** The app makes ~5 RPC calls per user interaction. Premature optimisation. A free-tier Helius endpoint handles this trivially.

### 3.5 Not building: multi-user support / auth beyond Privy
**Rationale.** The brief scopes "a user" (singular). Privy handles session + wallet; no additional auth layer is needed. Multi-tenant concerns (rate limiting, per-user quotas, ACLs) are explicitly out of scope.

### 3.6 Not building: production error telemetry (Sentry, Datadog, etc.)
**Rationale.** Secondary per the brief. The `ActivityLog` component writes all tx signatures + bridge order hashes inline; this is enough to reconstruct any failure during the video walkthrough. Telemetry wiring is > 30 min of work for zero grading impact.

### 3.7 Not building: i18n, theming, mobile polish, design system
**Rationale.** The brief says UI/UX is secondary. Tailwind + `shadcn/ui` default tokens are enough. One screen, desktop-first, English-only.

### 3.8 Not building: MEV protection / slippage controls / priority-fee tuning
**Rationale.** The brief: *"Slippage and fees are not important for this assignment."* Mayan's default slippage and Kamino's default priority fees are used verbatim.

### 3.9 Not building: collateral adjustment flow (add/withdraw beyond close)
**Rationale.** This is bonus #3 from the brief. The brief states: *"We value depth in one or two bonuses rather than breadth across all of them."* We chose Privy (bonus #1) and partial repayment (bonus #2) for depth. Collateral adjustments are deferred to `docs/PROGRESS.md` as future work. Implementing them would add ~60–90 min for a bonus we were explicitly told not to chase.

### 3.10 Not building: full Rust-style formal verification (TLA+, Kani, model checkers)
**Rationale.** Our sibling Rust projects (Mantis, hookbox) use Kani proofs. The TypeScript ecosystem has no equivalent. We use `fast-check` property tests as the realistic TS analogue — same invariant-checking discipline, weaker guarantees. This is called out so reviewers do not mistake it for sloppiness.

### 3.11 Not building: resume-from-crash orchestration / long-lived workflows
**Rationale.** All transitions are short (seconds to ~2 min for a bridge). On page refresh, the app re-derives state from on-chain. No Temporal, no durable workflow engine, no queue.

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

**Chosen**: Adapter functions build and return unsigned `VersionedTransaction` / `EvmTransactionRequest` objects; signing happens in the React layer via Privy hooks.

**Alternatives considered**:
- **Adapters sign internally** — rejected: couples adapters to a wallet library, kills Node-side testability, and forces integration tests to run in a browser.

**Benefit**: adapters are pure Node modules. Integration tests in CI can sign with a throwaway keypair and submit real txs against mainnet. Adapters are also trivially reusable from a CLI.

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
  getMainMarketReserves(): Promise<{ solReserve: Reserve; usdcReserve: Reserve }>;
  getObligation(owner: PublicKey): Promise<Obligation | null>;

  buildDepositCollateralTx(p: { owner: PublicKey; lamports: bigint }): Promise<VersionedTransaction>;
  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction>;
  buildRepayTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction>;
  buildWithdrawCollateralTx(p: { owner: PublicKey; lamports: bigint }): Promise<VersionedTransaction>;
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
  }): Promise<Quote>;

  buildBridgeTx(quote: Quote): Promise<VersionedTransaction | EvmTransactionRequest>;
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
  | { type: 'BRIDGE_OUT'; amountUsdc: bigint }
  | { type: 'BRIDGE_SETTLED' }
  | { type: 'BRIDGE_BACK'; amountUsdc: bigint }
  | { type: 'REPAY'; amountUsdc: bigint }   // partial-aware
  | { type: 'WITHDRAW'; lamports: bigint };

export function transition(state: PositionState, event: Event): PositionState;
export function canFire(state: PositionState, event: Event['type']): boolean;
export function derivePositionFromChain(obligation: Obligation | null, baseUsdc: bigint, pendingOrders: Order[]): PositionState;
```

## 7. Data Flow (happy path)

1. User authenticates via Privy → `useSolanaWallets()` and `useWallets()` return embedded Solana + Base addresses.
2. UI queries `kaminoAdapter.getObligation(solAddress)` → initial state derived.
3. User clicks **Open**:
   - `buildDepositCollateralTx` → Privy signs → submitted → confirmed → log tx.
   - `buildBorrowTx` → signs → submits → confirms → log tx.
   - `mayanAdapter.quote(sol→base, 5 USDC, solAddress, baseAddress)` → `buildBridgeTx` → Privy Solana signs → submitted → poll `getOrderStatus` until SETTLED.
4. State now `ACTIVE_ON_BASE`. UI shows Base USDC balance.
5. User clicks **Close** (or **Partial Repay** with amount):
   - `mayanAdapter.quote(base→sol, N USDC, baseAddress, solAddress)` → `buildBridgeTx` → Privy EVM signs → submitted → polled until SETTLED.
   - `buildRepayTx(N)` → signs → submits → confirms.
   - If full repayment: `buildWithdrawCollateralTx(allLamports)` → signs → submits → confirms → state `CLOSED`.
   - If partial: residual debt remains, state returns to `ON_SOL` with updated numbers.

## 8. Testing Strategy

- **Unit** (`packages/*/src/**/*.test.ts`, Vitest) — orchestrator transitions, amount conversions, parsers.
- **Property** (`packages/verify/`, Vitest + fast-check) — FSM invariants (e.g., `CLOSED ⇒ borrowed == 0`), arithmetic roundtrips, monotonicity of health factor under repay.
- **BDD / scenario** (`scenario-tests/features/*.feature`, @cucumber/cucumber) — Gherkin flows; two binaries: `orchestrator/` (in-memory, fast, every push) and `live/` (mainnet, scheduled).
- **Integration** (`integration-tests/`, Vitest) — live mainnet RPC, throwaway keypair, runs on PR label.
- **Docker smoke** (`docker/`, Playwright) — container boots, page renders, Privy login click works.
- **Mutation** (Stryker on `packages/orchestrator` + `packages/verify`, nightly cron).

Development is TDD/BDD: each vertical starts with a `.feature` file and failing unit tests; implementation follows until green; property tests added for invariants.

## 9. CI/CD

Four workflows, all actions SHA-pinned (matching Mantis/hookbox convention):

| Workflow | Trigger | Purpose |
|---|---|---|
| `ci.yml` | push / PR | lint + typecheck + unit + property + BDD-in-memory + build |
| `integration.yml` | PR label `integration` + manual | live-RPC integration |
| `smoke.yml` | push to main | docker build + Playwright smoke |
| `nightly.yml` | cron `0 3 * * *` | Stryker mutation + coverage |

Supply-chain: `pnpm audit --audit-level=high` inside `ci.yml`.

Deployment: Vercel, `apps/web` root, env vars set in dashboard (`NEXT_PUBLIC_PRIVY_APP_ID`, `NEXT_PUBLIC_SOLANA_RPC_URL`, `NEXT_PUBLIC_BASE_RPC_URL`).

## 10. Deliverables

Per the assignment brief:

- Git repo — this one.
- AI tooling writeup — `docs/AI_ORCHESTRATION.md`, documents how `superpowers:brainstorming → superpowers:writing-plans → superpowers:executing-plans` drove the work, including subagent decomposition.
- Time log — `docs/TIME_LOG.md`, updated per session.
- Video walkthrough — recorded live with KAST team.
- Architecture document — `docs/ARCHITECTURE.md`, full mermaid diagrams.
- Progress / future work — `docs/PROGRESS.md`.

## 11. Future Improvements

Explicitly deferred, ordered by impact / effort. These live in `docs/PROGRESS.md` as a living checklist during implementation.

### 11.1 Collateral adjustments (bonus #3)
Add and withdraw collateral on an open position without closing it. Two additional Kamino adapter functions already scoped (`buildDepositCollateralTx` and `buildWithdrawCollateralTx` can be reused); requires UI affordances and two new FSM transitions from `BORROWED` / `ACTIVE_ON_BASE` / `ON_SOL` back to themselves. Estimated 60–90 min.

### 11.2 Production error handling
Structured error taxonomy (RPC error, user-rejected, insufficient balance, bridge timeout, oracle stale), user-visible messages, opt-in retry with exponential backoff for idempotent calls only.

### 11.3 Position health monitoring
Poll obligation health factor; warn the user at < 1.3, block new borrows at < 1.1. Out of scope for a $5 borrow against $20 collateral, but essential in production.

### 11.4 Priority fee / compute budget tuning
Dynamic priority fee estimation based on recent slot congestion. The SDKs expose hooks for this; we use defaults.

### 11.5 MEV-aware bridge routing
Mayan exposes multiple relayers (Swift, MCTP); choose based on current fees / finality. We use Swift defaults.

### 11.6 Multi-position support
Current design assumes one open position per user (matches Kamino's single-obligation model on main market). Multiple obligations across isolated markets would require changes to the orchestrator state shape.

### 11.7 Observability
Sentry for client errors, structured logs of adapter calls, a `/metrics` endpoint with Prometheus-compatible output.

### 11.8 Formal verification (TLA+)
For a production version, model the cross-chain position lifecycle in TLA+ and check safety/liveness properties. Out of scope for a TS app in 6 hours; in scope for a v2.

### 11.9 Slippage & fee controls
User-configurable slippage tolerance, display of estimated fees before signing, pre-flight tx simulation for user confirmation.

### 11.10 Wallet migration path
Privy → export-to-self-custody flow, so users can move embedded wallets off-platform. Privy supports this natively; we do not expose it in the UI.

## 12. Open Questions

None at RFC approval time. Any discovered during implementation will be raised in the implementation plan or as PR comments.

## 13. Approval

This RFC is approved when the user responds "approved" or equivalent in the brainstorming session. After approval, the next step is `superpowers:writing-plans` to produce the step-by-step implementation plan.
