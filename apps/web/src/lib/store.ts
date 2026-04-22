'use client';
import { create } from 'zustand';
import type { PositionState } from '@kast/orchestrator';
import type { ObligationView, PersistedOrder } from '@kast/shared';
import { readPendingOrders, addPendingOrder, removePendingOrder } from './persistence.js';

export type LogChain = 'sol' | 'base' | 'mayan';
export type LogEntry = { at: number; message: string; sig?: string; chain?: LogChain };

export type StepName = 'DEPOSIT' | 'BORROW' | 'BRIDGE_OUT' | 'BRIDGE_BACK' | 'REPAY' | 'WITHDRAW';

export type StepSig =
  | { kind: 'sol'; sig: string }
  | { kind: 'base'; sig: string }
  | { kind: 'mayan'; sourceChain: 'solana' | 'base'; sig: string; orderHash: string };

type KastStore = {
  state: PositionState;
  obligation: ObligationView | null;
  log: LogEntry[];
  pendingOrders: PersistedOrder[];
  stepSigs: Partial<Record<StepName, StepSig>>;
  balanceRefreshTick: number;
  setState: (s: PositionState) => void;
  setObligation: (o: ObligationView | null) => void;
  pushLog: (entry: Omit<LogEntry, 'at'>) => void;
  trackOrder: (order: PersistedOrder) => void;
  untrackOrder: (hash: string) => void;
  setStepSig: (step: StepName, sig: StepSig) => void;
  resetStepSigs: () => void;
  bumpBalanceRefresh: () => void;
};

export const useKastStore = create<KastStore>((set) => ({
  state: 'IDLE',
  obligation: null,
  log: [],
  pendingOrders: typeof window === 'undefined' ? [] : readPendingOrders(),
  stepSigs: {},
  balanceRefreshTick: 0,
  setState: (state) => set({ state }),
  setObligation: (obligation) => set({ obligation }),
  pushLog: (entry) => set((s) => ({ log: [...s.log, { at: Date.now(), ...entry }] })),
  trackOrder: (order) => set({ pendingOrders: addPendingOrder(order) }),
  untrackOrder: (hash) => set({ pendingOrders: removePendingOrder(hash) }),
  setStepSig: (step, sig) => set((s) => ({ stepSigs: { ...s.stepSigs, [step]: sig } })),
  resetStepSigs: () => set({ stepSigs: {} }),
  bumpBalanceRefresh: () => set((s) => ({ balanceRefreshTick: s.balanceRefreshTick + 1 })),
}));
