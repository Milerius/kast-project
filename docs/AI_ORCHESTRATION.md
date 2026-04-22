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
