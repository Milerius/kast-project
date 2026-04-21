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

Then('the position should be {word}', function (this: KastWorld, expected: string) {
  assert.equal(this.state, expected);
});

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
