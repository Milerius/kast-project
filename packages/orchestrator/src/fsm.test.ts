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
