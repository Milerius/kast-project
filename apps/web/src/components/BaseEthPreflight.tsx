'use client';
import { useEffect, useState } from 'react';
import { BASE_ETH_GAS_THRESHOLD_WEI } from '@kast/shared';
import { basePublicClient } from '../lib/chain.js';

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
  if (wei === null) return <p className="opacity-60">Checking Base ETH balance…</p>;
  if (wei >= BASE_ETH_GAS_THRESHOLD_WEI) return null;

  return (
    <div className="rounded border border-amber-600 bg-amber-900/20 p-3">
      <p className="font-bold text-amber-200">Fund Base wallet with ETH to proceed</p>
      <p className="text-sm">
        Address: <code>{baseAddress}</code>
      </p>
      <p className="text-sm">Suggested: 0.001 ETH on Base</p>
    </div>
  );
}
