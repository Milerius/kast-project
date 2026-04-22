'use client';
import { useEffect } from 'react';
import { canFire, transition } from '@kast/orchestrator';
import { sharedMayan } from './adapters.js';
import { useKastStore } from './store.js';

const POLL_INTERVAL_MS = 5000;

export function usePendingOrderPoller() {
  const pendingOrders = useKastStore((s) => s.pendingOrders);

  useEffect(() => {
    if (pendingOrders.length === 0) return;
    const mayan = sharedMayan();
    let canceled = false;

    async function tick() {
      const snapshot = useKastStore.getState().pendingOrders;
      for (const order of snapshot) {
        if (canceled) return;
        try {
          const status = await mayan.getOrderStatus(order.orderHash);
          if (canceled) return;
          if (status === 'PENDING') continue;

          // Only untrack AFTER the FSM has consumed the terminal event.
          // If we untrack first and the state hasn't caught up yet (e.g. on a
          // page reload before BRIDGING_* is persisted), the SETTLED/REFUND
          // signal would be discarded forever and the user would stay stuck
          // in a pending-bridge UI.
          const store = useKastStore.getState();
          store.pushLog({ message: `Order ${order.orderHash.slice(0, 10)}… ${status}` });

          const ev = status === 'SETTLED' ? 'BRIDGE_SETTLED' : 'BRIDGE_REFUND';
          const currentState = useKastStore.getState().state;
          if (canFire(currentState, ev)) {
            store.setState(transition(currentState, { type: ev }));
            store.untrackOrder(order.orderHash);
            store.bumpBalanceRefresh();
          }
          // If the FSM can't consume the event yet, leave the order in the
          // pending list so the next tick retries once state has caught up.
        } catch (e) {
          // Mayan sometimes 404s briefly after submission while the order
          // lands in the indexer. Keep polling — the interval handles retry.
          console.warn('pending order poll failed', order.orderHash, e);
        }
      }
    }

    void tick();
    const interval = setInterval(() => void tick(), POLL_INTERVAL_MS);
    return () => {
      canceled = true;
      clearInterval(interval);
    };
  }, [pendingOrders]);
}
