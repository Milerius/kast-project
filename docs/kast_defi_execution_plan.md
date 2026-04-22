# KAST DeFi Lead Assignment — Execution Plan (AI-Orchestrated)

## TL;DR
Build a **minimal end-to-end DeFi flow**:
1. Deposit SOL collateral on Kamino
2. Borrow USDC
3. Bridge USDC to Base via Mayan
4. Bridge back + repay + close position

Focus ONLY on a **working happy path**. Everything else is secondary.

---

## Objectives

### Primary Goal
- Deliver a **fully working happy-path flow**
- Demonstrate:
  - protocol integration (Kamino + Mayan)
  - cross-chain orchestration (Solana ↔ Base)
  - ability to use AI agents effectively

### Secondary (optional if time allows)
- partial repayment
- small UI improvements
- basic error messages

---

## Constraints

- Timebox: **3–6 hours**
- Fixed parameters:
  - ~$20 SOL collateral
  - $5 USDC borrow
  - Solana + Base only
- Ignore:
  - edge cases
  - retries
  - production-grade security
  - full UX polish

---

## High-Level Architecture

Frontend (Next.js)
    ↓
Flow Orchestrator (TS functions)
    ↓
Protocol Adapters
    ├─ Kamino (Solana lending)
    └─ Mayan (cross-chain bridge)

---

## Execution Strategy (CRITICAL)

### Step 1 — Prove integrations independently
DO NOT start with full flow.

1. Test Kamino:
   - deposit SOL
   - borrow USDC

2. Test Mayan:
   - bridge small USDC Solana → Base

Goal:
→ Ensure both protocols work in isolation

---

### Step 2 — Implement Open Flow

Sequence:
1. deposit collateral
2. borrow USDC
3. bridge USDC

---

### Step 3 — Implement Close Flow

Sequence:
1. bridge back
2. repay
3. withdraw collateral

---

### Step 4 — UI Layer
- minimal
- just buttons + logs

---

## Definition of Done

✔ Deposit SOL on Kamino  
✔ Borrow USDC  
✔ Bridge USDC to Base  
✔ Bridge back to Solana  
✔ Repay loan  
✔ Withdraw collateral  

✔ All steps executable from UI  
✔ Logs show each step  

---

## Final Advice

Speed > perfection  
Working demo > clean code  
Clarity > abstraction  
