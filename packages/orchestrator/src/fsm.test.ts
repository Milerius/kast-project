import { describe, it, expect } from 'vitest';
import { transition, canFire, IllegalTransitionError } from './fsm.js';

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

describe('transition — bridge paths', () => {
  it('BORROWED + BRIDGE_OUT → BRIDGING_OUT', () => {
    expect(transition('BORROWED', { type: 'BRIDGE_OUT', amountUsdc: 5n, orderHash: 'h1' })).toBe(
      'BRIDGING_OUT',
    );
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
