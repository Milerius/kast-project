'use client';
import { useMemo } from 'react';
import { TARGET_COLLATERAL_USD } from '@kast/shared';
import { useKastStore } from '../lib/store.js';
import { targetCollateralLamports, formatSol } from '../lib/amounts.js';
import { usePriceSol } from '../lib/usePriceSol.js';
import { ProgressRail } from './ProgressRail.js';
import { BaseEthPreflight } from './BaseEthPreflight.js';

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Idle',
  DEPOSITED: 'Deposited',
  BORROWED: 'Borrowed',
  BRIDGING_OUT: 'Bridging out',
  ACTIVE_ON_BASE: 'Active on Base',
  BRIDGING_BACK: 'Bridging back',
};

export function PositionHero({ baseAddress }: { baseAddress: `0x${string}` | null }) {
  const state = useKastStore((s) => s.state);
  const obligation = useKastStore((s) => s.obligation);
  const solPrice = usePriceSol();
  const targetLamports = useMemo(() => targetCollateralLamports(solPrice), [solPrice]);

  const hasPosition = state !== 'IDLE' && obligation && obligation.collateralLamports > 0n;
  const heading = hasPosition ? 'Current Position' : 'No Active Position';
  const solDisplay = hasPosition ? formatSol(obligation.collateralLamports, 4) : '—';
  const usdDisplay = hasPosition
    ? `≈ $${((Number(obligation.collateralLamports) / 1e9) * solPrice).toFixed(2)}`
    : `Target: ${formatSol(targetLamports, 4)} SOL (~$${TARGET_COLLATERAL_USD})`;

  return (
    <section className="max-w-6xl mx-auto mb-12">
      <div className="bg-surface-container-low rounded-3xl p-10 flex flex-col md:flex-row justify-between items-start md:items-center relative overflow-hidden border border-outline-variant/10">
        <div className="absolute top-0 right-0 w-1/2 h-full opacity-10 pointer-events-none">
          <div className="w-full h-full bg-gradient-to-l from-primary-container/20 to-transparent" />
        </div>
        <div className="z-10">
          <div className="flex items-center gap-4 mb-4">
            <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
              {STATE_LABELS[state] ?? state}
            </span>
            <span className="text-on-surface-variant font-technical text-xs">{usdDisplay}</span>
          </div>
          <h1 className="text-5xl font-black tracking-tighter mb-2">{heading}</h1>
          <div className="flex items-baseline gap-2">
            <span className="font-technical text-4xl text-primary-container">{solDisplay}</span>
            <span className="font-technical text-xl text-on-surface/50">SOL</span>
          </div>
        </div>
        <div className="z-10 mt-8 md:mt-0 flex flex-col items-end gap-6">
          <ProgressRail state={state} />
          <BaseEthPreflight baseAddress={baseAddress} />
        </div>
      </div>
    </section>
  );
}
