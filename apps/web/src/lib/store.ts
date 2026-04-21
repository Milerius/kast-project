'use client';
import { create } from 'zustand';
import type { PositionState } from '@kast/orchestrator';
import type { PersistedOrder } from '@kast/shared';
import { readPendingOrders, addPendingOrder, removePendingOrder } from './persistence.js';

export type LogEntry = { at: number; message: string; sig?: string };

type KastStore = {
  state: PositionState;
  log: LogEntry[];
  pendingOrders: PersistedOrder[];
  setState: (s: PositionState) => void;
  pushLog: (entry: Omit<LogEntry, 'at'>) => void;
  trackOrder: (order: PersistedOrder) => void;
  untrackOrder: (hash: string) => void;
};

export const useKastStore = create<KastStore>((set) => ({
  state: 'IDLE',
  log: [],
  pendingOrders: typeof window === 'undefined' ? [] : readPendingOrders(),
  setState: (state) => set({ state }),
  pushLog: (entry) => set((s) => ({ log: [...s.log, { at: Date.now(), ...entry }] })),
  trackOrder: (order) => set({ pendingOrders: addPendingOrder(order) }),
  untrackOrder: (hash) => set({ pendingOrders: removePendingOrder(hash) }),
}));
