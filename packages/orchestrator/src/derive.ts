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
  if (obligation.collateralLamports === 0n && obligation.borrowedUsdcBaseUnits === 0n)
    return 'IDLE';
  if (obligation.borrowedUsdcBaseUnits === 0n) return 'DEPOSITED';
  if (baseUsdc > 0n) return 'ACTIVE_ON_BASE';
  return 'BORROWED';
}
