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
