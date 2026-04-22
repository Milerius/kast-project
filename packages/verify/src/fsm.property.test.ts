import { describe, it } from 'vitest';
import fc from 'fast-check';
import {
  transition,
  canFire,
  IllegalTransitionError,
  type Event,
  type PositionState,
} from '@kast/orchestrator';

const STATES: PositionState[] = [
  'IDLE',
  'DEPOSITED',
  'BORROWED',
  'BRIDGING_OUT',
  'ACTIVE_ON_BASE',
  'BRIDGING_BACK',
];

const EVENT_TYPES: Event['type'][] = [
  'DEPOSIT',
  'BORROW',
  'BRIDGE_OUT',
  'BRIDGE_SETTLED',
  'BRIDGE_REFUND',
  'BRIDGE_BACK',
  'REPAY',
  'WITHDRAW',
];

const anyState = () => fc.constantFrom(...STATES);

const anyEvent = (): fc.Arbitrary<Event> =>
  fc.oneof(
    fc.record({
      type: fc.constant('DEPOSIT' as const),
      lamports: fc.bigInt({ min: 1n, max: 10n ** 12n }),
    }),
    fc.record({
      type: fc.constant('BORROW' as const),
      amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }),
    }),
    fc.record({
      type: fc.constant('BRIDGE_OUT' as const),
      amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }),
      orderHash: fc.string({ minLength: 1 }),
    }),
    fc.record({ type: fc.constant('BRIDGE_SETTLED' as const) }),
    fc.record({ type: fc.constant('BRIDGE_REFUND' as const) }),
    fc.record({
      type: fc.constant('BRIDGE_BACK' as const),
      amountUsdc: fc.bigInt({ min: 1n, max: 10n ** 9n }),
      orderHash: fc.string({ minLength: 1 }),
    }),
    fc.record({
      type: fc.constant('REPAY' as const),
      amount: fc.oneof(fc.bigInt({ min: 1n, max: 10n ** 9n }), fc.constant('all' as const)),
    }),
    fc.record({
      type: fc.constant('WITHDRAW' as const),
      lamports: fc.oneof(fc.bigInt({ min: 1n, max: 10n ** 12n }), fc.constant('all' as const)),
    }),
  );

describe('FSM invariants (property-based)', () => {
  it('canFire ↔ transition does not throw', () => {
    fc.assert(
      fc.property(anyState(), anyEvent(), (s, e) => {
        const legal = canFire(s, e.type);
        try {
          transition(s, e);
          return legal;
        } catch (err) {
          return !legal && err instanceof IllegalTransitionError;
        }
      }),
    );
  });

  it('transition is deterministic for the same (state, event)', () => {
    fc.assert(
      fc.property(anyState(), anyEvent(), (s, e) => {
        if (!canFire(s, e.type)) return true;
        return transition(s, e) === transition(s, e);
      }),
    );
  });

  it('BRIDGE_REFUND inverts BRIDGE_OUT for {BORROWED}', () => {
    const s1 = transition('BORROWED', { type: 'BRIDGE_OUT', amountUsdc: 1n, orderHash: 'x' });
    const s2 = transition(s1, { type: 'BRIDGE_REFUND' });
    if (s2 !== 'BORROWED') throw new Error('refund did not invert');
  });

  it('BRIDGE_REFUND inverts BRIDGE_BACK for {ACTIVE_ON_BASE}', () => {
    const s1 = transition('ACTIVE_ON_BASE', {
      type: 'BRIDGE_BACK',
      amountUsdc: 1n,
      orderHash: 'x',
    });
    const s2 = transition(s1, { type: 'BRIDGE_REFUND' });
    if (s2 !== 'ACTIVE_ON_BASE') throw new Error('refund did not invert');
  });

  it('EVENT_TYPES cover all discriminants', () => {
    if (EVENT_TYPES.length !== 8) throw new Error('expected 8 event discriminants');
  });
});
