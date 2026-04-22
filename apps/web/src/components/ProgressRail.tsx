'use client';
import type { PositionState } from '@kast/orchestrator';
import { Icon } from './Icon.js';

type NodeState = 'done' | 'active' | 'pending';

const LABELS = ['Deposit', 'Borrow', 'Bridge', 'Return', 'Repay', 'Withdraw'] as const;

function nodeStates(state: PositionState): NodeState[] {
  switch (state) {
    case 'IDLE':
      return ['active', 'pending', 'pending', 'pending', 'pending', 'pending'];
    case 'DEPOSITED':
      return ['done', 'active', 'pending', 'pending', 'pending', 'pending'];
    case 'BORROWED':
      return ['done', 'done', 'active', 'pending', 'pending', 'pending'];
    case 'BRIDGING_OUT':
      return ['done', 'done', 'active', 'pending', 'pending', 'pending'];
    case 'ACTIVE_ON_BASE':
      return ['done', 'done', 'done', 'active', 'pending', 'pending'];
    case 'BRIDGING_BACK':
      return ['done', 'done', 'done', 'active', 'pending', 'pending'];
  }
}

export function ProgressRail({ state }: { state: PositionState }) {
  const nodes = nodeStates(state);
  return (
    <div className="flex items-center gap-2 flex-wrap">
      {nodes.map((s, i) => (
        <div key={i} className="flex items-center">
          <div className="flex flex-col items-center gap-2">
            <div
              className={
                s === 'done'
                  ? 'w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center'
                  : s === 'active'
                    ? 'w-8 h-8 rounded-full bg-surface-container border-2 border-primary-container text-primary-container flex items-center justify-center'
                    : 'w-8 h-8 rounded-full bg-surface-container-highest text-on-surface/30 flex items-center justify-center border border-outline-variant/10'
              }
            >
              {s === 'done' ? (
                <Icon name="check" filled className="text-base" />
              ) : (
                <span className="text-[10px] font-bold">{i + 1}</span>
              )}
            </div>
            <span
              className={
                s === 'done'
                  ? 'text-[9px] uppercase tracking-tighter text-primary-container font-bold'
                  : s === 'active'
                    ? 'text-[9px] uppercase tracking-tighter text-primary-container font-bold'
                    : 'text-[9px] uppercase tracking-tighter text-on-surface/30 font-bold'
              }
            >
              {LABELS[i]}
            </span>
          </div>
          {i < nodes.length - 1 && (
            <div
              className={
                s === 'done'
                  ? 'w-8 h-0.5 bg-primary-container/30 mx-1'
                  : 'w-8 h-0.5 bg-surface-container-highest mx-1'
              }
            />
          )}
        </div>
      ))}
    </div>
  );
}
