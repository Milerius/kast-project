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
