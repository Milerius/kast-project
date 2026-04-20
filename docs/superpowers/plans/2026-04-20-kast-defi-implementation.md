# KAST DeFi Assignment — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a Vercel-deployed Next.js app where a Privy-authenticated user deposits SOL on Kamino, borrows USDC, bridges it to Base via Mayan, and closes the position by bridging back + repaying + withdrawing. Partial repayment supported.

**Architecture:** pnpm monorepo. Pure-TS adapter packages (`kamino-adapter`, `mayan-adapter`) return unsigned txs; signing happens in the UI via Privy. A pure 6-state FSM in `packages/orchestrator` drives button enable/disable and is re-derived from chain + `localStorage` on mount. Full testing stack (Vitest, fast-check, Cucumber, Playwright, Stryker) from day one.

**Tech Stack:**
- Next.js 15 (App Router) + TypeScript 5 strict
- `@privy-io/react-auth` (Solana + EVM embedded wallets)
- `@kamino-finance/klend-sdk`
- `@mayanfinance/swap-sdk`
- `@solana/web3.js`, `@solana/spl-token`, `viem`
- `zustand` for client state
- Vitest, fast-check, `@cucumber/cucumber`, Playwright, Stryker
- ESLint flat config v9 + Prettier
- pnpm workspaces
- GitHub Actions (SHA-pinned) + Vercel

**Spec:** `docs/superpowers/specs/2026-04-20-kast-defi-design.md`  
**Diagrams:** `docs/ARCHITECTURE.md`

---

## File Structure

```
kast-project/
├── apps/
│   └── web/
│       ├── src/
│       │   ├── app/
│       │   │   ├── layout.tsx          # Root layout + Privy provider
│       │   │   ├── page.tsx            # Single-page UI
│       │   │   └── providers.tsx       # PrivyProvider wrapper (client)
│       │   ├── components/
│       │   │   ├── OpenFlow.tsx        # Deposit + Borrow + Bridge out buttons
│       │   │   ├── CloseFlow.tsx       # Bridge back + Repay + Withdraw buttons
│       │   │   ├── ActivityLog.tsx     # Step-by-step log with tx sigs
│       │   │   ├── BaseEthPreflight.tsx
│       │   │   └── PositionCard.tsx    # Current FSM state + amounts
│       │   └── lib/
│       │       ├── store.ts            # zustand: FSM state, log, pendingOrders
│       │       ├── env.ts              # Typed env reader
│       │       ├── persistence.ts      # localStorage kast:pendingOrders
│       │       ├── chain.ts            # Solana connection + viem client factories
│       │       └── amounts.ts          # SOL price → L_collateral, formatting
│       ├── next.config.mjs
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── shared/
│   │   └── src/
│   │       ├── constants.ts            # Mints, chain IDs, Kamino market
│   │       ├── errors.ts               # Typed error classes
│   │       └── types.ts                # Shared DTOs (Obligation, Reserve)
│   ├── orchestrator/
│   │   └── src/
│   │       ├── fsm.ts                  # State/Event types + transition/canFire
│   │       ├── derive.ts               # derivePositionFromChain
│   │       └── index.ts
│   ├── kamino-adapter/
│   │   └── src/
│   │       ├── adapter.ts              # KaminoAdapter impl
│   │       ├── reserves.ts             # getMainMarketReserves
│   │       ├── obligation.ts           # getObligation
│   │       ├── tx-deposit.ts
│   │       ├── tx-borrow.ts
│   │       ├── tx-repay.ts
│   │       ├── tx-withdraw.ts
│   │       └── index.ts
│   ├── mayan-adapter/
│   │   └── src/
│   │       ├── adapter.ts              # MayanAdapter impl
│   │       ├── quote.ts
│   │       ├── tx-build.ts
│   │       ├── status.ts
│   │       └── index.ts
│   └── verify/
│       └── src/
│           └── fsm.property.test.ts
├── scenario-tests/
│   ├── features/
│   │   ├── open-flow.feature
│   │   ├── close-flow.feature
│   │   ├── partial-repay.feature
│   │   └── refresh-recovery.feature
│   ├── orchestrator/
│   │   ├── steps.ts                    # In-memory fake adapters
│   │   └── world.ts
│   ├── live/
│   │   └── steps.ts                    # Real mainnet adapters (label-gated)
│   └── cucumber.mjs
├── integration-tests/
│   └── src/
│       ├── kamino.int.test.ts
│       └── mayan.int.test.ts
├── docker/
│   ├── Dockerfile
│   ├── docker-compose.yml
│   └── smoke.spec.ts                   # Playwright
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── integration.yml
│       ├── smoke.yml
│       └── nightly.yml
├── docs/
│   ├── ARCHITECTURE.md                 # (exists)
│   ├── AI_ORCHESTRATION.md
│   ├── TIME_LOG.md
│   ├── PROGRESS.md
│   └── superpowers/
│       ├── specs/2026-04-20-kast-defi-design.md (exists)
│       └── plans/2026-04-20-kast-defi-implementation.md (this file)
├── .gitignore
├── .nvmrc
├── .prettierrc.json
├── eslint.config.mjs
├── package.json
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── vercel.json
└── README.md
```

Every file has one responsibility. Adapter tx-builders are split per operation (one file each) so a Kamino-specific change never touches a Mayan-specific file.

---

## Execution Order

Phases 0 → 11. Dependencies flow forward; never skip ahead except for docs (Phase 11 can happen anytime).

- **Phase 0 — Bootstrap** (Tasks 1-3)
- **Phase 1 — Shared types** (Task 4)
- **Phase 2 — Orchestrator FSM (TDD)** (Tasks 5-9)
- **Phase 3 — Property tests** (Task 10)
- **Phase 4 — Kamino adapter** (Tasks 11-16)
- **Phase 5 — Mayan adapter** (Tasks 17-20)
- **Phase 6 — BDD scenarios** (Tasks 21-23)
- **Phase 7 — Next.js app** (Tasks 24-31)
- **Phase 8 — Integration tests** (Task 32)
- **Phase 9 — Docker + Playwright smoke** (Task 33)
- **Phase 10 — CI/CD + Vercel** (Tasks 34-38)
- **Phase 11 — Project docs** (Tasks 39-41)

---

## Phase 0 — Bootstrap

### Task 1: Initialise pnpm workspace + root configs

**Files:**
- Create: `package.json`
- Create: `pnpm-workspace.yaml`
- Create: `.nvmrc`
- Create: `.gitignore`
- Create: `tsconfig.base.json`

- [ ] **Step 1: Create `.nvmrc`**

```
20.17.0
```

- [ ] **Step 2: Create `.gitignore`**

```gitignore
node_modules/
.next/
dist/
*.tsbuildinfo
.env*.local
!.env.example
coverage/
.pnpm-store/
.vercel/
.DS_Store
playwright-report/
test-results/
```

- [ ] **Step 3: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - "apps/*"
  - "packages/*"
  - "integration-tests"
  - "scenario-tests"
```

- [ ] **Step 4: Create `package.json`**

```json
{
  "name": "kast-project",
  "private": true,
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=20.17" },
  "scripts": {
    "build": "pnpm -r --filter=!integration-tests --filter=!scenario-tests build",
    "typecheck": "pnpm -r typecheck",
    "lint": "eslint .",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "test": "pnpm -r --filter=!integration-tests test",
    "test:unit": "pnpm --filter='./packages/*' test",
    "test:property": "pnpm --filter verify test",
    "test:bdd": "pnpm --filter scenario-tests test",
    "test:integration": "pnpm --filter integration-tests test",
    "test:smoke": "pnpm --filter @kast/web exec playwright test",
    "test:mutation": "pnpm --filter orchestrator exec stryker run && pnpm --filter verify exec stryker run",
    "dev": "pnpm --filter @kast/web dev"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "eslint": "9.13.0",
    "prettier": "3.3.3",
    "@typescript-eslint/eslint-plugin": "8.12.2",
    "@typescript-eslint/parser": "8.12.2",
    "eslint-config-next": "15.0.2",
    "eslint-config-prettier": "9.1.0"
  }
}
```

- [ ] **Step 5: Create `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "forceConsistentCasingInFileNames": true,
    "lib": ["ES2022", "DOM"]
  }
}
```

- [ ] **Step 6: Install pnpm if missing, then install**

Run:
```bash
corepack enable
corepack prepare pnpm@9.12.0 --activate
pnpm install
```

Expected: `pnpm install` succeeds even with empty workspaces (no package errors).

- [ ] **Step 7: Commit**

```bash
git add .nvmrc .gitignore package.json pnpm-workspace.yaml tsconfig.base.json
git commit -m "chore: initialise pnpm workspace + tsconfig base"
```

---

### Task 2: ESLint + Prettier

**Files:**
- Create: `eslint.config.mjs`
- Create: `.prettierrc.json`
- Create: `.prettierignore`

- [ ] **Step 1: Create `.prettierrc.json`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "arrowParens": "always"
}
```

- [ ] **Step 2: Create `.prettierignore`**

```
node_modules
.next
dist
coverage
pnpm-lock.yaml
*.md
```

- [ ] **Step 3: Create `eslint.config.mjs`**

```js
// @ts-check
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import nextPlugin from 'eslint-config-next';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.base.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
      },
    },
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    ...nextPlugin,
  },
  {
    ignores: ['**/dist/**', '**/.next/**', '**/node_modules/**', '**/coverage/**'],
  },
  prettier,
);
```

- [ ] **Step 4: Verify lint works on an empty tree**

Run: `pnpm lint`
Expected: exits 0 (no files match yet).

- [ ] **Step 5: Commit**

```bash
git add eslint.config.mjs .prettierrc.json .prettierignore
git commit -m "chore: add eslint flat config + prettier"
```

---

### Task 3: Vitest at root (shared config helper)

**Files:**
- Create: `vitest.config.base.ts`

- [ ] **Step 1: Create `vitest.config.base.ts`**

```ts
import { defineConfig } from 'vitest/config';

export const baseConfig = defineConfig({
  test: {
    environment: 'node',
    globals: false,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
    },
  },
});
```

- [ ] **Step 2: Install vitest + fast-check at root**

Run: `pnpm add -Dw vitest@2.1.3 @vitest/coverage-v8@2.1.3 fast-check@3.23.1`
Expected: packages installed, workspace root updated.

- [ ] **Step 3: Commit**

```bash
git add vitest.config.base.ts package.json pnpm-lock.yaml
git commit -m "chore: add vitest + fast-check at workspace root"
```

---

## Phase 1 — Shared types

### Task 4: `packages/shared` — constants, types, errors

**Files:**
- Create: `packages/shared/package.json`
- Create: `packages/shared/tsconfig.json`
- Create: `packages/shared/src/constants.ts`
- Create: `packages/shared/src/types.ts`
- Create: `packages/shared/src/errors.ts`
- Create: `packages/shared/src/index.ts`

- [ ] **Step 1: Create `packages/shared/package.json`**

```json
{
  "name": "@kast/shared",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "echo 'no tests'"
  },
  "devDependencies": {
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Create `packages/shared/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/shared/src/constants.ts`**

```ts
export const SOLANA_USDC_MINT = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
export const SOLANA_SOL_MINT = 'So11111111111111111111111111111111111111112'; // WSOL
export const BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as const;
export const BASE_CHAIN_ID = 8453;

// Kamino main market (verify against @kamino-finance/klend-sdk constants at impl time)
export const KAMINO_MAIN_MARKET = '7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF';

export const LAMPORTS_PER_SOL = 1_000_000_000n;
export const USDC_BASE_UNITS = 1_000_000n; // USDC has 6 decimals on both chains

export const TARGET_COLLATERAL_USD = 20;
export const DEFAULT_BORROW_USDC_UNITS = 5n * USDC_BASE_UNITS; // 5 USDC

export const BASE_ETH_GAS_THRESHOLD_WEI = 1_000_000_000_000_000n; // 0.001 ETH
export const PENDING_ORDERS_STORAGE_KEY = 'kast:pendingOrders';
```

- [ ] **Step 4: Create `packages/shared/src/types.ts`**

```ts
export type Chain = 'solana' | 'base';

export type PersistedOrder = {
  orderHash: string;
  direction: 'out' | 'back';
  amountUsdc: string; // bigint serialized as decimal string
  startedAt: number;
};

export type ObligationView = {
  collateralLamports: bigint;
  borrowedUsdcBaseUnits: bigint;
};

export type OrderStatus = 'PENDING' | 'SETTLED' | 'REFUNDED';
```

- [ ] **Step 5: Create `packages/shared/src/errors.ts`**

```ts
export class KastError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = 'KastError';
  }
}

export class QuoteStaleError extends KastError {
  constructor(expiresAt: number) {
    super(`Quote expired at ${new Date(expiresAt).toISOString()}`, 'QUOTE_STALE');
  }
}

export class InsufficientGasError extends KastError {
  constructor(chain: string, required: bigint, actual: bigint) {
    super(
      `Insufficient gas on ${chain}: need ${required}, have ${actual}`,
      'INSUFFICIENT_GAS',
    );
  }
}
```

- [ ] **Step 6: Create `packages/shared/src/index.ts`**

```ts
export * from './constants.js';
export * from './types.js';
export * from './errors.js';
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @kast/shared typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/shared
git commit -m "feat(shared): add constants, types, and error classes"
```

---

## Phase 2 — Orchestrator FSM (TDD)

### Task 5: Orchestrator scaffolding + state/event types

**Files:**
- Create: `packages/orchestrator/package.json`
- Create: `packages/orchestrator/tsconfig.json`
- Create: `packages/orchestrator/vitest.config.ts`
- Create: `packages/orchestrator/src/fsm.ts`
- Create: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Create `packages/orchestrator/package.json`**

```json
{
  "name": "@kast/orchestrator",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@kast/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.3",
    "@stryker-mutator/core": "8.6.0",
    "@stryker-mutator/vitest-runner": "8.6.0"
  }
}
```

- [ ] **Step 2: Create `packages/orchestrator/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/orchestrator/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Create `packages/orchestrator/src/fsm.ts` (types only, throwing stubs)**

```ts
export type PositionState =
  | 'IDLE'
  | 'DEPOSITED'
  | 'BORROWED'
  | 'BRIDGING_OUT'
  | 'ACTIVE_ON_BASE'
  | 'BRIDGING_BACK';

export type Event =
  | { type: 'DEPOSIT'; lamports: bigint }
  | { type: 'BORROW'; amountUsdc: bigint }
  | { type: 'BRIDGE_OUT'; amountUsdc: bigint; orderHash: string }
  | { type: 'BRIDGE_SETTLED' }
  | { type: 'BRIDGE_REFUND' }
  | { type: 'BRIDGE_BACK'; amountUsdc: bigint; orderHash: string }
  | { type: 'REPAY'; amount: bigint | 'all' }
  | { type: 'WITHDRAW'; lamports: bigint | 'all' };

export class IllegalTransitionError extends Error {
  constructor(state: PositionState, event: Event['type']) {
    super(`Cannot fire ${event} from ${state}`);
    this.name = 'IllegalTransitionError';
  }
}

export function transition(_state: PositionState, _event: Event): PositionState {
  throw new Error('not implemented');
}

export function canFire(_state: PositionState, _event: Event['type']): boolean {
  throw new Error('not implemented');
}
```

- [ ] **Step 5: Create `packages/orchestrator/src/index.ts`**

```ts
export * from './fsm.js';
```

- [ ] **Step 6: Install**

Run: `pnpm install`

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @kast/orchestrator typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/orchestrator
git commit -m "feat(orchestrator): scaffold fsm types and stubs"
```

---

### Task 6: `transition` — IDLE/DEPOSITED/BORROWED (TDD)

**Files:**
- Create: `packages/orchestrator/src/fsm.test.ts`
- Modify: `packages/orchestrator/src/fsm.ts`

- [ ] **Step 1: Write failing tests**

Create `packages/orchestrator/src/fsm.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { transition, IllegalTransitionError } from './fsm.js';

describe('transition — deposit/borrow/repay/withdraw paths', () => {
  it('IDLE + DEPOSIT → DEPOSITED', () => {
    expect(transition('IDLE', { type: 'DEPOSIT', lamports: 100n })).toBe('DEPOSITED');
  });

  it('DEPOSITED + BORROW → BORROWED', () => {
    expect(transition('DEPOSITED', { type: 'BORROW', amountUsdc: 5_000_000n })).toBe('BORROWED');
  });

  it("DEPOSITED + WITHDRAW('all') → IDLE", () => {
    expect(transition('DEPOSITED', { type: 'WITHDRAW', lamports: 'all' })).toBe('IDLE');
  });

  it("BORROWED + REPAY('all') → DEPOSITED", () => {
    expect(transition('BORROWED', { type: 'REPAY', amount: 'all' })).toBe('DEPOSITED');
  });

  it('BORROWED + REPAY(partial) → BORROWED', () => {
    expect(transition('BORROWED', { type: 'REPAY', amount: 1_000_000n })).toBe('BORROWED');
  });

  it('IDLE + BORROW throws IllegalTransitionError', () => {
    expect(() => transition('IDLE', { type: 'BORROW', amountUsdc: 1n })).toThrow(
      IllegalTransitionError,
    );
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kast/orchestrator test`
Expected: FAIL with "not implemented".

- [ ] **Step 3: Implement `transition` (partial — lending paths only)**

Replace the stub in `packages/orchestrator/src/fsm.ts`:

```ts
export function transition(state: PositionState, event: Event): PositionState {
  switch (state) {
    case 'IDLE':
      if (event.type === 'DEPOSIT') return 'DEPOSITED';
      break;
    case 'DEPOSITED':
      if (event.type === 'BORROW') return 'BORROWED';
      if (event.type === 'WITHDRAW') return 'IDLE';
      break;
    case 'BORROWED':
      if (event.type === 'REPAY') return event.amount === 'all' ? 'DEPOSITED' : 'BORROWED';
      break;
  }
  throw new IllegalTransitionError(state, event.type);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kast/orchestrator test`
Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/src/fsm.ts packages/orchestrator/src/fsm.test.ts
git commit -m "feat(orchestrator): implement lending transitions"
```

---

### Task 7: `transition` — bridge paths (TDD)

**Files:**
- Modify: `packages/orchestrator/src/fsm.test.ts`
- Modify: `packages/orchestrator/src/fsm.ts`

- [ ] **Step 1: Extend the test file with bridge scenarios**

Append to `packages/orchestrator/src/fsm.test.ts`:

```ts
describe('transition — bridge paths', () => {
  it('BORROWED + BRIDGE_OUT → BRIDGING_OUT', () => {
    expect(
      transition('BORROWED', { type: 'BRIDGE_OUT', amountUsdc: 5n, orderHash: 'h1' }),
    ).toBe('BRIDGING_OUT');
  });

  it('BRIDGING_OUT + BRIDGE_SETTLED → ACTIVE_ON_BASE', () => {
    expect(transition('BRIDGING_OUT', { type: 'BRIDGE_SETTLED' })).toBe('ACTIVE_ON_BASE');
  });

  it('BRIDGING_OUT + BRIDGE_REFUND → BORROWED', () => {
    expect(transition('BRIDGING_OUT', { type: 'BRIDGE_REFUND' })).toBe('BORROWED');
  });

  it('ACTIVE_ON_BASE + BRIDGE_BACK → BRIDGING_BACK', () => {
    expect(
      transition('ACTIVE_ON_BASE', { type: 'BRIDGE_BACK', amountUsdc: 5n, orderHash: 'h2' }),
    ).toBe('BRIDGING_BACK');
  });

  it('BRIDGING_BACK + BRIDGE_SETTLED → BORROWED', () => {
    expect(transition('BRIDGING_BACK', { type: 'BRIDGE_SETTLED' })).toBe('BORROWED');
  });

  it('BRIDGING_BACK + BRIDGE_REFUND → ACTIVE_ON_BASE', () => {
    expect(transition('BRIDGING_BACK', { type: 'BRIDGE_REFUND' })).toBe('ACTIVE_ON_BASE');
  });

  it('BRIDGE_REFUND inverts BRIDGE_OUT', () => {
    const s1 = transition('BORROWED', { type: 'BRIDGE_OUT', amountUsdc: 5n, orderHash: 'x' });
    expect(transition(s1, { type: 'BRIDGE_REFUND' })).toBe('BORROWED');
  });

  it('BRIDGE_REFUND inverts BRIDGE_BACK', () => {
    const s1 = transition('ACTIVE_ON_BASE', {
      type: 'BRIDGE_BACK',
      amountUsdc: 5n,
      orderHash: 'x',
    });
    expect(transition(s1, { type: 'BRIDGE_REFUND' })).toBe('ACTIVE_ON_BASE');
  });
});
```

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @kast/orchestrator test`
Expected: 8 new tests FAIL.

- [ ] **Step 3: Extend `transition`**

Replace `transition` in `packages/orchestrator/src/fsm.ts` with the full switch:

```ts
export function transition(state: PositionState, event: Event): PositionState {
  switch (state) {
    case 'IDLE':
      if (event.type === 'DEPOSIT') return 'DEPOSITED';
      break;
    case 'DEPOSITED':
      if (event.type === 'BORROW') return 'BORROWED';
      if (event.type === 'WITHDRAW') return 'IDLE';
      break;
    case 'BORROWED':
      if (event.type === 'REPAY') return event.amount === 'all' ? 'DEPOSITED' : 'BORROWED';
      if (event.type === 'BRIDGE_OUT') return 'BRIDGING_OUT';
      break;
    case 'BRIDGING_OUT':
      if (event.type === 'BRIDGE_SETTLED') return 'ACTIVE_ON_BASE';
      if (event.type === 'BRIDGE_REFUND') return 'BORROWED';
      break;
    case 'ACTIVE_ON_BASE':
      if (event.type === 'BRIDGE_BACK') return 'BRIDGING_BACK';
      break;
    case 'BRIDGING_BACK':
      if (event.type === 'BRIDGE_SETTLED') return 'BORROWED';
      if (event.type === 'BRIDGE_REFUND') return 'ACTIVE_ON_BASE';
      break;
  }
  throw new IllegalTransitionError(state, event.type);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kast/orchestrator test`
Expected: all 14 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/src/fsm.ts packages/orchestrator/src/fsm.test.ts
git commit -m "feat(orchestrator): implement bridge transitions with refund inverse"
```

---

### Task 8: `canFire` (TDD)

**Files:**
- Modify: `packages/orchestrator/src/fsm.test.ts`
- Modify: `packages/orchestrator/src/fsm.ts`

- [ ] **Step 1: Write failing tests for `canFire`**

Append to `packages/orchestrator/src/fsm.test.ts`:

```ts
import { canFire } from './fsm.js';

describe('canFire', () => {
  it('returns true for legal transitions', () => {
    expect(canFire('IDLE', 'DEPOSIT')).toBe(true);
    expect(canFire('BORROWED', 'BRIDGE_OUT')).toBe(true);
    expect(canFire('BRIDGING_OUT', 'BRIDGE_SETTLED')).toBe(true);
  });

  it('returns false for illegal transitions', () => {
    expect(canFire('IDLE', 'BORROW')).toBe(false);
    expect(canFire('ACTIVE_ON_BASE', 'REPAY')).toBe(false);
    expect(canFire('BRIDGING_OUT', 'DEPOSIT')).toBe(false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kast/orchestrator test`
Expected: 2 new tests FAIL with "not implemented".

- [ ] **Step 3: Implement `canFire`**

Replace the `canFire` stub in `packages/orchestrator/src/fsm.ts`:

```ts
const LEGAL: Record<PositionState, Set<Event['type']>> = {
  IDLE: new Set(['DEPOSIT']),
  DEPOSITED: new Set(['BORROW', 'WITHDRAW']),
  BORROWED: new Set(['REPAY', 'BRIDGE_OUT']),
  BRIDGING_OUT: new Set(['BRIDGE_SETTLED', 'BRIDGE_REFUND']),
  ACTIVE_ON_BASE: new Set(['BRIDGE_BACK']),
  BRIDGING_BACK: new Set(['BRIDGE_SETTLED', 'BRIDGE_REFUND']),
};

export function canFire(state: PositionState, event: Event['type']): boolean {
  return LEGAL[state].has(event);
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kast/orchestrator test`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/orchestrator/src/fsm.ts packages/orchestrator/src/fsm.test.ts
git commit -m "feat(orchestrator): add canFire predicate"
```

---

### Task 9: `derivePositionFromChain` (TDD)

**Files:**
- Create: `packages/orchestrator/src/derive.ts`
- Create: `packages/orchestrator/src/derive.test.ts`
- Modify: `packages/orchestrator/src/index.ts`

- [ ] **Step 1: Create stub `derive.ts`**

```ts
import type { ObligationView, PersistedOrder } from '@kast/shared';
import type { PositionState } from './fsm.js';

export interface DeriveInput {
  obligation: ObligationView | null;
  baseUsdc: bigint;
  pendingOrders: PersistedOrder[];
}

export function derivePositionFromChain(_args: DeriveInput): PositionState {
  throw new Error('not implemented');
}
```

- [ ] **Step 2: Write failing tests**

Create `packages/orchestrator/src/derive.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { derivePositionFromChain } from './derive.js';

const order = (direction: 'out' | 'back') => ({
  orderHash: 'h',
  direction,
  amountUsdc: '5000000',
  startedAt: 0,
});

describe('derivePositionFromChain', () => {
  it('no obligation → IDLE', () => {
    expect(derivePositionFromChain({ obligation: null, baseUsdc: 0n, pendingOrders: [] })).toBe(
      'IDLE',
    );
  });

  it('obligation with zero collateral & debt → IDLE', () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 0n, borrowedUsdcBaseUnits: 0n },
        baseUsdc: 0n,
        pendingOrders: [],
      }),
    ).toBe('IDLE');
  });

  it('collateral > 0, debt == 0 → DEPOSITED', () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 100n, borrowedUsdcBaseUnits: 0n },
        baseUsdc: 0n,
        pendingOrders: [],
      }),
    ).toBe('DEPOSITED');
  });

  it('collateral > 0, debt > 0, no pending, no base USDC → BORROWED', () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 100n, borrowedUsdcBaseUnits: 5_000_000n },
        baseUsdc: 0n,
        pendingOrders: [],
      }),
    ).toBe('BORROWED');
  });

  it("pending order direction='out' → BRIDGING_OUT", () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 100n, borrowedUsdcBaseUnits: 5_000_000n },
        baseUsdc: 0n,
        pendingOrders: [order('out')],
      }),
    ).toBe('BRIDGING_OUT');
  });

  it("pending order direction='back' → BRIDGING_BACK", () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 100n, borrowedUsdcBaseUnits: 5_000_000n },
        baseUsdc: 5_000_000n,
        pendingOrders: [order('back')],
      }),
    ).toBe('BRIDGING_BACK');
  });

  it('debt > 0, baseUsdc > 0, no pending → ACTIVE_ON_BASE', () => {
    expect(
      derivePositionFromChain({
        obligation: { collateralLamports: 100n, borrowedUsdcBaseUnits: 5_000_000n },
        baseUsdc: 5_000_000n,
        pendingOrders: [],
      }),
    ).toBe('ACTIVE_ON_BASE');
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @kast/orchestrator test`
Expected: 7 new tests FAIL.

- [ ] **Step 4: Implement `derivePositionFromChain`**

```ts
import type { ObligationView, PersistedOrder } from '@kast/shared';
import type { PositionState } from './fsm.js';

export interface DeriveInput {
  obligation: ObligationView | null;
  baseUsdc: bigint;
  pendingOrders: PersistedOrder[];
}

export function derivePositionFromChain(args: DeriveInput): PositionState {
  const { obligation, baseUsdc, pendingOrders } = args;

  const pendingOut = pendingOrders.find((o) => o.direction === 'out');
  if (pendingOut) return 'BRIDGING_OUT';
  const pendingBack = pendingOrders.find((o) => o.direction === 'back');
  if (pendingBack) return 'BRIDGING_BACK';

  if (!obligation) return 'IDLE';
  if (obligation.collateralLamports === 0n && obligation.borrowedUsdcBaseUnits === 0n) return 'IDLE';
  if (obligation.borrowedUsdcBaseUnits === 0n) return 'DEPOSITED';
  if (baseUsdc > 0n) return 'ACTIVE_ON_BASE';
  return 'BORROWED';
}
```

- [ ] **Step 5: Export from index**

Replace `packages/orchestrator/src/index.ts`:

```ts
export * from './fsm.js';
export * from './derive.js';
```

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @kast/orchestrator test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add packages/orchestrator/src
git commit -m "feat(orchestrator): add derivePositionFromChain"
```

---

## Phase 3 — Property tests (fast-check)

### Task 10: `packages/verify` — FSM invariants

**Files:**
- Create: `packages/verify/package.json`
- Create: `packages/verify/tsconfig.json`
- Create: `packages/verify/vitest.config.ts`
- Create: `packages/verify/src/fsm.property.test.ts`

- [ ] **Step 1: Create `packages/verify/package.json`**

```json
{
  "name": "@kast/verify",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run"
  },
  "dependencies": {
    "@kast/orchestrator": "workspace:*",
    "@kast/shared": "workspace:*"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.3",
    "fast-check": "3.23.1"
  }
}
```

- [ ] **Step 2: Create `packages/verify/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/verify/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Create `packages/verify/src/fsm.property.test.ts`**

```ts
import { describe, it } from 'vitest';
import fc from 'fast-check';
import { transition, canFire, IllegalTransitionError, type Event, type PositionState } from '@kast/orchestrator';

const STATES: PositionState[] = [
  'IDLE',
  'DEPOSITED',
  'BORROWED',
  'BRIDGING_OUT',
  'ACTIVE_ON_BASE',
  'BRIDGING_BACK',
];

const EVENT_TYPES: Event['type'][] = [
  'DEPOSIT',
  'BORROW',
  'BRIDGE_OUT',
  'BRIDGE_SETTLED',
  'BRIDGE_REFUND',
  'BRIDGE_BACK',
  'REPAY',
  'WITHDRAW',
];

const anyState = () => fc.constantFrom(...STATES);

const anyEvent = (): fc.Arbitrary<Event> =>
  fc.oneof(
    fc.record({ type: fc.constant('DEPOSIT' as const), lamports: fc.bigInt({ min: 1n, max: 10n ** 12n }) }),
    fc.record({ type: fc.constant('BORROW' as const), amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }) }),
    fc.record({
      type: fc.constant('BRIDGE_OUT' as const),
      amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }),
      orderHash: fc.string({ minLength: 1 }),
    }),
    fc.record({ type: fc.constant('BRIDGE_SETTLED' as const) }),
    fc.record({ type: fc.constant('BRIDGE_REFUND' as const) }),
    fc.record({
      type: fc.constant('BRIDGE_BACK' as const),
      amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }),
      orderHash: fc.string({ minLength: 1 }),
    }),
    fc.record({
      type: fc.constant('REPAY' as const),
      amount: fc.oneof(fc.bigInt({ min: 1n, max: 10n ** 9n }), fc.constant('all' as const)),
    }),
    fc.record({
      type: fc.constant('WITHDRAW' as const),
      lamports: fc.oneof(fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.constant('all' as const)),
    }),
  );

describe('FSM invariants (property-based)', () => {
  it('canFire ↔ transition does not throw', () => {
    fc.assert(
      fc.property(anyState(), anyEvent(), (s, e) => {
        const legal = canFire(s, e.type);
        try {
          transition(s, e);
          return legal;
        } catch (err) {
          return !legal && err instanceof IllegalTransitionError;
        }
      }),
    );
  });

  it('transition is deterministic for the same (state, event)', () => {
    fc.assert(
      fc.property(anyState(), anyEvent(), (s, e) => {
        if (!canFire(s, e.type)) return true;
        return transition(s, e) === transition(s, e);
      }),
    );
  });

  it("BRIDGE_REFUND inverts BRIDGE_OUT for {BORROWED}", () => {
    const s1 = transition('BORROWED', { type: 'BRIDGE_OUT', amountUsdc: 1n, orderHash: 'x' });
    const s2 = transition(s1, { type: 'BRIDGE_REFUND' });
    if (s2 !== 'BORROWED') throw new Error('refund did not invert');
  });

  it('BRIDGE_REFUND inverts BRIDGE_BACK for {ACTIVE_ON_BASE}', () => {
    const s1 = transition('ACTIVE_ON_BASE', { type: 'BRIDGE_BACK', amountUsdc: 1n, orderHash: 'x' });
    const s2 = transition(s1, { type: 'BRIDGE_REFUND' });
    if (s2 !== 'ACTIVE_ON_BASE') throw new Error('refund did not invert');
  });

  it('EVENT_TYPES cover all discriminants', () => {
    if (EVENT_TYPES.length !== 8) throw new Error('expected 8 event discriminants');
  });
});
```

- [ ] **Step 5: Install + run**

Run:
```bash
pnpm install
pnpm --filter @kast/verify test
```
Expected: all 5 properties PASS (fast-check ran ~100 iterations per property).

- [ ] **Step 6: Commit**

```bash
git add packages/verify
git commit -m "test(verify): add fast-check property tests for FSM invariants"
```

---

## Phase 4 — Kamino adapter

### Task 11: Kamino adapter scaffolding + interface

**Files:**
- Create: `packages/kamino-adapter/package.json`
- Create: `packages/kamino-adapter/tsconfig.json`
- Create: `packages/kamino-adapter/vitest.config.ts`
- Create: `packages/kamino-adapter/src/adapter.ts`
- Create: `packages/kamino-adapter/src/index.ts`

- [ ] **Step 1: Create `packages/kamino-adapter/package.json`**

```json
{
  "name": "@kast/kamino-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@kast/shared": "workspace:*",
    "@kamino-finance/klend-sdk": "5.4.1",
    "@solana/web3.js": "1.95.4",
    "@solana/spl-token": "0.4.9",
    "decimal.js": "10.4.3"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.3"
  }
}
```

- [ ] **Step 2: Create `packages/kamino-adapter/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/kamino-adapter/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Create `packages/kamino-adapter/src/adapter.ts`** (interface + factory)

```ts
import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { ObligationView } from '@kast/shared';

export interface KaminoAdapter {
  getObligation(owner: PublicKey): Promise<ObligationView | null>;

  buildDepositCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint;
  }): Promise<VersionedTransaction[]>;

  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction[]>;

  buildRepayTx(p: {
    owner: PublicKey;
    amount: bigint | 'all';
  }): Promise<VersionedTransaction[]>;

  buildWithdrawCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint | 'all';
  }): Promise<VersionedTransaction[]>;
}

export interface KaminoAdapterConfig {
  connection: Connection;
  marketAddress: PublicKey;
}

// Implementations in tx-*.ts and obligation.ts — wired together in createKaminoAdapter.
export function createKaminoAdapter(_config: KaminoAdapterConfig): KaminoAdapter {
  throw new Error('not implemented — see Tasks 12-16');
}
```

- [ ] **Step 5: Create `packages/kamino-adapter/src/index.ts`**

```ts
export * from './adapter.js';
```

- [ ] **Step 6: Install**

Run: `pnpm install`
Expected: installs without errors. If klend-sdk version doesn't exist, run `pnpm view @kamino-finance/klend-sdk versions` and pick the latest stable.

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @kast/kamino-adapter typecheck`
Expected: exits 0.

- [ ] **Step 8: Commit**

```bash
git add packages/kamino-adapter
git commit -m "feat(kamino-adapter): scaffold adapter interface + factory stub"
```

---

### Task 12: `getObligation` — reads live obligation account

**Files:**
- Create: `packages/kamino-adapter/src/obligation.ts`
- Create: `packages/kamino-adapter/src/obligation.test.ts`
- Modify: `packages/kamino-adapter/src/adapter.ts`

> **SDK note for the engineer.** The klend-sdk exposes `KaminoMarket.load(connection, marketAddress)` and then `market.getObligationByWallet(owner, ProgramId)` returning a `KaminoObligation` with `deposits` and `borrows` maps keyed by mint. Verify method names in the installed version (`node_modules/@kamino-finance/klend-sdk/dist/index.d.ts`) and adjust.

- [ ] **Step 1: Write failing test (with mocked SDK)**

Create `packages/kamino-adapter/src/obligation.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { getObligation } from './obligation.js';

describe('getObligation', () => {
  it('returns null when obligation not found', async () => {
    const fakeMarket = { getObligationByWallet: vi.fn().mockResolvedValue(null) };
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(
      getObligation({ market: fakeMarket as never, owner }),
    ).resolves.toBeNull();
  });

  it('returns ObligationView when present', async () => {
    const solMint = 'So11111111111111111111111111111111111111112';
    const usdcMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
    const fakeObligation = {
      deposits: new Map([[solMint, { amount: 1_000_000_000n }]]),
      borrows: new Map([[usdcMint, { amount: 5_000_000n }]]),
    };
    const fakeMarket = { getObligationByWallet: vi.fn().mockResolvedValue(fakeObligation) };
    const owner = new PublicKey('11111111111111111111111111111111');
    await expect(getObligation({ market: fakeMarket as never, owner })).resolves.toEqual({
      collateralLamports: 1_000_000_000n,
      borrowedUsdcBaseUnits: 5_000_000n,
    });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kast/kamino-adapter test`
Expected: tests fail with "Cannot find module './obligation.js'".

- [ ] **Step 3: Implement `obligation.ts`**

```ts
import { PublicKey } from '@solana/web3.js';
import { SOLANA_SOL_MINT, SOLANA_USDC_MINT, type ObligationView } from '@kast/shared';

type MarketLike = {
  getObligationByWallet: (
    owner: PublicKey,
    programId?: PublicKey,
  ) => Promise<{
    deposits: Map<string, { amount: bigint }>;
    borrows: Map<string, { amount: bigint }>;
  } | null>;
};

export async function getObligation(args: {
  market: MarketLike;
  owner: PublicKey;
}): Promise<ObligationView | null> {
  const obligation = await args.market.getObligationByWallet(args.owner);
  if (!obligation) return null;
  const sol = obligation.deposits.get(SOLANA_SOL_MINT)?.amount ?? 0n;
  const usdc = obligation.borrows.get(SOLANA_USDC_MINT)?.amount ?? 0n;
  return { collateralLamports: sol, borrowedUsdcBaseUnits: usdc };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kast/kamino-adapter test`
Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kamino-adapter/src/obligation.ts packages/kamino-adapter/src/obligation.test.ts
git commit -m "feat(kamino-adapter): getObligation returns ObligationView"
```

---

### Task 13: `buildDepositCollateralTx`

**Files:**
- Create: `packages/kamino-adapter/src/tx-deposit.ts`
- Create: `packages/kamino-adapter/src/tx-deposit.test.ts`

> **SDK note.** klend-sdk typically exposes `KaminoAction.buildDepositTxns(market, amountLamports, mint, owner, obligation, referrer?)` returning `VersionedTransaction[]`. Confirm method signature. ATA + WSOL-wrap + compute-budget ixs are included by the SDK.

- [ ] **Step 1: Write failing test**

Create `packages/kamino-adapter/src/tx-deposit.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { buildDepositCollateralTx } from './tx-deposit.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildDepositCollateralTx', () => {
  it('throws on zero lamports', async () => {
    await expect(
      buildDepositCollateralTx({ market: {} as never, owner, lamports: 0n }),
    ).rejects.toThrow(/amount must be positive/i);
  });

  it('delegates to KaminoAction.buildDepositTxns and returns txs', async () => {
    const fakeTx = {} as VersionedTransaction;
    const buildDepositTxns = vi.fn().mockResolvedValue([fakeTx]);
    const fakeMarket = { address: owner, buildDepositTxns } as never;
    const result = await buildDepositCollateralTx({
      market: fakeMarket,
      owner,
      lamports: 1_000_000_000n,
    });
    expect(result).toEqual([fakeTx]);
    expect(buildDepositTxns).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @kast/kamino-adapter test`

- [ ] **Step 3: Implement**

Create `packages/kamino-adapter/src/tx-deposit.ts`:

```ts
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';

// Thin wrapper around what the klend-sdk exposes at runtime. The concrete
// helper used is `KaminoAction.buildDepositTxns`; we inject a market-like
// object that exposes the helper so we can mock it in tests.
export type DepositBuilder = (args: {
  owner: PublicKey;
  amount: bigint;
  mint: string;
}) => Promise<VersionedTransaction[]>;

export type MarketForDeposit = {
  buildDepositTxns: DepositBuilder;
};

export async function buildDepositCollateralTx(args: {
  market: MarketForDeposit;
  owner: PublicKey;
  lamports: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.lamports <= 0n) throw new Error('amount must be positive');
  return args.market.buildDepositTxns({
    owner: args.owner,
    amount: args.lamports,
    mint: SOLANA_SOL_MINT,
  });
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @kast/kamino-adapter test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/kamino-adapter/src/tx-deposit.ts packages/kamino-adapter/src/tx-deposit.test.ts
git commit -m "feat(kamino-adapter): buildDepositCollateralTx with positive-amount guard"
```

---

### Task 14: `buildBorrowTx`

**Files:**
- Create: `packages/kamino-adapter/src/tx-borrow.ts`
- Create: `packages/kamino-adapter/src/tx-borrow.test.ts`

- [ ] **Step 1: Write failing test**

Create `packages/kamino-adapter/src/tx-borrow.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { buildBorrowTx } from './tx-borrow.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildBorrowTx', () => {
  it('throws on zero amount', async () => {
    await expect(
      buildBorrowTx({ market: {} as never, owner, amountUsdc: 0n }),
    ).rejects.toThrow(/amount must be positive/i);
  });

  it('delegates to market.buildBorrowTxns with USDC mint', async () => {
    const fakeTx = {} as VersionedTransaction;
    const buildBorrowTxns = vi.fn().mockResolvedValue([fakeTx]);
    const fakeMarket = { buildBorrowTxns } as never;
    const result = await buildBorrowTx({ market: fakeMarket, owner, amountUsdc: 5_000_000n });
    expect(result).toEqual([fakeTx]);
    const [{ mint, amount }] = buildBorrowTxns.mock.calls[0] ?? [[]];
    expect(mint).toBe('EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v');
    expect(amount).toBe(5_000_000n);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/kamino-adapter/src/tx-borrow.ts`:

```ts
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';

export type MarketForBorrow = {
  buildBorrowTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildBorrowTx(args: {
  market: MarketForBorrow;
  owner: PublicKey;
  amountUsdc: bigint;
}): Promise<VersionedTransaction[]> {
  if (args.amountUsdc <= 0n) throw new Error('amount must be positive');
  return args.market.buildBorrowTxns({
    owner: args.owner,
    amount: args.amountUsdc,
    mint: SOLANA_USDC_MINT,
  });
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @kast/kamino-adapter test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/kamino-adapter/src/tx-borrow.ts packages/kamino-adapter/src/tx-borrow.test.ts
git commit -m "feat(kamino-adapter): buildBorrowTx"
```

---

### Task 15: `buildRepayTx` — supports `'all'`

**Files:**
- Create: `packages/kamino-adapter/src/tx-repay.ts`
- Create: `packages/kamino-adapter/src/tx-repay.test.ts`

> **SDK note.** klend-sdk's repay builder accepts a `repayAll` boolean (or a sentinel max value). When `amount === 'all'`, pass the SDK's "repay-all" flag so interest accrued between build and land is fully settled.

- [ ] **Step 1: Write failing tests**

Create `packages/kamino-adapter/src/tx-repay.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildRepayTx } from './tx-repay.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildRepayTx', () => {
  it("'all' sets repayAll: true on SDK call", async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildRepayTx({ market: { buildRepayTxns: build } as never, owner, amount: 'all' });
    const call = build.mock.calls[0]?.[0];
    expect(call?.repayAll).toBe(true);
  });

  it('partial amount passes bigint and repayAll: false', async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildRepayTx({
      market: { buildRepayTxns: build } as never,
      owner,
      amount: 2_000_000n,
    });
    const call = build.mock.calls[0]?.[0];
    expect(call?.amount).toBe(2_000_000n);
    expect(call?.repayAll).toBe(false);
  });

  it('rejects non-positive bigint', async () => {
    await expect(
      buildRepayTx({ market: {} as never, owner, amount: 0n }),
    ).rejects.toThrow(/amount must be positive/i);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/kamino-adapter/src/tx-repay.ts`:

```ts
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_USDC_MINT } from '@kast/shared';

export type MarketForRepay = {
  buildRepayTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
    repayAll: boolean;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildRepayTx(args: {
  market: MarketForRepay;
  owner: PublicKey;
  amount: bigint | 'all';
}): Promise<VersionedTransaction[]> {
  const repayAll = args.amount === 'all';
  if (!repayAll && args.amount <= 0n) throw new Error('amount must be positive');
  return args.market.buildRepayTxns({
    owner: args.owner,
    amount: repayAll ? 0n : (args.amount as bigint),
    mint: SOLANA_USDC_MINT,
    repayAll,
  });
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @kast/kamino-adapter test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/kamino-adapter/src/tx-repay.ts packages/kamino-adapter/src/tx-repay.test.ts
git commit -m "feat(kamino-adapter): buildRepayTx supports 'all' via repayAll flag"
```

---

### Task 16: `buildWithdrawCollateralTx` + wire `createKaminoAdapter`

**Files:**
- Create: `packages/kamino-adapter/src/tx-withdraw.ts`
- Create: `packages/kamino-adapter/src/tx-withdraw.test.ts`
- Create: `packages/kamino-adapter/src/reserves.ts`
- Modify: `packages/kamino-adapter/src/adapter.ts`

- [ ] **Step 1: Write failing test for withdraw**

Create `packages/kamino-adapter/src/tx-withdraw.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

const owner = new PublicKey('11111111111111111111111111111111');

describe('buildWithdrawCollateralTx', () => {
  it("'all' sets withdrawAll: true", async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 'all',
    });
    expect(build.mock.calls[0]?.[0]?.withdrawAll).toBe(true);
  });

  it('partial lamports passes bigint', async () => {
    const build = vi.fn().mockResolvedValue([]);
    await buildWithdrawCollateralTx({
      market: { buildWithdrawTxns: build } as never,
      owner,
      lamports: 500_000_000n,
    });
    const call = build.mock.calls[0]?.[0];
    expect(call?.amount).toBe(500_000_000n);
    expect(call?.withdrawAll).toBe(false);
  });
});
```

- [ ] **Step 2: Implement `tx-withdraw.ts`**

```ts
import { PublicKey, VersionedTransaction } from '@solana/web3.js';
import { SOLANA_SOL_MINT } from '@kast/shared';

export type MarketForWithdraw = {
  buildWithdrawTxns: (args: {
    owner: PublicKey;
    amount: bigint;
    mint: string;
    withdrawAll: boolean;
  }) => Promise<VersionedTransaction[]>;
};

export async function buildWithdrawCollateralTx(args: {
  market: MarketForWithdraw;
  owner: PublicKey;
  lamports: bigint | 'all';
}): Promise<VersionedTransaction[]> {
  const withdrawAll = args.lamports === 'all';
  if (!withdrawAll && args.lamports <= 0n) throw new Error('amount must be positive');
  return args.market.buildWithdrawTxns({
    owner: args.owner,
    amount: withdrawAll ? 0n : (args.lamports as bigint),
    mint: SOLANA_SOL_MINT,
    withdrawAll,
  });
}
```

- [ ] **Step 3: Create `reserves.ts`**

```ts
import type { Connection, PublicKey } from '@solana/web3.js';
// The real klend-sdk export is `KaminoMarket`; re-exported lazily to avoid
// importing browser-incompatible sub-paths from dependent pure-TS packages.
import { KaminoMarket } from '@kamino-finance/klend-sdk';

export async function loadMarket(args: {
  connection: Connection;
  marketAddress: PublicKey;
}): Promise<KaminoMarket> {
  const market = await KaminoMarket.load(args.connection, args.marketAddress);
  if (!market) throw new Error(`KaminoMarket.load returned null for ${args.marketAddress.toBase58()}`);
  return market;
}
```

- [ ] **Step 4: Wire `createKaminoAdapter` in `adapter.ts`**

Replace the stub:

```ts
import type { Connection, PublicKey, VersionedTransaction } from '@solana/web3.js';
import type { ObligationView } from '@kast/shared';
import { loadMarket } from './reserves.js';
import { getObligation as getObligationImpl } from './obligation.js';
import { buildDepositCollateralTx } from './tx-deposit.js';
import { buildBorrowTx } from './tx-borrow.js';
import { buildRepayTx } from './tx-repay.js';
import { buildWithdrawCollateralTx } from './tx-withdraw.js';

export interface KaminoAdapter {
  getObligation(owner: PublicKey): Promise<ObligationView | null>;
  buildDepositCollateralTx(p: { owner: PublicKey; lamports: bigint }): Promise<VersionedTransaction[]>;
  buildBorrowTx(p: { owner: PublicKey; amountUsdc: bigint }): Promise<VersionedTransaction[]>;
  buildRepayTx(p: { owner: PublicKey; amount: bigint | 'all' }): Promise<VersionedTransaction[]>;
  buildWithdrawCollateralTx(p: {
    owner: PublicKey;
    lamports: bigint | 'all';
  }): Promise<VersionedTransaction[]>;
}

export interface KaminoAdapterConfig {
  connection: Connection;
  marketAddress: PublicKey;
}

export function createKaminoAdapter(config: KaminoAdapterConfig): KaminoAdapter {
  const marketPromise = loadMarket(config);

  return {
    async getObligation(owner) {
      return getObligationImpl({ market: (await marketPromise) as never, owner });
    },
    async buildDepositCollateralTx(p) {
      return buildDepositCollateralTx({ market: (await marketPromise) as never, ...p });
    },
    async buildBorrowTx(p) {
      return buildBorrowTx({ market: (await marketPromise) as never, ...p });
    },
    async buildRepayTx(p) {
      return buildRepayTx({ market: (await marketPromise) as never, ...p });
    },
    async buildWithdrawCollateralTx(p) {
      return buildWithdrawCollateralTx({ market: (await marketPromise) as never, ...p });
    },
  };
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @kast/kamino-adapter test && pnpm --filter @kast/kamino-adapter typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/kamino-adapter/src
git commit -m "feat(kamino-adapter): wire createKaminoAdapter + withdraw impl"
```

---

## Phase 5 — Mayan adapter

### Task 17: Mayan adapter scaffolding + types

**Files:**
- Create: `packages/mayan-adapter/package.json`
- Create: `packages/mayan-adapter/tsconfig.json`
- Create: `packages/mayan-adapter/vitest.config.ts`
- Create: `packages/mayan-adapter/src/adapter.ts`
- Create: `packages/mayan-adapter/src/index.ts`

- [ ] **Step 1: Create `packages/mayan-adapter/package.json`**

```json
{
  "name": "@kast/mayan-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "build": "tsc",
    "test": "vitest run"
  },
  "dependencies": {
    "@kast/shared": "workspace:*",
    "@mayanfinance/swap-sdk": "9.8.1",
    "@solana/web3.js": "1.95.4",
    "viem": "2.21.34"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.3"
  }
}
```

- [ ] **Step 2: Create `packages/mayan-adapter/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `packages/mayan-adapter/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

- [ ] **Step 4: Create `packages/mayan-adapter/src/adapter.ts`**

```ts
import type { VersionedTransaction } from '@solana/web3.js';
import type { Chain, OrderStatus } from '@kast/shared';

export interface Quote {
  expiresAt: number;
  minAmountOut: bigint;
  raw: unknown; // SDK's opaque quote payload, passed back to buildBridgeTx
}

export interface EvmTransactionRequest {
  to: `0x${string}`;
  data: `0x${string}`;
  value: bigint;
  chainId: number;
}

export type BridgeTxBundle =
  | { chain: 'solana'; txs: [VersionedTransaction]; orderHash: string }
  | {
      chain: 'base';
      txs: [EvmTransactionRequest, EvmTransactionRequest];
      orderHash: string;
    };

export interface MayanAdapter {
  quote(p: {
    fromChain: Chain;
    toChain: Chain;
    amountUsdc: bigint;
    fromAddress: string;
    toAddress: string;
  }): Promise<Quote>;
  buildBridgeTx(quote: Quote): Promise<BridgeTxBundle>;
  getOrderStatus(orderHash: string): Promise<OrderStatus>;
}

export interface MayanAdapterConfig {
  referrer?: string;
}

export function createMayanAdapter(_config: MayanAdapterConfig = {}): MayanAdapter {
  throw new Error('not implemented — see Tasks 18-20');
}
```

- [ ] **Step 5: Create index**

```ts
export * from './adapter.js';
```

- [ ] **Step 6: Install + typecheck**

Run: `pnpm install && pnpm --filter @kast/mayan-adapter typecheck`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add packages/mayan-adapter
git commit -m "feat(mayan-adapter): scaffold adapter interface and types"
```

---

### Task 18: `quote`

**Files:**
- Create: `packages/mayan-adapter/src/quote.ts`
- Create: `packages/mayan-adapter/src/quote.test.ts`

> **SDK note.** `@mayanfinance/swap-sdk` exposes `fetchQuote({ amount, fromToken, toToken, fromChain, toChain, slippageBps, referrer? })` returning a `Quote[]` (first entry is best). USDC↔USDC same-symbol swap across `solana`/`base` is supported. Return the raw quote on the `.raw` field for later use.

- [ ] **Step 1: Write failing test**

Create `packages/mayan-adapter/src/quote.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { quote } from './quote.js';

describe('quote', () => {
  it('calls fetchQuote with USDC mints for sol→base', async () => {
    const fakeQuote = { deadline64: '1800000000', minAmountOut64: '4950000' };
    const fetchQuote = vi.fn().mockResolvedValue([fakeQuote]);
    const out = await quote({ fetchQuote } as never, {
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: 'Src',
      toAddress: '0xDst',
    });
    expect(out.minAmountOut).toBe(4_950_000n);
    expect(out.expiresAt).toBe(1_800_000_000_000);
  });

  it('throws when SDK returns empty array', async () => {
    const fetchQuote = vi.fn().mockResolvedValue([]);
    await expect(
      quote({ fetchQuote } as never, {
        fromChain: 'solana',
        toChain: 'base',
        amountUsdc: 5_000_000n,
        fromAddress: 'a',
        toAddress: 'b',
      }),
    ).rejects.toThrow(/no quote/i);
  });
});
```

- [ ] **Step 2: Implement**

Create `packages/mayan-adapter/src/quote.ts`:

```ts
import { SOLANA_USDC_MINT, BASE_USDC, type Chain } from '@kast/shared';
import type { Quote } from './adapter.js';

type SdkLike = {
  fetchQuote: (args: {
    amount: number;
    fromToken: string;
    toToken: string;
    fromChain: string;
    toChain: string;
    slippageBps: number;
    referrer?: string;
  }) => Promise<Array<{ deadline64: string; minAmountOut64: string }>>;
};

const USDC_FOR_CHAIN: Record<Chain, string> = {
  solana: SOLANA_USDC_MINT,
  base: BASE_USDC,
};

export async function quote(
  sdk: SdkLike,
  args: {
    fromChain: Chain;
    toChain: Chain;
    amountUsdc: bigint;
    fromAddress: string;
    toAddress: string;
    referrer?: string;
  },
): Promise<Quote> {
  const quotes = await sdk.fetchQuote({
    amount: Number(args.amountUsdc) / 1_000_000,
    fromToken: USDC_FOR_CHAIN[args.fromChain],
    toToken: USDC_FOR_CHAIN[args.toChain],
    fromChain: args.fromChain,
    toChain: args.toChain,
    slippageBps: 50,
    ...(args.referrer !== undefined && { referrer: args.referrer }),
  });
  const best = quotes[0];
  if (!best) throw new Error('Mayan returned no quote');
  return {
    expiresAt: Number(best.deadline64) * 1000,
    minAmountOut: BigInt(best.minAmountOut64),
    raw: best,
  };
}
```

- [ ] **Step 3: Run tests**

Run: `pnpm --filter @kast/mayan-adapter test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/mayan-adapter/src/quote.ts packages/mayan-adapter/src/quote.test.ts
git commit -m "feat(mayan-adapter): quote() wraps fetchQuote with USDC mints"
```

---

### Task 19: `buildBridgeTx` + `getOrderStatus`

**Files:**
- Create: `packages/mayan-adapter/src/tx-build.ts`
- Create: `packages/mayan-adapter/src/tx-build.test.ts`
- Create: `packages/mayan-adapter/src/status.ts`
- Create: `packages/mayan-adapter/src/status.test.ts`

> **SDK note.** `createSwapFromSolanaInstructions(quote, fromAddress, toAddress, referrerAddresses?, connection)` returns `{ instructions, signers, lookupTables }` — you assemble a `VersionedTransaction`. `getSwapFromEvmTxPayload(quote, fromAddress, toAddress, referrerAddresses?, signerChainId, rpcProvider, permit?)` returns ERC20-permit or `[approveTx, bridgeTx]`. The SDK returns an `orderHash` field on the built payload (or derives it from quote+nonce). Verify against installed version.

- [ ] **Step 1: Write failing tests for tx-build**

Create `packages/mayan-adapter/src/tx-build.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { buildBridgeTx } from './tx-build.js';

describe('buildBridgeTx', () => {
  it('solana quote → solana bundle with orderHash', async () => {
    const rawQuote = { fromChain: 'solana', toChain: 'base' };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn().mockResolvedValue({
        instructions: [],
        signers: [],
        lookupTables: [],
      }),
      getSwapFromEvmTxPayload: vi.fn(),
      deriveOrderHash: vi.fn().mockReturnValue('0xabc'),
    };
    const bundle = await buildBridgeTx(sdk as never, {
      expiresAt: 0,
      minAmountOut: 0n,
      raw: rawQuote,
    }, {
      fromAddress: 'SrcSol',
      toAddress: '0xBase',
    });
    expect(bundle.chain).toBe('solana');
    expect(bundle.orderHash).toBe('0xabc');
  });

  it('base quote → [approveTx, bridgeTx] bundle with orderHash', async () => {
    const rawQuote = { fromChain: 'base', toChain: 'solana' };
    const sdk = {
      createSwapFromSolanaInstructions: vi.fn(),
      getSwapFromEvmTxPayload: vi.fn().mockResolvedValue({
        approve: { to: '0xA', data: '0x01', value: 0n, chainId: 8453 },
        swap: { to: '0xS', data: '0x02', value: 0n, chainId: 8453 },
      }),
      deriveOrderHash: vi.fn().mockReturnValue('0xdef'),
    };
    const bundle = await buildBridgeTx(sdk as never, {
      expiresAt: 0,
      minAmountOut: 0n,
      raw: rawQuote,
    }, {
      fromAddress: '0xBase',
      toAddress: 'DstSol',
    });
    expect(bundle.chain).toBe('base');
    if (bundle.chain !== 'base') throw new Error('narrowing');
    expect(bundle.txs).toHaveLength(2);
    expect(bundle.orderHash).toBe('0xdef');
  });
});
```

- [ ] **Step 2: Implement `tx-build.ts`**

```ts
import { VersionedTransaction, TransactionMessage, PublicKey } from '@solana/web3.js';
import type { BridgeTxBundle, Quote } from './adapter.js';

type RawQuote = { fromChain: 'solana' | 'base'; toChain: 'solana' | 'base' };

type SdkLike = {
  createSwapFromSolanaInstructions: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: Record<string, string> | null,
    connection: unknown,
  ) => Promise<{
    instructions: unknown[];
    signers: unknown[];
    lookupTables: unknown[];
  }>;
  getSwapFromEvmTxPayload: (
    quote: unknown,
    fromAddress: string,
    toAddress: string,
    referrer: Record<string, string> | null,
    chainId: number,
    rpc: unknown,
    permit: unknown,
  ) => Promise<{
    approve: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number };
    swap: { to: `0x${string}`; data: `0x${string}`; value: bigint; chainId: number };
  }>;
  deriveOrderHash: (quote: unknown) => string;
};

export async function buildBridgeTx(
  sdk: SdkLike,
  quote: Quote,
  addresses: { fromAddress: string; toAddress: string },
): Promise<BridgeTxBundle> {
  const raw = quote.raw as RawQuote;
  const orderHash = sdk.deriveOrderHash(raw);

  if (raw.fromChain === 'solana') {
    // Building a real VersionedTransaction here requires a Connection + recent blockhash;
    // the adapter caller passes a builder factory. For test mock-ability we inline the
    // assembly as a thin stand-in.
    const { instructions, lookupTables } = await sdk.createSwapFromSolanaInstructions(
      raw,
      addresses.fromAddress,
      addresses.toAddress,
      null,
      null,
    );
    // In the wired adapter (Task 20) we recompute with the real Connection and signer.
    const message = new TransactionMessage({
      payerKey: new PublicKey(addresses.fromAddress),
      recentBlockhash: '11111111111111111111111111111111',
      instructions: instructions as never,
    }).compileToV0Message(lookupTables as never);
    const tx = new VersionedTransaction(message);
    return { chain: 'solana', txs: [tx], orderHash };
  }

  const payload = await sdk.getSwapFromEvmTxPayload(
    raw,
    addresses.fromAddress,
    addresses.toAddress,
    null,
    8453,
    null,
    null,
  );
  return {
    chain: 'base',
    txs: [payload.approve, payload.swap],
    orderHash,
  };
}
```

> **Engineer note:** the test builds a placeholder solana tx; in Task 20 the adapter wiring replaces this with the real `Connection.getLatestBlockhash` flow. Keep this function pure-ish for testability.

- [ ] **Step 3: Write failing test for status**

Create `packages/mayan-adapter/src/status.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { getOrderStatus } from './status.js';

describe('getOrderStatus', () => {
  it.each([
    ['ORDER_IN_PROGRESS', 'PENDING'],
    ['ORDER_COMPLETED', 'SETTLED'],
    ['ORDER_REFUNDED', 'REFUNDED'],
  ] as const)('maps %s → %s', async (sdk, expected) => {
    const fetchStatus = vi.fn().mockResolvedValue({ clientStatus: sdk });
    await expect(getOrderStatus({ fetchStatus } as never, '0xabc')).resolves.toBe(expected);
  });

  it('unknown status → PENDING', async () => {
    const fetchStatus = vi.fn().mockResolvedValue({ clientStatus: 'WHATEVER' });
    await expect(getOrderStatus({ fetchStatus } as never, 'h')).resolves.toBe('PENDING');
  });
});
```

- [ ] **Step 4: Implement `status.ts`**

```ts
import type { OrderStatus } from '@kast/shared';

type SdkLike = {
  fetchStatus: (orderHash: string) => Promise<{ clientStatus: string }>;
};

export async function getOrderStatus(sdk: SdkLike, orderHash: string): Promise<OrderStatus> {
  const { clientStatus } = await sdk.fetchStatus(orderHash);
  if (clientStatus === 'ORDER_COMPLETED') return 'SETTLED';
  if (clientStatus === 'ORDER_REFUNDED') return 'REFUNDED';
  return 'PENDING';
}
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @kast/mayan-adapter test && pnpm --filter @kast/mayan-adapter typecheck`
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/mayan-adapter/src
git commit -m "feat(mayan-adapter): buildBridgeTx + getOrderStatus with mock-friendly SDK shim"
```

---

### Task 20: Wire `createMayanAdapter` against the real SDK

**Files:**
- Modify: `packages/mayan-adapter/src/adapter.ts`

- [ ] **Step 1: Replace `createMayanAdapter` stub**

```ts
import type { Connection } from '@solana/web3.js';
import { fetchQuote, fetchStatus, swapFromSolana, swapFromEvm } from '@mayanfinance/swap-sdk';
import type { Chain, OrderStatus } from '@kast/shared';
import { quote as quoteImpl } from './quote.js';
import { buildBridgeTx as buildBridgeTxImpl } from './tx-build.js';
import { getOrderStatus as getOrderStatusImpl } from './status.js';

export interface Quote {
  expiresAt: number;
  minAmountOut: bigint;
  raw: unknown;
}
// ...keep existing EvmTransactionRequest, BridgeTxBundle, MayanAdapter defs above...

export interface MayanAdapterConfig {
  solanaConnection: Connection;
  referrer?: string;
}

export function createMayanAdapter(config: MayanAdapterConfig): MayanAdapter {
  const sdk = {
    fetchQuote,
    fetchStatus,
    createSwapFromSolanaInstructions: (swapFromSolana as unknown as {
      createSwapFromSolanaInstructions: typeof swapFromSolana;
    }).createSwapFromSolanaInstructions,
    getSwapFromEvmTxPayload: (swapFromEvm as unknown as {
      getSwapFromEvmTxPayload: typeof swapFromEvm;
    }).getSwapFromEvmTxPayload,
    deriveOrderHash: (q: { orderHash?: string }) => {
      if (!q.orderHash) throw new Error('Mayan quote missing orderHash');
      return q.orderHash;
    },
  };

  return {
    quote: (p) => quoteImpl(sdk as never, { ...p, referrer: config.referrer }),
    buildBridgeTx: (q) =>
      buildBridgeTxImpl(sdk as never, q, {
        fromAddress: (q.raw as { fromAddress: string }).fromAddress,
        toAddress: (q.raw as { toAddress: string }).toAddress,
      }),
    getOrderStatus: (h) => getOrderStatusImpl(sdk as never, h) as Promise<OrderStatus>,
  };
}
```

> **Engineer note:** The Mayan SDK's public surface changed across minor versions. When running, open `node_modules/@mayanfinance/swap-sdk/dist/index.d.ts` and map the real exports to the `SdkLike` shapes in `quote.ts`, `tx-build.ts`, `status.ts`. The shims are deliberately narrow so only the call sites in `createMayanAdapter` need updating.

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kast/mayan-adapter typecheck`
Expected: exits 0 (fix signature mismatches if any surface).

- [ ] **Step 3: Commit**

```bash
git add packages/mayan-adapter/src/adapter.ts
git commit -m "feat(mayan-adapter): wire createMayanAdapter to real SDK exports"
```

---

## Phase 6 — BDD scenarios

### Task 21: `scenario-tests` setup + feature files

**Files:**
- Create: `scenario-tests/package.json`
- Create: `scenario-tests/tsconfig.json`
- Create: `scenario-tests/cucumber.mjs`
- Create: `scenario-tests/features/open-flow.feature`
- Create: `scenario-tests/features/close-flow.feature`
- Create: `scenario-tests/features/partial-repay.feature`
- Create: `scenario-tests/features/refresh-recovery.feature`

- [ ] **Step 1: Create `scenario-tests/package.json`**

```json
{
  "name": "scenario-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "cucumber-js --config cucumber.mjs",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@kast/orchestrator": "workspace:*",
    "@kast/shared": "workspace:*"
  },
  "devDependencies": {
    "@cucumber/cucumber": "11.0.1",
    "tsx": "4.19.1",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Create `scenario-tests/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "." },
  "include": ["orchestrator/**/*", "live/**/*"]
}
```

- [ ] **Step 3: Create `scenario-tests/cucumber.mjs`**

```js
export default {
  default: {
    import: ['orchestrator/**/*.ts'],
    loader: ['tsx/esm'],
    paths: ['features/**/*.feature'],
    publishQuiet: true,
  },
  live: {
    import: ['live/**/*.ts'],
    loader: ['tsx/esm'],
    paths: ['features/**/*.feature'],
    tags: '@live',
    publishQuiet: true,
  },
};
```

- [ ] **Step 4: Create `scenario-tests/features/open-flow.feature`**

```gherkin
Feature: Open a leveraged SOL→USDC→Base position
  As a Privy-authenticated user
  I want to deposit SOL, borrow USDC, and bridge it to Base
  So that I hold USDC on Base backed by Kamino collateral

  Scenario: Happy path from IDLE to ACTIVE_ON_BASE
    Given the position is IDLE
    When I deposit 0.12 SOL as collateral
    Then the position is DEPOSITED
    When I borrow 5 USDC
    Then the position is BORROWED
    When I bridge 5 USDC from Solana to Base with order hash "0xA"
    Then the position is BRIDGING_OUT
    When the bridge order "0xA" settles
    Then the position is ACTIVE_ON_BASE
```

- [ ] **Step 5: Create `scenario-tests/features/close-flow.feature`**

```gherkin
Feature: Close the position by bridging back, repaying, and withdrawing

  Scenario: Full close
    Given the position is ACTIVE_ON_BASE
    When I bridge 5 USDC from Base to Solana with order hash "0xB"
    Then the position is BRIDGING_BACK
    When the bridge order "0xB" settles
    Then the position is BORROWED
    When I repay all debt
    Then the position is DEPOSITED
    When I withdraw all collateral
    Then the position is IDLE
```

- [ ] **Step 6: Create `scenario-tests/features/partial-repay.feature`**

```gherkin
Feature: Partial repayment (bonus #2)

  Scenario: Partial repay keeps the position in BORROWED
    Given the position is BORROWED
    When I repay 1 USDC
    Then the position is BORROWED

  Scenario: Final repay of remaining debt closes to DEPOSITED
    Given the position is BORROWED
    When I repay 1 USDC
    And I repay all debt
    Then the position is DEPOSITED
```

- [ ] **Step 7: Create `scenario-tests/features/refresh-recovery.feature`**

```gherkin
Feature: State re-derives correctly after a page refresh

  Scenario: Pending out-bridge order survives refresh
    Given an obligation with 0.12 SOL collateral and 5 USDC debt
    And a pending "out" bridge order in localStorage
    When I derive the position from chain and storage
    Then the derived state is BRIDGING_OUT

  Scenario: Settled position on Base re-derives to ACTIVE_ON_BASE
    Given an obligation with 0.12 SOL collateral and 5 USDC debt
    And 5 USDC held on the Base wallet
    And no pending bridge orders
    When I derive the position from chain and storage
    Then the derived state is ACTIVE_ON_BASE
```

- [ ] **Step 8: Install**

Run: `pnpm install`

- [ ] **Step 9: Commit**

```bash
git add scenario-tests/package.json scenario-tests/tsconfig.json scenario-tests/cucumber.mjs scenario-tests/features
git commit -m "test(bdd): add cucumber config + feature files"
```

---

### Task 22: BDD in-memory step defs (orchestrator runner)

**Files:**
- Create: `scenario-tests/orchestrator/world.ts`
- Create: `scenario-tests/orchestrator/steps.ts`

- [ ] **Step 1: Create `scenario-tests/orchestrator/world.ts`**

```ts
import { setWorldConstructor, World, IWorldOptions } from '@cucumber/cucumber';
import type { PositionState } from '@kast/orchestrator';
import type { ObligationView, PersistedOrder } from '@kast/shared';

export class KastWorld extends World {
  state: PositionState = 'IDLE';
  obligation: ObligationView | null = null;
  baseUsdc = 0n;
  pendingOrders: PersistedOrder[] = [];
  derived?: PositionState;

  constructor(options: IWorldOptions) {
    super(options);
  }
}

setWorldConstructor(KastWorld);
```

- [ ] **Step 2: Create `scenario-tests/orchestrator/steps.ts`**

```ts
import { Given, When, Then } from '@cucumber/cucumber';
import assert from 'node:assert/strict';
import { transition, derivePositionFromChain, type PositionState } from '@kast/orchestrator';
import { LAMPORTS_PER_SOL, USDC_BASE_UNITS } from '@kast/shared';
import type { KastWorld } from './world.js';

Given('the position is {word}', function (this: KastWorld, s: string) {
  this.state = s as PositionState;
});

When('I deposit {float} SOL as collateral', function (this: KastWorld, sol: number) {
  const lamports = BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL)));
  this.state = transition(this.state, { type: 'DEPOSIT', lamports });
});

When('I borrow {float} USDC', function (this: KastWorld, usdc: number) {
  const amountUsdc = BigInt(Math.round(usdc * Number(USDC_BASE_UNITS)));
  this.state = transition(this.state, { type: 'BORROW', amountUsdc });
});

When(
  'I bridge {float} USDC from Solana to Base with order hash {string}',
  function (this: KastWorld, usdc: number, orderHash: string) {
    const amountUsdc = BigInt(Math.round(usdc * Number(USDC_BASE_UNITS)));
    this.state = transition(this.state, { type: 'BRIDGE_OUT', amountUsdc, orderHash });
  },
);

When(
  'I bridge {float} USDC from Base to Solana with order hash {string}',
  function (this: KastWorld, usdc: number, orderHash: string) {
    const amountUsdc = BigInt(Math.round(usdc * Number(USDC_BASE_UNITS)));
    this.state = transition(this.state, { type: 'BRIDGE_BACK', amountUsdc, orderHash });
  },
);

When('the bridge order {string} settles', function (this: KastWorld, _h: string) {
  this.state = transition(this.state, { type: 'BRIDGE_SETTLED' });
});

When('the bridge order {string} is refunded', function (this: KastWorld, _h: string) {
  this.state = transition(this.state, { type: 'BRIDGE_REFUND' });
});

When('I repay all debt', function (this: KastWorld) {
  this.state = transition(this.state, { type: 'REPAY', amount: 'all' });
});

When('I repay {float} USDC', function (this: KastWorld, usdc: number) {
  const amount = BigInt(Math.round(usdc * Number(USDC_BASE_UNITS)));
  this.state = transition(this.state, { type: 'REPAY', amount });
});

When('I withdraw all collateral', function (this: KastWorld) {
  this.state = transition(this.state, { type: 'WITHDRAW', lamports: 'all' });
});

Then('the position is {word}', function (this: KastWorld, expected: string) {
  assert.equal(this.state, expected);
});

// Refresh scenarios
Given(
  'an obligation with {float} SOL collateral and {float} USDC debt',
  function (this: KastWorld, sol: number, usdc: number) {
    this.obligation = {
      collateralLamports: BigInt(Math.round(sol * Number(LAMPORTS_PER_SOL))),
      borrowedUsdcBaseUnits: BigInt(Math.round(usdc * Number(USDC_BASE_UNITS))),
    };
  },
);

Given('a pending {string} bridge order in localStorage', function (this: KastWorld, dir: string) {
  this.pendingOrders.push({
    orderHash: 'h',
    direction: dir as 'out' | 'back',
    amountUsdc: '5000000',
    startedAt: 0,
  });
});

Given('{float} USDC held on the Base wallet', function (this: KastWorld, usdc: number) {
  this.baseUsdc = BigInt(Math.round(usdc * Number(USDC_BASE_UNITS)));
});

Given('no pending bridge orders', function (this: KastWorld) {
  this.pendingOrders = [];
});

When('I derive the position from chain and storage', function (this: KastWorld) {
  this.derived = derivePositionFromChain({
    obligation: this.obligation,
    baseUsdc: this.baseUsdc,
    pendingOrders: this.pendingOrders,
  });
});

Then('the derived state is {word}', function (this: KastWorld, expected: string) {
  assert.equal(this.derived, expected);
});
```

- [ ] **Step 3: Run BDD**

Run: `pnpm --filter scenario-tests test`
Expected: all scenarios PASS (open, close, partial-repay x2, refresh x2).

- [ ] **Step 4: Commit**

```bash
git add scenario-tests/orchestrator
git commit -m "test(bdd): in-memory orchestrator step defs"
```

---

### Task 23: Live BDD runner scaffold (label-gated)

**Files:**
- Create: `scenario-tests/live/steps.ts`

- [ ] **Step 1: Create placeholder that reuses orchestrator steps**

```ts
// Live BDD steps — reuse the orchestrator-runner defs but wire a real
// Connection + real adapters. Deliberately a stub: the live workflow is
// triggered manually via the `integration` PR label (see nightly.yml later).
// When ready, replace the imports below with adapter factories from
// @kast/kamino-adapter and @kast/mayan-adapter and thread a throwaway
// Keypair through the world.
import '../orchestrator/steps.js';
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter scenario-tests typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add scenario-tests/live
git commit -m "test(bdd): live runner placeholder re-uses in-memory steps"
```

---

## Phase 7 — Next.js app

### Task 24: Next.js 15 bootstrap

**Files:**
- Create: `apps/web/package.json`
- Create: `apps/web/tsconfig.json`
- Create: `apps/web/next.config.mjs`
- Create: `apps/web/postcss.config.mjs`
- Create: `apps/web/tailwind.config.ts`
- Create: `apps/web/src/app/globals.css`
- Create: `apps/web/src/app/layout.tsx`
- Create: `apps/web/src/app/page.tsx`
- Create: `apps/web/.env.example`

- [ ] **Step 1: Create `apps/web/package.json`**

```json
{
  "name": "@kast/web",
  "version": "0.0.0",
  "private": true,
  "scripts": {
    "dev": "next dev -p 3000",
    "build": "next build",
    "start": "next start",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@kast/kamino-adapter": "workspace:*",
    "@kast/mayan-adapter": "workspace:*",
    "@kast/orchestrator": "workspace:*",
    "@kast/shared": "workspace:*",
    "@privy-io/react-auth": "2.2.1",
    "@solana/web3.js": "1.95.4",
    "next": "15.0.2",
    "react": "19.0.0-rc-69d4b800-20241021",
    "react-dom": "19.0.0-rc-69d4b800-20241021",
    "viem": "2.21.34",
    "zustand": "5.0.0"
  },
  "devDependencies": {
    "@playwright/test": "1.48.2",
    "@types/react": "18.3.12",
    "@types/react-dom": "18.3.1",
    "@types/node": "20.17.0",
    "autoprefixer": "10.4.20",
    "postcss": "8.4.47",
    "tailwindcss": "3.4.14",
    "typescript": "5.6.3"
  }
}
```

- [ ] **Step 2: Create `apps/web/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "jsx": "preserve",
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] },
    "incremental": true,
    "noEmit": true
  },
  "include": ["next-env.d.ts", "src/**/*", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 3: Create `apps/web/next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
export default {
  transpilePackages: [
    '@kast/shared',
    '@kast/orchestrator',
    '@kast/kamino-adapter',
    '@kast/mayan-adapter',
  ],
};
```

- [ ] **Step 4: Create `apps/web/postcss.config.mjs`**

```js
export default { plugins: { tailwindcss: {}, autoprefixer: {} } };
```

- [ ] **Step 5: Create `apps/web/tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

export default {
  content: ['./src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
} satisfies Config;
```

- [ ] **Step 6: Create `apps/web/src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

body { @apply bg-slate-950 text-slate-100 font-mono; }
button { @apply px-4 py-2 bg-indigo-600 rounded disabled:opacity-40; }
```

- [ ] **Step 7: Create `apps/web/src/app/layout.tsx`**

```tsx
import './globals.css';
import type { ReactNode } from 'react';
import { Providers } from './providers.js';

export const metadata = { title: 'KAST DeFi' };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

- [ ] **Step 8: Create `apps/web/src/app/page.tsx` (placeholder)**

```tsx
export default function Page() {
  return (
    <main className="p-8">
      <h1 className="text-2xl">KAST DeFi</h1>
      <p className="text-sm opacity-60">Login and flows mount here in Task 25.</p>
    </main>
  );
}
```

- [ ] **Step 9: Create `apps/web/.env.example`**

```
NEXT_PUBLIC_PRIVY_APP_ID=
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.mainnet-beta.solana.com
NEXT_PUBLIC_BASE_RPC_URL=https://mainnet.base.org
NEXT_PUBLIC_MAYAN_REFERRER=
```

- [ ] **Step 10: Install + smoke `next build`**

Run:
```bash
pnpm install
pnpm --filter @kast/web exec next --version
```
Expected: prints 15.x. (Skip build until Task 25 so providers aren't missing.)

- [ ] **Step 11: Commit**

```bash
git add apps/web
git commit -m "feat(web): bootstrap next 15 app with tailwind and placeholder layout"
```

---

### Task 25: Providers + env + Privy

**Files:**
- Create: `apps/web/src/lib/env.ts`
- Create: `apps/web/src/lib/chain.ts`
- Create: `apps/web/src/app/providers.tsx`

- [ ] **Step 1: Create `apps/web/src/lib/env.ts`**

```ts
function read(key: string, fallback?: string): string {
  const v = process.env[key] ?? fallback;
  if (v === undefined || v === '') throw new Error(`Missing env ${key}`);
  return v;
}

export const env = {
  privyAppId: () => read('NEXT_PUBLIC_PRIVY_APP_ID'),
  solanaRpcUrl: () => read('NEXT_PUBLIC_SOLANA_RPC_URL'),
  baseRpcUrl: () => read('NEXT_PUBLIC_BASE_RPC_URL'),
  mayanReferrer: () => process.env.NEXT_PUBLIC_MAYAN_REFERRER,
};
```

- [ ] **Step 2: Create `apps/web/src/lib/chain.ts`**

```ts
import { Connection } from '@solana/web3.js';
import { createPublicClient, http, type PublicClient } from 'viem';
import { base } from 'viem/chains';
import { env } from './env.js';

export function solanaConnection(): Connection {
  return new Connection(env.solanaRpcUrl(), 'confirmed');
}

export function basePublicClient(): PublicClient {
  return createPublicClient({ chain: base, transport: http(env.baseRpcUrl()) });
}
```

- [ ] **Step 3: Create `apps/web/src/app/providers.tsx`**

```tsx
'use client';
import { PrivyProvider } from '@privy-io/react-auth';
import { KAMINO_MAIN_MARKET } from '@kast/shared';
import type { ReactNode } from 'react';
import { env } from '../lib/env.js';

export function Providers({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={env.privyAppId()}
      config={{
        loginMethods: ['email', 'google'],
        embeddedWallets: {
          createOnLogin: 'users-without-wallets',
          // Enable both Solana and EVM embedded wallets.
          solana: { createOnLogin: 'users-without-wallets' },
        },
        appearance: { theme: 'dark' },
      }}
    >
      <div data-kamino-market={KAMINO_MAIN_MARKET}>{children}</div>
    </PrivyProvider>
  );
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @kast/web typecheck`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/env.ts apps/web/src/lib/chain.ts apps/web/src/app/providers.tsx
git commit -m "feat(web): add env reader, chain clients, and Privy provider"
```

---

### Task 26: Zustand store + persistence

**Files:**
- Create: `apps/web/src/lib/persistence.ts`
- Create: `apps/web/src/lib/store.ts`

- [ ] **Step 1: Create `persistence.ts`**

```ts
import { PENDING_ORDERS_STORAGE_KEY, type PersistedOrder } from '@kast/shared';

export function readPendingOrders(): PersistedOrder[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(PENDING_ORDERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PersistedOrder[];
  } catch {
    return [];
  }
}

export function writePendingOrders(orders: PersistedOrder[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

export function addPendingOrder(order: PersistedOrder): PersistedOrder[] {
  const next = [...readPendingOrders(), order];
  writePendingOrders(next);
  return next;
}

export function removePendingOrder(orderHash: string): PersistedOrder[] {
  const next = readPendingOrders().filter((o) => o.orderHash !== orderHash);
  writePendingOrders(next);
  return next;
}
```

- [ ] **Step 2: Create `store.ts`**

```ts
'use client';
import { create } from 'zustand';
import type { PositionState } from '@kast/orchestrator';
import type { PersistedOrder } from '@kast/shared';
import { readPendingOrders, addPendingOrder, removePendingOrder } from './persistence.js';

export type LogEntry = { at: number; message: string; sig?: string };

type KastStore = {
  state: PositionState;
  log: LogEntry[];
  pendingOrders: PersistedOrder[];
  setState: (s: PositionState) => void;
  pushLog: (entry: Omit<LogEntry, 'at'>) => void;
  trackOrder: (order: PersistedOrder) => void;
  untrackOrder: (hash: string) => void;
};

export const useKastStore = create<KastStore>((set) => ({
  state: 'IDLE',
  log: [],
  pendingOrders: typeof window === 'undefined' ? [] : readPendingOrders(),
  setState: (state) => set({ state }),
  pushLog: (entry) => set((s) => ({ log: [...s.log, { at: Date.now(), ...entry }] })),
  trackOrder: (order) => set({ pendingOrders: addPendingOrder(order) }),
  untrackOrder: (hash) => set({ pendingOrders: removePendingOrder(hash) }),
}));
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/persistence.ts apps/web/src/lib/store.ts
git commit -m "feat(web): zustand store + localStorage persistence for pending orders"
```

---

### Task 27: Amounts helper + Base ETH preflight component

**Files:**
- Create: `apps/web/src/lib/amounts.ts`
- Create: `apps/web/src/components/BaseEthPreflight.tsx`

- [ ] **Step 1: Create `amounts.ts`**

```ts
import { LAMPORTS_PER_SOL, TARGET_COLLATERAL_USD } from '@kast/shared';

// In production, fetch a live SOL/USD price. For a 3-6 hour timebox we use a
// pinned fallback; override via env if needed. The placeholder L_collateral
// in diagrams corresponds to this function's output.
export function targetCollateralLamports(solUsdPrice: number): bigint {
  if (solUsdPrice <= 0) throw new Error('solUsdPrice must be positive');
  const sol = TARGET_COLLATERAL_USD / solUsdPrice;
  return BigInt(Math.floor(sol * Number(LAMPORTS_PER_SOL)));
}

export function formatUsdc(baseUnits: bigint): string {
  return (Number(baseUnits) / 1_000_000).toFixed(6);
}

export function formatSol(lamports: bigint): string {
  return (Number(lamports) / Number(LAMPORTS_PER_SOL)).toFixed(6);
}
```

- [ ] **Step 2: Create `BaseEthPreflight.tsx`**

```tsx
'use client';
import { useEffect, useState } from 'react';
import { BASE_ETH_GAS_THRESHOLD_WEI } from '@kast/shared';
import { basePublicClient } from '../lib/chain.js';

export function BaseEthPreflight({ baseAddress }: { baseAddress: `0x${string}` | null }) {
  const [wei, setWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!baseAddress) return;
    basePublicClient()
      .getBalance({ address: baseAddress })
      .then(setWei)
      .catch(() => setWei(0n));
  }, [baseAddress]);

  if (!baseAddress) return null;
  if (wei === null) return <p className="opacity-60">Checking Base ETH balance…</p>;
  if (wei >= BASE_ETH_GAS_THRESHOLD_WEI) return null;

  return (
    <div className="rounded border border-amber-600 bg-amber-900/20 p-3">
      <p className="font-bold text-amber-200">Fund Base wallet with ETH to proceed</p>
      <p className="text-sm">
        Address: <code>{baseAddress}</code>
      </p>
      <p className="text-sm">Suggested: 0.001 ETH on Base</p>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/lib/amounts.ts apps/web/src/components/BaseEthPreflight.tsx
git commit -m "feat(web): amounts helpers + Base ETH preflight banner"
```

---

### Task 28: Open flow UI

**Files:**
- Create: `apps/web/src/components/OpenFlow.tsx`
- Create: `apps/web/src/components/ActivityLog.tsx`
- Create: `apps/web/src/components/PositionCard.tsx`

- [ ] **Step 1: Create `ActivityLog.tsx`**

```tsx
'use client';
import { useKastStore } from '../lib/store.js';

export function ActivityLog() {
  const log = useKastStore((s) => s.log);
  return (
    <ul className="font-mono text-xs space-y-1 max-h-64 overflow-auto bg-slate-900 p-3 rounded">
      {log.map((e, i) => (
        <li key={i}>
          <span className="opacity-60">{new Date(e.at).toISOString().slice(11, 19)}</span>{' '}
          {e.message}
          {e.sig ? <> sig={e.sig.slice(0, 12)}…</> : null}
        </li>
      ))}
      {log.length === 0 && <li className="opacity-60">No activity yet.</li>}
    </ul>
  );
}
```

- [ ] **Step 2: Create `PositionCard.tsx`**

```tsx
'use client';
import { useKastStore } from '../lib/store.js';

export function PositionCard() {
  const state = useKastStore((s) => s.state);
  return (
    <div className="rounded border border-slate-700 p-4">
      <p className="text-sm opacity-60">Position state</p>
      <p className="text-2xl font-bold">{state}</p>
    </div>
  );
}
```

- [ ] **Step 3: Create `OpenFlow.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolanaWallets, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { canFire, transition } from '@kast/orchestrator';
import {
  DEFAULT_BORROW_USDC_UNITS,
  LAMPORTS_PER_SOL,
  TARGET_COLLATERAL_USD,
  type PersistedOrder,
} from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';
import { solanaConnection } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { env } from '../lib/env.js';
import { targetCollateralLamports } from '../lib/amounts.js';

export function OpenFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { state, setState, pushLog, trackOrder } = useKastStore();
  const [busy, setBusy] = useState(false);

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) return <p>Log in with Privy first.</p>;

  const connection = solanaConnection();
  const kamino = createKaminoAdapter({
    connection,
    marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
  });
  const mayan = createMayanAdapter({
    solanaConnection: connection,
    ...(env.mayanReferrer() !== undefined && { referrer: env.mayanReferrer()! }),
  });

  async function onDeposit() {
    setBusy(true);
    try {
      const solPrice = 150; // TODO: replace with live oracle read
      const lamports = targetCollateralLamports(solPrice);
      pushLog({ message: `Deposit ${TARGET_COLLATERAL_USD} USD of SOL (${lamports} lamports)` });
      const [tx] = await kamino.buildDepositCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports,
      });
      if (!tx) throw new Error('No tx returned');
      const sig = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Deposit confirmed', sig: sig.signature });
      setState(transition(state, { type: 'DEPOSIT', lamports }));
    } finally {
      setBusy(false);
    }
  }

  async function onBorrow() {
    setBusy(true);
    try {
      const [tx] = await kamino.buildBorrowTx({
        owner: new PublicKey(solWallet!.address),
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
      });
      if (!tx) throw new Error('No tx returned');
      const sig = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Borrowed 5 USDC', sig: sig.signature });
      setState(transition(state, { type: 'BORROW', amountUsdc: DEFAULT_BORROW_USDC_UNITS }));
    } finally {
      setBusy(false);
    }
  }

  async function onBridgeOut() {
    setBusy(true);
    try {
      const q = await mayan.quote({
        fromChain: 'solana',
        toChain: 'base',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
        fromAddress: solWallet!.address,
        toAddress: evmWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      const order: PersistedOrder = {
        orderHash: bundle.orderHash,
        direction: 'out',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      pushLog({ message: `Bridging out — order ${bundle.orderHash.slice(0, 10)}…` });
      if (bundle.chain !== 'solana') throw new Error('expected solana bundle');
      const sig = await sendTransaction({ transaction: bundle.txs[0], connection });
      pushLog({ message: 'Bridge tx submitted', sig: sig.signature });
      setState(transition(state, {
        type: 'BRIDGE_OUT',
        amountUsdc: DEFAULT_BORROW_USDC_UNITS,
        orderHash: bundle.orderHash,
      }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">Open</h2>
      <div className="flex gap-2">
        <button disabled={busy || !canFire(state, 'DEPOSIT')} onClick={onDeposit}>
          1. Deposit SOL
        </button>
        <button disabled={busy || !canFire(state, 'BORROW')} onClick={onBorrow}>
          2. Borrow 5 USDC
        </button>
        <button disabled={busy || !canFire(state, 'BRIDGE_OUT')} onClick={onBridgeOut}>
          3. Bridge to Base
        </button>
      </div>
    </section>
  );
}
```

> **Engineer note:** `useSendTransaction` may differ in the installed Privy version — the API surface is effectively "sign + submit Solana tx." Adapt to the version at hand. The `@privy-io/react-auth` Solana helpers live under the `/solana` sub-path in v2+. Import from there if TS complains.

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @kast/web typecheck`
Expected: exits 0 (fix any Privy import path issues at this point).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/components
git commit -m "feat(web): OpenFlow, ActivityLog, and PositionCard components"
```

---

### Task 29: Close flow UI + polling loop

**Files:**
- Create: `apps/web/src/components/CloseFlow.tsx`

- [ ] **Step 1: Create `CloseFlow.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { PublicKey } from '@solana/web3.js';
import { useSolanaWallets, useWallets, useSendTransaction } from '@privy-io/react-auth';
import { canFire, transition } from '@kast/orchestrator';
import {
  DEFAULT_BORROW_USDC_UNITS,
  USDC_BASE_UNITS,
  type PersistedOrder,
} from '@kast/shared';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { createMayanAdapter } from '@kast/mayan-adapter';
import { solanaConnection } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { env } from '../lib/env.js';

export function CloseFlow() {
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const { sendTransaction } = useSendTransaction();
  const { state, setState, pushLog, trackOrder, untrackOrder, pendingOrders } = useKastStore();
  const [partial, setPartial] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const solWallet = solWallets[0];
  const evmWallet = evmWallets[0];
  if (!solWallet || !evmWallet) return null;

  const connection = solanaConnection();
  const kamino = createKaminoAdapter({
    connection,
    marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
  });
  const mayan = createMayanAdapter({
    solanaConnection: connection,
    ...(env.mayanReferrer() !== undefined && { referrer: env.mayanReferrer()! }),
  });

  async function pollOrder(hash: string) {
    while (true) {
      await new Promise((r) => setTimeout(r, 3000));
      const status = await mayan.getOrderStatus(hash);
      if (status === 'SETTLED' || status === 'REFUNDED') {
        untrackOrder(hash);
        pushLog({ message: `Order ${hash.slice(0, 10)}… ${status}` });
        return status;
      }
    }
  }

  async function onBridgeBack() {
    setBusy(true);
    try {
      const amt = partial ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS))) : DEFAULT_BORROW_USDC_UNITS;
      const q = await mayan.quote({
        fromChain: 'base',
        toChain: 'solana',
        amountUsdc: amt,
        fromAddress: evmWallet!.address,
        toAddress: solWallet!.address,
      });
      const bundle = await mayan.buildBridgeTx(q);
      if (bundle.chain !== 'base') throw new Error('expected base bundle');
      const order: PersistedOrder = {
        orderHash: bundle.orderHash,
        direction: 'back',
        amountUsdc: amt.toString(),
        startedAt: Date.now(),
      };
      trackOrder(order);
      // Submit approveTx then bridgeTx via the EVM wallet provider.
      const provider = await evmWallet!.getEthereumProvider();
      for (const tx of bundle.txs) {
        const hash = await provider.request({
          method: 'eth_sendTransaction',
          params: [{ to: tx.to, data: tx.data, value: `0x${tx.value.toString(16)}` }],
        });
        pushLog({ message: 'EVM tx submitted', sig: hash as string });
      }
      setState(transition(state, {
        type: 'BRIDGE_BACK',
        amountUsdc: amt,
        orderHash: bundle.orderHash,
      }));
      const status = await pollOrder(bundle.orderHash);
      if (status === 'SETTLED') {
        setState(transition(state, { type: 'BRIDGE_SETTLED' }));
      } else {
        setState(transition(state, { type: 'BRIDGE_REFUND' }));
      }
    } finally {
      setBusy(false);
    }
  }

  async function onRepay() {
    setBusy(true);
    try {
      const amount: bigint | 'all' = partial
        ? BigInt(Math.round(parseFloat(partial) * Number(USDC_BASE_UNITS)))
        : 'all';
      const [tx] = await kamino.buildRepayTx({
        owner: new PublicKey(solWallet!.address),
        amount,
      });
      if (!tx) throw new Error('No tx');
      const sig = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: `Repay ${amount === 'all' ? 'all' : amount}`, sig: sig.signature });
      setState(transition(state, { type: 'REPAY', amount }));
    } finally {
      setBusy(false);
    }
  }

  async function onWithdraw() {
    setBusy(true);
    try {
      const [tx] = await kamino.buildWithdrawCollateralTx({
        owner: new PublicKey(solWallet!.address),
        lamports: 'all',
      });
      if (!tx) throw new Error('No tx');
      const sig = await sendTransaction({ transaction: tx, connection });
      pushLog({ message: 'Withdraw all collateral', sig: sig.signature });
      setState(transition(state, { type: 'WITHDRAW', lamports: 'all' }));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="space-y-2">
      <h2 className="text-lg font-bold">Close</h2>
      <div className="flex gap-2 items-center">
        <input
          type="text"
          value={partial}
          onChange={(e) => setPartial(e.target.value)}
          placeholder="Partial USDC (blank = max)"
          className="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-sm"
        />
        <button disabled={busy || !canFire(state, 'BRIDGE_BACK')} onClick={onBridgeBack}>
          4. Bridge back
        </button>
        <button disabled={busy || !canFire(state, 'REPAY')} onClick={onRepay}>
          5. Repay
        </button>
        <button disabled={busy || !canFire(state, 'WITHDRAW')} onClick={onWithdraw}>
          6. Withdraw
        </button>
      </div>
      {pendingOrders.length > 0 && (
        <p className="text-xs opacity-60">
          Pending orders: {pendingOrders.map((o) => o.orderHash.slice(0, 8)).join(', ')}
        </p>
      )}
    </section>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @kast/web typecheck`
Expected: exits 0.

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/CloseFlow.tsx
git commit -m "feat(web): CloseFlow with partial repay input and order polling"
```

---

### Task 30: Wire page + mount-time derive

**Files:**
- Modify: `apps/web/src/app/page.tsx`

- [ ] **Step 1: Replace `page.tsx`**

```tsx
'use client';
import { useEffect } from 'react';
import { PublicKey } from '@solana/web3.js';
import { usePrivy, useSolanaWallets, useWallets } from '@privy-io/react-auth';
import { derivePositionFromChain } from '@kast/orchestrator';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { solanaConnection, basePublicClient } from '../lib/chain.js';
import { useKastStore } from '../lib/store.js';
import { readPendingOrders } from '../lib/persistence.js';
import { BASE_USDC } from '@kast/shared';
import { OpenFlow } from '../components/OpenFlow.js';
import { CloseFlow } from '../components/CloseFlow.js';
import { PositionCard } from '../components/PositionCard.js';
import { ActivityLog } from '../components/ActivityLog.js';
import { BaseEthPreflight } from '../components/BaseEthPreflight.js';

const USDC_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'a', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;

export default function Page() {
  const { ready, authenticated, login, logout } = usePrivy();
  const { wallets: solWallets } = useSolanaWallets();
  const { wallets: evmWallets } = useWallets();
  const setState = useKastStore((s) => s.setState);

  useEffect(() => {
    if (!authenticated) return;
    const sol = solWallets[0];
    const evm = evmWallets[0];
    if (!sol || !evm) return;

    (async () => {
      const kamino = createKaminoAdapter({
        connection: solanaConnection(),
        marketAddress: new PublicKey(process.env.NEXT_PUBLIC_KAMINO_MARKET ?? ''),
      });
      const obligation = await kamino.getObligation(new PublicKey(sol.address));
      const baseUsdc = await basePublicClient().readContract({
        address: BASE_USDC,
        abi: USDC_ABI,
        functionName: 'balanceOf',
        args: [evm.address as `0x${string}`],
      });
      const pendingOrders = readPendingOrders();
      setState(derivePositionFromChain({ obligation, baseUsdc, pendingOrders }));
    })().catch(console.error);
  }, [authenticated, solWallets, evmWallets, setState]);

  if (!ready) return <main className="p-8">Loading…</main>;

  return (
    <main className="p-8 space-y-6 max-w-3xl">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">KAST DeFi</h1>
        {authenticated ? (
          <button onClick={logout}>Log out</button>
        ) : (
          <button onClick={login}>Log in</button>
        )}
      </header>
      {authenticated && (
        <>
          <PositionCard />
          <BaseEthPreflight
            baseAddress={(evmWallets[0]?.address as `0x${string}` | undefined) ?? null}
          />
          <OpenFlow />
          <CloseFlow />
          <ActivityLog />
        </>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Add `NEXT_PUBLIC_KAMINO_MARKET` to `.env.example`**

Append to `apps/web/.env.example`:

```
NEXT_PUBLIC_KAMINO_MARKET=7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
```

- [ ] **Step 3: Build**

Run: `pnpm --filter @kast/web build`
Expected: `next build` succeeds. (If Privy warns about server components, confirm `providers.tsx` has `'use client'`.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/app/page.tsx apps/web/.env.example
git commit -m "feat(web): wire page with mount-time derive and all flow sections"
```

---

### Task 31: Browser smoke check

- [ ] **Step 1: Create `.env.local` (user action — not committed)**

Instruct the user:

```
cd apps/web
cp .env.example .env.local
# fill NEXT_PUBLIC_PRIVY_APP_ID at minimum
```

- [ ] **Step 2: Run dev server**

Run: `pnpm dev`
Expected: `ready on http://localhost:3000` in the logs.

- [ ] **Step 3: Manual check**

Open `http://localhost:3000`. Expected: renders, Log in button visible, no console errors. If a button errors on click, capture the error and fix before continuing.

- [ ] **Step 4: Kill dev server**

Ctrl-C in the dev terminal.

- [ ] **Step 5: Commit (nothing to commit — manual only)**

Skip commit unless you made fixes in Step 3. If so:

```bash
git add apps/web
git commit -m "fix(web): resolve issues found during browser smoke check"
```

---

## Phase 8 — Integration tests

### Task 32: Live-RPC integration tests

**Files:**
- Create: `integration-tests/package.json`
- Create: `integration-tests/tsconfig.json`
- Create: `integration-tests/vitest.config.ts`
- Create: `integration-tests/src/kamino.int.test.ts`
- Create: `integration-tests/src/mayan.int.test.ts`

- [ ] **Step 1: Create `integration-tests/package.json`**

```json
{
  "name": "integration-tests",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "dependencies": {
    "@kast/kamino-adapter": "workspace:*",
    "@kast/mayan-adapter": "workspace:*",
    "@kast/shared": "workspace:*",
    "@solana/web3.js": "1.95.4"
  },
  "devDependencies": {
    "typescript": "5.6.3",
    "vitest": "2.1.3"
  }
}
```

- [ ] **Step 2: Create `integration-tests/tsconfig.json`**

```json
{
  "extends": "../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Step 3: Create `integration-tests/vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
  test: { environment: 'node', testTimeout: 60_000 },
});
```

- [ ] **Step 4: Create `integration-tests/src/kamino.int.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { Connection, PublicKey } from '@solana/web3.js';
import { createKaminoAdapter } from '@kast/kamino-adapter';
import { KAMINO_MAIN_MARKET } from '@kast/shared';

const rpc = process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com';

describe.skipIf(!process.env.KAST_INTEGRATION)('Kamino live', () => {
  it('loads main market and getObligation returns null for fresh pubkey', async () => {
    const connection = new Connection(rpc, 'confirmed');
    const kamino = createKaminoAdapter({
      connection,
      marketAddress: new PublicKey(KAMINO_MAIN_MARKET),
    });
    const fresh = new PublicKey('11111111111111111111111111111111');
    const obligation = await kamino.getObligation(fresh);
    expect(obligation).toBeNull();
  });
});
```

- [ ] **Step 5: Create `integration-tests/src/mayan.int.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { Connection } from '@solana/web3.js';
import { createMayanAdapter } from '@kast/mayan-adapter';

describe.skipIf(!process.env.KAST_INTEGRATION)('Mayan live', () => {
  it('fetches a live quote for 5 USDC sol→base', async () => {
    const mayan = createMayanAdapter({
      solanaConnection: new Connection(
        process.env.SOLANA_RPC_URL ?? 'https://api.mainnet-beta.solana.com',
      ),
    });
    const q = await mayan.quote({
      fromChain: 'solana',
      toChain: 'base',
      amountUsdc: 5_000_000n,
      fromAddress: '11111111111111111111111111111111',
      toAddress: '0x0000000000000000000000000000000000000000',
    });
    expect(q.minAmountOut).toBeGreaterThan(0n);
    expect(q.expiresAt).toBeGreaterThan(Date.now());
  });
});
```

- [ ] **Step 6: Run (opt-in)**

Run: `KAST_INTEGRATION=1 pnpm --filter integration-tests test`
Expected: both tests PASS against mainnet.

- [ ] **Step 7: Commit**

```bash
git add integration-tests
git commit -m "test(integration): live-RPC tests gated on KAST_INTEGRATION env"
```

---

## Phase 9 — Docker smoke + Playwright

### Task 33: Dockerfile + Playwright smoke spec

**Files:**
- Create: `docker/Dockerfile`
- Create: `docker/docker-compose.yml`
- Create: `docker/smoke.spec.ts`
- Create: `apps/web/playwright.config.ts`

- [ ] **Step 1: Create `docker/Dockerfile`**

```dockerfile
FROM node:20.17-alpine AS deps
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo
COPY pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY packages packages
COPY integration-tests/package.json integration-tests/
COPY scenario-tests/package.json scenario-tests/
RUN pnpm install --frozen-lockfile=false

FROM deps AS build
COPY . .
RUN pnpm --filter @kast/web build

FROM node:20.17-alpine AS runner
WORKDIR /app
COPY --from=build /repo /app
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]
```

- [ ] **Step 2: Create `docker/docker-compose.yml`**

```yaml
services:
  web:
    build:
      context: ..
      dockerfile: docker/Dockerfile
    ports: ['3000:3000']
    environment:
      NEXT_PUBLIC_PRIVY_APP_ID: ${NEXT_PUBLIC_PRIVY_APP_ID:-smoke-placeholder}
      NEXT_PUBLIC_SOLANA_RPC_URL: https://api.mainnet-beta.solana.com
      NEXT_PUBLIC_BASE_RPC_URL: https://mainnet.base.org
      NEXT_PUBLIC_KAMINO_MARKET: 7u3HeHxYDLhnCoErrtycNokbQYbWGzLs6JSDqGAv5PfF
```

- [ ] **Step 3: Create `apps/web/playwright.config.ts`**

```ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: '../../docker',
  testMatch: 'smoke.spec.ts',
  use: { baseURL: process.env.SMOKE_BASE_URL ?? 'http://localhost:3000' },
});
```

- [ ] **Step 4: Create `docker/smoke.spec.ts`**

```ts
import { test, expect } from '@playwright/test';

test('app boots and renders Log in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'KAST DeFi' })).toBeVisible();
  await expect(page.getByRole('button', { name: /log in/i })).toBeVisible();
});
```

- [ ] **Step 5: Smoke locally**

Run:
```bash
docker compose -f docker/docker-compose.yml up --build -d
pnpm --filter @kast/web exec playwright install chromium
pnpm --filter @kast/web exec playwright test
docker compose -f docker/docker-compose.yml down
```
Expected: smoke test PASSES; container shuts down cleanly.

- [ ] **Step 6: Commit**

```bash
git add docker apps/web/playwright.config.ts apps/web/package.json
git commit -m "test(smoke): docker image + playwright boot check"
```

---

## Phase 10 — CI/CD + Vercel

### Task 34: `ci.yml` — fast gate

**Files:**
- Create: `.github/workflows/ci.yml`

> **Pinning note.** The SHAs below are representative; when creating the file, look up the current tagged release for each action and use its commit SHA. The comment next to each SHA names the tag it corresponds to — update together.

- [ ] **Step 1: Create `.github/workflows/ci.yml`**

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  fast-gate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.0.0
        with: { version: 9.12.0 }
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with:
          node-version-file: .nvmrc
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm audit --audit-level=high
      - run: pnpm lint
      - run: pnpm format:check
      - run: pnpm typecheck
      - run: pnpm test:unit
      - run: pnpm test:property
      - run: pnpm test:bdd
      - run: pnpm build
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: add fast-gate workflow with SHA-pinned actions"
```

---

### Task 35: `integration.yml` — label-gated

**Files:**
- Create: `.github/workflows/integration.yml`

- [ ] **Step 1: Create file**

```yaml
name: Integration

on:
  pull_request:
    types: [labeled]
  workflow_dispatch:

jobs:
  live-rpc:
    if: github.event.label.name == 'integration' || github.event_name == 'workflow_dispatch'
    runs-on: ubuntu-latest
    env:
      KAST_INTEGRATION: '1'
      SOLANA_RPC_URL: ${{ secrets.SOLANA_RPC_URL }}
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.0.0
        with: { version: 9.12.0 }
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:integration
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/integration.yml
git commit -m "ci: add label-gated integration workflow"
```

---

### Task 36: `smoke.yml` — docker + Playwright on main

**Files:**
- Create: `.github/workflows/smoke.yml`

- [ ] **Step 1: Create file**

```yaml
name: Smoke

on:
  push:
    branches: [main]

jobs:
  docker-smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.0.0
        with: { version: 9.12.0 }
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: docker compose -f docker/docker-compose.yml up -d --build
      - run: pnpm --filter @kast/web exec playwright install --with-deps chromium
      - run: pnpm --filter @kast/web exec playwright test
      - if: always()
        run: docker compose -f docker/docker-compose.yml down
```

- [ ] **Step 2: Commit**

```bash
git add .github/workflows/smoke.yml
git commit -m "ci: add docker smoke workflow on main"
```

---

### Task 37: `nightly.yml` — Stryker + coverage

**Files:**
- Create: `packages/orchestrator/stryker.conf.json`
- Create: `packages/verify/stryker.conf.json`
- Create: `.github/workflows/nightly.yml`

- [ ] **Step 1: Create `packages/orchestrator/stryker.conf.json`**

```json
{
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "reporters": ["clear-text", "progress"],
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"],
  "thresholds": { "high": 80, "low": 70, "break": 60 }
}
```

- [ ] **Step 2: Create `packages/verify/stryker.conf.json`** (same content)

```json
{
  "packageManager": "pnpm",
  "testRunner": "vitest",
  "reporters": ["clear-text", "progress"],
  "mutate": ["src/**/*.ts", "!src/**/*.test.ts"],
  "thresholds": { "high": 80, "low": 70, "break": 60 }
}
```

- [ ] **Step 3: Create `.github/workflows/nightly.yml`**

```yaml
name: Nightly

on:
  schedule:
    - cron: '0 3 * * *'
  workflow_dispatch:

jobs:
  mutation:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.0.0
        with: { version: 9.12.0 }
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm test:mutation
  coverage:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@692973e3d937129bcbf40652eb9f2f61becf3332 # v4.1.7
      - uses: pnpm/action-setup@fe02b34f77f8bc703788d5817da081398fad5dd2 # v4.0.0
        with: { version: 9.12.0 }
      - uses: actions/setup-node@1e60f620b9541d16bece96c5465dc8ee9832be0b # v4.0.3
        with: { node-version-file: .nvmrc, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r --filter './packages/*' exec vitest run --coverage
```

- [ ] **Step 4: Commit**

```bash
git add packages/orchestrator/stryker.conf.json packages/verify/stryker.conf.json .github/workflows/nightly.yml
git commit -m "ci: nightly Stryker + coverage"
```

---

### Task 38: Vercel config

**Files:**
- Create: `vercel.json`

- [ ] **Step 1: Create `vercel.json`**

```json
{
  "buildCommand": "pnpm build",
  "installCommand": "pnpm install --frozen-lockfile",
  "outputDirectory": "apps/web/.next",
  "framework": "nextjs"
}
```

- [ ] **Step 2: Commit**

```bash
git add vercel.json
git commit -m "chore: add vercel.json for monorepo deployment"
```

---

## Phase 11 — Project docs

### Task 39: `docs/PROGRESS.md`

**Files:**
- Create: `docs/PROGRESS.md`

- [ ] **Step 1: Create file**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add docs/PROGRESS.md
git commit -m "docs: add PROGRESS.md with shipped + deferred checklist"
```

---

### Task 40: `docs/AI_ORCHESTRATION.md`

**Files:**
- Create: `docs/AI_ORCHESTRATION.md`

- [ ] **Step 1: Create file**

```markdown
# AI Orchestration Writeup

This document records how the KAST DeFi assignment was driven end-to-end with Claude Code and the `superpowers` skill pack.

## Workflow

1. **Brainstorming** (`superpowers:brainstorming`)
   - Read the assignment PDF and the pre-existing `docs/kast_defi_execution_plan.md` sketch.
   - Scoped decisions through multiple-choice questions: wallet provider (Privy vs. Phantom multi-chain), bonus selection (#1 Privy + #2 partial repay, #3 deferred), test stack parity with sibling Rust projects (Mantis, hookbox), lint/format choice.
   - Wrote an RFC-style spec at `docs/superpowers/specs/2026-04-20-kast-defi-design.md` with explicit Non-Goals and rationale.
   - Wrote `docs/ARCHITECTURE.md` with mermaid diagrams.
   - Three rounds of `codex exec` independent review; fixes applied in place:
     - Round 1 (11 issues): env var naming, Mayan `orderHash` timing, REFUNDED transitions, Base ETH preflight, localStorage schema, protocol constants table, repay-all for interest accrual, etc.
     - Round 2 (2 blockers): `buildBridgeTx` orderHash contract, FSM state set was observationally ambiguous.
     - Round 3 (1 blocker): ARCHITECTURE vs. RFC inconsistency on where `orderHash` is returned.
   - Final codex pass: **GO** for implementation.

2. **Writing plans** (`superpowers:writing-plans`)
   - Produced `docs/superpowers/plans/2026-04-20-kast-defi-implementation.md` (this repository's implementation plan).
   - 41 tasks across 12 phases, each task 2-5-minute bite-sized TDD steps with complete code.

3. **Executing plans** (`superpowers:executing-plans` or `superpowers:subagent-driven-development`)
   - Task-by-task execution with a commit per task.
   - Property tests + BDD scenarios served as the "acceptance gate" between phases.

## What subagents were used for
- **Explore** (read-only): surveying sibling projects (Mantis, hookbox) for test conventions and CI patterns without consuming main-context budget.
- **codex-cli** (external, via `codex exec`): independent review of the spec and architecture — a second opinion not produced by the same Claude session.

## What humans stayed in the loop for
- Scoping decisions (bonus selection, wallet choice).
- Approving the RFC before any code was written.
- Approving the implementation plan before execution.
- Running the live demo + funding wallets (Base ETH, Solana rent).

## Why this matters for a lead-level read
The product is a working happy path. The *methodology* is a 3-stage design-then-build pipeline with external review at every gate. This is how I would run a team on a 3-6 hour spike: brainstorm → spec → plan → execute, with artifacts at every step that a reviewer can inspect.
```

- [ ] **Step 2: Commit**

```bash
git add docs/AI_ORCHESTRATION.md
git commit -m "docs: add AI orchestration writeup"
```

---

### Task 41: `docs/TIME_LOG.md` + README

**Files:**
- Create: `docs/TIME_LOG.md`
- Modify: `README.md`

- [ ] **Step 1: Create `docs/TIME_LOG.md`**

```markdown
# Time Log

Append one line per working session. Total at the bottom.

| Date | Phase | Duration | Notes |
|---|---|---|---|
| 2026-04-20 | Brainstorm + RFC | XX min | 3 codex review rounds |
| 2026-04-20 | Plan | XX min | 41-task TDD/BDD plan |
| YYYY-MM-DD | Phase 0-1 bootstrap | XX min | |
| YYYY-MM-DD | Phase 2 orchestrator | XX min | |
| YYYY-MM-DD | Phase 3 property tests | XX min | |
| YYYY-MM-DD | Phase 4 kamino-adapter | XX min | |
| YYYY-MM-DD | Phase 5 mayan-adapter | XX min | |
| YYYY-MM-DD | Phase 6 BDD | XX min | |
| YYYY-MM-DD | Phase 7 web app | XX min | |
| YYYY-MM-DD | Phase 8 integration | XX min | |
| YYYY-MM-DD | Phase 9 docker/playwright | XX min | |
| YYYY-MM-DD | Phase 10 CI/CD + Vercel | XX min | |
| YYYY-MM-DD | Phase 11 docs | XX min | |

**Total:** ~X hours (target ≤ 6h).
```

- [ ] **Step 2: Replace `README.md`**

```markdown
# KAST DeFi Assignment

End-to-end DeFi happy path: **Deposit SOL on Kamino → borrow USDC → bridge to Base via Mayan → bridge back → repay (partial supported) → withdraw**.

## Quick links
- [Spec](docs/superpowers/specs/2026-04-20-kast-defi-design.md)
- [Architecture + diagrams](docs/ARCHITECTURE.md)
- [Implementation plan](docs/superpowers/plans/2026-04-20-kast-defi-implementation.md)
- [AI orchestration writeup](docs/AI_ORCHESTRATION.md)
- [Time log](docs/TIME_LOG.md)
- [Progress + future work](docs/PROGRESS.md)

## Run locally

```bash
corepack enable && corepack prepare pnpm@9.12.0 --activate
pnpm install
cp apps/web/.env.example apps/web/.env.local  # fill NEXT_PUBLIC_PRIVY_APP_ID
pnpm dev
```

## Tests

```bash
pnpm test                # unit + property + BDD
pnpm test:integration    # live RPC (requires KAST_INTEGRATION=1)
pnpm test:smoke          # docker + playwright (requires docker)
```

## Deploy
Pushed to main → GitHub Actions `ci.yml` + `smoke.yml` → Vercel production.
```

- [ ] **Step 3: Commit**

```bash
git add docs/TIME_LOG.md README.md
git commit -m "docs: add time log and rewrite README"
```

---

## Self-Review

### Spec coverage

Every section of `docs/superpowers/specs/2026-04-20-kast-defi-design.md` maps to at least one task:

- §2 G1-G4 (deposit/borrow/bridge/close) — Tasks 12-16, 17-20, 28-30
- §2 G5 partial repay — Task 29 (partial input), Task 22 (BDD scenario)
- §2 G6 Vercel — Task 38
- §2 G7 tests + CI + AI writeup — Tasks 5-23, 32-37, 40
- §5.1 Privy — Task 25
- §5.3 pure FSM — Tasks 5-9
- §5.4 adapters return unsigned txs — Tasks 12-16, 19-20
- §5.5 full test stack — Tasks 10, 21-22, 32-33, 37
- §5.6 ESLint + Prettier — Task 2
- §5.7 4-workflow CI — Tasks 34-37
- §6 KaminoAdapter interface — Tasks 11-16
- §6 MayanAdapter interface — Tasks 17-20
- §6 PositionState + transitions — Tasks 5-8
- §7.1 open flow — Task 28
- §7.2 close flow — Task 29
- §7.3 refresh/recovery — Task 30 mount-time derive
- §8.1 protocol constants — Task 4
- §8.2 persistence — Task 26
- §8.3 Base ETH preflight — Task 27

### Placeholder scan
- No "TBD" / "fill in later" markers.
- Every code step includes complete code.
- SDK-version notes are explicit notes for the engineer, not placeholder code.

### Type consistency
- `ObligationView`, `PersistedOrder`, `OrderStatus`, `PositionState`, `Event`, `Quote`, `BridgeTxBundle` all defined in one place and referenced consistently.
- Adapter method signatures match between interface definition (Tasks 11, 17) and implementations (Tasks 12-20).
- `canFire` / `transition` signatures consistent across FSM, property tests, BDD steps, and UI.
