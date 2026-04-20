# Architecture

Visual reference for the KAST DeFi project. Design decisions live in the RFC at `docs/superpowers/specs/2026-04-20-kast-defi-design.md`; this document focuses on **what things are**, **how they connect**, and **how data flows**.

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

```mermaid
stateDiagram-v2
    [*] --> IDLE

    IDLE --> DEPOSITED: DEPOSIT(lamports)
    DEPOSITED --> BORROWED: BORROW(amountUsdc)
    BORROWED --> BRIDGING_OUT: BRIDGE_OUT(amountUsdc)
    BRIDGING_OUT --> ACTIVE_ON_BASE: BRIDGE_SETTLED

    ACTIVE_ON_BASE --> BRIDGING_BACK: BRIDGE_BACK(amountUsdc)
    BRIDGING_BACK --> ON_SOL: BRIDGE_SETTLED

    ON_SOL --> ON_SOL: REPAY(partial)
    ON_SOL --> WITHDRAWING: REPAY(full)

    WITHDRAWING --> CLOSED: WITHDRAW(allLamports)
    CLOSED --> [*]

    note right of ON_SOL
      Partial repayment is a
      self-loop; state advances
      only when borrowed == 0.
    end note
```

**Invariants verified by property tests** (`packages/verify/`):

- No path reaches `CLOSED` with `obligation.borrowed > 0`.
- No path reaches `CLOSED` with `obligation.collateral > 0`.
- `transition(s, e)` is deterministic and total for all legal `(s, e)` pairs.
- `canFire(s, e)` is true iff `transition(s, e)` would not throw.
- Amount round-trips: `lamportsToSol(solToLamports(x)) == x` for valid `x`.
- Repay is monotonic: `borrowed_after_repay ≤ borrowed_before_repay`.

---

## 4. Happy-Path Data Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as apps/web
    participant P as Privy
    participant O as orchestrator
    participant K as kamino-adapter
    participant M as mayan-adapter
    participant SOL as Solana RPC
    participant BASE as Base RPC

    User->>P: Login
    P-->>UI: solAddr, baseAddr

    UI->>K: getObligation(solAddr)
    K->>SOL: fetch obligation account
    SOL-->>K: obligation | null
    K-->>UI: obligation | null
    UI->>O: derivePositionFromChain(...)
    O-->>UI: IDLE

    User->>UI: click Open
    UI->>K: buildDepositCollateralTx(0.12 SOL)
    K-->>UI: unsigned tx
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: confirmed signature
    UI->>O: transition(IDLE, DEPOSIT)
    O-->>UI: DEPOSITED

    UI->>K: buildBorrowTx(5 USDC)
    K-->>UI: unsigned tx
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: confirmed signature
    UI->>O: transition(DEPOSITED, BORROW)
    O-->>UI: BORROWED

    UI->>M: quote(sol→base, 5 USDC)
    M-->>UI: Quote
    UI->>M: buildBridgeTx(quote)
    M-->>UI: unsigned tx
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: signature + orderHash
    UI->>O: transition(BORROWED, BRIDGE_OUT)
    O-->>UI: BRIDGING_OUT

    loop poll until SETTLED
        UI->>M: getOrderStatus(orderHash)
        M-->>UI: PENDING | SETTLED
    end
    UI->>O: transition(BRIDGING_OUT, BRIDGE_SETTLED)
    O-->>UI: ACTIVE_ON_BASE

    UI->>BASE: read USDC balance(baseAddr)
    BASE-->>UI: 5 USDC
```

---

## 5. Close-Path Data Flow

```mermaid
sequenceDiagram
    actor User
    participant UI as apps/web
    participant P as Privy
    participant O as orchestrator
    participant K as kamino-adapter
    participant M as mayan-adapter
    participant SOL as Solana RPC
    participant BASE as Base RPC

    User->>UI: click Close (or enter partial amount)
    UI->>M: quote(base→sol, N USDC)
    M-->>UI: Quote
    UI->>M: buildBridgeTx(quote)
    M-->>UI: unsigned evm tx
    UI->>P: sign + send (EVM)
    P->>BASE: submit
    BASE-->>UI: tx hash + orderHash
    UI->>O: transition(ACTIVE_ON_BASE, BRIDGE_BACK)
    O-->>UI: BRIDGING_BACK

    loop poll until SETTLED
        UI->>M: getOrderStatus(orderHash)
        M-->>UI: PENDING | SETTLED
    end
    UI->>O: transition(BRIDGING_BACK, BRIDGE_SETTLED)
    O-->>UI: ON_SOL

    UI->>K: buildRepayTx(N)
    K-->>UI: unsigned tx
    UI->>P: sign + send
    P->>SOL: submit
    SOL-->>UI: confirmed signature

    UI->>O: transition(ON_SOL, REPAY(N))
    alt N == borrowed (full)
        O-->>UI: WITHDRAWING
        UI->>K: buildWithdrawCollateralTx(allLamports)
        K-->>UI: unsigned tx
        UI->>P: sign + send
        P->>SOL: submit
        SOL-->>UI: confirmed signature
        UI->>O: transition(WITHDRAWING, WITHDRAW)
        O-->>UI: CLOSED
    else N < borrowed (partial)
        O-->>UI: ON_SOL (residual debt)
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

    prod --> env[(Vercel env:<br/>PRIVY_APP_ID<br/>SOLANA_RPC_URL<br/>BASE_RPC_URL)]
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
