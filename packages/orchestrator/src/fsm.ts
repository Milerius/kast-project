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

export function transition(state: PositionState, event: Event): PositionState {
  switch (state) {
    case 'IDLE':
      if (event.type === 'DEPOSIT') return 'DEPOSITED';
      break;
    case 'DEPOSITED':
      if (event.type === 'BORROW') return 'BORROWED';
      if (event.type === 'WITHDRAW') return event.lamports === 'all' ? 'IDLE' : 'DEPOSITED';
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
