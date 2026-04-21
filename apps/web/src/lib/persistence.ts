import { PENDING_ORDERS_STORAGE_KEY, type PersistedOrder } from '@kast/shared';

export function readPendingOrders(): PersistedOrder[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(PENDING_ORDERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PersistedOrder[];
  } catch {
    return [];
  }
}

export function writePendingOrders(orders: PersistedOrder[]): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(PENDING_ORDERS_STORAGE_KEY, JSON.stringify(orders));
}

export function addPendingOrder(order: PersistedOrder): PersistedOrder[] {
  const next = [...readPendingOrders(), order];
  writePendingOrders(next);
  return next;
}

export function removePendingOrder(orderHash: string): PersistedOrder[] {
  const next = readPendingOrders().filter((o) => o.orderHash !== orderHash);
  writePendingOrders(next);
  return next;
}
