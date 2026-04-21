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
