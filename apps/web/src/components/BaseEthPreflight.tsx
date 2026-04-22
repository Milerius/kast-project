'use client';
import { useEffect, useState } from 'react';
import { BASE_ETH_GAS_THRESHOLD_WEI } from '@kast/shared';
import { basePublicClient } from '../lib/chain.js';
import { Icon } from './Icon.js';

export function BaseEthPreflight({ baseAddress }: { baseAddress: `0x${string}` | null }) {
  const [wei, setWei] = useState<bigint | null>(null);

  useEffect(() => {
    if (!baseAddress) return;
    basePublicClient()
      .getBalance({ address: baseAddress })
      .then(setWei)
      .catch(() => setWei(0n));
  }, [baseAddress]);

  if (!baseAddress) return null;
  if (wei === null) {
    return (
      <div className="flex items-center gap-2 text-on-surface-variant font-technical text-[10px] tracking-widest uppercase">
        <Icon name="sync" className="text-sm animate-spin" />
        Checking Base ETH balance
      </div>
    );
  }
  if (wei >= BASE_ETH_GAS_THRESHOLD_WEI) {
    return (
      <div className="flex items-center gap-2 text-primary-container font-technical text-[10px] tracking-widest uppercase">
        <Icon name="check_circle" filled className="text-sm" />
        Base gas ready
      </div>
    );
  }

  return (
    <div className="max-w-md rounded-2xl border border-error/40 bg-error-container/20 p-4 flex items-start gap-3">
      <Icon name="warning" filled className="text-error text-lg mt-0.5" />
      <div className="flex-1 min-w-0">
        <div className="font-bold text-error text-sm">Fund Base wallet with ETH</div>
        <div className="font-technical text-[11px] text-on-surface-variant mt-1 truncate">
          {baseAddress}
        </div>
        <div className="font-technical text-[10px] text-on-surface/60 tracking-widest uppercase mt-1">
          Suggested · 0.001 ETH on Base
        </div>
      </div>
    </div>
  );
}
