'use client';
import { formatSol, formatUsdc } from '../lib/amounts.js';
import { useLiveBalances } from '../lib/useLiveBalances.js';
import { useKastStore } from '../lib/store.js';
import { Icon } from './Icon.js';

const STATE_LABELS: Record<string, string> = {
  IDLE: 'Idle',
  DEPOSITED: 'Deposited',
  BORROWED: 'Borrowed',
  BRIDGING_OUT: 'Bridging out',
  ACTIVE_ON_BASE: 'Active on Base',
  BRIDGING_BACK: 'Bridging back',
};

function formatEth(wei: bigint, decimals = 4): string {
  return (Number(wei) / 1e18).toFixed(decimals);
}

function Stat({
  icon,
  chain,
  label,
  value,
  unit,
}: {
  icon: string;
  chain: string;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="flex items-start gap-3 p-4 rounded-2xl bg-surface-container border border-outline-variant/10">
      <div className="w-10 h-10 rounded-full bg-surface-container-high flex items-center justify-center shrink-0">
        <Icon name={icon} className="text-lg text-secondary" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-technical text-[10px] tracking-widest text-outline uppercase mb-0.5">
          {chain} · {label}
        </div>
        <div className="flex items-baseline gap-1 truncate">
          <span className="font-technical text-xl text-on-surface truncate">{value}</span>
          <span className="font-technical text-[10px] text-on-surface/50">{unit}</span>
        </div>
      </div>
    </div>
  );
}

export function BalancesPanel() {
  const bal = useLiveBalances();
  const state = useKastStore((s) => s.state);
  const obligation = useKastStore((s) => s.obligation);

  const collateral = obligation?.collateralLamports ?? 0n;
  const borrowed = obligation?.borrowedUsdcBaseUnits ?? 0n;

  return (
    <div className="bg-surface-container-low rounded-3xl p-8 border border-outline-variant/10">
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="font-technical text-[10px] tracking-widest text-outline mb-1">
            LIVE STATE
          </div>
          <h2 className="text-2xl font-black tracking-tight">Wallets &amp; Obligation</h2>
        </div>
        <div className="flex items-center gap-3">
          <span className="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold tracking-widest uppercase">
            {STATE_LABELS[state] ?? state}
          </span>
          {bal.loading && (
            <Icon name="sync" className="text-sm text-on-surface-variant animate-spin" />
          )}
        </div>
      </div>

      <div className="mb-5 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-4 rounded-2xl bg-primary-container/5 border border-primary-container/20">
          <div className="font-technical text-[10px] tracking-widest text-primary-container uppercase mb-1">
            Kamino Collateral
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-technical text-2xl text-on-surface">
              {collateral > 0n ? formatSol(collateral, 4) : '—'}
            </span>
            <span className="font-technical text-xs text-on-surface/50">SOL</span>
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-secondary/5 border border-secondary/20">
          <div className="font-technical text-[10px] tracking-widest text-secondary uppercase mb-1">
            Kamino Borrowed
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-technical text-2xl text-on-surface">
              {borrowed > 0n ? formatUsdc(borrowed) : '—'}
            </span>
            <span className="font-technical text-xs text-on-surface/50">USDC</span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Stat
          icon="account_balance_wallet"
          chain="SOL"
          label="Native"
          value={bal.solLamports !== null ? formatSol(bal.solLamports, 4) : '…'}
          unit="SOL"
        />
        <Stat
          icon="attach_money"
          chain="SOL"
          label="USDC"
          value={bal.solUsdcBaseUnits !== null ? formatUsdc(bal.solUsdcBaseUnits) : '…'}
          unit="USDC"
        />
        <Stat
          icon="link"
          chain="BASE"
          label="Native"
          value={bal.baseEthWei !== null ? formatEth(bal.baseEthWei) : '…'}
          unit="ETH"
        />
        <Stat
          icon="attach_money"
          chain="BASE"
          label="USDC"
          value={bal.baseUsdcBaseUnits !== null ? formatUsdc(bal.baseUsdcBaseUnits) : '…'}
          unit="USDC"
        />
      </div>
    </div>
  );
}
