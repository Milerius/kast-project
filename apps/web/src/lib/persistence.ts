import { PENDING_ORDERS_STORAGE_KEY, type PersistedOrder } from '@kast/shared';

function isPersistedOrder(x: unknown): x is PersistedOrder {
  if (typeof x !== 'object' || x === null) return false;
  const o = x as Record<string, unknown>;
  return (
    typeof o.orderHash === 'string' &&
    (o.direction === 'out' || o.direction === 'back') &&
    typeof o.amountUsdc === 'string' &&
    typeof o.startedAt === 'number' &&
    Number.isFinite(o.startedAt)
  );
}

export function readPendingOrders(): PersistedOrder[] {
  if (typeof window === 'undefined') return [];
  const raw = window.localStorage.getItem(PENDING_ORDERS_STORAGE_KEY);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isPersistedOrder);
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
