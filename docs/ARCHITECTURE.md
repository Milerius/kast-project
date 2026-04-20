# Architecture

Visual reference for the KAST DeFi project. Design decisions, **non-goals, and future improvements live in the RFC** at `docs/superpowers/specs/2026-04-20-kast-defi-design.md` (§3 and §12 respectively); this document focuses on **what things are**, **how they connect**, and **how data flows**.

Amount placeholders used in diagrams:
- `L_collateral` — lamports equivalent to $20 SOL at mount time (not hardcoded)
- `N_borrow` — `5_000_000` USDC base units (5 USDC with 6 decimals)
- `N_repay` — user-entered partial amount or `'all'` for full close

---

## 1. Repository Layout

```mermaid
graph TD
    root[kast-project/]
    root --> apps[apps/]
    root --> packages[packages/]
    root --> scenario[scenario-tests/]
    root --> integ[integration-tests/]
    root --> docker[docker/]
    root --> workflows[.github/workflows/]
    root --> docs[docs/]

    apps --> web[web/ — Next.js 15 App Router]

    packages --> kamino[kamino-adapter/]
    packages --> mayan[mayan-adapter/]
    packages --> orch[orchestrator/ — pure FSM]
    packages --> verify[verify/ — fast-check]
    packages --> shared[shared/ — types, errors]

    scenario --> features[features/*.feature]
    scenario --> orchBdd[orchestrator/ — in-memory runner]
    scenario --> liveBdd[live/ — mainnet runner]

    workflows --> ci[ci.yml]
    workflows --> integYml[integration.yml]
    workflows --> smoke[smoke.yml]
    workflows --> nightly[nightly.yml]

    docs --> arch[ARCHITECTURE.md]
    docs --> aiOrch[AI_ORCHESTRATION.md]
    docs --> tlog[TIME_LOG.md]
    docs --> prog[PROGRESS.md]
    docs --> rfc[superpowers/specs/2026-04-20-kast-defi-design.md]
```

---

## 2. Component Map

```mermaid
graph LR
    subgraph Browser
        UI[apps/web<br/>Next.js UI]
        Privy[Privy SDK<br/>Solana + EVM wallets]
        Store[zustand store<br/>FSM state + log]
    end

    subgraph Pure_Packages
        Orch[orchestrator<br/>transition / canFire / derive]
        Kamino[kamino-adapter<br/>tx builders]
        Mayan[mayan-adapter<br/>quote + tx + status]
        Shared[shared<br/>types / constants]
    end

    subgraph External
        SolRpc[(Solana RPC<br/>Helius)]
        BaseRpc[(Base RPC)]
        KaminoProg[(Kamino<br/>on-chain program)]
        MayanApi[(Mayan Swift API<br/>+ relayers)]
    end

    UI --> Privy
    UI --> Store
    UI --> Orch
    UI --> Kamino
    UI --> Mayan

    Orch --> Shared
    Kamino --> Shared
    Mayan --> Shared

    Kamino --> SolRpc
    Kamino --> KaminoProg
    Mayan --> MayanApi
    Mayan --> SolRpc
    Mayan --> BaseRpc

    Privy -. signs .-> UI
```

Adapters are pure Node packages — no React, no browser APIs. The UI is the only layer that touches Privy and the zustand store.

---

## 3. Position State Machine

Six **observable** states — each uniquely determined by `(obligation, baseUsdc, pendingOrders)`. No hidden "intent" substates: full-close and partial-repay share the same FSM path (`BORROWED` ← repay ← `BORROWED` for partial; `DEPOSITED` ← repay('all') ← `BORROWED` for full).

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> DEPOSITED: DEPOSIT(L_collateral)
    DEPOSITED --> BORROWED: BORROW(N_borrow)
    DEPOSITED --> IDLE: WITHDRAW('all')

    BORROWED --> BRIDGING_OUT: BRIDGE_OUT(N_borrow, orderHash)
    BORROWED --> BORROWED: REPAY(partial)
    BORROWED --> DEPOSITED: REPAY('all')

    BRIDGING_OUT --> ACTIVE_ON_BASE: BRIDGE_SETTLED
    BRIDGING_OUT --> BORROWED: BRIDGE_REFUND

    ACTIVE_ON_BASE --> BRIDGING_BACK: BRIDGE_BACK(N_repay, orderHash)
    BRIDGING_BACK --> BORROWED: BRIDGE_SETTLED
    BRIDGING_BACK --> ACTIVE_ON_BASE: BRIDGE_REFUND

    note right of BORROWED
      'all' triggers Kamino's
      repay-all path; partial
      is a self-loop with
      reduced debt.
    end note
```

Full close path: `BRIDGING_BACK → BORROWED → DEPOSITED → IDLE` (three confirmations: bridge settle, repay-all, withdraw-all).

**Invariants verified by property tests** (`packages/verify/`):

- No sequence of events reaches `IDLE` with `obligation.borrowed > 0` or `obligation.collateral > 0`.
- `transition(s, e)` is deterministic and total for all legal `(s, e)` pairs.
- `canFire(s, e)` is true iff `transition(s, e)` would not throw.
- Amount round-trips: `lamportsToSol(solToLamports(x)) == x` for valid `x`.
- Repay is monotonic *at tx-submit time*: `borrowed_after_repay ≤ borrowed_before_repay` (live accrual means strict inequality can hold even for a no-op build).
- `BRIDGE_REFUND` inverts the matching outbound event:
  - `transition(transition(BORROWED, BRIDGE_OUT), BRIDGE_REFUND) == BORROWED`
  - `transition(transition(ACTIVE_ON_BASE, BRIDGE_BACK), BRIDGE_REFUND) == ACTIVE_ON_BASE`

---

## 4. Happy-Path Data Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as apps/web
    participant LS as localStorage
    participant P as Privy
    participant O as orchestrator
    participant K as kamino-adapter
    participant M as mayan-adapter
    participant SOL as Solana RPC
    participant BASE as Base RPC

    User->>P: Login
    P-->>UI: wallet handles (solWallet, baseWallet)
    UI->>UI: solAddr = solWallet.address, baseAddr = baseWallet.address

    UI->>K: getObligation(solAddr)
    K->>SOL: fetch obligation account
    SOL-->>K: obligation | null
    K-->>UI: obligation | null
    UI->>LS: read pendingOrders
    LS-->>UI: [] (first visit)
    UI->>O: derivePositionFromChain({obligation, baseUsdc, pendingOrders})
    O-->>UI: IDLE

    User->>UI: click Open
    UI->>K: buildDepositCollateralTx(solAddr, L_collateral)
    K-->>UI: [tx1] (inlines ATA + WSOL)
    UI->>P: sign tx1
    P-->>UI: signed tx1
    UI->>SOL: submit
    SOL-->>UI: confirmed signature
    UI->>O: transition(IDLE, DEPOSIT)
    O-->>UI: DEPOSITED

    UI->>K: buildBorrowTx(solAddr, N_borrow)
    K-->>UI: [tx]
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: confirmed signature
    UI->>O: transition(DEPOSITED, BORROW)
    O-->>UI: BORROWED

    UI->>M: quote(sol→base, N_borrow, solAddr, baseAddr)
    M-->>UI: Quote{expiresAt, orderHash}
    Note over UI,M: orderHash known at quote-build time<br/>(from Mayan SDK, not from RPC)
    UI->>LS: persist {orderHash, direction:'out', N_borrow}
    UI->>M: buildBridgeTx(quote)
    M-->>UI: {chain:'solana', txs:[tx]}
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: confirmed signature
    UI->>O: transition(BORROWED, BRIDGE_OUT)
    O-->>UI: BRIDGING_OUT

    loop poll every ~3s until terminal
        UI->>M: getOrderStatus(orderHash)
        M-->>UI: PENDING | SETTLED | REFUNDED
    end
    alt SETTLED
        UI->>LS: delete order
        UI->>O: transition(BRIDGING_OUT, BRIDGE_SETTLED)
        O-->>UI: ACTIVE_ON_BASE
        UI->>BASE: read USDC balance(baseAddr)
        BASE-->>UI: ~N_borrow minus Mayan fees
    else REFUNDED
        UI->>LS: delete order
        UI->>O: transition(BRIDGING_OUT, BRIDGE_REFUND)
        O-->>UI: BORROWED (USDC back on Solana, user may retry)
    end
```

---

## 5. Close-Path Data Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as apps/web
    participant LS as localStorage
    participant P as Privy
    participant O as orchestrator
    participant K as kamino-adapter
    participant M as mayan-adapter
    participant SOL as Solana RPC
    participant BASE as Base RPC

    User->>UI: click Close (or enter partial N_repay)
    Note over UI,BASE: Pre-flight: check baseWallet ETH ≥ gas threshold<br/>else render "Fund Base wallet" prompt

    UI->>M: quote(base→sol, N_repay, baseAddr, solAddr)
    M-->>UI: Quote{expiresAt, orderHash}
    UI->>LS: persist {orderHash, direction:'back', N_repay}
    UI->>M: buildBridgeTx(quote)
    M-->>UI: {chain:'base', txs:[approveTx, bridgeTx]}

    UI->>P: sign approveTx
    P->>BASE: submit
    BASE-->>UI: approve confirmed
    UI->>P: sign bridgeTx
    P->>BASE: submit
    BASE-->>UI: bridge tx confirmed
    UI->>O: transition(ACTIVE_ON_BASE, BRIDGE_BACK)
    O-->>UI: BRIDGING_BACK

    loop poll every ~3s until terminal
        UI->>M: getOrderStatus(orderHash)
        M-->>UI: PENDING | SETTLED | REFUNDED
    end
    alt SETTLED
        UI->>LS: delete order
        UI->>O: transition(BRIDGING_BACK, BRIDGE_SETTLED)
        O-->>UI: BORROWED
    else REFUNDED
        UI->>LS: delete order
        UI->>O: transition(BRIDGING_BACK, BRIDGE_REFUND)
        O-->>UI: ACTIVE_ON_BASE (user retries)
    end

    UI->>K: getObligation(solAddr)
    K->>SOL: fetch live obligation
    SOL-->>K: { borrowed: B_live, ... }
    K-->>UI: B_live (accrued since borrow)

    alt full close
        UI->>K: buildRepayTx(solAddr, 'all')
        Note over K: 'all' → Kamino repay-all flag,<br/>safe across interest accrual
        K-->>UI: [tx]
        UI->>P: sign + send
        P->>SOL: submit
        SOL-->>UI: confirmed
        UI->>O: transition(BORROWED, REPAY('all'))
        O-->>UI: DEPOSITED

        UI->>K: buildWithdrawCollateralTx(solAddr, 'all')
        K-->>UI: [tx]
        UI->>P: sign + send
        P->>SOL: submit
        SOL-->>UI: confirmed
        UI->>O: transition(DEPOSITED, WITHDRAW('all'))
        O-->>UI: IDLE
    else partial close
        UI->>K: buildRepayTx(solAddr, N_repay)
        K-->>UI: [tx]
        UI->>P: sign + send
        P->>SOL: submit
        SOL-->>UI: confirmed
        UI->>O: transition(BORROWED, REPAY(partial))
        O-->>UI: BORROWED (residual debt)
    end
```

---

## 6. Test Topology

```mermaid
graph TD
    subgraph Fast[Fast CI - every push]
        lint[lint / format / typecheck]
        unit[unit - vitest]
        prop[property - fast-check]
        bddMem[BDD in-memory - cucumber]
        build[next build]
    end

    subgraph Medium[Medium CI]
        smoke[docker build + Playwright]
    end

    subgraph Slow[Slow CI - on demand or scheduled]
        integ[integration - live mainnet RPC]
        bddLive[BDD live - live mainnet]
        mutate[Stryker mutation]
        cov[coverage report]
    end

    lint --> unit --> prop --> bddMem --> build
    build --> smoke
    build -. label:integration .-> integ
    build -. cron nightly .-> mutate
    build -. cron nightly .-> cov
    integ --> bddLive
```

---

## 7. Deployment

```mermaid
graph LR
    push[git push] --> gha[GitHub Actions ci.yml]
    gha -->|pass| vercel[Vercel preview deploy]
    merge[merge to main] --> gha2[ci.yml + smoke.yml]
    gha2 -->|pass| prod[Vercel production]

    prod --> env[(Vercel env:<br/>NEXT_PUBLIC_PRIVY_APP_ID<br/>NEXT_PUBLIC_SOLANA_RPC_URL<br/>NEXT_PUBLIC_BASE_RPC_URL<br/>NEXT_PUBLIC_MAYAN_REFERRER)]
```

---

## 8. What Lives Where (quick reference)

| Concern | Location |
|---|---|
| UI components | `apps/web/src/components/` |
| UI pages | `apps/web/src/app/` |
| Client state store | `apps/web/src/lib/store.ts` |
| Privy providers | `apps/web/src/lib/privy.tsx` |
| Kamino SDK calls | `packages/kamino-adapter/src/` |
| Mayan SDK calls | `packages/mayan-adapter/src/` |
| State machine | `packages/orchestrator/src/fsm.ts` |
| State derivation from chain | `packages/orchestrator/src/derive.ts` |
| Property tests | `packages/verify/src/` |
| Gherkin features | `scenario-tests/features/*.feature` |
| Cucumber step defs | `scenario-tests/orchestrator/steps.ts`, `scenario-tests/live/steps.ts` |
| Live integration tests | `integration-tests/src/` |
| Dockerfile | `docker/Dockerfile` |
| Playwright smoke | `docker/smoke.spec.ts` |
| CI workflows | `.github/workflows/` |
| RFC / spec | `docs/superpowers/specs/2026-04-20-kast-defi-design.md` |
| Future work | `docs/PROGRESS.md` |
| AI workflow writeup | `docs/AI_ORCHESTRATION.md` |
| Time log | `docs/TIME_LOG.md` |
